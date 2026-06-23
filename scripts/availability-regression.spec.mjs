import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

test.use({ channel: "chrome" });

mkdirSync(".omo/evidence", { recursive: true });

const baseURL = process.env.BASE_URL || "http://localhost:3199";

const viewports = [
  { name: "mobile", width: 375, height: 900 },
  { name: "tablet", width: 768, height: 900 },
  { name: "desktop", width: 1280, height: 900 }
];

async function expectWholePageShell(page) {
  await expect(page.locator(".book-routing-app")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".routing-command")).toBeVisible();
  await expect(page.locator(".decision-runway")).toBeVisible();
  await expect(page.locator("section.library-ledger")).toBeVisible();
  await expect(page.locator(".decision-route")).toHaveCount(6);
  await expect(page.locator(".book-routing-app")).toHaveAttribute("data-no-left-rails", "true");
  await expect(
    page.locator(
      ".app-shell, .topbar, .hero, .results-head, .supported-panel, .results-side, .reader-desk, .verdict-docket, .route-step, .evidence-ledger, .availability-flow, .flow-decision-card"
        + ", .flow-ordered-list, .flow-item, .guide-card, .provider-card, .book-item"
    )
  ).toHaveCount(0);
}

for (const viewport of viewports) {
  test(`shows Seoul subscription as readable and Millie inactive title as not viewable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(baseURL);
    await page.fill("#q", "성매매 경험 당사자 무한발설");
    await page.click('button[type="submit"]');

    await expectWholePageShell(page);
    await expect(page.locator(".answer-ticket")).toBeVisible();
    await expect(page.locator(".routing-command__field")).toBeVisible();
    await expect(
      page.locator(".decision-route").filter({ hasText: "1. 밀리의서재에서 바로 보기" }).locator(".decision-route__answer")
    ).toHaveText("볼 수 없음");
    await expect(page.locator("#decision-board")).toHaveAttribute("aria-busy", "false", { timeout: 30000 });
    await expect(
      page.locator(".decision-route").filter({ hasText: "3. 구독형 도서관에서 열람하기" }).locator(".decision-route__answer")
    ).toHaveText("바로 열람 가능");
    await expect(page.locator(".decision-runway__summary")).toContainText("먼저 가능한 첫 단계");
    await expect(page.getByText("구독형 도서관에서 바로 열람 가능").first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("밀리에서 현재 볼 수 없음").first()).toBeVisible();
    await expect(page.getByText("밀리 검색 노출 · 대출/열람 불가")).toHaveCount(0);
    await expect(page.locator(".library-ledger")).toBeVisible();
    await expect(page.locator(".library-ledger__provider").first()).toBeVisible();
    await expect(page.locator(".catalog-record").first()).toBeVisible();
    await expect(page.locator(".catalog-record__status").first()).toBeVisible();
    await page.screenshot({ path: `.omo/evidence/playwright-seoul-millie-${viewport.name}.png`, fullPage: true });
  });

  test(`shows Eunpyong New Town mutual-loan-in-progress copy as reservable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(baseURL);
    await page.fill("#q", "쇳돌");
    await page.click('button[type="submit"]');

    await expectWholePageShell(page);
    await expect(page.locator(".answer-ticket")).toBeVisible();
    await expect(page.locator("#decision-board")).toHaveAttribute("aria-busy", "false", { timeout: 30000 });
    await expect(page.locator(".answer-ticket__answer")).toContainText("예약 가능");
    await expect(
      page.locator(".decision-route").filter({ hasText: "4. 은평구 공공도서관 직접 대출" }).locator(".decision-route__answer")
    ).toHaveText("직접 대출 없음");
    await expect(
      page.locator(".decision-route").filter({ hasText: "5. 은평구 공공도서관 직접 예약" }).locator(".decision-route__answer")
    ).toHaveText("예약 가능");
    await expect(
      page.locator(".decision-route").filter({ hasText: "6. 어느 도서관이든 예약하기" }).locator(".decision-route__answer")
    ).toHaveText("예약 후보 있음");
    await expect(page.locator(".decision-runway__summary")).toContainText("예약 가능");
    await expect(page.getByText("은평뉴타운도서관").first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("상호대차진행자료").first()).toBeVisible();
    await expect(page.getByText("예약 가능").first()).toBeVisible();
    await expect(page.locator(".library-ledger")).toBeVisible();
    await expect(page.locator(".library-ledger__provider").first()).toBeVisible();
    await expect(page.locator(".catalog-record").first()).toBeVisible();
    await expect(page.locator(".catalog-record__status").first()).toBeVisible();
    await page.screenshot({ path: `.omo/evidence/playwright-eunpyeong-reserve-${viewport.name}.png`, fullPage: true });
  });

  test(`shows generic e-library reservation candidates in the any-library step on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(baseURL);
    await page.fill("#q", "작별하지 않는다");
    await page.click('button[type="submit"]');

    await expectWholePageShell(page);
    await expect(page.locator("#decision-board")).toHaveAttribute("aria-busy", "false", { timeout: 30000 });
    await expect(
      page.locator(".decision-route").filter({ hasText: "6. 어느 도서관이든 예약하기" }).locator(".decision-route__answer")
    ).toHaveText("예약 후보 있음");
    await expect(page.locator(".decision-route").filter({ hasText: "6. 어느 도서관이든 예약하기" })).toContainText(
      /중구도서관|중랑도서관|노원구립도서관|마포구도서관|서초구 전자도서관/
    );
  });
}

test("resets the decision runway when search validation fails", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(baseURL);
  await page.fill("#q", "가".repeat(81));
  await page.click('button[type="submit"]');

  await expect(page.locator("#decision-board")).toHaveAttribute("aria-busy", "false", { timeout: 30000 });
  await expect(page.locator(".decision-runway__summary")).toContainText("검색을 완료하지 못했습니다");
  await expect(page.locator(".result-error")).toContainText("오류:");
});
