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
  { id: "eunpyeong-ebook", name: "은평구립도서관", baseURL: "https://epbook.eplib.or.kr/ebookPlatform/home/search.do?k={searchTerm}", isEucKR: false, loginURL: "https://epbook.eplib.or.kr/ebookPlatform/login/loginForm.do" },
  { id: "nanet", name: "국회도서관", baseURL: "https://nanet.dkyobobook.co.kr/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://nanet.dkyobobook.co.kr/member/login.ink", subscriptionListAvailable: true },
  { id: "junggu", name: "중구도서관", baseURL: "https://ebook.junggulib.or.kr/elibrary-front/search/searchList.ink?schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.junggulib.or.kr/elibrary-front/member/login.ink" },
  { id: "yongsan", name: "용산도서관", baseURL: "https://ebook.yslibrary.or.kr/elibrary-front/search/searchList.ink?schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.yslibrary.or.kr/elibrary-front/member/login.ink" },
  { id: "jungnang", name: "중랑도서관", baseURL: "https://ebook.jungnanglib.seoul.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ebook.jungnanglib.seoul.kr/elibrary-front/member/login.ink" },
  { id: "ydp", name: "영등포도서관", baseURL: "https://ydplib.dkyobobook.co.kr/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://ydplib.dkyobobook.co.kr/member/login.ink", subscriptionListAvailable: true },
  { id: "gangnam", name: "강남도서관", baseURL: "https://ebook.gangnam.go.kr/elibbook/book_info.asp?search=title&strSearch={searchTerm}", isEucKR: true, loginURL: "https://ebook.gangnam.go.kr/elibbook/login.asp" },
  { id: "songpa", name: "송파도서관", baseURL: "https://ebook.splib.or.kr/search/?srch_order=total&src_key={searchTerm}", isEucKR: false, loginURL: "https://ebook.splib.or.kr/member/login" },
  { id: "dongdaemun", name: "동대문도서관", baseURL: "https://e-book.l4d.or.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt={searchTerm}", isEucKR: false, loginURL: "https://e-book.l4d.or.kr/elibrary-front/main.ink" },
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

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/config/providers", (_, res) => {
  res.json({ libraryProviders, eunpyeongUnified, samStore });
});

app.get("/api/search", async (req, res) => {
  const query = (req.query.q || "").toString().trim();
  if (!query) {
    return res.status(400).json({ error: "검색어(q)가 필요합니다." });
  }

  const libraryResults = await Promise.all(
    libraryProviders.map((provider) => searchProvider(provider, query))
  );

  const anyBorrowable = libraryResults.some((result) =>
    result.books.some((book) => book.decision.state === "borrow_now")
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

  return res.json({
    query,
    searchedAt: new Date().toISOString(),
    libraryResults,
    flow
  });
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

  try {
    const response = await fetch(searchURL, { headers: queryHeaders });
    const html = await response.text();

    const books = parseBooksFromHtml(html, query)
      .slice(0, 8)
      .map((book) => ({
        ...book,
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
      }));

    return {
      providerId: provider.id,
      providerName: provider.name,
      searchURL,
      loginURL: provider.loginURL,
      isSubscriptionProvider: Boolean(provider.subscriptionListAvailable),
      searchable: response.ok,
      ok: response.ok,
      statusCode: response.status,
      books
    };
  } catch (error) {
    return {
      providerId: provider.id,
      providerName: provider.name,
      searchURL,
      loginURL: provider.loginURL,
      isSubscriptionProvider: Boolean(provider.subscriptionListAvailable),
      searchable: false,
      ok: false,
      statusCode: 0,
      error: error instanceof Error ? error.message : "Unknown error",
      books: []
    };
  }
}

function parseBooksFromHtml(html, query) {
  const $ = load(html);
  const normalizedQuery = normalizeKorean(query);

  const candidates = [];
  const selectors = [
    "li",
    ".book_item",
    ".book-list li",
    ".search-result li",
    ".bookList li",
    ".cont_list li",
    ".listType li",
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
      const loanedCount = pickNumber(text, [/(?:대출\s*중|대출중)\s*[:：]?\s*(\d+)/]);
      const reservationCount = pickNumber(text, [/(?:예약|대기)\s*[:：]?\s*(\d+)/, /예약\s*(\d+)\s*명/]);

      const loanSlashPattern = text.match(/대출\s*[:：]\s*(\d+)\s*\/\s*(\d+)/);
      const resolvedLoaned = loanSlashPattern ? Number(loanSlashPattern[1]) : loanedCount;
      const resolvedHoldings = loanSlashPattern ? Number(loanSlashPattern[2]) : holdingsCount;
      const resolvedAvailable =
        loanSlashPattern && Number.isFinite(resolvedHoldings) && Number.isFinite(resolvedLoaned)
          ? Math.max(resolvedHoldings - resolvedLoaned, 0)
          : availableCount;

      const decision = decideAvailability({
        text,
        holdingsCount: resolvedHoldings,
        availableCount: resolvedAvailable,
        reservationCount
      });

      const detailURL = node.find("a[href]").first().attr("href") || null;
      candidates.push({
        title,
        detailURL,
        holdingsCount: resolvedHoldings,
        availableCount: resolvedAvailable,
        loanedCount: resolvedLoaned,
        reservationCount,
        decision,
        rawStatusText: text.slice(0, 300)
      });
    });
  }

  return uniqueByTitle(candidates)
    .sort((a, b) => scoreBook(b) - scoreBook(a))
    .slice(0, 12);
}

function decideAvailability({ text, holdingsCount, availableCount, reservationCount }) {
  const availableToken = /(대출\s*가능|대출가능|바로대출|즉시대출)/.test(text);
  const unavailableToken = /(미소장|소장없음|서비스\s*없음)/.test(text);
  const reservationToken = /(예약가능|예약중|예약\s*대기|대기중|대기자|예약자)/.test(text);

  if (availableCount !== null && availableCount > 0) {
    return {
      state: "borrow_now",
      confidence: "high",
      reason: "available_count_positive"
    };
  }

  if (availableToken && (reservationCount === null || reservationCount === 0)) {
    return {
      state: "borrow_now",
      confidence: "medium",
      reason: "available_token_without_reservation"
    };
  }

  if (holdingsCount === 0 || unavailableToken) {
    return {
      state: "unavailable",
      confidence: "high",
      reason: "holdings_zero_or_unavailable_token"
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
    ".title",
    ".book_tit",
    ".tit",
    "h3",
    "h4",
    "strong",
    "a[title]"
  ];

  for (const selector of selectors) {
    const value = compactText(node.find(selector).first().text() || node.find(selector).first().attr("title") || "");
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

function uniqueByTitle(items) {
  const map = new Map();
  for (const item of items) {
    const key = normalizeKorean(item.title);
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

function compactText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKorean(value) {
  return value.toLowerCase().replace(/\s+/g, "").normalize("NFKC");
}

function constructURL(provider, searchTerm) {
  const encoded = provider.isEucKR ? encodeEucKR(searchTerm) : encodeURIComponent(searchTerm);
  return provider.baseURL.replace("{searchTerm}", encoded);
}

function encodeEucKR(string) {
  const bytes = iconv.encode(string, "euc-kr");
  return Array.from(bytes)
    .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
    .join("");
}
