import { expect, test } from "@playwright/test";

test.use({ channel: "chrome" });

const viewports = [
  { name: "mobile", width: 375, height: 900 },
  { name: "tablet", width: 768, height: 900 },
  { name: "desktop", width: 1280, height: 900 }
];

for (const viewport of viewports) {
  test(`shows Seoul subscription as readable and Millie inactive title as not viewable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("http://localhost:3199/");
    await page.fill("#q", "성매매 경험 당사자 무한발설");
    await page.click('button[type="submit"]');

    await expect(page.getByText("구독형 도서관에서 바로 열람 가능").first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("밀리에서 현재 볼 수 없음").first()).toBeVisible();
    await expect(page.getByText("밀리 검색 노출 · 대출/열람 불가")).toHaveCount(0);
    await page.screenshot({ path: `.omx/playwright-seoul-millie-${viewport.name}.png`, fullPage: true });
  });

  test(`shows Eunpyong New Town mutual-loan-in-progress copy as reservable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("http://localhost:3199/");
    await page.fill("#q", "쇳돌");
    await page.click('button[type="submit"]');

    await expect(page.getByText("은평뉴타운도서관").first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("상호대차진행자료").first()).toBeVisible();
    await expect(page.getByText("예약 가능").first()).toBeVisible();
    await page.screenshot({ path: `.omx/playwright-eunpyeong-reserve-${viewport.name}.png`, fullPage: true });
  });
}
