import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://localhost:3199";
const live = process.env.LIVE_VERIFY === "1";
const query = process.env.VERIFY_QUERY || "쇳돌";
process.env.VERCEL = "1";
const { parseBooksFromEunpyeongHtml, buildTitleMatch } = await import("../server.js");
const config = await (await fetch(new URL("/api/config/providers", baseURL))).json();
const providers = [...config.libraryProviders, ...config.externalProviders, ...config.physicalProviders];
const books = parseBooksFromEunpyeongHtml(
  readFileSync(new URL("./fixtures/eunpyeong-copies.html", import.meta.url), "utf8"),
  "https://www.eplib.or.kr"
).map((book) => ({ ...book, titleMatch: buildTitleMatch(book.title, "쇳돌") }));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined)
});
mkdirSync("test-results", { recursive: true });

try {
  for (const width of [1280, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let scenario = "success";
    if (!live) {
      await page.route("**/api/search/stream?*", (route) => {
        const libraryResults = providers.map((provider) => ({
          providerId: provider.id, providerName: provider.name,
          isPhysicalProvider: Boolean(provider.physicalProvider),
          isExternalProvider: Boolean(provider.externalProvider),
          searchURL: provider.baseURL.replace("{searchTerm}", encodeURIComponent(query)),
          ok: provider.physicalProvider ? scenario !== "failure" : true,
          searchable: provider.physicalProvider ? scenario !== "failure" : true,
          books: provider.physicalProvider && scenario === "success" ? books : []
        }));
        const event = (type, data) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        return route.fulfill({ contentType: "text/event-stream", body:
          event("start", { totalProviders: providers.length }) +
          libraryResults.map((result) => event("provider", result)).join("") +
          event("done", { libraryResults }) });
      });
    }
    await page.goto(baseURL);
    await expect(page.locator("#source-count")).toHaveText(String(providers.length));
    const search = async () => {
      await page.locator("#q").fill(query);
      await page.locator("#search-form").evaluate((form) => form.requestSubmit());
      await expect(page.locator("#progress-label")).toContainText("확인 완료", { timeout: 45000 });
    };
    await search();
    await page.locator('#format-filters [data-format="physical"]').click();
    await expect(page.locator('.availability-row[data-format="physical"]').first()).toBeVisible();
    await expect(page.locator('#book-results .location-name').filter({ hasText: "은평뉴타운도서관" }).first()).toBeVisible();
    await page.locator("#status-filter").selectOption("reserve");
    await expect(page.locator('.availability-row[data-state="reserve"]').first()).toBeVisible();
    assert.ok((await page.locator("#book-results").innerText()).includes("예약 가능"));
    await page.screenshot({ path: `test-results/eunpyeong-${live ? "live" : "fixture"}-${width}.png`, fullPage: true });

    if (!live) {
      scenario = "failure";
      await search();
      await expect(page.locator("#search-warning")).toBeVisible();
      await expect(page.locator("#book-results")).toContainText("아직 책이 없는지 확정할 수 없어요");
      await page.locator("#coverage-status").click();
      await expect(page.locator(".source-row").filter({ hasText: "은평구공공도서관 실물도서" })).toContainText("연결 오류");
      await page.locator("#close-sources").click();
      scenario = "empty";
      await search();
      await expect(page.locator("#search-warning")).toBeHidden();
      await expect(page.locator("#book-results")).toContainText("이 검색어로 찾은 책이 없어요");
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`ok Eunpyong ${live ? "live" : "success/error/empty"} UI width=${width}`);
  }
} finally {
  await browser.close();
}
