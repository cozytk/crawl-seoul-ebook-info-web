import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

test.use({ channel: "chrome" });

mkdirSync(".omo/evidence", { recursive: true });

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

    await expect(page.locator(".flow-decision-card")).toHaveCount(6, { timeout: 30000 });
    await expect(page.locator("#decision-board")).toHaveAttribute("aria-busy", "false");
    await expect(
      page.locator(".flow-decision-card").filter({ hasText: "1. 밀리의서재에서 바로 보기" }).locator(".flow-decision-card__answer")
    ).toHaveText("볼 수 없음");
    await expect(
      page.locator(".flow-decision-card").filter({ hasText: "3. 구독형 도서관에서 열람하기" }).locator(".flow-decision-card__answer")
    ).toHaveText("바로 열람 가능");
    await expect(page.locator(".availability-flow__summary")).toContainText("먼저 가능한 첫 단계");
    await expect(page.getByText("구독형 도서관에서 바로 열람 가능").first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("밀리에서 현재 볼 수 없음").first()).toBeVisible();
    await expect(page.getByText("밀리 검색 노출 · 대출/열람 불가")).toHaveCount(0);
    await page.screenshot({ path: `.omo/evidence/playwright-seoul-millie-${viewport.name}.png`, fullPage: true });
  });

  test(`shows Eunpyong New Town mutual-loan-in-progress copy as reservable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("http://localhost:3199/");
    await page.fill("#q", "쇳돌");
    await page.click('button[type="submit"]');

    await expect(page.locator(".flow-decision-card")).toHaveCount(6, { timeout: 30000 });
    await expect(page.locator("#decision-board")).toHaveAttribute("aria-busy", "false");
    await expect(
      page.locator(".flow-decision-card").filter({ hasText: "4. 은평구 공공도서관 직접 대출" }).locator(".flow-decision-card__answer")
    ).toHaveText("직접 대출 없음");
    await expect(
      page.locator(".flow-decision-card").filter({ hasText: "5. 은평구 공공도서관 직접 예약" }).locator(".flow-decision-card__answer")
    ).toHaveText("예약 가능");
    await expect(
      page.locator(".flow-decision-card").filter({ hasText: "6. 어느 도서관이든 예약하기" }).locator(".flow-decision-card__answer")
    ).toHaveText("예약 후보 있음");
    await expect(page.locator(".availability-flow__summary")).toContainText("예약 가능");
    await expect(page.getByText("은평뉴타운도서관").first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("상호대차진행자료").first()).toBeVisible();
    await expect(page.getByText("예약 가능").first()).toBeVisible();
    await page.screenshot({ path: `.omo/evidence/playwright-eunpyeong-reserve-${viewport.name}.png`, fullPage: true });
  });

  test(`shows generic e-library reservation candidates in the any-library step on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("http://localhost:3199/");
    await page.fill("#q", "작별하지 않는다");
    await page.click('button[type="submit"]');

    await expect(page.locator(".flow-decision-card")).toHaveCount(6, { timeout: 30000 });
    await expect(
      page.locator(".flow-decision-card").filter({ hasText: "6. 어느 도서관이든 예약하기" }).locator(".flow-decision-card__answer")
    ).toHaveText("예약 후보 있음");
    await expect(page.locator(".flow-decision-card").filter({ hasText: "6. 어느 도서관이든 예약하기" })).toContainText(
      /중구도서관|중랑도서관|노원구립도서관|마포구도서관|서초구 전자도서관/
    );
  });
}

test("resets the availability flow when search validation fails", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("http://localhost:3199/");
  await page.fill("#q", "가".repeat(81));
  await page.click('button[type="submit"]');

  await expect(page.locator("#decision-board")).toHaveAttribute("aria-busy", "false", { timeout: 30000 });
  await expect(page.locator(".availability-flow__summary")).toContainText("검색을 완료하지 못했습니다");
  await expect(page.locator(".result-error")).toContainText("오류:");
});
