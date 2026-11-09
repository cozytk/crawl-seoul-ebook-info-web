import assert from "node:assert/strict";
import { test } from "node:test";
import { incompleteProviderIds, readSearchView, searchViewURL } from "../public/search-model.js";

test("shared URLs restore the query, all filters and sorting, with safe defaults for invalid values", () => {
  const view = { query: "쇳돌", filters: { format: "physical", status: "reserve", provider: "eunpyeong-public" }, sort: "available" };
  const url = searchViewURL("https://example.com/?utm_source=friend", view);
  assert.deepEqual(readSearchView(url), view);
  assert.equal(new URL(url).searchParams.get("utm_source"), "friend");
  assert.deepEqual(readSearchView("https://example.com/?q=book&format=bad&status=bad&sort=bad&provider=%3Cscript%3E").filters,
    { format: "all", status: "all", provider: "all" });
  const cleared = searchViewURL(url, { query: "", filters: view.filters, sort: view.sort });
  assert.equal(new URL(cleared).searchParams.size, 1);
});

test("a failed physical source is unresolved, while a successful empty source is a real zero", () => {
  const config = [{ id: "ebook" }, { id: "physical", physicalProvider: true }];
  const results = [{ providerId: "ebook", ok: true, searchable: true, books: [] }, { providerId: "physical", ok: false, searchable: false, books: [] }];
  assert.deepEqual(incompleteProviderIds(config, results, { format: "physical", provider: "all" }), ["physical"]);
  assert.deepEqual(incompleteProviderIds(config, results, { format: "ebook", provider: "all" }), []);
  assert.deepEqual(incompleteProviderIds(config, [], { format: "all", provider: "physical" }), ["physical"]);
  results[1] = { ...results[1], ok: true, searchable: true };
  assert.deepEqual(incompleteProviderIds(config, results), []);
});
