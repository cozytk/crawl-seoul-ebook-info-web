import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

process.env.VERCEL = "1";
const { searchProvider, physicalProviders } = await import("../server.js");
const provider = physicalProviders.find((item) => item.id === "eunpyeong-public");
const copies = readFileSync(new URL("./fixtures/eunpyeong-copies.html", import.meta.url), "utf8");
const empty = readFileSync(new URL("./fixtures/eunpyeong-empty.html", import.meta.url), "utf8");
const errorPage = '<meta http-equiv="refresh" content="0;url=https://www.eplib.or.kr/error/error.asp">';

test("Eunpyeong recovers after two HTTP 200 error pages using the canonical search route", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input, options) => {
    requests.push({ url: new URL(input), options });
    return new Response(requests.length < 3 ? errorPage : copies);
  });
  const result = await searchProvider(provider, "쇳돌");
  assert.equal(result.ok, true);
  assert.equal(result.partialResults, false);
  assert.equal(result.checkedResults, 3);
  assert.equal(requests.length, 3);
  for (const { url, options } of requests) {
    assert.equal(url.pathname, "/intro/menu/10003/program/30006/alpasq/searchResultList.do");
    assert.equal(url.searchParams.get("searchKeyword"), "쇳돌");
    assert.equal(url.searchParams.get("currentPageNo"), "1");
    assert.equal(options.headers.Accept, "text/html");
    assert.equal(new URL(options.headers.Referer).pathname, "/intro/menu/10003/program/30006/alpasq/searchSimple.do");
  }
  assert.equal(result.books.length, 3);
  assert.equal(result.books.find((book) => book.localLibraryName === "구산동도서관마을").decision.state, "borrow_now");
  assert.equal(result.books.find((book) => book.localLibraryName === "은평뉴타운도서관").decision.state, "reserve");
});

test("Eunpyeong reports persistent error pages as failure, not an empty catalogue", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(errorPage));
  const result = await searchProvider(provider, "쇳돌");
  assert.equal(fetch.mock.callCount(), 3);
  assert.equal(result.ok, false);
  assert.equal(result.searchable, false);
  assert.match(result.error, /응답 구조/);
  assert.deepEqual(result.books, []);
});

test("Eunpyeong excludes the no-results placeholder from checked records", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(empty));
  const result = await searchProvider(provider, "없는책zxy928373645");
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(result.ok, true);
  assert.equal(result.totalResults, 0);
  assert.equal(result.checkedResults, 0);
  assert.equal(result.partialResults, false);
  assert.deepEqual(result.books, []);
});

test("Eunpyeong retains earlier copies when a later page cannot be read", async (t) => {
  const firstPage = copies.replace('id="facetCnt">3<', 'id="facetCnt">83<');
  const pages = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    const page = new URL(input).searchParams.get("currentPageNo");
    pages.push(page);
    return new Response(page === "1" ? firstPage : errorPage);
  });
  const result = await searchProvider(provider, "쇳돌");
  assert.deepEqual(pages, ["1", "2", "2", "2"]);
  assert.equal(result.ok, true);
  assert.equal(result.partialResults, true);
  assert.equal(result.checkedResults, 3);
  assert.equal(result.totalResults, 83);
  assert.equal(result.books.length, 3);
  assert.match(result.warning, /다음 검색 결과/);
});

test("Eunpyeong does not retry non-transient HTTP failures", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response("Forbidden", { status: 403 }));
  const result = await searchProvider(provider, "쇳돌");
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 403);
});
