import { load } from "cheerio";

const text = (value) => String(value || "").replace(/\s+/g, " ").trim();
const invalid = (message) => Object.assign(new Error(message), { retryable: true });
const count = (value) => /^\d+$/.test(String(value ?? "").replace(/,/g, "").trim())
  ? Number(String(value).replace(/,/g, "").trim()) : null;

function detailURL(href, origin, pattern) {
  let url;
  try { url = new URL(href || "", origin); } catch { return null; }
  return url.origin === origin && pattern.test(url.pathname) ? url.toString() : null;
}

function subscriptionBook({ title, author, storeName, detailURL, coverImageURL, plans, status = "", available }) {
  const ended = /서비스\s*종료|이용\s*불가|판매\s*중지|판매\s*종료/.test(status);
  const readable = available && !ended;
  const labels = plans.map((plan) => plan.label);
  return {
    title, author, storeName, detailURL, coverImageURL: coverImageURL || null,
    contentKind: "ebook", contentKindLabel: "전자책",
    subscriptionAccess: Boolean(readable),
    subscriptionPlans: plans.map((plan) => plan.id), subscriptionPlanLabels: labels,
    holdingsCount: null, availableCount: null, loanedCount: null, reservationCount: null,
    decision: {
      state: readable ? "borrow_now" : ended ? "unavailable" : "unknown",
      confidence: readable || ended ? "high" : "low",
      reason: readable ? "subscription_provider_listed" : ended ? "subscription_provider_unavailable" : "subscription_plan_unconfirmed"
    },
    rawStatusText: [author ? `저자 ${author}` : "", ...labels, status, readable ? "구독 대상 도서" : ended ? "현재 이용 불가" : "구독 종류 확인 필요"].filter(Boolean).join(" / ")
  };
}

export function parseSamSearchPage(html) {
  const $ = load(html);
  const totalResults = count($('input[name="totalNumber"]').first().val());
  const samPage = $('#targetHidden').val() === "sam" || $('.tab_item.ui-state-active[data-target="sam"]').length;
  if (!samPage || !$('#result_contents').length || totalResults === null) {
    throw invalid("교보 SAM 구독 검색 응답을 확인할 수 없습니다.");
  }
  const rows = $('#shopData_list li.prod_item').toArray();
  if (totalResults === 0) {
    if (rows.length) throw invalid("교보 SAM 검색 결과 수가 일치하지 않습니다.");
    return { books: [], totalResults: 0, recordCount: 0 };
  }
  if (!rows.length) throw invalid("교보 SAM 도서 목록을 읽지 못했습니다.");
  const books = rows.map((element) => {
    const node = $(element);
    const anchor = node.find('a.prod_info').first();
    const title = text(anchor.find('[id^="cmdtName_"]').first().text()) || text(anchor.clone().find('.prod_category').remove().end().text());
    const url = detailURL(anchor.attr('href'), "https://ebook-product.kyobobook.co.kr", /^\/dig\/epd\/sam\/[A-Za-z0-9]+$/);
    if (!title || !url) throw invalid("교보 SAM 도서 정보를 일부 읽지 못했습니다.");
    const badges = node.find('.prod_badge .badge_digital').filter((_, badge) => {
      return !$(badge).parents().addBack().toArray().some((item) =>
        $(item).is('[hidden], [aria-hidden="true"], .hidden, .hide') || /display\s*:\s*none|visibility\s*:\s*hidden/i.test($(item).attr('style') || '')
      );
    });
    const plans = [];
    if (badges.filter('.premium').length) plans.push({ id: "sam-premium", label: "SAM 프리미엄" });
    if (badges.filter('.unlimited').length) plans.push({ id: "sam-unlimited", label: "SAM 무제한" });
    const author = [...new Set(node.find('.prod_author_info .author').toArray().map((item) => text($(item).text())).filter(Boolean))].join(", ");
    const status = text(node.find('.prod_state, .prod_status, .prod_condition').text());
    return subscriptionBook({ title, author, detailURL: url,
      storeName: "교보문고 SAM · 전자책", coverImageURL: node.find('.prod_thumb_box img').first().attr('src'),
      plans, status, available: plans.length > 0 });
  });
  return { books, totalResults, recordCount: rows.length };
}

export function parseCremaClubSearchPage(html) {
  const $ = load(html);
  if (!$('#bCCateGoodsWrap').length || !/크레마클럽|CREMACLUB/i.test($('title').text())) {
    throw invalid("YES24 크레마클럽 검색 응답을 확인할 수 없습니다.");
  }
  const noResults = $('#bCCateGoodsWrap .noData.schData .txt_tit');
  const rows = $('#yesSchList > li').toArray();
  if (noResults.length && /검색결과가\s*없습니다/.test(text(noResults.text()))) {
    if (rows.length) throw invalid("크레마클럽 검색 결과 수가 일치하지 않습니다.");
    return { books: [], totalResults: 0, recordCount: 0 };
  }
  const totalResults = count($('.bCGoodsSecTit').first().text().match(/상품\s*\(\s*([\d,]+)\s*\)/)?.[1]);
  if (totalResults === null || !$('#yesSchList').length || (totalResults > 0 && !rows.length)) {
    throw invalid("크레마클럽 구독 도서 목록을 읽지 못했습니다.");
  }
  const books = rows.map((element) => {
    const node = $(element);
    const anchor = node.find('a.gd_name').first();
    const title = text(anchor.text());
    const url = detailURL(anchor.attr('href'), "https://cremaclub.yes24.com", /^\/BookClub\/Detail\/\d+$/i);
    if (!title || !url) throw invalid("크레마클럽 도서 정보를 일부 읽지 못했습니다.");
    const action = node.find('.btn_addBC[data-ebook-code]').filter((_, item) =>
      $(item).attr('data-ebook-code') && !$(item).is('[disabled], [aria-disabled="true"]')
    );
    const status = text(node.find('.gd_status, .item_status, .info_status, .service_status').text());
    return subscriptionBook({ title, author: text(node.find('.info_auth').first().text()), detailURL: url,
      storeName: "YES24 크레마클럽 · 전자책",
      coverImageURL: node.find('.img_grp img').first().attr('data-original') || node.find('.img_grp img').first().attr('src'),
      plans: action.length ? [{ id: "cremaclub", label: "크레마클럽" }] : [], status, available: action.length > 0 });
  });
  return { books, totalResults, recordCount: rows.length };
}
