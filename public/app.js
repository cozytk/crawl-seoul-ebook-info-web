const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#q");
const flowEl = document.querySelector("#flow");
const resultEl = document.querySelector("#result");
const rowTemplate = document.querySelector("#book-row-template");
const providerTemplate = document.querySelector("#provider-card-template");
const resultMeta = document.querySelector("#result-meta");
const searchTime = document.querySelector("#search-time");
const fallbackLinks = document.querySelector("#fallback-links");
const supportedCountEl = document.querySelector("#supported-count");
const supportedLibrariesEl = document.querySelector("#supported-libraries");
const searchButton = form.querySelector('button[type="submit"]');
const sharedCoverURLByKey = new Map();

let activeSearchController = null;
let activeSearchRequestId = 0;

init();

async function init() {
  renderFlowPlaceholder();
  renderFallbackLinks();
  await loadSupportedLibraries();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = queryInput.value.trim();
  if (!query) {
    return;
  }

  if (activeSearchController) {
    activeSearchController.abort();
  }

  const controller = new AbortController();
  const requestId = ++activeSearchRequestId;
  activeSearchController = controller;

  flowEl.replaceChildren();
  renderResultNotice("검색 중입니다. 도서관 페이지를 순차 분석하고 있어요.", "loading-state");
  resultEl.setAttribute("aria-busy", "true");
  resultMeta.textContent = `"${query}" 검색 중...`;
  searchTime.textContent = "";
  setSearchPending(true);
  renderFallbackLinks();

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      signal: controller.signal
    });
    const data = await response.json();

    if (requestId !== activeSearchRequestId) {
      return;
    }

    if (!response.ok) {
      throw new Error(data.error || "검색 실패");
    }

    renderFlow(data.flow);
    renderResults(data.libraryResults);
    resultMeta.textContent = `"${data.query}" 기준 ${data.libraryResults.length}개 도서관 분석 완료`;
    searchTime.textContent = formatSearchedAt(data.searchedAt);
    renderFallbackLinks(data.flow);
  } catch (error) {
    if (requestId !== activeSearchRequestId) {
      return;
    }

    if (error?.name === "AbortError") {
      return;
    }

    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    renderFlowPlaceholder();
    renderResultNotice(`오류: ${message}`, "result-error");
    resultMeta.textContent = "오류가 발생했습니다.";
    searchTime.textContent = "";
  } finally {
    if (requestId === activeSearchRequestId) {
      activeSearchController = null;
      setSearchPending(false);
      resultEl.setAttribute("aria-busy", "false");
    }
  }
});

async function loadSupportedLibraries() {
  if (!supportedLibrariesEl || !supportedCountEl) {
    return;
  }

  try {
    const response = await fetch("/api/config/providers");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "설정 조회 실패");
    }

    renderSupportedLibraries(data.libraryProviders || []);
  } catch {
    supportedCountEl.textContent = "지원 도서관 확인 실패";
    renderSupportedLibrariesEmpty("목록을 불러오지 못했습니다.");
  }
}

function renderSupportedLibraries(providers) {
  if (!supportedLibrariesEl || !supportedCountEl) {
    return;
  }

  supportedCountEl.textContent = `지원 도서관 ${providers.length}개`;
  supportedLibrariesEl.replaceChildren();

  if (!providers.length) {
    renderSupportedLibrariesEmpty("표시할 도서관이 없습니다.");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const provider of providers) {
    const chip = document.createElement("span");
    const isSubscription = provider.libraryModel === "subscription";
    chip.className = `library-chip ${isSubscription ? "is-subscription" : "is-owned"}`;
    chip.textContent = `${provider.name} · ${isSubscription ? "구독형" : "소장형"}`;
    fragment.appendChild(chip);
  }
  supportedLibrariesEl.appendChild(fragment);
}

function renderSupportedLibrariesEmpty(message) {
  supportedLibrariesEl.replaceChildren();
  const empty = document.createElement("p");
  empty.className = "supported-empty";
  empty.textContent = message;
  supportedLibrariesEl.appendChild(empty);
}

function renderFlow(flow) {
  if (!flow) {
    renderFlowPlaceholder();
    return;
  }

  const phase1Text = flow.phase1.hasBorrowable
    ? "대출 가능 후보를 찾았어요. 상단 결과를 우선 확인하세요."
    : "대출 가능 후보가 없어 다음 탐색 경로를 활성화합니다.";

  const phase2Text = flow.phase2.enabled
    ? "필요: 은평 통합검색으로 범위를 넓혀보세요."
    : "불필요: 1단계에서 충분한 후보를 찾았습니다.";

  const phase3Text = flow.phase3.enabled
    ? "필요: 외부 전자책 서비스 대안을 함께 확인하세요."
    : "불필요: 도서관 후보가 존재합니다.";

  const flowItems = [
    {
      title: `1단계 · ${flow.phase1.label}`,
      text: phase1Text,
      active: flow.phase1.hasBorrowable
    },
    {
      title: `2단계 · ${flow.phase2.label}`,
      text: phase2Text,
      active: flow.phase2.enabled
    },
    {
      title: `3단계 · ${flow.phase3.label}`,
      text: phase3Text,
      active: flow.phase3.enabled
    }
  ];

  flowEl.replaceChildren(buildFlowList(flowItems));
}

function renderFlowPlaceholder() {
  const flowItems = [
    {
      title: "1단계 · 서울 전역 전자도서관 검색",
      text: "검색 결과에서 즉시 대출 가능 여부를 먼저 보여줍니다.",
      active: false
    },
    {
      title: "2단계 · 통합검색 확장",
      text: "필요할 때만 범위를 넓혀 확인합니다.",
      active: false
    },
    {
      title: "3단계 · 외부 서비스 대안",
      text: "도서관 후보가 없을 때만 보조 수단을 안내합니다.",
      active: false
    }
  ];

  flowEl.replaceChildren(buildFlowList(flowItems));
}

function buildFlowList(flowItems) {
  const list = document.createElement("ol");
  list.className = "flow-ordered-list";

  for (const item of flowItems) {
    const listItem = document.createElement("li");
    listItem.className = `flow-item ${item.active ? "is-active" : "is-idle"}`;

    const title = document.createElement("strong");
    title.textContent = item.title;
    listItem.appendChild(title);

    const body = document.createElement("span");
    body.textContent = item.text;
    listItem.appendChild(body);

    list.appendChild(listItem);
  }

  return list;
}

function setSearchPending(isPending) {
  if (!searchButton) {
    return;
  }
  searchButton.disabled = isPending;
  searchButton.textContent = isPending ? "검색 중..." : "검색";
}

function renderResultNotice(message, className) {
  resultEl.replaceChildren();
  const notice = document.createElement("p");
  notice.className = className;
  notice.textContent = message;
  resultEl.appendChild(notice);
}

function renderResults(results) {
  sharedCoverURLByKey.clear();
  const enrichedProviders = results.map(deriveProviderStats);
  const sortedProviders = [...enrichedProviders].sort(compareProviders);
  resultEl.replaceChildren();

  if (!sortedProviders.length) {
    renderResultNotice("표시할 도서관 결과가 없습니다.", "result-empty");
    return;
  }

  for (const provider of sortedProviders) {
    const items = provider.books || [];
    const card = providerTemplate.content.cloneNode(true);
    const root = card.querySelector(".provider-card");

    root.querySelector(".provider-name").textContent = provider.providerName;
    root.querySelector(".provider-meta").textContent = `파싱 도서 ${items.length}권 · ${getLibraryModelLabel(provider.libraryModel)}`;
    root.querySelector(".search-link").href = provider.searchURL;
    root.querySelector(".login-link").href = provider.loginURL;

    const providerTags = root.querySelector(".provider-tags");
    const storeNames = Array.from(new Set(items.map((book) => normalizeStoreName(book.storeName))));
    const modelTag = document.createElement("span");
    modelTag.className = `provider-tag ${
      provider.libraryModel === "subscription" ? "is-subscription" : "is-owned"
    }`;
    modelTag.textContent = getLibraryModelLabel(provider.libraryModel);
    providerTags.appendChild(modelTag);
    for (const storeName of storeNames.sort(compareStoreNames)) {
      const storeTag = document.createElement("span");
      storeTag.className = "provider-tag is-store";
      storeTag.textContent = storeName;
      providerTags.appendChild(storeTag);
    }

    const highlight = root.querySelector(".provider-highlight");
    highlight.classList.add(provider.providerInstantCount > 0 ? "has-instant" : "no-instant");
    highlight.textContent =
      provider.providerInstantCount > 0 ? "바로 대출 후보 있음" : "바로 대출 후보 없음";

    const connection = document.createElement("p");
    connection.classList.add("provider-connection", provider.searchable ? "connected" : "disconnected");
    connection.textContent = provider.searchable
      ? `연결 상태: 정상 (${provider.statusCode})`
      : `연결 상태: 실패 (${provider.error || provider.statusCode})`;

    const bookList = root.querySelector(".provider-books");
    const sortedItems = [...items].sort(compareBooksForBorrowFirst);
    const groupedItems = groupBooksByStore(sortedItems);

    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "result-empty";
      empty.textContent = "이 키워드는 자동 파싱 결과가 없었습니다. 검색 페이지에서 직접 확인해 주세요.";
      bookList.appendChild(empty);
      root.appendChild(connection);
      if (!provider.searchable) {
        root.classList.add("search-failed");
      }
      resultEl.appendChild(card);
      continue;
    }

    for (const group of groupedItems) {
      const groupNode = document.createElement("section");
      groupNode.className = "provider-store-group";

      const groupTitle = document.createElement("p");
      groupTitle.className = "provider-store-title";
      groupTitle.textContent = `${group.storeName} · ${group.books.length}권`;
      groupNode.appendChild(groupTitle);

      for (const book of group.books) {
        const node = rowTemplate.content.cloneNode(true);
        const stateView = renderState(book.decision);
        const itemNode = node.querySelector(".book-item");
        itemNode.classList.add(stateView.containerClass);
        const coverNode = node.querySelector(".book-cover");
        const optimizedCoverURL = optimizeCoverImageURL(book.coverImageURL);
        if (optimizedCoverURL) {
          coverNode.src = optimizedCoverURL;
          coverNode.alt = `${book.title} 표지`;
        } else {
          itemNode.classList.add("no-cover");
          coverNode.remove();
        }
        const detailLink = node.querySelector(".book-detail-link");
        detailLink.href = book.detailURL || provider.searchURL;
        detailLink.title = book.detailURL ? "도서 상세 페이지 열기" : "상세 링크가 없어 검색 페이지로 이동";
        node.querySelector(".book-title").textContent = book.title;
        const sourceNode = node.querySelector(".book-source");
        sourceNode.textContent = `공급사: ${book.storeName || "미확인"}`;
        const actionLinksNode = node.querySelector(".book-action-links");
        const previewLink = node.querySelector(".book-preview-link");
        if (book.previewURL) {
          previewLink.href = book.previewURL;
          previewLink.title = "도서 미리보기 열기";
        } else {
          actionLinksNode.remove();
        }
        const statusNode = node.querySelector(".book-status");
        statusNode.classList.add(stateView.textClass);
        statusNode.textContent = stateView.text;
        node.querySelector(".book-counts").textContent = renderCounts(book);
        groupNode.appendChild(node);
      }

      bookList.appendChild(groupNode);
    }
    root.appendChild(connection);
    if (!provider.searchable) {
      root.classList.add("search-failed");
    }
    resultEl.appendChild(card);
  }
}

function compareProviders(a, b) {
  const rankA = providerRank(a);
  const rankB = providerRank(b);

  if (rankA !== rankB) {
    return rankA - rankB;
  }

  const sizeDiff = (b.books?.length || 0) - (a.books?.length || 0);
  if (sizeDiff !== 0) {
    return sizeDiff;
  }

  return a.providerName.localeCompare(b.providerName, "ko-KR");
}

function providerRank(provider) {
  if (provider.providerInstantCount > 0) {
    return 0;
  }
  if (provider.providerSubscriptionCount > 0 && !provider.isSubscriptionProvider) {
    return 1;
  }
  if (provider.providerSubscriptionCount > 0 && provider.isSubscriptionProvider) {
    return 2;
  }
  if (provider.searchable) {
    return 3;
  }
  return 4;
}

function deriveProviderStats(provider) {
  const books = provider.books || [];
  const immediateBorrowBooks = books.filter(
    (book) => book.decision?.state === "borrow_now" && book.decision?.reason !== "subscription_provider_listed"
  );
  const subscriptionBorrowBooks = books.filter(
    (book) => book.decision?.state === "borrow_now" && book.decision?.reason === "subscription_provider_listed"
  );
  const providerTopAvailability = Math.max(0, ...immediateBorrowBooks.map((book) => book.availableCount || 0));

  return {
    ...provider,
    providerInstantCount: immediateBorrowBooks.length,
    providerSubscriptionCount: subscriptionBorrowBooks.length,
    providerUrgencyScore: immediateBorrowBooks.length * 100 + providerTopAvailability
  };
}

function compareBooksForBorrowFirst(a, b) {
  const scoreA = scoreBookPriority(a);
  const scoreB = scoreBookPriority(b);
  return scoreB - scoreA;
}

function optimizeCoverImageURL(coverImageURL) {
  if (!coverImageURL) {
    return null;
  }

  let key = coverImageURL;
  try {
    const parsed = new URL(coverImageURL);
    key = `${parsed.origin}${parsed.pathname}`;
  } catch {
    key = coverImageURL;
  }

  const sharedURL = sharedCoverURLByKey.get(key);
  if (sharedURL) {
    return sharedURL;
  }

  if (sharedCoverURLByKey.size > 300) {
    sharedCoverURLByKey.clear();
  }

  sharedCoverURLByKey.set(key, coverImageURL);
  return coverImageURL;
}

function groupBooksByStore(books) {
  const storeGroups = new Map();

  for (const book of books) {
    const storeName = normalizeStoreName(book.storeName);
    if (!storeGroups.has(storeName)) {
      storeGroups.set(storeName, []);
    }
    storeGroups.get(storeName).push({
      ...book,
      storeName
    });
  }

  return Array.from(storeGroups.entries())
    .sort(([nameA], [nameB]) => compareStoreNames(nameA, nameB))
    .map(([storeName, groupedBooks]) => ({
      storeName,
      books: groupedBooks
    }));
}

function normalizeStoreName(storeName) {
  if (!storeName) {
    return "공급사 미확인";
  }

  const normalized = storeName.trim();
  if (!normalized) {
    return "공급사 미확인";
  }
  if (/yes24/i.test(normalized)) {
    return "YES24";
  }
  if (/교보\s*문고|교보문고|kyobo/i.test(normalized)) {
    return "교보문고";
  }
  return normalized;
}

function compareStoreNames(a, b) {
  const rank = (storeName) => {
    if (storeName === "YES24") {
      return 0;
    }
    if (storeName === "교보문고") {
      return 1;
    }
    if (storeName === "공급사 미확인") {
      return 3;
    }
    return 2;
  };

  const rankDiff = rank(a) - rank(b);
  if (rankDiff !== 0) {
    return rankDiff;
  }
  return a.localeCompare(b, "ko-KR");
}

function scoreBookPriority(book) {
  const state = book.decision?.state;
  if (state === "borrow_now") {
    return 300 + (book.availableCount || 0);
  }
  if (state === "reserve") {
    return 200;
  }
  if (state === "unknown") {
    return 100;
  }
  return 0;
}

function renderState(decision) {
  if (!decision) {
    return {
      text: "상태 미상",
      textClass: "muted",
      containerClass: "state-unknown"
    };
  }
  if (decision.state === "borrow_now") {
    return {
      text: `지금 대출 가능 (신뢰도: ${decision.confidence})`,
      textClass: "ok",
      containerClass: "state-borrow"
    };
  }
  if (decision.state === "reserve") {
    return {
      text: `예약/대기 상태 (신뢰도: ${decision.confidence})`,
      textClass: "warn",
      containerClass: "state-reserve"
    };
  }
  if (decision.state === "unavailable") {
    return {
      text: `미소장/이용불가 (신뢰도: ${decision.confidence})`,
      textClass: "muted",
      containerClass: "state-unavailable"
    };
  }
  return {
    text: `판단 보류 (신뢰도: ${decision.confidence})`,
    textClass: "muted",
    containerClass: "state-unknown"
  };
}

function renderCounts(book) {
  const segments = [];
  segments.push(`소장: ${book.holdingsCount ?? "미확인"}`);
  segments.push(`대출가능: ${book.availableCount ?? "미확인"}`);
  segments.push(`대출중: ${book.loanedCount ?? "미확인"}`);
  segments.push(`예약: ${book.reservationCount ?? "미확인"}`);
  return segments.join(" / ");
}

function getLibraryModelLabel(libraryModel) {
  if (libraryModel === "subscription") {
    return "구독형 도서관";
  }
  return "소장형 도서관";
}

function renderFallbackLinks(flow) {
  fallbackLinks.replaceChildren();

  const heading = document.createElement("h4");
  heading.textContent = "대안 바로가기";
  fallbackLinks.appendChild(heading);

  const muted = document.createElement("p");
  muted.className = "guide-muted";
  muted.textContent = "검색 후 자동 안내됩니다.";
  fallbackLinks.appendChild(muted);

  if (!flow) {
    return;
  }

  const eunpyeongLink = document.createElement("a");
  eunpyeongLink.href = flow.phase2.searchURL;
  eunpyeongLink.target = "_blank";
  eunpyeongLink.rel = "noopener noreferrer";
  eunpyeongLink.textContent = flow.phase2.enabled
    ? "은평 통합검색 열기 (활성)"
    : "은평 통합검색 열기";

  const samLink = document.createElement("a");
  samLink.href = flow.phase3.searchURL;
  samLink.target = "_blank";
  samLink.rel = "noopener noreferrer";
  samLink.textContent = flow.phase3.enabled
    ? "외부 전자책 서비스 검색 열기 (활성)"
    : "외부 전자책 서비스 검색 열기";

  fallbackLinks.appendChild(eunpyeongLink);
  fallbackLinks.appendChild(samLink);
}

function formatSearchedAt(isoString) {
  if (!isoString) {
    return "";
  }
  const date = new Date(isoString);
  return `분석 시각: ${date.toLocaleString("ko-KR")}`;
}
