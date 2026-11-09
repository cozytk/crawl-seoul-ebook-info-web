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
  for (const width of [1280, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let scenario = "success";
    const requests = [];
    if (!live) {
      await page.route("**/api/search/stream?*", (route) => {
        const params = new URL(route.request().url()).searchParams;
        requests.push(params);
        const requested = params.get('providers')?.split(',');
        const libraryResults = providers.filter(p => !requested || requested.includes(p.id)).map((provider) => ({
          providerId: provider.id, providerName: provider.name,
          isPhysicalProvider: Boolean(provider.physicalProvider),
          isExternalProvider: Boolean(provider.externalProvider),
          searchURL: provider.baseURL.replace("{searchTerm}", encodeURIComponent(query)),
          ok: provider.physicalProvider ? scenario !== "failure" : true,
          searchable: provider.physicalProvider ? scenario !== "failure" : true,
          checkedAt: new Date().toISOString(),
          books: provider.physicalProvider && scenario === "success" ? books.map(book => params.has('fresh')
            ? { ...book, reservationCount: 7, rawStatusText: `${book.rawStatusText} / 예약 7` } : book)
            : provider.id === 'seoul' && scenario !== 'empty' ? [{ ...books[0], localLibraryAccess: false, localLibraryName: '', storeName: '전자책' }] : []
        }));
        const event = (type, data) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        return route.fulfill({ contentType: "text/event-stream", body:
          event("start", { totalProviders: libraryResults.length }) +
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
      assert.equal(new URL(page.url()).searchParams.get('format'), 'physical');
      assert.equal(new URL(page.url()).searchParams.get('status'), 'reserve');
      await page.reload();
      await expect(page.locator('#progress-label')).toContainText('확인 완료');
      await expect(page.locator('#status-filter')).toHaveValue('reserve');
      await expect(page.locator('#format-filters [data-format="physical"]')).toHaveAttribute('aria-pressed', 'true');
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('permission denied')) } }));
      await page.locator('#share-search').click();
      await expect(page.locator('#share-url')).toHaveValue(page.url());
      await page.locator('#close-share').click();
      await page.locator('#refresh-search').click();
      await expect(page.locator('#book-results')).toContainText('예약 7명');
      assert.equal(requests.at(-1).get('fresh'), '1');
      await expect(page.locator('#status-filter')).toHaveValue('reserve');
      await expect(page.locator('#search-progressbar')).toHaveAttribute('aria-valuenow', String(providers.length));

      scenario = "failure";
      await search();
      await expect(page.locator("#search-warning")).toBeVisible();
      await page.locator('#format-filters [data-format="physical"]').click();
      await expect(page.locator("#book-results")).toContainText("이 조건의 검색처를 확인하지 못했어요");
      await page.locator("#coverage-status").click();
      await expect(page.locator(".source-row").filter({ hasText: "은평구공공도서관 실물도서" })).toContainText("연결 오류");
      await page.keyboard.press('Escape');
      await expect(page.locator('#coverage-status')).toBeFocused();
      scenario = "success";
      await page.getByRole('button', { name: '확인 못한 검색처 다시 확인' }).click();
      await expect(page.locator('.availability-row[data-format="physical"]').first()).toBeVisible();
      assert.equal(requests.at(-1).get('providers'), 'eunpyeong-public');
      assert.equal(requests.at(-1).get('fresh'), '1');
      await page.locator('#reset-filters').click();
      const extra = page.locator('.more-locations').first();
      await expect(extra.locator('.availability-row')).toHaveCount(0);
      await extra.locator('summary').click();
      await expect(extra.locator('.availability-row')).toHaveCount(1);
      await expect(page.locator('#book-results .location-name').filter({ hasText: '서울도서관' })).toBeVisible();
      scenario = "empty";
      await search();
      await expect(page.locator("#search-warning")).toBeHidden();
      await expect(page.locator("#book-results")).toContainText("이 검색어로 찾은 책이 없어요");
      const previousRequests = requests.length;
      await page.goto(`${baseURL}/?q=${'a'.repeat(81)}`);
      await expect(page.locator('#query-error')).toBeVisible();
      await expect(page.locator('#q')).toHaveAttribute('aria-invalid', 'true');
      assert.equal(requests.length, previousRequests);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow at ${width}`);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`ok Eunpyong ${live ? "live" : "success/error/empty"} UI width=${width}`);
  }
} finally {
  await browser.close();
}
