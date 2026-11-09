import express from "express";
import { collectSearchPages } from "./lib/search-pagination.js";
import { withProviderRetry } from "./lib/provider-retry.js";
import { createSearchRouter } from "./lib/search-runtime.js";
import { parseSamSearchPage, parseCremaClubSearchPage } from "./lib/subscription-catalogs.js";
import { load } from "cheerio";
import iconv from "iconv-lite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3199;

const libraryProviders = [
  { id: "seoul", name: "서울도서관", baseURL: "https://elib.seoul.go.kr/contents/search/content?t=EB&k={searchTerm}", isEucKR: false, loginURL: "https://elib.seoul.go.kr/login" },
  { id: "eunpyeong-ebook", name: "은평구립도서관", baseURL: "https://epbook.eplib.or.kr/search?keyword={searchTerm}", apiBaseURL: "https://epbook.eplib.or.kr", isEucKR: false, loginURL: "https://epbook.eplib.or.kr/login" },
  { id: "nanet", name: "국회도서관", baseURL: "https://nanet.dkyobobook.co.kr/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://nanet.dkyobobook.co.kr/member/login.ink", subscriptionListAvailable: true },
  { id: "junggu", name: "중구도서관", baseURL: "https://ebook.junggulib.or.kr/elibrary-front/search/searchList.ink?schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.junggulib.or.kr/elibrary-front/member/login.ink" },
  { id: "yongsan", name: "용산도서관", baseURL: "https://ebook.yslibrary.or.kr/elibrary-front/search/searchList.ink?schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.yslibrary.or.kr/elibrary-front/member/login.ink" },
  { id: "jungnang", name: "중랑도서관", baseURL: "https://ebook.jungnanglib.seoul.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.jungnanglib.seoul.kr/elibrary-front/member/login.ink" },
  { id: "ydp", name: "영등포도서관", baseURL: "https://ydplib.dkyobobook.co.kr/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ydplib.dkyobobook.co.kr/member/login.ink", subscriptionListAvailable: true },
  { id: "gangnam", name: "강남구 전자도서관", baseURL: "https://ebook.gangnam.go.kr/elibbook/book_info.asp?search=title&strSearch={searchTerm}", isEucKR: true, loginURL: "https://ebook.gangnam.go.kr/elibbook/login.asp" },
  { id: "dongdaemun", name: "동대문도서관", baseURL: "https://e-book.l4d.or.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://e-book.l4d.or.kr/elibrary-front/main.ink" },
  { id: "nowon", name: "노원구립도서관", baseURL: "https://eb.nowonlib.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://eb.nowonlib.kr/elibrary-front/main.ink" },
  { id: "jongno", name: "종로구도서관", baseURL: "https://elib.jongno.go.kr/search/?srch_order=total&src_key={searchTerm}", isEucKR: false, loginURL: "https://elib.jongno.go.kr/member/?mode=login" },
  { id: "mapo", name: "마포구도서관", baseURL: "https://ebook.mapo.go.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.mapo.go.kr/elibrary-front/main.ink" },
  { id: "seongdong", name: "성동구도서관", baseURL: "https://ebook.sdlib.or.kr:444/elibrary-front/search/searchList.ink?schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.sdlib.or.kr:444/elibrary-front/member/login.ink" },
  { id: "seocho", name: "서초구 전자도서관", baseURL: "https://e-book.seocholib.or.kr/search?keyword={searchTerm}", apiBaseURL: "https://e-book.seocholib.or.kr", contentTypes: ["EB", "SUBS"], isEucKR: false, loginURL: "https://e-book.seocholib.or.kr/login" }
];

const externalProviders = [
  {
    id: "millie",
    name: "밀리의서재",
    baseURL: "https://www.millie.co.kr/v4/library/search/{searchTerm}",
    isEucKR: false,
    loginURL: "https://www.millie.co.kr/v3/login?isReferer=Y",
    subscriptionListAvailable: true,
    externalProvider: true
  },
  {
    id: "kyobo-sam", name: "교보문고 SAM",
    baseURL: "https://search.kyobobook.co.kr/search?keyword={searchTerm}&gbCode=SAM&target=sam&cat1=eBook%40SAM",
    loginURL: "https://order.kyobobook.co.kr/login", isEucKR: false,
    subscriptionListAvailable: true, externalProvider: true,
    subscriptionDescription: "도서마다 SAM 프리미엄·무제한 대상 여부를 구분합니다."
  },
  {
    id: "yes24-cremaclub", name: "YES24 크레마클럽",
    baseURL: "https://cremaclub.yes24.com/BookClub/Search?query={searchTerm}",
    loginURL: "https://www.yes24.com/Templates/FTLogin.aspx", isEucKR: false,
    subscriptionListAvailable: true, externalProvider: true,
    subscriptionDescription: "크레마클럽 전용 구독 도서 목록을 확인합니다."
  }
];

const physicalProviders = [
  {
    id: "eunpyeong-public",
    name: "은평구공공도서관 실물도서",
    baseURL: "https://www.eplib.or.kr/intro/menu/10003/program/30006/alpasq/searchResultList.do?searchType=SIMPLE&searchManageCode=ALL&searchPubFormCode=MO&searchKeyword={searchTerm}",
    isEucKR: false,
    loginURL: "https://www.eplib.or.kr/intro/program/memberLogin.do",
    physicalProvider: true
  }
];

const eunpyeongUnified = {
  id: "eunpyeong-unified",
  name: "은평구립도서관 통합검색",
  baseURL: "https://www.eplib.or.kr/intro/menu/10003/program/30006/alpasq/searchResultList.do?searchType=SIMPLE&searchManageCode=ALL&searchPubFormCode=MO&searchKeyword={searchTerm}",
  isEucKR: false,
  loginURL: "https://www.eplib.or.kr/intro/program/memberLogin.do"
};

const samStore = externalProviders.find((provider) => provider.id === "kyobo-sam");

const searchProviders = [...externalProviders, ...libraryProviders, ...physicalProviders];

const queryHeaders = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"
};

const MAX_QUERY_LENGTH = Number(process.env.MAX_QUERY_LENGTH || 80);
const PROVIDER_FETCH_TIMEOUT_MS = Number(process.env.PROVIDER_FETCH_TIMEOUT_MS || 20000);
const SEARCH_CACHE_TTL_MS = Number(process.env.SEARCH_CACHE_TTL_MS || 120000);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 20);
const INVALID_CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

const searchRateLimitBuckets = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/config/providers", (_, res) => {
  res.json({
    libraryProviders: libraryProviders.map((provider) => ({
      ...provider,
      libraryModel: resolveLibraryModel(provider)
    })),
    externalProviders: externalProviders.map((provider) => ({
      ...provider,
      libraryModel: resolveLibraryModel(provider)
    })),
    physicalProviders: physicalProviders.map((provider) => ({
      ...provider,
      libraryModel: resolveLibraryModel(provider)
    })),
    eunpyeongUnified,
    samStore
  });
});

app.use("/api/search", createSearchRouter({
  providers: searchProviders,
  search: searchProvider,
  buildFlow: buildSearchFlow,
  validateQuery,
  consumeRateLimit: consumeSearchRateLimit,
  ttlMs: SEARCH_CACHE_TTL_MS
}));

function buildSearchFlow(query, libraryResults) {
  const millieResult = libraryResults.find((result) => result.providerId === "millie");
  const hasMillieExactEbook = Boolean(
    millieResult?.books?.some(
      (book) =>
        book.contentKind === "ebook" &&
        book.isExactTitleMatch &&
        book.decision?.state === "borrow_now"
    )
  );
  const hasMillieExactAny = Boolean(
    millieResult?.books?.some((book) => book.isExactTitleMatch && book.decision?.state === "borrow_now")
  );
  const anySeoulEbookBorrowable = libraryResults.some((result) =>
    !result.isExternalProvider &&
    !result.isPhysicalProvider &&
    result.books.some((book) => isImmediateBorrowCandidate(book) && isStrongTitleCandidate(book))
  );
  const anyEunpyeongPhysicalBorrowable = libraryResults.some((result) =>
    result.isPhysicalProvider && result.books.some((book) => isImmediateBorrowCandidate(book))
  );

  return {
    phase1: {
      label: "밀리의서재 확인",
      completed: true,
      hasBorrowable: hasMillieExactAny,
      hasPrimary: hasMillieExactEbook,
      searchURL: constructURL(externalProviders[0], query)
    },
    phase2: {
      label: "서울 전역 전자책 검색",
      completed: true,
      enabled: !hasMillieExactEbook,
      hasBorrowable: anySeoulEbookBorrowable
    },
    phase3: {
      label: "은평구공공도서관 실물 대출 확인",
      enabled: !hasMillieExactEbook && !anySeoulEbookBorrowable,
      hasBorrowable: anyEunpyeongPhysicalBorrowable,
      searchURL: constructURL(physicalProviders[0], query),
      externalLinks: [
        { id: "eunpyeong-public", label: "은평구공공도서관 검색", searchURL: constructURL(physicalProviders[0], query) },
        { id: "kyobo-sam", label: "교보 SAM 검색", searchURL: constructURL(samStore, query) }
      ]
    }
  };
}

if (!process.env.VERCEL && process.argv[1] === __filename) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`ebook-local-web started: http://localhost:${PORT}`);
  });
}

export default app;

async function searchProvider(provider, query, { signal: parentSignal } = {}) {
  const searchURL = constructURL(provider, query);
  const timeoutController = new AbortController();
  const controller = { signal: parentSignal ? AbortSignal.any([parentSignal, timeoutController.signal]) : timeoutController.signal };
  const timeoutId = setTimeout(() => timeoutController.abort(), PROVIDER_FETCH_TIMEOUT_MS);

  try {
    controller.signal.throwIfAborted();
    let result;
    if (provider.id === "seoul") {
      result = await fetchSeoulBooks(provider, query, controller.signal);
    } else if (provider.id === "millie") {
      result = await fetchMillieBooks(provider, query, controller.signal);
    } else if (["kyobo-sam", "yes24-cremaclub"].includes(provider.id)) {
      result = await fetchSubscriptionCatalogBooks(provider, query, controller.signal);
    } else if (provider.id === "eunpyeong-public") {
      result = await fetchEunpyeongPublicBooks(provider, query, controller.signal);
    } else if (provider.apiBaseURL) {
      result = await fetchEcoBooks(provider, query, controller.signal);
    } else {
      result = await fetchHtmlBooks(provider, query, controller.signal);
    }
    const { response, books: parsedBooks, ...coverage } = result;

    const books = parsedBooks
      .map((book) => enrichBookForQuery(book, query))
      .sort((a, b) => scoreBook(b) - scoreBook(a))
      .map((book) => {
        const { detailOnclick, previewOnclick, ...safeBook } = book;
        return {
          ...safeBook,
          detailURL: resolveDetailURL(book.detailURL, searchURL, detailOnclick),
          previewURL: resolvePreviewURL(book.previewURL, previewOnclick, searchURL),
          coverImageURL: resolveCoverImageURL(book.coverImageURL, searchURL),
          providerId: provider.id,
          providerName: provider.name,
          decision:
            provider.subscriptionListAvailable &&
            !provider.externalProvider &&
            book.title &&
            isStrongTitleCandidate(book) &&
            book.decision?.state !== "unavailable"
              ? {
                  state: "borrow_now",
                  confidence: "medium",
                  reason: "library_subscription_provider_listed"
                }
              : book.decision
        };
      });

    return {
      providerId: provider.id,
      providerName: provider.name,
      searchURL,
      loginURL: provider.loginURL,
      isSubscriptionProvider: Boolean(provider.subscriptionListAvailable),
      isExternalProvider: Boolean(provider.externalProvider),
      isPhysicalProvider: Boolean(provider.physicalProvider),
      libraryModel: resolveLibraryModel(provider),
      ...coverage,
      searchable: response.ok,
      ok: response.ok,
      statusCode: response.status,
      books
    };
  } catch (error) {
    const message = normalizeProviderError(error);
    if (process.env.VERCEL && !parentSignal?.aborted) {
      console.warn("Provider search failed", {
        providerId: provider.id,
        code: error.cause?.code || error.code || error.name,
        message
      });
    }
    return {
      providerId: provider.id,
      providerName: provider.name,
      searchURL,
      loginURL: provider.loginURL,
      isSubscriptionProvider: Boolean(provider.subscriptionListAvailable),
      isExternalProvider: Boolean(provider.externalProvider),
      isPhysicalProvider: Boolean(provider.physicalProvider),
      libraryModel: resolveLibraryModel(provider),
      searchable: false,
      ok: false,
      statusCode: error.statusCode || 0,
      error: message,
      books: []
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function assertProviderResponse(response) {
  if (!response.ok) {
    const error = new Error(`도서관 응답 오류 (HTTP ${response.status})`);
    error.statusCode = response.status;
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) {
      error.retryAfterMs = /^\d+(?:\.\d+)?$/.test(retryAfter)
        ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0;
    }
    response.body?.cancel().catch(() => {});
    throw error;
  }
}

async function readProviderJSON(response, selectList) {
  assertProviderResponse(response);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw providerDataError("검색 응답이 JSON 형식이 아닙니다. 도서관 연결을 확인해 주세요.");
  }
  if (!Array.isArray(selectList(payload))) {
    throw providerDataError("검색 응답 구조가 변경되었거나 도서관이 오류를 반환했습니다.");
  }
  return payload;
}

function providerDataError(message) {
  return Object.assign(new Error(message), { retryable: true });
}

function collectProviderSearchPages(fetchPage, signal, retryOptions = {}) {
  return collectSearchPages((page) => withProviderRetry(
    (attemptSignal) => fetchPage(page, attemptSignal), { ...retryOptions, signal }
  ));
}

async function fetchMillieBooks(provider, query, signal) {
  return collectProviderSearchPages(async (page, signal) => {
    const apiURL = new URL("https://live-api.millie.co.kr/v3/search/content");
    apiURL.search = new URLSearchParams({
      keyword: query, orderBy: "accuracy", startPage: String(page), limitCount: "20",
      searchType: "isInactive", rent_yn: "N", adult_yn: "Y"
    }).toString();
    const response = await fetch(apiURL, {
      headers: { ...queryHeaders, Accept: "application/json", Origin: "https://www.millie.co.kr", Referer: constructURL(provider, query) }, signal
    });
    const payload = await readProviderJSON(response, (data) => data?.RESP_DATA?.list);
    const list = payload.RESP_DATA.list;
    const totalResults = toFiniteNumber(payload.RESP_DATA.total);
    return { response, books: parseBooksFromMilliePayload(payload, query), totalResults, recordCount: list.length,
      hasMore: list.length > 0 && (totalResults === null ? list.length === 20 : page * 20 < totalResults) };
  }, signal);
}

async function fetchSubscriptionCatalogBooks(provider, query, signal) {
  const sam = provider.id === "kyobo-sam";
  let pageSize = sam ? 60 : 20;
  return collectProviderSearchPages(async (page, attemptSignal) => {
    const url = new URL(constructURL(provider, query));
    url.searchParams.set("page", String(page));
    if (sam) url.searchParams.set("len", "60");
    const response = await fetch(url, {
      headers: { ...queryHeaders, Accept: "text/html", Referer: sam ? "https://sam.kyobobook.co.kr/" : "https://cremaclub.yes24.com/BookClub/Main" },
      signal: attemptSignal
    });
    assertProviderResponse(response);
    const html = await decodeProviderHtml(response, provider);
    const parsed = sam ? parseSamSearchPage(html) : parseCremaClubSearchPage(html);
    if (page === 1 && parsed.recordCount) pageSize = parsed.recordCount;
    return { response, ...parsed, hasMore: page * pageSize < parsed.totalResults };
  }, signal);
}

async function fetchEunpyeongPublicBooks(provider, query, signal) {
  // The migrated site sometimes returns an HTTP 200 error page. Allow one more
  // complete page read, keeping three attempts within the provider's 20s budget.
  return collectProviderSearchPages(async (page, signal) => {
    const url = new URL(constructURL(provider, query));
    url.searchParams.set("currentPageNo", String(page));
    url.searchParams.set("searchDisplay", "80");
    const response = await fetch(url, {
      headers: {
        ...queryHeaders,
        Accept: "text/html",
        Referer: new URL("searchSimple.do", url).toString()
      },
      signal
    });
    assertProviderResponse(response);
    const html = await response.text();
    const $ = load(html);
    const totalResults = toFiniteNumber($("#facetCnt").text().replace(/,/g, ""));
    if (totalResults === null || !$("#bookList").length) throw providerDataError("은평 통합검색 응답 구조를 확인할 수 없습니다.");
    const books = parseBooksFromEunpyeongHtml(html, url.toString());
    // The catalogue renders a placeholder <li> even when its validated total is 0.
    const recordCount = totalResults === 0 ? 0 : $("#bookList .book-list > li").length;
    if (totalResults === 0 && books.length) throw providerDataError("은평 검색 결과 수가 도서 정보와 일치하지 않습니다.");
    if (totalResults > 0 && (!recordCount || books.length !== recordCount)) throw providerDataError("은평 검색 결과 일부를 읽지 못했습니다.");
    return { response, books, totalResults, recordCount, hasMore: page * 80 < totalResults };
  }, signal, { attempts: 3, attemptTimeoutMs: 5000, retryDelayMs: 500 });
}

async function fetchSeoulBooks(provider, query, signal) {
  return collectProviderSearchPages(async (page, signal) => {
    const apiURL = new URL("/api/contents/search", provider.baseURL);
    apiURL.search = new URLSearchParams({
      libCode: "", contentType: "EB", searchKeyword: query, searchOption: "4", sortOption: "1",
      innerSearchYN: "N", innerKeyword: "", currentCount: String(page), pageCount: "30",
      loanable: "", isTotal: "false", showType: "A", searchCombine: "N"
    }).toString();
    const response = await fetch(apiURL, { headers: { ...queryHeaders, Accept: "application/json", Referer: constructURL(provider, query) }, signal });
    const payload = await readProviderJSON(response, (data) => data?.ContentDataList);
    const list = payload.ContentDataList;
    const totalResults = toFiniteNumber(payload.totalCount);
    return { response, books: parseBooksFromSeoulPayload(payload), totalResults, recordCount: list.length,
      hasMore: list.length > 0 && (totalResults === null ? list.length === 30 : page * 30 < totalResults) };
  }, signal);
}

async function fetchEcoBooks(provider, query, signal) {
  const contentTypes = provider.contentTypes || ["EB"];
  const outcomes = await Promise.allSettled(contentTypes.map((type) => fetchEcoBooksForType(provider, query, signal, type)));
  const results = outcomes.filter((item) => item.status === "fulfilled").map((item) => item.value);
  if (!results.length) throw outcomes[0].reason;
  const failedTypes = contentTypes.filter((_, index) => outcomes[index].status === "rejected");
  const warnings = results.map((result) => result.warning).filter(Boolean);
  if (failedTypes.length) warnings.push(`${failedTypes.map((type) => type === "SUBS" ? "구독형" : "소장형").join(", ")} 검색을 확인하지 못했습니다.`);
  return {
    response: results[0].response,
    books: results.flatMap((result) => result.books),
    totalResults: failedTypes.length || results.some((result) => result.totalResults === null) ? null : results.reduce((sum, result) => sum + result.totalResults, 0),
    checkedResults: results.reduce((sum, result) => sum + result.checkedResults, 0),
    pagesFetched: results.reduce((sum, result) => sum + result.pagesFetched, 0),
    partialResults: warnings.length > 0,
    warning: warnings.join(" ") || null,
    sourceBreakdown: contentTypes.map((contentType, index) => ({
      contentType, ok: outcomes[index].status === "fulfilled", totalResults: outcomes[index].value?.totalResults ?? null
    }))
  };
}

async function fetchEcoBooksForType(provider, query, signal, contentType) {
  return collectProviderSearchPages(async (page, signal) => {
    const apiURL = new URL("/api/service/search/simple", provider.apiBaseURL);
    apiURL.search = new URLSearchParams({
      contentType, searchType: "", detailQuery: "", isbn: "", OnlyStartWith: "",
      sort: "title", asc: "desc", loanable: "N", page: String(page), size: "20",
      keyword: query.replace(/\s+/g, "")
    }).toString();
    const response = await fetch(apiURL, { headers: { ...queryHeaders, Accept: "application/json", Referer: constructURL(provider, query) }, signal });
    const payload = await readProviderJSON(response, (data) => data?.data?.content);
    const list = payload.data.content;
    const totalResults = toFiniteNumber(payload.data.totalElements);
    return { response, books: parseBooksFromEcoPayload(payload, query, provider), totalResults, recordCount: list.length,
      hasMore: list.length > 0 && (totalResults === null ? list.length === 20 : page * 20 < totalResults) };
  }, signal);
}

async function fetchHtmlBooks(provider, query, signal) {
  return collectProviderSearchPages(async (page, signal) => {
    // Preserve Gangnam's EUC-KR bytes when adding pagination parameters.
    const pageKey = provider.id === "jongno" || provider.id === "gangnam" ? "page_num" : "pageIndex";
    const url = `${constructURL(provider, query)}&${pageKey}=${page}`;
    const response = await fetch(url, { headers: queryHeaders, signal });
    assertProviderResponse(response);
    const html = await decodeProviderHtml(response, provider);
    const $ = load(html);
    const totalResults = provider.id === "jongno"
      ? pickNumber($(".total").text().replace(/,/g, ""), [/전체\s*(\d+)건/])
      : provider.id === "gangnam"
        ? pickNumber($(".book_list").text().replace(/,/g, ""), [/(\d+)종/])
        : pickNumber(html.replace(/,/g, ""), [/totalCount\s*:\s*["'](\d+)/]);
    if (totalResults === null) throw providerDataError("도서관 검색 결과 구조를 확인할 수 없습니다.");
    const books = parseBooksFromHtml(html, query, url);
    if (totalResults > 0 && !books.length) throw providerDataError("도서관 검색 결과는 있지만 도서 정보를 읽지 못했습니다.");
    const pageSize = provider.id === "jongno" ? 10 : 20;
    // Gangnam renders its empty-result message inside a .book placeholder.
    // A validated zero total is an empty search, not one unreadable book.
    const recordCount = totalResults === 0 ? 0 : provider.id === "jongno" ? $(".ebook-list .bx").length
      : provider.id === "gangnam" ? $(".book_list_body .book").length : $(".book_resultList > li").length;
    if (totalResults > 0 && !recordCount) throw providerDataError("도서관 검색 목록 구조가 변경되었습니다.");
    return { response, books, totalResults, recordCount,
      hasMore: page * pageSize < totalResults };
  }, signal);
}

function parseBooksFromHtml(html, query, searchURL) {
  const $ = load(html);

  const candidates = [];
  const selectors = [
    ".book_resultList > li",
    ".book_item",
    ".book-list > li",
    ".ebook-list .bx",
    ".ebook-list > .bx",
    ".search-result > li",
    ".bookList > li",
    ".cont_list > li",
    ".listType > li",
    ".book_list_body .book",
    ".book_list .book",
    "li:has(.tit)",
    "article"
  ];

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const node = $(el);
      const text = compactText(node.text());
      if (!text || text.length < 18) {
        return;
      }

      const title = extractTitle(node, text);
      if (!title) {
        return;
      }

      // The provider already applied the search. Keep keyword/author matches as
      // evidence even when their titles are not exact matches.

      const holdingsCount = pickNumber(text, [/(?:소장|보유)\s*[:：]?\s*(\d+)/, /(\d+)\s*권\s*(?:소장|보유)/]);
      const availableCount = pickNumber(text, [/(?:대출\s*가능|대출가능)\s*[:：]?\s*(\d+)/, /(?:대출\s*가능|대출가능)\s*(\d+)\s*권/]);
      const loanedCount = pickNumber(text, [
        /(?:대출\s*중|대출중)\s*[:：]?\s*(\d+)/,
        /(?:^|[\s|/,])대출(?!\s*가능)\s*[:：]?\s*(\d+)/
      ]);
      const reservationCount = pickNumber(text, [/(?:예약|대기)\s*[:：]?\s*(\d+)/, /예약\s*(\d+)\s*명/]);

      const loanSlashPattern = text.match(/대출\s*[:：]\s*(\d+)\s*\/\s*(\d+)/);
      const resolvedLoaned = loanSlashPattern ? Number(loanSlashPattern[1]) : loanedCount;
      const resolvedHoldings = loanSlashPattern ? Number(loanSlashPattern[2]) : holdingsCount;
      const inferredAvailableFromCounts =
        Number.isFinite(resolvedHoldings) && Number.isFinite(resolvedLoaned)
          ? Math.max(resolvedHoldings - resolvedLoaned, 0)
          : null;
      const resolvedAvailable =
        loanSlashPattern && Number.isFinite(resolvedHoldings) && Number.isFinite(resolvedLoaned)
          ? Math.max(resolvedHoldings - resolvedLoaned, 0)
          : availableCount ?? inferredAvailableFromCounts;

      const reservationAction = node.find('input[value="예약"], button, a').toArray().some((el) => {
        const action = $(el);
        return !action.is('[disabled], [aria-disabled="true"]') &&
          /^(예약|예약하기|예약신청|예약가능)$/.test(compactText(action.attr("value") || action.text()));
      });
      const decision = decideAvailability({
        text,
        holdingsCount: resolvedHoldings,
        availableCount: resolvedAvailable,
        reservationCount,
        reservable: reservationAction ? true : null
      });

      const detailAnchor = pickDetailAnchor(node, $);
      const detailOnclick = detailAnchor?.attr("onclick") || "";
      const detailURL = resolveDetailURL(detailAnchor?.attr("href") || null, searchURL, detailOnclick);
      const previewAnchor = pickPreviewAnchor(node, $);
      const previewURL = previewAnchor?.attr("href") || null;
      const previewOnclick = previewAnchor?.attr("onclick") || "";
      const coverImageURL = node.find("img[src]").first().attr("src") || null;
      const storeName = detectStoreName(node, text);
      candidates.push({
        title,
        storeName,
        detailURL,
        detailOnclick,
        previewURL,
        previewOnclick,
        coverImageURL,
        holdingsCount: resolvedHoldings,
        availableCount: resolvedAvailable,
        loanedCount: resolvedLoaned,
        reservationCount,
        decision,
        rawStatusText: text.slice(0, 300)
      });
    });
  }

  return uniqueByTitleAndStore(candidates.map((book) => enrichBookForQuery(book, query)))
    .sort((a, b) => scoreBook(b) - scoreBook(a));
}

function parseBooksFromSeoulPayload(payload) {
  const list = Array.isArray(payload?.ContentDataList) ? payload.ContentDataList : [];

  return list
    .map((item) => {
      const title = compactText(item?.title || "");
      if (!title) {
        return null;
      }

      const author = compactText(item?.author || "");
      const publisher = compactText(item?.publisher || "");
      const holdingsCount = toFiniteNumber(item?.b2bCopys);
      const loanedCount = toFiniteNumber(item?.currentLoanCount);
      const reservationCount = toFiniteNumber(item?.currentResvCount);
      const availableCount =
        holdingsCount !== null && loanedCount !== null
          ? Math.max(holdingsCount - loanedCount, 0)
          : null;

      const statusTextParts = [];
      if (author) {
        statusTextParts.push(`저자 ${author}`);
      }
      if (publisher) {
        statusTextParts.push(`출판사 ${publisher}`);
      }
      if (holdingsCount !== null) {
        statusTextParts.push(`소장 ${holdingsCount}`);
      }
      if (availableCount !== null) {
        statusTextParts.push(`대출가능 ${availableCount}`);
      }
      if (loanedCount !== null) {
        statusTextParts.push(`대출중 ${loanedCount}`);
      }
      if (reservationCount !== null) {
        statusTextParts.push(`예약 ${reservationCount}`);
      }
      const rawStatusText = statusTextParts.join(" / ");

      const detailURL = item?.contentsKey
        ? `https://elib.seoul.go.kr/contents/detail.do?no=${encodeURIComponent(item.contentsKey)}`
        : null;

      const isSubscriptionContent = /구독형/.test(compactText(item?.contentsTypeDesc || ""));

      return {
        title,
        storeName: compactText(item?.contentsTypeDesc || ""),
        detailURL,
        detailOnclick: "",
        previewURL: null,
        previewOnclick: "",
        coverImageURL: item?.coverUrl || item?.coverMSizeUrl || item?.coverSSizeUrl || null,
        holdingsCount,
        availableCount,
        loanedCount,
        reservationCount,
        decision: isSubscriptionContent
          ? {
              state: "borrow_now",
              confidence: "high",
              reason: "library_subscription_provider_listed"
            }
          : decideAvailability({
              text: rawStatusText,
              holdingsCount,
              availableCount,
              reservationCount
            }),
        rawStatusText
      };
    })
    .filter(Boolean);
}

function parseBooksFromEcoPayload(payload, query, provider) {
  const list = Array.isArray(payload?.data?.content) ? payload.data.content : [];

  return list
    .map((item) => {
      const title = compactText(item?.title || "");
      if (!title) {
        return null;
      }

      const author = compactText(item?.author || "");
      const publisher = compactText(item?.publisher || "");
      const isSubscriptionContent = item?.contentType === "SUBS";
      const holdingsCount = toFiniteNumber(item?.copys);
      const loanedCount = toFiniteNumber(item?.loanCnt);
      const reservationCount = toFiniteNumber(item?.reserveCnt);
      const apiLoanableCount = toFiniteNumber(item?.loanable);
      const availableCount =
        apiLoanableCount !== null
          ? apiLoanableCount
          : holdingsCount !== null && loanedCount !== null
          ? Math.max(holdingsCount - loanedCount, 0)
          : null;

      const statusTextParts = [];
      if (author) {
        statusTextParts.push(`저자 ${author}`);
      }
      if (publisher) {
        statusTextParts.push(`출판사 ${publisher}`);
      }
      if (holdingsCount !== null) {
        statusTextParts.push(`소장 ${holdingsCount}`);
      }
      if (availableCount !== null) {
        statusTextParts.push(`대출가능 ${availableCount}`);
      }
      if (loanedCount !== null) {
        statusTextParts.push(`대출중 ${loanedCount}`);
      }
      if (reservationCount !== null) {
        statusTextParts.push(`예약 ${reservationCount}`);
      }
      const rawStatusText = statusTextParts.join(" / ");

      const detailURL = item?.webpageUrl
        ? resolveSafeAbsoluteURL(item.webpageUrl, provider.baseURL)
        : item?.contentKey
          ? new URL(`/content/detail?id=${encodeURIComponent(item.contentKey)}&contentType=${encodeURIComponent(item.contentType || "EB")}`, provider.baseURL).toString()
          : null;

      return {
        title,
        storeName: compactText(item?.ownerName || item?.ownerCode || "") + (isSubscriptionContent ? " · 구독형" : ""),
        contentType: item?.contentType || "EB",
        detailURL,
        detailOnclick: "",
        previewURL: null,
        previewOnclick: "",
        coverImageURL: item?.coverAccessUrl || item?.coverUrl || null,
        holdingsCount,
        availableCount,
        loanedCount,
        reservationCount,
        decision: isSubscriptionContent
          ? { state: item.serviceUseYn === "Y" ? "borrow_now" : "unknown", confidence: "medium",
              reason: item.serviceUseYn === "Y" ? "library_subscription_provider_listed" : "insufficient_signals" }
          : decideAvailability({
          text: rawStatusText,
          holdingsCount,
          availableCount,
          reservationCount,
          reservable: toFiniteNumber(item?.reservable) === null ? null : Number(item.reservable) > 0
        }),
        rawStatusText
      };
    })
    .filter(Boolean);
}

function parseBooksFromMilliePayload(payload, query) {
  const list = Array.isArray(payload?.RESP_DATA?.list) ? payload.RESP_DATA.list : [];

  return list
    .map((item) => {
      const title = compactText(item?.content_name || "");
      if (!title) {
        return null;
      }

      const author = compactText(item?.author || "");
      const category = compactText([item?.category, item?.category2].filter(Boolean).join(" / "));
      const statusTextParts = [];
      if (author) {
        statusTextParts.push(`저자 ${author}`);
      }
      if (category) {
        statusTextParts.push(`분류 ${category}`);
      }
      const isService = isPositiveFlag(item?.is_service);
      const isEbookRent = isPositiveFlag(item?.is_ebook_rent);
      const contentKind = resolveMillieContentKind(item);
      statusTextParts.push(contentKind.id === "ebook" ? "밀리 전자책" : "밀리 오디오북");
      statusTextParts.push(isService ? "검색 노출" : "미서비스");
      statusTextParts.push(isEbookRent ? "앱에서 이용 가능" : "대출/열람 불가 신호");
      const rawStatusText = statusTextParts.join(" / ");

      return {
        title,
        storeName: `밀리의서재 · ${contentKind.label}`,
        contentKind: contentKind.id,
        contentKindLabel: contentKind.label,
        subscriptionAccess: true,
        detailURL: item?.book_id
          ? `https://www.millie.co.kr/v4/book/${encodeURIComponent(item.book_id)}`
          : null,
        detailOnclick: "",
        previewURL: null,
        previewOnclick: "",
        coverImageURL: item?.content_thumb_url || null,
        holdingsCount: null,
        availableCount: null,
        loanedCount: null,
        reservationCount: null,
        decision: isService && isEbookRent
          ? {
              state: "borrow_now",
              confidence: "high",
              reason: "subscription_provider_listed"
            }
          : {
              state: "unavailable",
              confidence: isService ? "medium" : "high",
              reason: "subscription_provider_unavailable"
            },
        rawStatusText
      };
    })
    .filter(Boolean);
}

function parseBooksFromEunpyeongHtml(html, searchURL) {
  const $ = load(html);
  const libraryNames = {
    은평: "은평구립도서관", 증산: "구립증산도서관", 응암: "구립응암도서관",
    뉴타운: "은평뉴타운도서관", 구산동: "구산동도서관마을", 내숲: "내를건너서숲으로도서관",
    은뜨락: "은뜨락도서관", 상림: "구립상림도서관", 대조꿈나무: "대조꿈나무어린이도서관"
  };
  return $("#bookList .book-list > li").toArray().map((el) => {
    const node = $(el);
    const title = compactText(node.find(".book-name .kor").first().text());
    const args = Array.from((node.find(".book-name").attr("onclick") || "").matchAll(/'([^']*)'/g), (m) => m[1]);
    if (!title || args.length !== 4) return null;
    const [bookKey, speciesKey, isbn, pubFormCode] = args;
    const detailURL = new URL("/intro/menu/10003/program/30006/alpasq/searchResultDetail.do", searchURL);
    detailURL.search = new URLSearchParams({ bookKey, speciesKey, isbn, pubFormCode }).toString();
    const location = compactText(node.find(".info03").text());
    const shortName = location.match(/^\[([^\]]+)\]/)?.[1] || location;
    const localLibraryName = libraryNames[shortName] || shortName;
    const localShelfLocation = location.replace(/^\[[^\]]+\]\s*/, "");
    const localLoanStatus = compactText(node.find(".book-data-btn .status").first().text());
    const isAvailable = /^대출가능/.test(localLoanStatus);
    const activeAction = (name) => node.find(`button[onclick*="${name}"], a[onclick*="${name}"]`).not('[disabled], [aria-disabled="true"]').length > 0;
    const isReservationAvailable = activeAction("fnReservationApply");
    const isMutualLoanAvailable = activeAction("fnMutualLoanApply");
    const isUnmannedReservationAvailable = activeAction("fnUnmannedApply");
    const statusInfo = compactText(node.find(".info04").text());
    const reservationCount = pickNumber(statusInfo, [/예약수\s*:\s*(\d+)/]);
    const localReturnPlanDate = statusInfo.match(/반납예정일\s*:\s*([\d.-]+)/)?.[1] || "";
    const serviceAvailability = getEunpyeongLibraryServiceAvailability(localLibraryName);
    const callNo = node.find(".info02 p").first().clone();
    callNo.find("button").remove();
    return {
      title, storeName: `${localLibraryName} · 실물도서`, detailURL: detailURL.toString(),
      coverImageURL: node.find(".book-img img").attr("src") || null,
      holdingsCount: 1, availableCount: isAvailable ? 1 : 0, loanedCount: isAvailable ? 0 : null, reservationCount,
      localLibraryAccess: true, localLibraryName, localShelfLocation, localLoanStatus, localReturnPlanDate,
      localCallNo: compactText(callNo.text()), localRegNo: "", localManageCode: "",
      isPreferredDaejo: /대조/.test(location), isChaekdanbiReservable: isMutualLoanAvailable,
      isMutualLoanAvailable, isMutualLoanPickupAvailable: serviceAvailability.mutualPickup,
      isUnmannedReservationAvailable, isOtherLibraryReturnAvailable: serviceAvailability.otherReturn,
      isWalkingAvailable: false,
      decision: {
        state: isAvailable ? "borrow_now" : isReservationAvailable ? "reserve" : "unavailable",
        confidence: "high",
        reason: isAvailable ? "eunpyeong_public_available" : isReservationAvailable ? "eunpyeong_public_reservable" : "eunpyeong_public_unavailable"
      },
      rawStatusText: [localLibraryName, localShelfLocation, localLoanStatus, statusInfo,
        isReservationAvailable ? "예약 가능" : "예약 불가",
        `상호대차 ${isMutualLoanAvailable ? "가능" : "불가"}`,
        `무인예약 ${isUnmannedReservationAvailable ? "가능" : "불가"}`].filter(Boolean).join(" / ")
    };
  }).filter(Boolean);
}

const eunpyeongLibraryServiceAvailability = [
  { name: "은평구립도서관", chaekdanbi: true, mutualPickup: true, otherReturn: true },
  { name: "구립증산도서관", chaekdanbi: true, mutualPickup: true, otherReturn: true },
  { name: "구립응암도서관", chaekdanbi: true, mutualPickup: true, otherReturn: true },
  { name: "구립상림도서관", chaekdanbi: false, mutualPickup: false, otherReturn: true },
  { name: "은평뉴타운도서관", chaekdanbi: true, mutualPickup: true, otherReturn: true },
  { name: "구산동도서관마을", chaekdanbi: true, mutualPickup: true, otherReturn: true },
  { name: "내를건너서숲으로도서관", chaekdanbi: true, mutualPickup: true, otherReturn: true },
  { name: "은뜨락도서관", chaekdanbi: true, mutualPickup: true, otherReturn: true },
  { name: "신사어린이도서관", chaekdanbi: false, mutualPickup: true, otherReturn: true },
  { name: "대조꿈나무어린이도서관", chaekdanbi: false, mutualPickup: true, otherReturn: true },
  { name: "은평작은도서관", chaekdanbi: false, mutualPickup: true, otherReturn: true },
  { name: "녹번문화도서관", chaekdanbi: false, mutualPickup: false, otherReturn: false },
  { name: "응암1동문화의집문고", chaekdanbi: false, mutualPickup: false, otherReturn: false },
  { name: "갈현1동문화의집", chaekdanbi: false, mutualPickup: false, otherReturn: false },
  { name: "효경골마을문고", chaekdanbi: false, mutualPickup: false, otherReturn: false },
  { name: "은평어린이영어도서관", chaekdanbi: false, mutualPickup: false, otherReturn: false },
  { name: "역마루작은도서관", chaekdanbi: false, mutualPickup: false, otherReturn: false }
];

function getEunpyeongLibraryServiceAvailability(libName) {
  const normalizedLibName = normalizeKorean(libName);
  const matched = eunpyeongLibraryServiceAvailability.find((item) =>
    normalizedLibName.includes(normalizeKorean(item.name))
  );
  return matched ? { ...matched, matched: true } : { matched: false, chaekdanbi: false, mutualPickup: false, otherReturn: false };
}

function resolveMillieContentKind(item) {
  const category = compactText([item?.category, item?.category2].filter(Boolean).join(" "));
  const contentCode = String(item?.content_code || "");
  const fileTypeCode = String(item?.file_type_code || "");
  const isAudio =
    /오디오|도슨트/.test(category) ||
    contentCode === "806" ||
    contentCode === "890" ||
    /^90[125]$/.test(fileTypeCode);

  return isAudio
    ? { id: "audiobook", label: "오디오북" }
    : { id: "ebook", label: "전자책" };
}

function enrichBookForQuery(book, query) {
  const titleMatch = buildTitleMatch(book.title || "", query);
  const isLargePrint = detectLargePrintBook(book);

  return {
    ...book,
    titleMatch,
    titleMatchScore: titleMatch.score,
    titleMatchLabel: titleMatch.label,
    isExactTitleMatch: titleMatch.level === "exact",
    isLargePrint
  };
}

function buildTitleMatch(title, query) {
  const normalizedTitle = normalizeKorean(title || "");
  const normalizedQuery = normalizeKorean(query || "");
  if (!normalizedTitle || !normalizedQuery) {
    return { level: "unknown", label: "제목 비교 불가", score: 0 };
  }

  const simplifiedTitle = simplifyComparableTitle(normalizedTitle);
  const simplifiedQuery = simplifyComparableTitle(normalizedQuery);

  if (!simplifiedTitle || !simplifiedQuery) {
    return { level: "weak", label: "본문/검색어 간접 일치", score: 50 };
  }

  if (simplifiedTitle === simplifiedQuery) {
    return { level: "exact", label: "정확 제목", score: 1000 };
  }
  if (simplifiedTitle.startsWith(simplifiedQuery)) {
    return { level: "starts_with", label: "제목 앞부분 일치", score: 700 };
  }
  if (simplifiedTitle.includes(simplifiedQuery)) {
    return { level: "contains", label: "제목 포함", score: 500 };
  }
  // A query can name the subtitle or a parenthesized part of the actual title.
  const fullTitle = normalizedTitle.replace(/[^\p{Letter}\p{Number}]/gu, "");
  const fullQuery = normalizedQuery.replace(/[^\p{Letter}\p{Number}]/gu, "");
  if (fullQuery && fullTitle.includes(fullQuery)) {
    return { level: "contains", label: "제목 포함", score: 500 };
  }
  return { level: "weak", label: "본문/검색어 간접 일치", score: 50 };
}

function simplifyComparableTitle(value) {
  return value
    .replace(/[=:：].*$/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/큰글자책|큰글씨책|큰글자|큰글씨|개정판|특별판|30주년|국내출간/g, "")
    .replace(/[^\p{Letter}\p{Number}]/gu, "");
}

function detectLargePrintBook(book) {
  const text = compactText(`${book.title || ""} ${book.storeName || ""} ${book.rawStatusText || ""}`);
  return /큰\s*글자|큰\s*글씨|대활자|large\s*print/i.test(text);
}

function decideAvailability({ text, holdingsCount, availableCount, reservationCount, reservable = null }) {
  const availableToken = /(대출\s*가능|대출가능|바로대출|즉시대출)/.test(text);
  const hardUnavailableToken = /(미소장|소장\s*없음|대출\s*불가|이용\s*불가|열람\s*불가)/.test(text);
  const serviceUnavailableToken = /서비스\s*없음/.test(text);
  const reservationToken = /(예약가능|예약중|예약\s*대기|대기중|대기자|예약자)/.test(text);

  if (availableCount !== null && availableCount > 0) {
    return {
      state: "borrow_now",
      confidence: "high",
      reason: "available_count_positive"
    };
  }

  if (
    availableToken &&
    (availableCount === null || availableCount > 0) &&
    (reservationCount === null || reservationCount === 0)
  ) {
    return {
      state: "borrow_now",
      confidence: "medium",
      reason: "available_token_without_reservation"
    };
  }

  if (reservable === true) {
    return { state: "reserve", confidence: "high", reason: "reservation_action_available" };
  }
  if (reservable === false && availableCount === 0) {
    return { state: "unavailable", confidence: "high", reason: "reservation_action_unavailable" };
  }

  if (holdingsCount === 0 || hardUnavailableToken) {
    return {
      state: "unavailable",
      confidence: "high",
      reason: "holdings_zero_or_unavailable_token"
    };
  }

  if (
    serviceUnavailableToken &&
    !availableToken &&
    !(availableCount !== null && availableCount > 0) &&
    (holdingsCount === null || holdingsCount <= 0)
  ) {
    return {
      state: "unavailable",
      confidence: "medium",
      reason: "service_unavailable_without_positive_signals"
    };
  }

  if (
    holdingsCount === 1 &&
    reservationCount !== null &&
    reservationCount > 0 &&
    !(availableCount !== null && availableCount > 0) &&
    !availableToken
  ) {
    return {
      state: "reserve",
      confidence: "high",
      reason: "single_holding_with_reservation_queue"
    };
  }

  if ((reservationCount !== null && reservationCount > 0) || (reservationToken && reservationCount !== 0)) {
    return {
      state: "reserve",
      confidence: "medium",
      reason: "reservation_signal_detected"
    };
  }

  if (holdingsCount !== null && holdingsCount > 0) {
    return {
      state: "unknown",
      confidence: "low",
      reason: "holdings_positive_but_no_clear_availability"
    };
  }

  return {
    state: "unknown",
    confidence: "low",
    reason: "insufficient_signals"
  };
}

function scoreBook(book) {
  let score = book.titleMatchScore || 0;
  if (book.isLargePrint) {
    score -= 250;
  }

  if (book.localLibraryAccess) {
    if (book.isPreferredDaejo) {
      score += 3000;
    }
    if (book.decision.state === "borrow_now") {
      score += 1000;
    }
    if (book.isMutualLoanAvailable) {
      score += 120;
    }
    if (book.isUnmannedReservationAvailable) {
      score += 100;
    }
    return score;
  }

  if (book.decision.state === "borrow_now") {
    score += 100 + (book.availableCount || 0);
  } else if (book.decision.state === "reserve") {
    score += 70 - (book.reservationCount || 0);
  } else if (book.decision.state === "unknown") {
    score += 40;
  } else if (book.decision.state === "unavailable") {
    score -= 100;
  }
  return score;
}

function extractTitle(node, fallbackText) {
  const selectors = [
    ".book_title a",
    ".book_title",
    ".title",
    ".book_tit",
    ".tit",
    "h3",
    "h4",
    "strong",
    "a[title]",
    "img[alt]"
  ];

  for (const selector of selectors) {
    const target = node.find(selector).first();
    const value = compactText(target.text() || target.attr("title") || target.attr("alt") || "");
    if (value.length >= 2) {
      return value;
    }
  }

  return fallbackText.split("/")[0].slice(0, 80);
}

function pickNumber(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const number = Number(match[1]);
      if (Number.isFinite(number)) {
        return number;
      }
    }
  }
  return null;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isPositiveFlag(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value > 0;
  }
  if (typeof value === "string") {
    return /^(y|yes|true|1)$/i.test(value.trim());
  }
  return false;
}

function uniqueByTitleAndStore(items) {
  const map = new Map();
  for (const item of items) {
    const key = `${normalizeKorean(item.title)}::${normalizeStoreName(item.storeName) || "unknown"}::${item.detailURL || ""}`;
    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }
    if (scoreBook(item) > scoreBook(map.get(key))) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

function detectStoreName(node, text) {
  const badgeText = compactText(node.find(".store").first().text() || "");
  if (badgeText) {
    return normalizeStoreName(badgeText);
  }
  return normalizeStoreName(text);
}

function normalizeStoreName(value) {
  if (!value) {
    return null;
  }

  const text = compactText(value);
  if (!text) {
    return null;
  }

  if (/yes24/i.test(text)) {
    return "YES24";
  }
  if (/교보\s*문고|교보문고|kyobo/i.test(text)) {
    return "교보문고";
  }
  return null;
}

function compactText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKorean(value) {
  return value.toLowerCase().replace(/\s+/g, "").normalize("NFKC");
}

function pickDetailAnchor(node, $) {
  const anchors = node.find("a[href]");
  if (!anchors.length) {
    return null;
  }

  const onclickAnchor = anchors.filter((_, el) => {
    const onclick = $(el).attr("onclick") || "";
    return onclick.includes("fnContentClick");
  });
  if (onclickAnchor.length) {
    return onclickAnchor.first();
  }

  const contentViewAnchor = anchors.filter((_, el) => {
    const href = ($(el).attr("href") || "").toLowerCase();
    return href.includes("content/contentview.ink");
  });
  if (contentViewAnchor.length) {
    return contentViewAnchor.first();
  }

  return anchors.first();
}

function pickPreviewAnchor(node, $) {
  const anchors = node.find("a[href], a[onclick]");
  if (!anchors.length) {
    return null;
  }

  const previewOnclickAnchor = anchors.filter((_, el) => {
    const onclick = ($(el).attr("onclick") || "").toLowerCase();
    return onclick.includes("fncontentpreview");
  });
  if (previewOnclickAnchor.length) {
    return previewOnclickAnchor.first();
  }

  const previewTextAnchor = anchors.filter((_, el) => {
    const text = compactText($(el).text() || "");
    return text.includes("미리보기");
  });
  if (previewTextAnchor.length) {
    return previewTextAnchor.first();
  }

  return null;
}

function constructURL(provider, searchTerm) {
  const encoded = provider.isEucKR ? encodeEucKR(searchTerm) : encodeURIComponent(searchTerm);
  return provider.baseURL.replace("{searchTerm}", encoded);
}

function isImmediateBorrowCandidate(book) {
  return (
    book?.decision?.state === "borrow_now" &&
    book.decision?.reason !== "subscription_provider_listed" &&
    book.decision?.reason !== "library_subscription_provider_listed"
  );
}

function isStrongTitleCandidate(book) {
  return ["exact", "starts_with", "contains"].includes(book?.titleMatch?.level);
}

function validateQuery(query) {
  if (!query) {
    return "검색어(q)가 필요합니다.";
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return `검색어는 ${MAX_QUERY_LENGTH}자 이하로 입력해 주세요.`;
  }

  if (INVALID_CONTROL_CHAR_PATTERN.test(query)) {
    return "유효하지 않은 문자가 포함되어 있습니다.";
  }

  return null;
}

function normalizeQueryForCache(query) {
  return query.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}

function consumeSearchRateLimit(clientKey) {
  const now = Date.now();
  const key = clientKey || "unknown";
  const bucket = searchRateLimitBuckets.get(key);

  if (!bucket || bucket.expiresAt <= now) {
    if (searchRateLimitBuckets.size >= 1000) {
      for (const [bucketKey, entry] of searchRateLimitBuckets) {
        if (entry.expiresAt <= now) searchRateLimitBuckets.delete(bucketKey);
      }
      if (searchRateLimitBuckets.size >= 1000) searchRateLimitBuckets.delete(searchRateLimitBuckets.keys().next().value);
    }
    searchRateLimitBuckets.set(key, {
      count: 1,
      expiresAt: now + RATE_LIMIT_WINDOW_MS
    });
    return true;
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  bucket.count += 1;

  if (searchRateLimitBuckets.size < 1000) {
    return true;
  }

  for (const [bucketKey, entry] of searchRateLimitBuckets.entries()) {
    if (entry.expiresAt <= now) {
      searchRateLimitBuckets.delete(bucketKey);
    }
  }

  return true;
}

async function decodeProviderHtml(response, provider) {
  const charset = resolveResponseCharset(response.headers.get("content-type"), provider);
  const buffer = Buffer.from(await response.arrayBuffer());

  try {
    return iconv.decode(buffer, charset);
  } catch {
    return buffer.toString("utf8");
  }
}

function resolveResponseCharset(contentType, provider) {
  const fallback = provider.isEucKR ? "euc-kr" : "utf-8";
  if (!contentType) {
    return fallback;
  }

  const match = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  if (!match || !match[1]) {
    return fallback;
  }

  const raw = match[1].trim().toLowerCase();
  if (raw === "utf8" || raw === "utf-8") {
    return "utf-8";
  }
  if (raw === "euc-kr" || raw === "euckr" || raw === "ks_c_5601-1987" || raw === "cp949" || raw === "x-windows-949") {
    return "euc-kr";
  }
  return fallback;
}

function normalizeProviderError(error) {
  if (error?.name === "AbortError") {
    return `요청 시간 초과 (${PROVIDER_FETCH_TIMEOUT_MS}ms)`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function resolvePreviewURL(rawURL, onclick, searchURL) {
  const directURL = resolveSafeAbsoluteURL(rawURL, searchURL);
  if (directURL) {
    return directURL;
  }

  const previewParams = extractFnContentPreviewParams(onclick);
  if (!previewParams || !previewParams.brcd) {
    return null;
  }

  try {
    const previewURL = new URL("/elibrary-front/popup/popPreview.ink", searchURL);
    previewURL.searchParams.set("type", "web");
    previewURL.searchParams.set("brcd", previewParams.brcd);
    if (previewParams.spenDvsnCode) {
      previewURL.searchParams.set("spenDvsnCode", previewParams.spenDvsnCode);
    }
    if (previewParams.sntnAuthCode) {
      previewURL.searchParams.set("sntnAuthCode", previewParams.sntnAuthCode);
    }
    return previewURL.toString();
  } catch {
    return null;
  }
}

function resolveCoverImageURL(rawURL, searchURL) {
  const resolved = resolveSafeAbsoluteURL(rawURL, searchURL);
  if (!resolved) {
    return null;
  }

  try {
    const imageURL = new URL(resolved);
    imageURL.hash = "";
    return imageURL.toString();
  } catch {
    return resolved;
  }
}

function resolveSafeAbsoluteURL(rawURL, baseURL) {
  if (!rawURL) {
    return null;
  }

  const trimmed = rawURL.trim();
  if (!trimmed || trimmed === "#" || /^javascript:/i.test(trimmed)) {
    return null;
  }

  try {
    return new URL(trimmed, baseURL).toString();
  } catch {
    return null;
  }
}

function resolveDetailURL(rawURL, searchURL, onclick) {
  const safeURL = resolveSafeAbsoluteURL(rawURL, searchURL);
  if (!safeURL) {
    return null;
  }

  try {
    const resolved = new URL(safeURL);
    const clickParams = extractFnContentClickParams(onclick);

    if (clickParams) {
      if (clickParams.cttsDvsnCode) {
        resolved.searchParams.set("cttsDvsnCode", clickParams.cttsDvsnCode);
      }
      if (clickParams.brcd) {
        resolved.searchParams.set("brcd", clickParams.brcd);
      }
      if (clickParams.ctgrId) {
        resolved.searchParams.set("ctgrId", clickParams.ctgrId);
      }
      resolved.searchParams.set("sntnAuthCode", clickParams.sntnAuthCode || "");
      if (clickParams.spenDvsnCode) {
        resolved.searchParams.set("spenDvsnCode", clickParams.spenDvsnCode);
      }
    }

    const path = resolved.pathname.toLowerCase();
    if (path.endsWith("/content/contentview.ink") && !resolved.searchParams.get("brcd")) {
      return null;
    }

    return resolved.toString();
  } catch {
    return null;
  }
}

function extractFnContentPreviewParams(onclick) {
  if (!onclick || !onclick.includes("fnContentPreview")) {
    return null;
  }

  const args = Array.from(onclick.matchAll(/'([^']*)'/g), (match) => match[1]);
  if (args.length < 5) {
    return null;
  }

  return {
    adltYN: args[0] || "",
    cttsDvsnCode: args[1] || "",
    ctgrId: args[2] || "",
    brcd: args[3] || "",
    spenDvsnCode: args[4] || "",
    sntnAuthCode: args[5] || ""
  };
}

function extractFnContentClickParams(onclick) {
  if (!onclick || !onclick.includes("fnContentClick")) {
    return null;
  }

  const args = Array.from(onclick.matchAll(/'([^']*)'/g), (match) => match[1]);
  if (args.length < 4) {
    return null;
  }

  return {
    cttsDvsnCode: args[0] || "",
    brcd: args[1] || "",
    ctgrId: args[2] || "",
    sntnAuthCode: args[3] || "",
    adltYN: args[4] || "",
    spenDvsnCode: args[5] || ""
  };
}

function resolveLibraryModel(provider) {
  if (provider.physicalProvider) {
    return "physical";
  }
  if (provider.contentTypes?.includes("SUBS")) return "mixed";
  return provider.subscriptionListAvailable ? "subscription" : "owned";
}

function encodeEucKR(string) {
  const bytes = iconv.encode(string, "euc-kr");
  return Array.from(bytes)
    .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
    .join("");
}

export { searchProvider, libraryProviders, physicalProviders, externalProviders, parseBooksFromHtml, parseBooksFromEcoPayload, parseBooksFromEunpyeongHtml, buildTitleMatch, toFiniteNumber, normalizeQueryForCache, readProviderJSON };
