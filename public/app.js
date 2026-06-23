const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#q");
const flowEl = document.querySelector("#flow");
const decisionBoard = document.querySelector("#decision-board");
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
  renderDecisionBoardPlaceholder();
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
  renderDecisionBoardLoading(query);
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
      renderResults(data.libraryResults, {
        isComplete: true,
        completedProviders: data.libraryResults.length,
        totalProviders: data.libraryResults.length
      });
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
    renderDecisionBoardError(message);
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
        renderResults(streamedResults, {
          isComplete: false,
          completedProviders,
          totalProviders
        });
        resultMeta.textContent = `"${query}" 기준 ${completedProviders}/${totalProviders || "?"}개 검색처 분석 중`;
      }

      if (event.type === "flow") {
        flow = event.data;
        renderFlow(flow);
        renderFallbackLinks(flow);
      }

      if (event.type === "done") {
        renderResults(streamedResults, {
          isComplete: true,
          completedProviders: streamedResults.length,
          totalProviders: totalProviders || streamedResults.length
        });
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

  const flowItems = [
    {
      title: "1단계 · 밀리의서재 바로 보기",
      text: flow.phase1.hasPrimary ? "바로 볼 수 있으면 여기서 멈춥니다." : "볼 수 없으면 다음 대출형 도서관을 봅니다.",
      active: flow.phase1.hasBorrowable
    },
    {
      title: "2단계 · 대출형 전자도서관",
      text: "소장형 전자책을 바로 대출할 수 있는지 확인합니다.",
      active: flow.phase2.enabled
    },
    {
      title: "3단계 · 구독형 도서관",
      text: "서울도서관 등 구독형 전자책으로 바로 열람 가능한지 확인합니다.",
      active: flow.phase2.enabled
    },
    {
      title: "4단계 · 은평 실물 직접 대출",
      text: "전자책이 부족하면 은평구 공공도서관 실물 대출을 확인합니다.",
      active: flow.phase3.enabled
    },
    {
      title: "5단계 · 은평 실물 직접 예약",
      text: "직접 대출이 안 되면 예약 가능한 실물 소장본을 봅니다.",
      active: flow.phase3.enabled
    },
    {
      title: "6단계 · 전체 예약 후보",
      text: "마지막으로 어느 도서관에서라도 예약 가능한지 확인합니다.",
      active: true
    }
  ];

  flowEl.replaceChildren(buildFlowList(flowItems));
}

function renderFlowPlaceholder() {
  const flowItems = [
    {
      title: "1단계 · 밀리의서재 바로 보기",
      text: "바로 볼 수 있는지 먼저 확인합니다.",
      active: false
    },
    {
      title: "2단계 · 대출형 전자도서관",
      text: "바로 빌릴 수 있는 소장형 전자책을 확인합니다.",
      active: false
    },
    {
      title: "3단계 · 구독형 도서관",
      text: "구독형 전자책으로 열람 가능한지 확인합니다.",
      active: false
    },
    {
      title: "4단계 · 은평 실물 직접 대출",
      text: "직접 빌릴 수 있는 은평 실물도서를 확인합니다.",
      active: false
    },
    {
      title: "5단계 · 은평 실물 직접 예약",
      text: "예약 가능한 은평 실물도서를 확인합니다.",
      active: false
    },
    {
      title: "6단계 · 전체 예약 후보",
      text: "어느 도서관에서라도 예약 가능한지 확인합니다.",
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

function renderDecisionBoardPlaceholder() {
  if (!decisionBoard) {
    return;
  }
  decisionBoard.className = "availability-flow";
  decisionBoard.setAttribute("aria-busy", "false");
  const steps = [
    ["1", "밀리의서재", "바로 볼 수 있는지 확인"],
    ["2", "대출형 전자도서관", "바로 빌릴 수 있는지 확인"],
    ["3", "구독형 도서관", "바로 열람 가능한지 확인"],
    ["4", "은평 실물 대출", "지금 직접 빌릴 수 있는지 확인"],
    ["5", "은평 실물 예약", "예약 가능한 소장본이 있는지 확인"],
    ["6", "전체 예약", "어느 도서관이든 예약 가능한지 확인"]
  ];
  decisionBoard.replaceChildren(buildDecisionBoardShell("검색하면 판단 흐름이 여기에 표시됩니다.", steps));
}

function renderDecisionBoardLoading(query) {
  if (!decisionBoard) {
    return;
  }
  decisionBoard.className = "availability-flow";
  decisionBoard.setAttribute("aria-busy", "true");
  const loadingSteps = buildAvailabilityDecisions([], { isComplete: false }).map((step) => [
    step.step,
    step.title,
    `"${query}" 분석 중`
  ]);
  decisionBoard.replaceChildren(buildDecisionBoardShell("도서관별 응답을 기다리는 중입니다.", loadingSteps));
}

function renderDecisionBoardError(message) {
  if (!decisionBoard) {
    return;
  }
  decisionBoard.className = "availability-flow";
  decisionBoard.setAttribute("aria-busy", "false");
  const errorSteps = buildAvailabilityDecisions([], { isComplete: true }).map((step) => [
    step.step,
    step.title,
    step.step === "1" ? `검색 오류: ${message}` : "검색 후 다시 확인"
  ]);
  decisionBoard.replaceChildren(buildDecisionBoardShell("검색을 완료하지 못했습니다. 입력값을 확인하고 다시 시도해 주세요.", errorSteps));
}

function buildDecisionBoardShell(summary, steps) {
  const fragment = document.createDocumentFragment();
  const head = document.createElement("header");
  head.className = "availability-flow__head availability-flow__header";

  const mark = document.createElement("p");
  mark.className = "availability-flow__mark";
  mark.textContent = "판정표";
  head.appendChild(mark);

  const title = document.createElement("h4");
  title.id = "availability-flow-title";
  title.textContent = "읽을 수 있는 순서대로 확인";
  head.appendChild(title);

  const body = document.createElement("p");
  body.className = "availability-flow__summary";
  body.textContent = summary;
  head.appendChild(body);
  fragment.appendChild(head);

  const grid = document.createElement("ol");
  grid.className = "availability-flow__rail availability-flow__list";
  for (const step of steps) {
    const card = document.createElement("li");
    card.className = "flow-decision-card flow-decision-card--pending is-pending";

    const stepLabel = document.createElement("p");
    stepLabel.className = "flow-decision-card__step";
    stepLabel.textContent = `${step[0]}단계`;
    card.appendChild(stepLabel);

    const cardTitle = document.createElement("h5");
    cardTitle.className = "flow-decision-card__question flow-decision-card__title";
    cardTitle.textContent = `${step[0]}. ${step[1]}`;
    card.appendChild(cardTitle);

    const status = document.createElement("strong");
    status.className = "flow-decision-card__answer";
    status.textContent = step[2];
    card.appendChild(status);
    grid.appendChild(card);
  }
  fragment.appendChild(grid);
  return fragment;
}

function renderDecisionBoard(providers, options = {}) {
  if (!decisionBoard) {
    return;
  }
  decisionBoard.className = "availability-flow";
  decisionBoard.setAttribute("aria-busy", options.isComplete ? "false" : "true");

  const decisions = buildAvailabilityDecisions(providers, options);
  const completed = options.completedProviders ?? providers.length;
  const total = options.totalProviders || providers.length;
  const summary = options.isComplete
    ? summarizeDecisionFlow(decisions)
    : `${completed}/${total || "?"}개 검색처 분석 중입니다. 아직 도착하지 않은 검색처는 대기 상태로 표시됩니다.`;

  decisionBoard.replaceChildren();
  const head = document.createElement("header");
  head.className = "availability-flow__head availability-flow__header";

  const mark = document.createElement("p");
  mark.className = "availability-flow__mark";
  mark.textContent = "판정표";
  head.appendChild(mark);

  const title = document.createElement("h4");
  title.id = "availability-flow-title";
  title.textContent = "읽을 수 있는 순서대로 확인";
  head.appendChild(title);

  const body = document.createElement("p");
  body.className = "availability-flow__summary";
  body.textContent = summary;
  head.appendChild(body);
  decisionBoard.appendChild(head);

  const grid = document.createElement("ol");
  grid.className = "availability-flow__rail availability-flow__list";
  for (const decision of decisions) {
    grid.appendChild(renderDecisionCard(decision));
  }
  decisionBoard.appendChild(grid);
}

function summarizeDecisionFlow(decisions) {
  const firstActionable = decisions.find((decision) => decision.tone === "good" || decision.tone === "warn");
  if (!firstActionable) {
    return "먼저 가능한 첫 단계가 아직 없습니다. 아래 결과에서 검색 페이지를 직접 확인해 주세요.";
  }
  const reserveAction = decisions.find((decision) => decision.tone === "warn" && decision.label.includes("예약"));
  const reserveCopy =
    reserveAction && reserveAction !== firstActionable
      ? ` 예약 가능 단계: ${reserveAction.step}단계 ${reserveAction.title}.`
      : "";
  return `먼저 가능한 첫 단계: ${firstActionable.step}단계 ${firstActionable.title} · ${firstActionable.label}.${reserveCopy}`;
}

function buildAvailabilityDecisions(providers, options = {}) {
  const candidates = providers.flatMap((provider) =>
    (provider.books || []).map((book) => ({
      provider,
      book
    }))
  );
  const isComplete = Boolean(options.isComplete);
  const findBest = (predicate) =>
    candidates
      .filter(({ book }) => isStrongTitleCandidate(book))
      .filter(predicate)
      .sort((left, right) => scoreBookPriority(right.book) - scoreBookPriority(left.book))[0] || null;

  return [
    buildDecision({
      step: "1",
      title: "밀리의서재에서 바로 보기",
      positiveLabel: "바로 볼 수 있음",
      positiveText: "밀리에서 바로 열람할 수 있습니다.",
      negativeLabel: "볼 수 없음",
      negativeText: "밀리 검색 결과는 있지만 현재 열람 가능한 상태가 아닙니다.",
      pendingText: "밀리 결과 분석 중",
      toneWhenNegative: "bad",
      hit: findBest(({ provider, book }) => provider.providerId === "millie" && isBorrowNow(book)),
      isComplete
    }),
    buildDecision({
      step: "2",
      title: "대출형 전자도서관에서 빌리기",
      positiveLabel: "바로 대출 가능",
      positiveText: "소장형 전자도서관에서 바로 대출할 수 있습니다.",
      negativeLabel: "바로 대출 없음",
      negativeText: "대출형 전자도서관에서는 바로 빌릴 후보가 없습니다.",
      pendingText: "대출형 도서관 분석 중",
      hit: findBest(
        ({ provider, book }) =>
          isOwnedLibraryProvider(provider) &&
          isBorrowNow(book) &&
          !isSubscriptionBorrowReason(book.decision?.reason)
      ),
      isComplete
    }),
    buildDecision({
      step: "3",
      title: "구독형 도서관에서 열람하기",
      positiveLabel: "바로 열람 가능",
      positiveText: "구독형 도서관에서 바로 열람할 수 있습니다.",
      negativeLabel: "열람 후보 없음",
      negativeText: "다른 구독형 도서관에서 바로 열람 가능한 후보가 없습니다.",
      pendingText: "구독형 도서관 분석 중",
      hit: findBest(({ provider, book }) => provider.providerId !== "millie" && isLibrarySubscriptionBorrow(provider, book)),
      isComplete
    }),
    buildDecision({
      step: "4",
      title: "은평구 공공도서관 직접 대출",
      positiveLabel: "직접 대출 가능",
      positiveText: "은평구 공공도서관 실물도서를 지금 빌릴 수 있습니다.",
      negativeLabel: "직접 대출 없음",
      negativeText: "은평구 공공도서관에서 지금 바로 빌릴 실물도서 후보가 없습니다.",
      pendingText: "은평 실물 대출 분석 중",
      hit: findBest(({ provider, book }) => provider.isPhysicalProvider && isBorrowNow(book)),
      isComplete
    }),
    buildDecision({
      step: "5",
      title: "은평구 공공도서관 직접 예약",
      positiveLabel: "예약 가능",
      positiveText: "은평구 공공도서관 실물도서를 예약할 수 있습니다.",
      negativeLabel: "예약 후보 없음",
      negativeText: "은평구 공공도서관에서 예약 가능한 실물도서 후보가 없습니다.",
      pendingText: "은평 실물 예약 분석 중",
      toneWhenPositive: "warn",
      hit: findBest(({ provider, book }) => provider.isPhysicalProvider && isPhysicalReservationActionable(book)),
      isComplete
    }),
    buildDecision({
      step: "6",
      title: "어느 도서관이든 예약하기",
      positiveLabel: "예약 후보 있음",
      positiveText: "검색된 도서관 중 예약 가능한 후보가 있습니다.",
      negativeLabel: "예약 후보 없음",
      negativeText: "현재 자동 판정으로 예약 가능한 후보가 없습니다.",
      pendingText: "전체 예약 가능성 분석 중",
      toneWhenPositive: "warn",
      hit: findBest(({ book }) => isAnyReservationCandidate(book)),
      isComplete
    })
  ];
}

function buildDecision({
  step,
  title,
  positiveLabel,
  positiveText,
  negativeLabel,
  negativeText,
  pendingText,
  toneWhenPositive = "good",
  toneWhenNegative = "neutral",
  hit,
  isComplete
}) {
  if (hit) {
    return {
      step,
      title,
      label: positiveLabel,
      text: positiveText,
      tone: toneWhenPositive,
      providerName: hit.provider.providerName,
      bookTitle: hit.book.title,
      evidence: buildDecisionEvidence(hit.provider, hit.book),
      actionLabel: buildDecisionActionLabel(hit.provider, hit.book),
      href: hit.book.detailURL || hit.provider.searchURL
    };
  }

  return {
    step,
    title,
    label: isComplete ? negativeLabel : "분석 중",
    text: isComplete ? negativeText : pendingText,
    tone: isComplete ? toneWhenNegative : "pending",
    providerName: "",
    bookTitle: "",
    evidence: "",
    actionLabel: isComplete ? "다음 후보 확인" : "검색 결과 대기",
    href: null
  };
}

function renderDecisionCard(decision) {
  const card = document.createElement("li");
  card.className = `flow-decision-card flow-decision-card--${decision.tone} is-${decision.tone}`;

  const step = document.createElement("p");
  step.className = "flow-decision-card__step";
  step.textContent = `${decision.step}단계`;
  card.appendChild(step);

  const title = document.createElement("h5");
  title.className = "flow-decision-card__question flow-decision-card__title";
  title.textContent = `${decision.step}. ${decision.title}`;
  card.appendChild(title);

  const status = document.createElement("strong");
  status.className = "flow-decision-card__answer";
  status.textContent = decision.label;
  card.appendChild(status);

  const text = document.createElement("p");
  text.className = "flow-decision-card__copy";
  text.textContent = decision.text;
  card.appendChild(text);

  if (decision.providerName || decision.bookTitle || decision.evidence) {
    const evidence = document.createElement("p");
    evidence.className = "flow-decision-card__evidence flow-decision-card__supporting-results";
    evidence.textContent = [decision.providerName, decision.bookTitle, decision.evidence]
      .filter(Boolean)
      .join(" · ");
    card.appendChild(evidence);
  }

  if (decision.href) {
    const link = document.createElement("a");
    link.className = "flow-decision-card__link flow-decision-card__action";
    link.href = decision.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = decision.actionLabel || "상세 확인";
    card.appendChild(link);
  }

  return card;
}

function buildDecisionActionLabel(provider, book) {
  if (provider.providerId === "millie") {
    return "밀리 상세 열기";
  }
  if (provider.isPhysicalProvider && isReservationActionable(book)) {
    return "예약 페이지 확인";
  }
  if (provider.isPhysicalProvider) {
    return "소장 위치 확인";
  }
  if (isLibrarySubscriptionBorrow(provider, book)) {
    return "구독 열람 확인";
  }
  return "대출 페이지 확인";
}

function buildDecisionEvidence(provider, book) {
  if (book.localLibraryAccess) {
    return [book.localLoanStatus, book.localShelfLocation].filter(Boolean).join(" / ");
  }
  if (book.contentKindLabel) {
    return `밀리 ${book.contentKindLabel}`;
  }
  return getLibraryModelLabel(provider);
}

function renderResults(results, options = {}) {
  sharedCoverURLByKey.clear();
  const enrichedProviders = results.map(deriveProviderStats);
  const sortedProviders = [...enrichedProviders].sort(compareProviders);
  renderDecisionBoard(sortedProviders, options);
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

function isSubscriptionBorrowReason(reason) {
  return reason === "subscription_provider_listed" || reason === "library_subscription_provider_listed";
}

function isBorrowNow(book) {
  return book.decision?.state === "borrow_now";
}

function isOwnedLibraryProvider(provider) {
  return !provider.isExternalProvider && !provider.isPhysicalProvider && provider.libraryModel !== "subscription";
}

function isLibrarySubscriptionBorrow(provider, book) {
  return (
    isBorrowNow(book) &&
    !provider.isPhysicalProvider &&
    (provider.isSubscriptionProvider || isSubscriptionBorrowReason(book.decision?.reason))
  );
}

function isReservationActionable(book) {
  return isAnyReservationCandidate(book);
}

function isPhysicalReservationActionable(book) {
  return (
    book.decision?.state === "reserve" &&
    (
      book.decision?.reason === "eunpyeong_public_reservable" ||
      /예약\s*가능|예약가능/.test(book.rawStatusText || "") ||
      book.isUnmannedReservationAvailable
    )
  );
}

function isAnyReservationCandidate(book) {
  return book.decision?.state === "reserve";
}

function deriveProviderStats(provider) {
  const books = provider.books || [];
  const immediateBorrowBooks = books.filter(
    (book) =>
      book.decision?.state === "borrow_now" &&
      !isSubscriptionBorrowReason(book.decision?.reason) &&
      isStrongTitleCandidate(book)
  );
  const subscriptionBorrowBooks = books.filter(
    (book) =>
      book.decision?.state === "borrow_now" &&
      isSubscriptionBorrowReason(book.decision?.reason) &&
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
    if (decision.reason === "library_subscription_provider_listed") {
      return {
        text: `구독형 도서관에서 바로 열람 가능 (신뢰도: ${decision.confidence})`,
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
    if (decision.reason === "eunpyeong_public_reservable") {
      return {
        text: `예약 가능 (신뢰도: ${decision.confidence})`,
        textClass: "warn",
        containerClass: "state-reserve"
      };
    }
    return {
      text: `예약/대기 상태 (신뢰도: ${decision.confidence})`,
      textClass: "warn",
      containerClass: "state-reserve"
    };
  }
  if (decision.state === "unavailable") {
    if (decision.reason === "subscription_provider_unavailable") {
      return {
        text: `밀리에서 현재 볼 수 없음 (신뢰도: ${decision.confidence})`,
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
