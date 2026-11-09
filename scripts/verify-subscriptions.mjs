import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { parseSamSearchPage, parseCremaClubSearchPage } from "../lib/subscription-catalogs.js";

const baseURL = process.env.BASE_URL || "http://localhost:3199";
const live = process.env.LIVE_VERIFY === "1";
const query = "불편한 편의점";
process.env.VERCEL = "1";
const { buildTitleMatch } = await import("../server.js");
const config = await (await fetch(new URL("/api/config/providers", baseURL))).json();
const providers = [...config.libraryProviders, ...config.externalProviders, ...config.physicalProviders];
const sample = (file, parse) => parse(readFileSync(new URL(`./fixtures/${file}.html`, import.meta.url), "utf8")).books.map((book) => {
  const titleMatch = buildTitleMatch(book.title, query);
  return { ...book, titleMatch, titleMatchScore: titleMatch.score, isExactTitleMatch: titleMatch.level === "exact" };
});
const sam = sample("sam-search", parseSamSearchPage);
const crema = sample("cremaclub-search", parseCremaClubSearchPage);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined) });
mkdirSync("test-results", { recursive: true });

try {
  for (const width of [1280, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (!live) {
      await page.route('**/api/search/stream?*', (route) => {
        const libraryResults = providers.map((provider) => ({
          providerId: provider.id, providerName: provider.name,
          isExternalProvider: Boolean(provider.externalProvider), isPhysicalProvider: Boolean(provider.physicalProvider),
          ok: true, searchable: true, checkedAt: new Date().toISOString(),
          books: provider.id === 'kyobo-sam' ? sam : provider.id === 'yes24-cremaclub' ? crema : []
        }));
        const event = (type, data) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        return route.fulfill({ contentType: 'text/event-stream', body: event('start', { totalProviders: providers.length }) +
          libraryResults.map((result) => event('provider', result)).join('') + event('done', { libraryResults }) });
      });
    }
    await page.goto(baseURL);
    await expect(page.locator('#source-count')).toHaveText(String(providers.length));
    await expect(page.locator('#subscription-count')).toHaveText('3곳');
    await page.locator('#q').fill(query);
    await page.locator('#search-form').evaluate((form) => form.requestSubmit());
    await expect(page.locator('#progress-label')).toContainText('확인 완료', { timeout: 45000 });
    const exactCard = () => page.locator('.book-card').filter({ has: page.getByRole('heading', { name: query, exact: true }) });
    await page.locator('#provider-filter').selectOption('kyobo-sam');
    await expect(exactCard().locator('.location-name')).toHaveText('교보문고 SAM');
    await expect(exactCard().locator('.subscription-plans')).toHaveText('SAM 프리미엄');
    await expect(exactCard().locator('.location-detail')).toContainText('김호연');
    await expect(page.locator('#recommendation')).toContainText('SAM 프리미엄');
    await expect(page.locator('#recommendation')).toContainText('김호연');
    await page.screenshot({ path: `test-results/sam-${live ? 'live' : 'fixture'}-${width}.png`, fullPage: true });

    await page.locator('#provider-filter').selectOption('yes24-cremaclub');
    await expect(exactCard().locator('.location-name')).toHaveText('YES24 크레마클럽');
    await expect(exactCard().locator('.subscription-plans')).toHaveText('크레마클럽');
    await expect(exactCard().locator('.availability')).toHaveText('바로 읽기 가능');
    await expect(exactCard().locator('.location-detail')).toContainText('김호연');
    assert.equal(new URL(page.url()).searchParams.get('provider'), 'yes24-cremaclub');
    await page.screenshot({ path: `test-results/cremaclub-${live ? 'live' : 'fixture'}-${width}.png`, fullPage: true });
    await page.locator('#coverage-status').click();
    await expect(page.locator('.source-row').filter({ hasText: '교보문고 SAM' })).toContainText('프리미엄·무제한');
    await expect(page.locator('.source-row').filter({ hasText: 'YES24 크레마클럽' })).toContainText('구독 도서');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`ok SAM premium/CREMA ${live ? 'live' : 'fixture'} UI width=${width}`);
  }
} finally {
  await browser.close();
}
