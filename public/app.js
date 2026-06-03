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
    if (window.ReadableStream) {
      await streamSearchResults(query, controller.signal, requestId);
    } else {
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
      resultMeta.textContent = `"${data.query}" 기준 ${data.libraryResults.length}개 검색처 분석 완료`;
      searchTime.textContent = formatSearchedAt(data.searchedAt);
      renderFallbackLinks(data.flow);
    }
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

async function streamSearchResults(query, signal, requestId) {
  const response = await fetch(`/api/search/stream?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "검색 실패");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let totalProviders = 0;
  let completedProviders = 0;
  let searchedAt = "";
  let flow = null;
  const streamedResults = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const event = parseSseChunk(chunk);
      if (!event || requestId !== activeSearchRequestId) {
        continue;
      }

      if (event.type === "start") {
        totalProviders = event.data.totalProviders || 0;
        searchedAt = event.data.searchedAt || "";
        resultMeta.textContent = `"${query}" 검색 중... 먼저 도착한 결과부터 표시합니다.`;
        searchTime.textContent = formatSearchedAt(searchedAt);
      }

      if (event.type === "provider") {
        completedProviders += 1;
        streamedResults.push(event.data);
        renderResults(streamedResults);
        resultMeta.textContent = `"${query}" 기준 ${completedProviders}/${totalProviders || "?"}개 검색처 분석 중`;
      }

      if (event.type === "flow") {
        flow = event.data;
        renderFlow(flow);
        renderFallbackLinks(flow);
      }

      if (event.type === "done") {
        if (!flow) {
          flow = buildFallbackFlow(query, streamedResults);
          renderFlow(flow);
          renderFallbackLinks(flow);
        }
        resultMeta.textContent = `"${query}" 기준 ${streamedResults.length}개 검색처 분석 완료`;
        searchTime.textContent = formatSearchedAt(event.data.searchedAt || searchedAt);
      }
    }
  }
}

function parseSseChunk(chunk) {
  const lines = chunk.split("\n");
  const type = lines.find((line) => line.startsWith("event: "))?.slice(7).trim() || "message";
  const dataText = lines
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .join("\n");
  if (!dataText) {
    return null;
  }
  return {
    type,
    data: JSON.parse(dataText)
  };
}

function buildFallbackFlow(query, results) {
  const millie = results.find((result) => result.providerId === "millie");
  const hasMillieExactEbook = Boolean(
    millie?.books?.some(
      (book) =>
        book.contentKind === "ebook" &&
        book.isExactTitleMatch &&
        book.decision?.state === "borrow_now"
    )
  );
  const hasMillieExactAny = Boolean(
    millie?.books?.some((book) => book.isExactTitleMatch && book.decision?.state === "borrow_now")
  );
  const hasSeoulBorrowable = results.some(
    (result) =>
      !result.isExternalProvider &&
      !result.isPhysicalProvider &&
      result.books?.some((book) => book.decision?.state === "borrow_now" && isStrongTitleCandidate(book))
  );
  const hasPhysicalBorrowable = results.some(
    (result) => result.isPhysicalProvider && result.books?.some((book) => book.decision?.state === "borrow_now")
  );

  return {
    phase1: {
      label: "밀리의서재 확인",
      completed: true,
      hasBorrowable: hasMillieExactAny,
      hasPrimary: hasMillieExactEbook,
      searchURL: `https://www.millie.co.kr/v4/library/search/${encodeURIComponent(query)}`
    },
    phase2: {
      label: "서울 전역 전자책 검색",
      completed: true,
      enabled: !hasMillieExactEbook,
      hasBorrowable: hasSeoulBorrowable
    },
    phase3: {
      label: "은평구공공도서관 실물 대출 확인",
      enabled: !hasMillieExactEbook && !hasSeoulBorrowable,
      hasBorrowable: hasPhysicalBorrowable,
      searchURL: `https://lib.eplib.or.kr/unified/search.asp?search_word=${encodeURIComponent(query)}`,
      externalLinks: [
        {
          id: "eunpyeong-public",
          label: "은평구공공도서관 검색",
          searchURL: `https://lib.eplib.or.kr/unified/search.asp?search_word=${encodeURIComponent(query)}`
        }
      ]
    }
  };
}

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

    renderSupportedLibraries(data.libraryProviders || [], data.externalProviders || [], data.physicalProviders || []);
  } catch {
    supportedCountEl.textContent = "지원 검색처 확인 실패";
    renderSupportedLibrariesEmpty("목록을 불러오지 못했습니다.");
  }
}

function renderSupportedLibraries(providers, externalProviders = [], physicalProviders = []) {
  if (!supportedLibrariesEl || !supportedCountEl) {
    return;
  }

  const allProviders = [...externalProviders, ...providers, ...physicalProviders];
  supportedCountEl.textContent = `전자책 ${providers.length}개 · 외부 ${externalProviders.length}개 · 실물 ${physicalProviders.length}개`;
  supportedLibrariesEl.replaceChildren();

  if (!allProviders.length) {
    renderSupportedLibrariesEmpty("표시할 검색처가 없습니다.");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const provider of allProviders) {
    const chip = document.createElement("span");
    const isSubscription = provider.libraryModel === "subscription";
    chip.className = `library-chip ${isSubscription ? "is-subscription" : "is-owned"}`;
    chip.textContent = `${provider.name} · ${
      provider.physicalProvider ? "실물 대출" : provider.externalProvider ? "외부 구독형" : isSubscription ? "구독형" : "소장형"
    }`;
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

  const phase1Text = flow.phase1.hasPrimary
    ? "전자책으로 바로 볼 수 있는 후보가 있습니다."
    : flow.phase1.hasBorrowable
      ? "밀리 후보가 있습니다. 전자책이 없으면 오디오북도 확인하세요."
      : "밀리 후보가 없어 서울 전자책 검색을 우선 확인합니다.";

  const phase2Text = flow.phase2.enabled
    ? flow.phase2.hasBorrowable
      ? "서울 전역 전자책에서 대출 가능 후보가 있습니다."
      : "서울 전역 전자책 후보가 부족하면 은평 실물도서를 확인하세요."
    : "밀리 전자책 후보가 있어 후순위로 배치합니다.";

  const phase3Text = flow.phase3.enabled
    ? flow.phase3.hasBorrowable
      ? "은평구공공도서관 실물 대출 가능 후보가 있습니다."
      : "은평 실물 소장/예약/상호대차/무인예약 여부를 확인하세요."
    : "전자책 후보가 있어 후순위로 배치합니다.";

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
      title: "1단계 · 밀리의서재 확인",
      text: "전자책 후보를 먼저 확인하고, 없으면 오디오북을 보조로 봅니다.",
      active: false
    },
    {
      title: "2단계 · 서울 전역 전자책 검색",
      text: "서울권 전자도서관의 대출 가능 여부를 확인합니다.",
      active: false
    },
    {
      title: "3단계 · 은평구공공도서관 실물 대출",
      text: "대조꿈나무, 상호대차/무인예약 가능, 타 도서관 순으로 봅니다.",
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
    renderResultNotice("표시할 검색 결과가 없습니다.", "result-empty");
    return;
  }

  for (const provider of sortedProviders) {
    const items = provider.books || [];
    const card = providerTemplate.content.cloneNode(true);
    const root = card.querySelector(".provider-card");

    root.querySelector(".provider-name").textContent = provider.providerName;
    root.querySelector(".provider-meta").textContent = `파싱 도서 ${items.length}권 · ${getLibraryModelLabel(provider)}`;
    root.querySelector(".search-link").href = provider.searchURL;
    root.querySelector(".login-link").href = provider.loginURL;

    const providerTags = root.querySelector(".provider-tags");
    const storeNames = Array.from(new Set(items.map((book) => normalizeStoreName(book.storeName))));
    const modelTag = document.createElement("span");
    modelTag.className = `provider-tag ${
      provider.libraryModel === "subscription" ? "is-subscription" : "is-owned"
    }`;
    modelTag.textContent = getLibraryModelLabel(provider);
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

  const exactDiff = (b.providerExactBorrowCount || 0) - (a.providerExactBorrowCount || 0);
  if (exactDiff !== 0) {
    return exactDiff;
  }

  const titleDiff = (b.providerTitleScore || 0) - (a.providerTitleScore || 0);
  if (titleDiff !== 0) {
    return titleDiff;
  }

  const sizeDiff = (b.books?.length || 0) - (a.books?.length || 0);
  if (sizeDiff !== 0) {
    return sizeDiff;
  }

  return a.providerName.localeCompare(b.providerName, "ko-KR");
}

function providerRank(provider) {
  if (provider.providerInstantCount > 0) {
    return provider.isPhysicalProvider ? 3 : 1;
  }
  if (provider.providerSubscriptionCount > 0 && provider.providerId === "millie") {
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
    (book) =>
      book.decision?.state === "borrow_now" &&
      book.decision?.reason !== "subscription_provider_listed" &&
      isStrongTitleCandidate(book)
  );
  const subscriptionBorrowBooks = books.filter(
    (book) =>
      book.decision?.state === "borrow_now" &&
      book.decision?.reason === "subscription_provider_listed" &&
      isStrongTitleCandidate(book)
  );
  const exactBorrowBooks = books.filter(
    (book) => book.decision?.state === "borrow_now" && book.isExactTitleMatch
  );
  const providerTopAvailability = Math.max(0, ...immediateBorrowBooks.map((book) => book.availableCount || 0));
  const providerTitleScore = Math.max(0, ...books.map((book) => book.titleMatchScore || 0));

  return {
    ...provider,
    providerInstantCount: immediateBorrowBooks.length,
    providerSubscriptionCount: subscriptionBorrowBooks.length,
    providerExactBorrowCount: exactBorrowBooks.length,
    providerUrgencyScore: immediateBorrowBooks.length * 100 + providerTopAvailability,
    providerTitleScore
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
    .sort(([nameA, booksA], [nameB, booksB]) => {
      const priorityA = Math.max(0, ...booksA.map(scoreBookPriority));
      const priorityB = Math.max(0, ...booksB.map(scoreBookPriority));
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      return compareStoreNames(nameA, nameB);
    })
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
  let score = book.titleMatchScore || 0;
  if (book.isLargePrint) {
    score -= 250;
  }
  if (book.localLibraryAccess) {
    if (book.decision?.state === "borrow_now") {
      score += 1000;
    }
    if (book.isPreferredDaejo) {
      score += 3000;
    }
    if (book.isMutualLoanAvailable) {
      score += 120;
    }
    if (book.isUnmannedReservationAvailable) {
      score += 100;
    }
    return score;
  }
  if (book.subscriptionAccess) {
    if (book.decision?.state === "borrow_now") {
      score += book.contentKind === "ebook" ? 350 : 250;
    } else if (book.decision?.state === "unavailable") {
      score -= 100;
    }
    return score;
  }
  const state = book.decision?.state;
  if (state === "borrow_now") {
    return score + 300 + (book.availableCount || 0);
  }
  if (state === "reserve") {
    return score + 200;
  }
  if (state === "unknown") {
    return score + 100;
  }
  return score;
}

function isStrongTitleCandidate(book) {
  return ["exact", "starts_with", "contains"].includes(book?.titleMatch?.level);
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
    if (decision.reason === "eunpyeong_public_available") {
      return {
        text: `은평 실물도서 대출 가능 (신뢰도: ${decision.confidence})`,
        textClass: "ok",
        containerClass: "state-borrow"
      };
    }
    if (decision.reason === "subscription_provider_listed") {
      return {
        text: `밀리에서 앱 이용 가능 (신뢰도: ${decision.confidence})`,
        textClass: "ok",
        containerClass: "state-borrow"
      };
    }
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
    if (decision.reason === "subscription_provider_unavailable") {
      return {
        text: `밀리 검색 노출 · 대출/열람 불가 (신뢰도: ${decision.confidence})`,
        textClass: "muted",
        containerClass: "state-unavailable"
      };
    }
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
  if (book.subscriptionAccess) {
    const segments = [];
    segments.push(`유형: 밀리 ${book.contentKindLabel || "구독 콘텐츠"}`);
    if (book.titleMatchLabel) {
      segments.push(`제목: ${book.titleMatchLabel}`);
    }
    if (book.rawStatusText) {
      segments.push(book.rawStatusText);
    }
    return segments.join(" / ");
  }

  if (book.localLibraryAccess) {
    const segments = [];
    segments.push(`위치: ${book.localLibraryName || "미확인"} ${book.localShelfLocation || ""}`.trim());
    segments.push(`상태: ${book.localLoanStatus || "미확인"}`);
    if (book.localReturnPlanDate) {
      segments.push(`반납예정: ${book.localReturnPlanDate}`);
    }
    if (book.titleMatchLabel) {
      segments.push(`제목: ${book.titleMatchLabel}`);
    }
    segments.push(`책단비: ${book.isChaekdanbiReservable ? "가능" : "불가"}`);
    segments.push(`상호대차 수령: ${book.isMutualLoanPickupAvailable ? "가능" : "불가"}`);
    segments.push(`상호대차: ${book.isMutualLoanAvailable ? "가능" : "불가"}`);
    segments.push(`무인예약: ${book.isUnmannedReservationAvailable ? "가능" : "불가"}`);
    segments.push(`타관반납: ${book.isOtherLibraryReturnAvailable ? "가능" : "불가"}`);
    if (book.isPreferredDaejo) {
      segments.push("선호: 대조꿈나무/대조동");
    }
    return segments.join(" / ");
  }

  const segments = [];
  if (book.titleMatchLabel) {
    segments.push(`제목: ${book.titleMatchLabel}`);
  }
  if (book.isLargePrint) {
    segments.push("큰글자책");
  }
  segments.push(`소장: ${book.holdingsCount ?? "미확인"}`);
  segments.push(`대출가능: ${book.availableCount ?? "미확인"}`);
  segments.push(`대출중: ${book.loanedCount ?? "미확인"}`);
  segments.push(`예약: ${book.reservationCount ?? "미확인"}`);
  return segments.join(" / ");
}

function getLibraryModelLabel(providerOrModel) {
  const provider =
    typeof providerOrModel === "string" ? { libraryModel: providerOrModel } : providerOrModel || {};
  if (provider.isExternalProvider || provider.externalProvider) {
    return "외부 구독형 서비스";
  }
  if (provider.isPhysicalProvider || provider.physicalProvider || provider.libraryModel === "physical") {
    return "실물도서 대출";
  }
  if (provider.libraryModel === "subscription") {
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

  const millieLink = document.createElement("a");
  millieLink.href = flow.phase1.searchURL;
  millieLink.target = "_blank";
  millieLink.rel = "noopener noreferrer";
  millieLink.textContent = flow.phase1.hasBorrowable
    ? "밀리의서재 검색 열기 (후보 있음)"
    : "밀리의서재 검색 열기";

  const externalLinks = flow.phase3.externalLinks?.length
    ? flow.phase3.externalLinks
    : [{ label: "외부 전자책 서비스 검색", searchURL: flow.phase3.searchURL }];

  fallbackLinks.appendChild(millieLink);
  for (const externalLink of externalLinks) {
    const link = document.createElement("a");
    link.href = externalLink.searchURL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = flow.phase3.enabled
      ? `${externalLink.label} 열기 (활성)`
      : `${externalLink.label} 열기`;
    fallbackLinks.appendChild(link);
  }
}

function formatSearchedAt(isoString) {
  if (!isoString) {
    return "";
  }
  const date = new Date(isoString);
  return `분석 시각: ${date.toLocaleString("ko-KR")}`;
}
