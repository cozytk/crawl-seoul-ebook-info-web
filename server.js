import express from "express";
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
  { id: "jongno", name: "종로구도서관", baseURL: "https://elib.jongno.go.kr/search/?srch_order=total&src_key={searchTerm}", isEucKR: false, loginURL: "https://elib.jongno.go.kr/member/login" },
  { id: "mapo", name: "마포구도서관", baseURL: "https://ebook.mapo.go.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.mapo.go.kr/elibrary-front/main.ink" },
  { id: "seongdong", name: "성동구도서관", baseURL: "https://ebook.sdlib.or.kr:444/elibrary-front/search/searchList.ink?schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.sdlib.or.kr:444/elibrary-front/member/login.ink" },
  { id: "seocho", name: "서초구 전자도서관", baseURL: "https://e-book.seocholib.or.kr/search?keyword={searchTerm}", apiBaseURL: "https://e-book.seocholib.or.kr", isEucKR: false, loginURL: "https://e-book.seocholib.or.kr/login" }
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
  }
];

const physicalProviders = [
  {
    id: "eunpyeong-public",
    name: "은평구공공도서관 실물도서",
    baseURL: "https://lib.eplib.or.kr/unified/search.asp?search_word={searchTerm}",
    isEucKR: false,
    loginURL: "https://lib.eplib.or.kr/member/login.asp",
    physicalProvider: true
  }
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

const searchCache = new Map();
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
    searchProviders.map((provider) => searchProvider(provider, query))
  );

  const flow = buildSearchFlow(query, libraryResults);

  const payload = {
    query,
    searchedAt: new Date().toISOString(),
    libraryResults,
    flow
  };

  setCachedSearchPayload(cacheKey, payload);

  return res.json(payload);
});

app.get("/api/search/stream", async (req, res) => {
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

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const writeEvent = (type, data) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  writeEvent("start", {
    query,
    searchedAt: new Date().toISOString(),
    totalProviders: searchProviders.length
  });

  const libraryResults = await Promise.all(
    searchProviders.map(async (provider) => {
      const result = await searchProvider(provider, query);
      writeEvent("provider", result);
      return result;
    })
  );

  writeEvent("flow", buildSearchFlow(query, libraryResults));
  writeEvent("done", {
    query,
    searchedAt: new Date().toISOString(),
    libraryResults
  });
  res.end();
});

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
    } else if (provider.id === "millie") {
      const millieResult = await fetchMillieBooks(provider, query, controller.signal);
      response = millieResult.response;
      parsedBooks = millieResult.books;
    } else if (provider.id === "eunpyeong-public") {
      const eunpyeongResult = await fetchEunpyeongPublicBooks(provider, query, controller.signal);
      response = eunpyeongResult.response;
      parsedBooks = eunpyeongResult.books;
    } else if (provider.apiBaseURL) {
      const ecoResult = await fetchEcoBooks(provider, query, controller.signal);
      response = ecoResult.response;
      parsedBooks = ecoResult.books;
    } else {
      response = await fetch(searchURL, { headers: queryHeaders, signal: controller.signal });
      const html = await decodeProviderHtml(response, provider);
      parsedBooks = parseBooksFromHtml(html, query, searchURL);
    }

    const books = parsedBooks
      .map((book) => enrichBookForQuery(book, query))
      .sort((a, b) => scoreBook(b) - scoreBook(a))
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
            provider.subscriptionListAvailable &&
            !provider.externalProvider &&
            book.title &&
            isStrongTitleCandidate(book) &&
            book.decision?.state !== "unavailable"
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
      isExternalProvider: Boolean(provider.externalProvider),
      isPhysicalProvider: Boolean(provider.physicalProvider),
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
      isExternalProvider: Boolean(provider.externalProvider),
      isPhysicalProvider: Boolean(provider.physicalProvider),
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

async function fetchMillieBooks(provider, query, signal) {
  const apiURL = new URL("https://live-api.millie.co.kr/v3/search/content");
  apiURL.searchParams.set("keyword", query);
  apiURL.searchParams.set("orderBy", "accuracy");
  apiURL.searchParams.set("startPage", "1");
  apiURL.searchParams.set("limitCount", "8");
  apiURL.searchParams.set("searchType", "isInactive");
  apiURL.searchParams.set("rent_yn", "N");
  apiURL.searchParams.set("adult_yn", "Y");

  const response = await fetch(apiURL, {
    headers: {
      ...queryHeaders,
      Accept: "application/json, text/plain, */*",
      Origin: "https://www.millie.co.kr",
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
    books: parseBooksFromMilliePayload(payload, query)
  };
}

async function fetchEunpyeongPublicBooks(provider, query, signal) {
  const response = await fetch("https://lib.eplib.or.kr/api/eplib/search/simple", {
    method: "POST",
    headers: {
      ...queryHeaders,
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json;charset=UTF-8",
      Referer: constructURL(provider, query)
    },
    body: JSON.stringify({
      searchMode: "BOOK",
      searchKeyword: query,
      reSearchKeyword: [],
      searchType: "",
      manageCode: [""],
      aggsSubject: "",
      aggsPubYear: "",
      page: 1,
      display: 5
    }),
    signal
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const books = response.ok ? await parseBooksFromEunpyeongPublicPayload(payload, query, signal) : [];

  return {
    response,
    books
  };
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

async function fetchEcoBooks(provider, query, signal) {
  const apiURL = new URL("/api/service/search/simple", provider.apiBaseURL);
  apiURL.searchParams.set("contentType", "EB");
  apiURL.searchParams.set("searchType", "");
  apiURL.searchParams.set("detailQuery", "");
  apiURL.searchParams.set("isbn", "");
  apiURL.searchParams.set("OnlyStartWith", "");
  apiURL.searchParams.set("sort", "title");
  apiURL.searchParams.set("asc", "desc");
  apiURL.searchParams.set("loanable", "N");
  apiURL.searchParams.set("page", "1");
  apiURL.searchParams.set("size", "20");
  apiURL.searchParams.set("keyword", query.replace(/\s+/g, ""));

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
    books: parseBooksFromEcoPayload(payload, query, provider)
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

  return uniqueByTitleAndStore(candidates.map((book) => enrichBookForQuery(book, query)))
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

function parseBooksFromEcoPayload(payload, query, provider) {
  const list = Array.isArray(payload?.data?.content) ? payload.data.content : [];
  const normalizedQuery = normalizeKorean(query);

  return list
    .map((item) => {
      const title = compactText(item?.title || "");
      if (!title) {
        return null;
      }

      const normalizedTitle = normalizeKorean(title);
      if (normalizedQuery && !normalizedTitle.includes(normalizedQuery)) {
        return null;
      }

      const author = compactText(item?.author || "");
      const publisher = compactText(item?.publisher || "");
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
        storeName: compactText(item?.ownerName || item?.ownerCode || ""),
        detailURL,
        detailOnclick: "",
        previewURL: null,
        previewOnclick: "",
        coverImageURL: item?.coverAccessUrl || item?.coverUrl || null,
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

function parseBooksFromMilliePayload(payload, query) {
  const list = Array.isArray(payload?.RESP_DATA?.list) ? payload.RESP_DATA.list : [];
  const normalizedQuery = normalizeKorean(query);

  return list
    .map((item) => {
      const title = compactText(item?.content_name || "");
      if (!title) {
        return null;
      }

      const normalizedTitle = normalizeKorean(title);
      if (normalizedQuery && !normalizedTitle.includes(normalizedQuery)) {
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

async function parseBooksFromEunpyeongPublicPayload(payload, query, signal) {
  const list = Array.isArray(payload?.contents?.bookList) ? payload.contents.bookList : [];
  const normalizedQuery = normalizeKorean(query);
  const matchedBooks = list
    .map((item) => ({
      ...item,
      titleMatch: buildTitleMatch(item?.title || "", query)
    }))
    .filter((item) => {
      const title = compactText(item?.title || "");
      return title && (!normalizedQuery || normalizeKorean(title).includes(normalizedQuery));
    })
    .sort((a, b) => b.titleMatch.score - a.titleMatch.score)
    .slice(0, 5);

  const collectionGroups = await Promise.all(
    matchedBooks.map((book) => fetchEunpyeongCollectionsForBook(book, signal))
  );

  return collectionGroups
    .flat()
    .sort(compareEunpyeongCopies)
    .slice(0, 12);
}

async function fetchEunpyeongCollectionsForBook(book, signal) {
  const speciesKey = compactText(book?.speciesKey || "");
  const pubFormCode = compactText(book?.pubFormCode || "MO") || "MO";
  if (!speciesKey) {
    return [];
  }

  const libListURL = new URL("https://lib.eplib.or.kr/api/bookDetail/bookCollection/libList");
  libListURL.searchParams.set("speciesKey", speciesKey);
  libListURL.searchParams.set("pubFormCode", pubFormCode);

  const libListPayload = await fetchEunpyeongJSON(libListURL, signal);
  const libraries = Array.isArray(libListPayload?.contents?.libList) ? libListPayload.contents.libList : [];
  const collectionPayloads = await Promise.all(
    libraries.map((library) => {
      const collectionURL = new URL(
        `https://lib.eplib.or.kr/api/bookDetail/bookCollection/${/MO|MM/.test(pubFormCode) ? "MOMM" : pubFormCode}`
      );
      collectionURL.searchParams.set("speciesKey", speciesKey);
      collectionURL.searchParams.set("manageCode", library.manageCode);
      return fetchEunpyeongJSON(collectionURL, signal).catch(() => null);
    })
  );

  return collectionPayloads
    .flatMap((payload) => payload?.contents?.collectionList || [])
    .map((collection) => mapEunpyeongCollectionToBook(book, collection, speciesKey, pubFormCode));
}

async function fetchEunpyeongJSON(url, signal) {
  const response = await fetch(url, {
    headers: {
      ...queryHeaders,
      Accept: "application/json, text/plain, */*",
      Referer: "https://lib.eplib.or.kr/unified/book_detail.asp"
    },
    signal
  });
  if (!response.ok) {
    throw new Error(`은평구공공도서관 API ${response.status}`);
  }
  return response.json();
}

function mapEunpyeongCollectionToBook(book, collection, speciesKey, pubFormCode) {
  const title = compactText(book?.title || "");
  const libName = compactText(collection?.libName || "");
  const shelfLocName = compactText(collection?.shelfLocName || "");
  const loanStatus = compactText(collection?.loanStatus || "");
  const reservationCount = toFiniteNumber(collection?.reservationCount) || 0;
  const isAvailable = /대출가능/.test(loanStatus);
  const serviceAvailability = getEunpyeongLibraryServiceAvailability(libName);
  const apiMutualLoanAvailable =
    isPositiveFlag(collection?.isActiveMutualLoanYn) || isPositiveFlag(collection?.isActiveDeliveryYn);
  const isMutualLoanAvailable = serviceAvailability.matched
    ? serviceAvailability.mutualPickup
    : apiMutualLoanAvailable;
  const isUnmannedReservationAvailable = isPositiveFlag(collection?.isActiveUnmannedResvYn);
  const isWalkingAvailable = isPositiveFlag(collection?.isActiveWalkingYn);
  const rawStatusText = [
    libName,
    shelfLocName,
    loanStatus,
    collection?.returnPlanDate ? `반납예정 ${collection.returnPlanDate}` : "",
    `예약 ${reservationCount}`,
    `책단비 ${serviceAvailability.chaekdanbi ? "가능" : "불가"}`,
    `상호대차 수령 ${serviceAvailability.mutualPickup ? "가능" : "불가"}`,
    `상호대차 ${isMutualLoanAvailable ? "가능" : "불가"}`,
    `무인예약 ${isUnmannedReservationAvailable ? "가능" : "불가"}`,
    `타관반납 ${serviceAvailability.otherReturn ? "가능" : "불가"}`,
    isWalkingAvailable ? "워킹스루 가능" : ""
  ]
    .filter(Boolean)
    .join(" / ");

  return {
    title,
    storeName: `${libName || "은평구공공도서관"} · 실물도서`,
    detailURL: `https://lib.eplib.or.kr/unified/book_detail.asp?speciesKey=${encodeURIComponent(speciesKey)}&pubFormCode=${encodeURIComponent(pubFormCode)}`,
    detailOnclick: "",
    previewURL: null,
    previewOnclick: "",
    coverImageURL: book?.coverUrl || null,
    holdingsCount: 1,
    availableCount: isAvailable ? 1 : 0,
    loanedCount: isAvailable ? 0 : 1,
    reservationCount,
    localLibraryAccess: true,
    localLibraryName: libName,
    localShelfLocation: shelfLocName,
    localLoanStatus: loanStatus,
    localReturnPlanDate: collection?.returnPlanDate || "",
    localCallNo: collection?.callNo || "",
    localRegNo: collection?.regNo || "",
    localManageCode: collection?.bookManageCode || "",
    isPreferredDaejo: isPreferredDaejoLibrary(collection),
    isChaekdanbiReservable: serviceAvailability.chaekdanbi,
    isMutualLoanAvailable,
    isMutualLoanPickupAvailable: serviceAvailability.mutualPickup,
    isUnmannedReservationAvailable,
    isOtherLibraryReturnAvailable: serviceAvailability.otherReturn,
    isWalkingAvailable,
    decision: isAvailable
      ? {
          state: "borrow_now",
          confidence: "high",
          reason: "eunpyeong_public_available"
        }
      : reservationCount > 0 || /예약/.test(loanStatus)
        ? {
            state: "reserve",
            confidence: "high",
            reason: "eunpyeong_public_reserved"
          }
        : {
            state: "unknown",
            confidence: "medium",
            reason: "eunpyeong_public_unavailable"
          },
    rawStatusText
  };
}

function compareEunpyeongCopies(a, b) {
  return scoreEunpyeongCopy(b) - scoreEunpyeongCopy(a);
}

function scoreEunpyeongCopy(book) {
  let score = 0;
  if (book.isPreferredDaejo) {
    score += 3000;
  }
  if (book.decision?.state === "borrow_now") {
    score += 1000;
  }
  if (book.isMutualLoanAvailable) {
    score += 120;
  }
  if (book.isUnmannedReservationAvailable) {
    score += 100;
  }
  if (book.isWalkingAvailable) {
    score += 60;
  }
  return score;
}

function isPreferredDaejoLibrary(collection) {
  const text = compactText(`${collection?.libName || ""} ${collection?.shelfLocName || ""} ${collection?.bookManageCode || ""}`);
  return /대조|MK/.test(text);
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

  if (simplifiedTitle === simplifiedQuery) {
    return { level: "exact", label: "정확 제목", score: 1000 };
  }
  if (simplifiedTitle.startsWith(simplifiedQuery)) {
    return { level: "starts_with", label: "제목 앞부분 일치", score: 700 };
  }
  if (simplifiedTitle.includes(simplifiedQuery)) {
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
  if (provider.physicalProvider) {
    return "physical";
  }
  return provider.subscriptionListAvailable ? "subscription" : "owned";
}

function encodeEucKR(string) {
  const bytes = iconv.encode(string, "euc-kr");
  return Array.from(bytes)
    .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
    .join("");
}
