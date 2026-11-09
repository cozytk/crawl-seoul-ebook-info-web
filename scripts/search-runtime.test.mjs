import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import { createProviderSearchStore, createSearchRouter, searchClientKey } from "../lib/search-runtime.js";

const provider = { id: "library-a" };
const result = (id = provider.id) => ({ providerId: id, ok: true, searchable: true, books: [{ title: "책" }] });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test("Vercel request limits use the visitor address; local servers ignore forged proxy headers", () => {
  const req = { ip: "127.0.0.1", headers: { "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "203.0.113.20" } };
  assert.equal(searchClientKey(req, true), "203.0.113.9");
  assert.equal(searchClientKey(req, false), "127.0.0.1");
  assert.equal(searchClientKey({ ...req, headers: { "x-forwarded-for": "2001:db8::1" } }, true), "2001:db8::1");
  assert.equal(searchClientKey({ ...req, headers: { "x-vercel-forwarded-for": "invalid" } }, true), "127.0.0.1");
});

test("successful source results are cached with their original check time and bounded by TTL/LRU", async () => {
  let now = 1000;
  let calls = 0;
  const store = createProviderSearchStore(async () => { calls += 1; return result(); }, { now: () => now, ttlMs: 100, maxEntries: 2 });
  const first = await store.get(provider, " Ａ  book ");
  const cached = await store.get(provider, "a book");
  assert.equal(calls, 1);
  assert.equal(first.cacheHit, false);
  assert.equal(cached.cacheHit, true);
  assert.equal(cached.checkedAt, first.checkedAt);
  now += 101;
  assert.equal((await store.get(provider, "a book")).cacheHit, false);
  await store.get(provider, "second");
  await store.get(provider, "third");
  assert.equal((await store.get(provider, "a book")).cacheHit, false);
  assert.equal(calls, 5);
});

test("failed and incomplete source responses are not cached; forced refresh invalidates old success", async () => {
  let calls = 0;
  let outcome = result();
  const store = createProviderSearchStore(async () => { calls += 1; return outcome; });
  await store.get(provider, "book");
  outcome = { ...result(), ok: false };
  await store.get(provider, "book", { fresh: true });
  await store.get(provider, "book");
  assert.equal(calls, 3);
  outcome = { ...result(), partialResults: true };
  await store.get(provider, "book");
  await store.get(provider, "book");
  assert.equal(calls, 5);
});

test("concurrent callers share work and one cancellation does not cancel the other caller", async () => {
  const work = deferred();
  let signal;
  let calls = 0;
  const store = createProviderSearchStore(async (_, __, options) => { calls += 1; signal = options.signal; return work.promise; });
  const controller = new AbortController();
  const first = store.get(provider, "book", { signal: controller.signal });
  const second = store.get(provider, "book");
  const cancelled = assert.rejects(first, { name: "AbortError" });
  await Promise.resolve();
  controller.abort();
  await cancelled;
  assert.equal(calls, 1);
  assert.equal(signal.aborted, false);
  work.resolve(result());
  assert.equal((await second).ok, true);
});

test("the last cancellation stops upstream work; a late old response cannot remove a newer cached result", async () => {
  const old = deferred();
  let calls = 0;
  let upstream;
  const store = createProviderSearchStore(async (_, __, { signal }) => {
    calls += 1;
    upstream = signal;
    return calls === 1 ? old.promise : { ...result(), revision: "new" };
  });
  const controller = new AbortController();
  const request = store.get(provider, "book", { signal: controller.signal });
  const rejected = assert.rejects(request, { name: "AbortError" });
  await Promise.resolve();
  controller.abort();
  await rejected;
  assert.equal(upstream.aborted, true);
  await store.get(provider, "book");
  old.resolve({ ...result(), ok: false });
  await new Promise((resolve) => setImmediate(resolve));
  const cached = await store.get(provider, "book");
  assert.equal(cached.cacheHit, true);
  assert.equal(cached.revision, "new");
  assert.equal(calls, 2);
});

async function serve(t, search, consumeRateLimit = () => true) {
  const app = express();
  app.use("/api/search", createSearchRouter({
    providers: [provider, { id: "library-b" }], search,
    validateQuery: (query) => !query || query.length > 80 ? "invalid query" : null,
    consumeRateLimit, buildFlow: () => ({})
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}/api/search`;
}

test("JSON and SSE share cached sources; targeted refresh fetches only the requested source", async (t) => {
  const calls = [];
  const base = await serve(t, async (item) => { calls.push(item.id); return result(item.id); });
  const first = await (await fetch(`${base}?q=book`)).json();
  assert.equal(first.libraryResults.length, 2);
  const cached = await (await fetch(`${base}/stream?q=book&providers=library-a`)).text();
  assert.match(cached, /event: done/);
  assert.match(cached, /"cacheHit":true/);
  assert.deepEqual(calls, ["library-a", "library-b"]);
  const refreshed = await (await fetch(`${base}?q=book&providers=library-b&fresh=1`)).json();
  assert.equal(refreshed.libraryResults.length, 1);
  assert.equal(refreshed.libraryResults[0].cacheHit, false);
  assert.deepEqual(calls, ["library-a", "library-b", "library-b"]);
});

test("invalid queries/options do not call upstream; throttled requests include a retry time", async (t) => {
  let calls = 0;
  const base = await serve(t, async () => { calls += 1; return result(); }, () => false);
  for (const query of ["", "q=book&providers=unknown", "q=book&providers=", "q=book&fresh=oops", "q=book&q=other"]) {
    const response = await fetch(`${base}?${query}`);
    assert.equal(response.status, 400);
  }
  const limited = await fetch(`${base}?q=book`);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal(calls, 0);
});

test("closing an SSE connection cancels the remaining provider requests", async (t) => {
  const started = deferred();
  const stopped = deferred();
  const base = await serve(t, async (_, __, { signal }) => {
    started.resolve();
    return new Promise((resolve) => signal.addEventListener("abort", () => { stopped.resolve(); resolve(result()); }, { once: true }));
  });
  const response = await fetch(`${base}/stream?q=book&providers=library-a`);
  await started.promise;
  await response.body.cancel();
  await Promise.race([stopped.promise, new Promise((_, reject) => {
    const timeout = setTimeout(() => reject(new Error("upstream was not cancelled")), 1000);
    stopped.promise.then(() => clearTimeout(timeout));
  })]);
});
