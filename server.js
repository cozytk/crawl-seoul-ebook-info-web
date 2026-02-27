import express from "express";
import { load } from "cheerio";
import iconv from "iconv-lite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3199;
const EUNPYEONG_LIBRARY_CODE = "111042";

const libraryProviders = [
  { id: "seoul", name: "서울도서관", baseURL: "https://elib.seoul.go.kr/contents/search/content?t=EB&k={searchTerm}", isEucKR: false, loginURL: "https://elib.seoul.go.kr/login" },
  { id: "eunpyeong-ebook", name: "은평구립도서관", baseURL: "https://epbook.eplib.or.kr/ebookPlatform/home/search.do?k={searchTerm}", isEucKR: false, loginURL: "https://epbook.eplib.or.kr/ebookPlatform/login/loginForm.do" },
  { id: "nanet", name: "국회도서관", baseURL: "https://nanet.dkyobobook.co.kr/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://nanet.dkyobobook.co.kr/member/login.ink", subscriptionListAvailable: true },
  { id: "junggu", name: "중구도서관", baseURL: "https://ebook.junggulib.or.kr/elibrary-front/search/searchList.ink?schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.junggulib.or.kr/elibrary-front/member/login.ink" },
  { id: "yongsan", name: "용산도서관", baseURL: "https://ebook.yslibrary.or.kr/elibrary-front/search/searchList.ink?schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.yslibrary.or.kr/elibrary-front/member/login.ink" },
  { id: "jungnang", name: "중랑도서관", baseURL: "https://ebook.jungnanglib.seoul.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.jungnanglib.seoul.kr/elibrary-front/member/login.ink" },
  { id: "ydp", name: "영등포도서관", baseURL: "https://ydplib.dkyobobook.co.kr/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ydplib.dkyobobook.co.kr/member/login.ink", subscriptionListAvailable: true },
  { id: "gangnam", name: "강남도서관", baseURL: "https://ebook.gangnam.go.kr/elibbook/book_info.asp?search=title&strSearch={searchTerm}", isEucKR: true, loginURL: "https://ebook.gangnam.go.kr/elibbook/login.asp" },
  { id: "songpa", name: "송파도서관", baseURL: "https://ebook.splib.or.kr/search/?srch_order=total&src_key={searchTerm}", isEucKR: false, loginURL: "https://ebook.splib.or.kr/member/login" },
  { id: "dongdaemun", name: "동대문도서관", baseURL: "https://e-book.l4d.or.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://e-book.l4d.or.kr/elibrary-front/main.ink" },
  { id: "nowon", name: "노원구립도서관", baseURL: "https://eb.nowonlib.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://eb.nowonlib.kr/elibrary-front/main.ink" },
  { id: "jongno", name: "종로구도서관", baseURL: "https://elib.jongno.go.kr/search/?srch_order=total&src_key={searchTerm}", isEucKR: false, loginURL: "https://elib.jongno.go.kr/member/login" },
  { id: "mapo", name: "마포구도서관", baseURL: "https://ebook.mapo.go.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.mapo.go.kr/elibrary-front/main.ink" },
  { id: "seongdong", name: "성동구도서관", baseURL: "https://ebook.sdlib.or.kr:444/elibrary-front/search/searchList.ink?schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.sdlib.or.kr:444/elibrary-front/member/login.ink" }
];

const eunpyeongUnified = {
  id: "eunpyeong-unified",
  name: "은평구립도서관 통합검색",
  baseURL: "https://lib.eplib.or.kr/unified/search.asp?search_word={searchTerm}",
  isEucKR: false,
  loginURL: "https://lib.eplib.or.kr/login.asp"
};

const samStore = {
  id: "kyobo-sam",
  name: "교보 SAM",
  baseURL: "https://search.kyobobook.co.kr/search?keyword={searchTerm}&gbCode=SAM&target=sam",
  isEucKR: false,
  loginURL: "https://order.kyobobook.co.kr/login"
};

const queryHeaders = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"
};

const MAX_QUERY_LENGTH = Number(process.env.MAX_QUERY_LENGTH || 80);
const PROVIDER_FETCH_TIMEOUT_MS = Number(process.env.PROVIDER_FETCH_TIMEOUT_MS || 6500);
const SEARCH_CACHE_TTL_MS = Number(process.env.SEARCH_CACHE_TTL_MS || 120000);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 20);
const INVALID_CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

const searchCache = new Map();
const searchRateLimitBuckets = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/config/providers", (_, res) => {
  res.json({
    libraryProviders: libraryProviders.map((provider) => ({
      ...provider,
      libraryModel: resolveLibraryModel(provider)
    })),
    eunpyeongUnified,
    samStore
  });
});

app.get("/api/search", async (req, res) => {
  const query = (req.query.q || "").toString().trim();
  const validationError = validateQuery(query);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  if (!consumeSearchRateLimit(req.ip || "unknown")) {
    return res.status(429).json({
      error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
    });
  }

  const cacheKey = normalizeQueryForCache(query);
  const cached = getCachedSearchPayload(cacheKey);
  if (cached) {
    return res.json({ ...cached, cacheHit: true });
  }

  const libraryResults = await Promise.all(
    libraryProviders.map((provider) => searchProvider(provider, query))
  );

  const anyBorrowable = libraryResults.some((result) =>
    result.books.some((book) => isImmediateBorrowCandidate(book))
  );

  const flow = {
    phase1: {
      label: "서울 전역 전자도서관 검색",
      completed: true,
      hasBorrowable: anyBorrowable
    },
    phase2: {
      label: "은평구립도서관 통합검색",
      enabled: !anyBorrowable,
      searchURL: constructURL(eunpyeongUnified, query)
    },
    phase3: {
      label: "교보 SAM 구매 대안",
      enabled: !anyBorrowable,
      searchURL: constructURL(samStore, query)
    }
  };

  const payload = {
    query,
    searchedAt: new Date().toISOString(),
    libraryResults,
    flow
  };

  setCachedSearchPayload(cacheKey, payload);

  return res.json(payload);
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`ebook-local-web started: http://localhost:${PORT}`);
  });
}

export default app;

async function searchProvider(provider, query) {
  const searchURL = constructURL(provider, query);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_FETCH_TIMEOUT_MS);

  try {
    let response;
    let parsedBooks;

    if (provider.id === "seoul") {
      const seoulResult = await fetchSeoulBooks(provider, query, controller.signal);
      response = seoulResult.response;
      parsedBooks = seoulResult.books;
    } else if (provider.id === "eunpyeong-ebook") {
      const eunpyeongResult = await fetchEunpyeongBooks(provider, query, controller.signal);
      response = eunpyeongResult.response;
      parsedBooks = eunpyeongResult.books;
    } else {
      response = await fetch(searchURL, { headers: queryHeaders, signal: controller.signal });
      const html = await decodeProviderHtml(response, provider);
      parsedBooks = parseBooksFromHtml(html, query, searchURL);
    }

    const books = parsedBooks
      .slice(0, 8)
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
            provider.subscriptionListAvailable && book.title
              ? {
                  state: "borrow_now",
                  confidence: "medium",
                  reason: "subscription_provider_listed"
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
      libraryModel: resolveLibraryModel(provider),
      searchable: response.ok,
      ok: response.ok,
      statusCode: response.status,
      books
    };
  } catch (error) {
    const message = normalizeProviderError(error);
    return {
      providerId: provider.id,
      providerName: provider.name,
      searchURL,
      loginURL: provider.loginURL,
      isSubscriptionProvider: Boolean(provider.subscriptionListAvailable),
      libraryModel: resolveLibraryModel(provider),
      searchable: false,
      ok: false,
      statusCode: 0,
      error: message,
      books: []
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSeoulBooks(provider, query, signal) {
  const apiURL = new URL("/api/contents/search", provider.baseURL);
  apiURL.searchParams.set("libCode", "");
  apiURL.searchParams.set("contentType", "EB");
  apiURL.searchParams.set("searchKeyword", query);
  apiURL.searchParams.set("searchOption", "4");
  apiURL.searchParams.set("sortOption", "1");
  apiURL.searchParams.set("innerSearchYN", "N");
  apiURL.searchParams.set("innerKeyword", "");
  apiURL.searchParams.set("currentCount", "1");
  apiURL.searchParams.set("pageCount", "30");
  apiURL.searchParams.set("loanable", "");
  apiURL.searchParams.set("isTotal", "false");
  apiURL.searchParams.set("showType", "A");
  apiURL.searchParams.set("searchCombine", "N");

  const response = await fetch(apiURL, {
    headers: {
      ...queryHeaders,
      Accept: "application/json, text/plain, */*",
      Referer: constructURL(provider, query)
    },
    signal
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return {
    response,
    books: parseBooksFromSeoulPayload(payload)
  };
}

async function fetchEunpyeongBooks(provider, query, signal) {
  const apiURL = new URL("/ebookPlatform/Homepage/ContentsSearch.do", provider.baseURL);
  apiURL.searchParams.set("libCode", EUNPYEONG_LIBRARY_CODE);
  apiURL.searchParams.set("userId", "null");
  apiURL.searchParams.set("searchKeyword", query);
  apiURL.searchParams.set("searchOption", "0");
  apiURL.searchParams.set("currentCount", "1");
  apiURL.searchParams.set("pageCount", "20");
  apiURL.searchParams.set("sortOption", "1");

  const response = await fetch(apiURL, {
    headers: {
      ...queryHeaders,
      Accept: "application/json, text/plain, */*",
      Referer: constructURL(provider, query)
    },
    signal
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return {
    response,
    books: parseBooksFromEunpyeongPayload(payload, query)
  };
}

function parseBooksFromHtml(html, query, searchURL) {
  const $ = load(html);
  const normalizedQuery = normalizeKorean(query);

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

      const normalizedTitle = normalizeKorean(title);
      const normalizedText = normalizeKorean(text);
      const hasQuery = normalizedTitle.includes(normalizedQuery) || normalizedText.includes(normalizedQuery);
      if (!hasQuery) {
        return;
      }

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

      const decision = decideAvailability({
        text,
        holdingsCount: resolvedHoldings,
        availableCount: resolvedAvailable,
        reservationCount
      });

      const detailAnchor = pickDetailAnchor(node, $);
      const detailURL = detailAnchor?.attr("href") || null;
      const detailOnclick = detailAnchor?.attr("onclick") || "";
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

  return uniqueByTitleAndStore(candidates)
    .sort((a, b) => scoreBook(b) - scoreBook(a))
    .slice(0, 12);
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
        decision: decideAvailability({
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

function parseBooksFromEunpyeongPayload(payload, query) {
  const list = Array.isArray(payload?.Contents?.ContentDataList) ? payload.Contents.ContentDataList : [];
  const normalizedQuery = normalizeKorean(query);

  return list
    .map((item) => {
      const title = compactText(item?.ContentTitle || "");
      if (!title) {
        return null;
      }

      const normalizedTitle = normalizeKorean(title);
      if (normalizedQuery && !normalizedTitle.includes(normalizedQuery)) {
        return null;
      }

      const author = compactText(item?.ContentAuthor || "");
      const publisher = compactText(item?.ContentPublisher || "");
      const holdingsCount = toFiniteNumber(item?.Copys);
      const loanedCount = toFiniteNumber(item?.CurLoanCnt);
      const reservationCount = toFiniteNumber(item?.CurResvCnt);
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

      const detailURL = item?.ContentKey
        ? `https://epbook.eplib.or.kr/ebookPlatform/home/detail.do?no=${encodeURIComponent(item.ContentKey)}`
        : null;

      return {
        title,
        storeName: compactText(item?.OwnerCodeDesc || ""),
        detailURL,
        detailOnclick: "",
        previewURL: null,
        previewOnclick: "",
        coverImageURL: item?.ContentCoverUrlM || item?.ContentCoverUrl || item?.ContentCoverUrlS || null,
        holdingsCount,
        availableCount,
        loanedCount,
        reservationCount,
        decision: decideAvailability({
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

function decideAvailability({ text, holdingsCount, availableCount, reservationCount }) {
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
  if (book.decision.state === "borrow_now") {
    return 100 + (book.availableCount || 0);
  }
  if (book.decision.state === "reserve") {
    return 70 - (book.reservationCount || 0);
  }
  if (book.decision.state === "unknown") {
    return 40;
  }
  return 0;
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
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function uniqueByTitleAndStore(items) {
  const map = new Map();
  for (const item of items) {
    const key = `${normalizeKorean(item.title)}::${normalizeStoreName(item.storeName) || "unknown"}`;
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
    book.decision?.reason !== "subscription_provider_listed"
  );
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
  return normalizeKorean(query);
}

function getCachedSearchPayload(cacheKey) {
  const entry = searchCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    searchCache.delete(cacheKey);
    return null;
  }

  return entry.payload;
}

function setCachedSearchPayload(cacheKey, payload) {
  searchCache.set(cacheKey, {
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    payload
  });

  if (searchCache.size < 300) {
    return;
  }

  const now = Date.now();
  for (const [key, entry] of searchCache.entries()) {
    if (entry.expiresAt <= now) {
      searchCache.delete(key);
    }
  }
}

function consumeSearchRateLimit(clientKey) {
  const now = Date.now();
  const key = clientKey || "unknown";
  const bucket = searchRateLimitBuckets.get(key);

  if (!bucket || bucket.expiresAt <= now) {
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
  return provider.subscriptionListAvailable ? "subscription" : "owned";
}

function encodeEucKR(string) {
  const bytes = iconv.encode(string, "euc-kr");
  return Array.from(bytes)
    .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
    .join("");
}
