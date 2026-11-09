import express from "express";
import { isIP } from "node:net";

export function searchClientKey(req, vercel = Boolean(process.env.VERCEL)) {
  // Vercel overwrites these headers at its edge. On a local/direct server,
  // untrusted forwarded headers must not change a caller's request limit.
  const forwarded = vercel && (req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"]);
  const ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "";
  return isIP(ip) ? ip : req.ip || "unknown";
}

// Share work across JSON/SSE callers. Each caller can leave independently;
// upstream requests stop when the last listener leaves. Never cache failures.
export function createProviderSearchStore(search, {
  ttlMs = 120000, maxEntries = 256, now = Date.now
} = {}) {
  const cache = new Map();
  const pending = new Map();
  const normalize = (query) => query.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");

  function get(provider, query, { signal, fresh = false } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const key = `${provider.id}:${normalize(query)}`;
    const saved = cache.get(key);
    if (saved && saved.expiresAt <= now()) cache.delete(key);
    else if (saved && !fresh) {
      cache.delete(key);
      cache.set(key, saved);
      return Promise.resolve({ ...saved.result, cacheHit: true });
    }
    if (fresh) cache.delete(key);

    let entry = pending.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, listeners: 0, settled: false };
      pending.set(key, entry);
      entry.promise = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return search(provider, query, { signal: controller.signal });
      }).then((result) => {
        const checked = { ...result, checkedAt: new Date(now()).toISOString(), cacheHit: false };
        if (controller.signal.aborted) return checked;
        if (result.ok && result.searchable && !result.partialResults) {
          cache.delete(key);
          cache.set(key, { result: checked, expiresAt: now() + ttlMs });
          while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
        } else {
          // A forced refresh must not leave an older successful copy cached.
          cache.delete(key);
        }
        return checked;
      }).finally(() => {
        entry.settled = true;
        if (pending.get(key) === entry) pending.delete(key);
      });
    }

    entry.listeners += 1;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (callback, value) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener("abort", onAbort);
        entry.listeners -= 1;
        if (!entry.listeners && !entry.settled) {
          entry.controller.abort();
          if (pending.get(key) === entry) pending.delete(key);
        }
        callback(value);
      };
      const onAbort = () => finish(reject, signal.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
      entry.promise.then((value) => finish(resolve, value), (error) => finish(reject, error));
    });
  }

  return { get };
}

export function createSearchRouter({ providers, search, buildFlow, validateQuery, consumeRateLimit, ttlMs }) {
  const router = express.Router();
  const store = createProviderSearchStore(search, { ttlMs });
  router.get(["/", "/stream"], async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const invalid = validateQuery(query);
    if (invalid) return res.status(400).json({ error: invalid });

    let selected = providers;
    if (req.query.providers !== undefined) {
      const ids = typeof req.query.providers === "string" ? [...new Set(req.query.providers.split(","))] : [];
      if (!ids.length || ids.some((id) => !providers.some((provider) => provider.id === id))) {
        return res.status(400).json({ error: "검색처를 확인해 주세요." });
      }
      selected = providers.filter((provider) => ids.includes(provider.id));
    }
    if (req.query.fresh !== undefined && !["0", "1"].includes(req.query.fresh)) {
      return res.status(400).json({ error: "새로 확인 옵션을 확인해 주세요." });
    }
    if (!consumeRateLimit(searchClientKey(req))) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." });
    }

    const streaming = req.path === "/stream";
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.once("close", onClose);
    const writeEvent = (type, data) => {
      if (!res.destroyed) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    let heartbeat;
    if (streaming) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      writeEvent("start", { query, totalProviders: selected.length, searchedAt: new Date().toISOString() });
      heartbeat = setInterval(() => { if (!res.destroyed) res.write(": keep-alive\n\n"); }, 10000);
    }
    try {
      const libraryResults = await Promise.all(selected.map(async (provider) => {
        const result = await store.get(provider, query, { signal: controller.signal, fresh: req.query.fresh === "1" });
        if (streaming) writeEvent("provider", result);
        return result;
      }));
      if (controller.signal.aborted) return;
      const payload = { query, searchedAt: new Date().toISOString(), libraryResults,
        cacheHit: libraryResults.every((result) => result.cacheHit), flow: buildFlow(query, libraryResults) };
      if (streaming) {
        writeEvent("flow", payload.flow);
        writeEvent("done", payload);
        res.end();
      } else res.json(payload);
    } catch {
      if (!controller.signal.aborted) {
        const error = { error: "검색 연결을 완료하지 못했습니다. 다시 시도해 주세요." };
        if (streaming) { writeEvent("error", error); res.end(); }
        else res.status(502).json(error);
      }
    } finally {
      clearInterval(heartbeat);
      res.off("close", onClose);
    }
  });
  return router;
}
