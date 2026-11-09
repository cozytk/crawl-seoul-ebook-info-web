import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { load } from "cheerio";
import { parseSamSearchPage, parseCremaClubSearchPage } from "../lib/subscription-catalogs.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
const samHTML = fixture("sam-search");
const cremaHTML = fixture("cremaclub-search");
process.env.VERCEL = "1";
const { searchProvider, externalProviders } = await import("../server.js");

test("SAM reads premium-only and dual-plan books separately from actual catalogue badges", () => {
  const page = parseSamSearchPage(samHTML);
  assert.equal(page.totalResults, 6);
  assert.equal(page.recordCount, 6);
  const exact = page.books.find((book) => book.title === "불편한 편의점");
  assert.equal(exact.author, "김호연");
  assert.deepEqual(exact.subscriptionPlans, ["sam-premium"]);
  assert.equal(exact.decision.state, "borrow_now");
  assert.deepEqual(page.books.find((book) => book.title === "선택은 어디서 달라지는가").subscriptionPlans, ["sam-premium", "sam-unlimited"]);
});

test("SAM does not assume premium access for unlimited-only books or availability without a visible badge", () => {
  const $ = load(samHTML);
  const first = $('#shopData_list li.prod_item').first();
  first.find('.prod_badge').html('<span class="badge_digital unlimited">sam무제한</span>');
  assert.deepEqual(parseSamSearchPage($.html()).books[0].subscriptionPlans, ["sam-unlimited"]);
  first.find('.prod_badge').html('<span class="badge_digital premium" hidden>sam프리미엄</span>');
  const unknown = parseSamSearchPage($.html()).books[0];
  assert.deepEqual(unknown.subscriptionPlans, []);
  assert.equal(unknown.subscriptionAccess, false);
  assert.equal(unknown.decision.state, "unknown");
  first.find('.prod_badge').html('<span class="badge_digital premium">sam프리미엄</span>').attr('hidden', '');
  assert.equal(parseSamSearchPage($.html()).books[0].decision.state, "unknown");
});

test("CREMA reads only subscription catalogue rows and their authors and real covers", () => {
  const page = parseCremaClubSearchPage(cremaHTML);
  assert.equal(page.totalResults, 3);
  assert.equal(page.books[0].title, "불편한 편의점");
  assert.equal(page.books[0].author, "김호연 저");
  assert.deepEqual(page.books[0].subscriptionPlans, ["cremaclub"]);
  assert.equal(page.books[0].detailURL, "https://cremaclub.yes24.com/BookClub/Detail/101506482");
  assert.equal(page.books[0].coverImageURL, "https://image.yes24.com/goods/101506482/L");
  assert.equal(page.books[0].decision.state, "borrow_now");
});

test("expired CREMA books and rows without a subscription action are not labelled readable", () => {
  const $ = load(cremaHTML);
  const first = $('#yesSchList > li').first();
  first.find('.item_info').append('<span class="service_status">서비스 종료</span>');
  assert.equal(parseCremaClubSearchPage($.html()).books[0].decision.state, "unavailable");
  first.find('.service_status').remove();
  first.find('.btn_addBC').remove();
  assert.equal(parseCremaClubSearchPage($.html()).books[0].decision.state, "unknown");
});

test("validated empty catalogues are empty; general store pages and HTTP 200 error documents are errors", () => {
  for (const [parse, empty] of [[parseSamSearchPage, fixture('sam-empty')], [parseCremaClubSearchPage, fixture('cremaclub-empty')]]) {
    assert.deepEqual(parse(empty), { books: [], totalResults: 0, recordCount: 0 });
    assert.throws(() => parse('<html><title>점검 중</title><body>잠시 후 다시 시도하세요.</body></html>'), { retryable: true });
  }
  assert.throws(() => parseSamSearchPage(samHTML.replace('value="sam"', 'value="ebook"')), { retryable: true });
  assert.throws(() => parseCremaClubSearchPage('<title>YES24 크레마클럽</title><ul><li>일반 전자책 판매 상품</li></ul>'), { retryable: true });
});

test("catalogue parsing rejects broken or off-site product links instead of hiding unread rows", () => {
  const $ = load(cremaHTML);
  $('#yesSchList .gd_name').first().attr('href', 'https://example.com/BookClub/Detail/123');
  assert.throws(() => parseCremaClubSearchPage($.html()), { retryable: true });
  const sam = load(samHTML);
  sam('#shopData_list a.prod_info').first().remove();
  assert.throws(() => parseSamSearchPage(sam.html()), { retryable: true });
});

test("SAM integration pages through the dedicated eBook subscription catalogue", async (t) => {
  const first = load(samHTML);
  first('input[name=totalNumber]').val('7');
  const second = load(samHTML);
  second('input[name=totalNumber]').val('7');
  second('#shopData_list li.prod_item').slice(1).remove();
  second('#shopData_list a.prod_info').first().attr('href', 'https://ebook-product.kyobobook.co.kr/dig/epd/sam/E000099999999?tabType=SAM');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    requests.push(url);
    return new Response(url.searchParams.get('page') === '1' ? first.html() : second.html(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
  const result = await searchProvider(externalProviders.find((provider) => provider.id === 'kyobo-sam'), '불편한 편의점');
  assert.equal(result.ok, true);
  assert.equal(result.partialResults, false);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.checkedResults, 7);
  assert.deepEqual(requests.map((url) => url.searchParams.get('page')), ['1', '2']);
  assert.equal(requests[0].searchParams.get('target'), 'sam');
  assert.equal(requests[0].searchParams.get('cat1'), 'eBook@SAM');
  assert.equal(result.isExternalProvider, true);
  assert.equal(result.isSubscriptionProvider, true);
});

test("CREMA integration retries a temporary error page and preserves plan and title evidence", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (input) => {
    assert.equal(new URL(input).origin, 'https://cremaclub.yes24.com');
    calls += 1;
    return new Response(calls === 1 ? '<title>점검 중</title>' : cremaHTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
  const result = await searchProvider(externalProviders.find((provider) => provider.id === 'yes24-cremaclub'), '불편한 편의점');
  assert.equal(calls, 2);
  assert.equal(result.ok, true);
  const book = result.books.find((item) => item.title === '불편한 편의점');
  assert.equal(book.isExactTitleMatch, true);
  assert.deepEqual(book.subscriptionPlanLabels, ['크레마클럽']);
  assert.equal(book.decision.state, 'borrow_now');
});
