const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#q");
const flowEl = document.querySelector("#flow");
const resultEl = document.querySelector("#result");
const rowTemplate = document.querySelector("#book-row-template");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = queryInput.value.trim();
  if (!query) {
    return;
  }

  flowEl.innerHTML = "<p>검색 중...</p>";
  resultEl.innerHTML = "";

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "검색 실패");
    }

    renderFlow(data.flow);
    renderResults(data.libraryResults);
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    flowEl.innerHTML = "";
    resultEl.innerHTML = `<p class=\"tag-warn\">오류: ${message}</p>`;
  }
});

function renderFlow(flow) {
  const phase2 = flow.phase2.enabled
    ? `필요: <a href="${flow.phase2.searchURL}" target="_blank" rel="noopener noreferrer">은평 통합검색 열기</a>`
    : "불필요(서울 전역 전자도서관에서 대출 가능 후보 발견)";

  const phase3 = flow.phase3.enabled
    ? `필요: <a href="${flow.phase3.searchURL}" target="_blank" rel="noopener noreferrer">교보 SAM 검색 열기</a>`
    : "불필요(도서관 대출 후보 존재)";

  flowEl.innerHTML = [
    `<p class=\"flow-item\"><strong>1단계</strong> ${flow.phase1.label}: ${flow.phase1.hasBorrowable ? "대출 가능 후보 있음" : "대출 가능 후보 없음"}</p>`,
    `<p class=\"flow-item\"><strong>2단계</strong> ${flow.phase2.label}: ${phase2}</p>`,
    `<p class=\"flow-item\"><strong>3단계</strong> ${flow.phase3.label}: ${phase3}</p>`
  ].join("");
}

function renderResults(results) {
  const sortedProviders = [...results].sort(compareProviders);
  const cards = [];

  for (const provider of sortedProviders) {
    const items = provider.books || [];

    const card = document.createElement("section");
    card.className = "provider-card";
    const statusLabel = provider.searchable
      ? `<span class="tag-ok">검색 연결됨</span> (${provider.statusCode})`
      : `<span class="tag-warn">검색 연결 실패</span> (${provider.error || provider.statusCode})`;

    const head = document.createElement("div");
    head.className = "provider-head";
    const connectionClass = provider.searchable ? "connected" : "disconnected";
    const connectionLabel = provider.searchable ? "연결됨" : "연결안됨";
    head.innerHTML = `
      <h3><span class="connection-dot ${connectionClass}" aria-label="${connectionLabel}" title="${connectionLabel}"></span>${provider.providerName}</h3>
      <div class="provider-links">
        <a href="${provider.searchURL}" target="_blank" rel="noopener noreferrer">검색 페이지</a>
        <a href="${provider.loginURL}" target="_blank" rel="noopener noreferrer">로그인 페이지</a>
      </div>
    `;
    card.appendChild(head);

    const probe = document.createElement("p");
    probe.className = "book-status";
    probe.innerHTML = `${statusLabel} / 파싱 도서 수: ${items.length}`;
    card.appendChild(probe);

    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "book-counts";
      empty.textContent = "이 키워드는 자동 파싱 결과가 없었습니다. 검색 페이지에서 직접 확인해 주세요.";
      card.appendChild(empty);
      cards.push(card);
      continue;
    }

    for (const book of items) {
      const node = rowTemplate.content.cloneNode(true);
      node.querySelector(".book-title").textContent = book.title;
      node.querySelector(".book-status").innerHTML = renderState(book.decision);
      node.querySelector(".book-counts").textContent = renderCounts(book);
      const link = node.querySelector(".book-link");
      link.href = provider.searchURL;
      card.appendChild(node);
    }

    cards.push(card);
  }

  resultEl.innerHTML = "";
  cards.forEach((card) => resultEl.appendChild(card));
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
  const books = provider.books || [];
  const hasBorrowNow = books.some((book) => book.decision?.state === "borrow_now");
  const hasBorrowNowLoanType = books.some(
    (book) => book.decision?.state === "borrow_now" && book.decision?.reason !== "subscription_provider_listed"
  );

  if (hasBorrowNowLoanType) {
    return 0;
  }
  if (hasBorrowNow && !provider.isSubscriptionProvider) {
    return 1;
  }
  if (hasBorrowNow && provider.isSubscriptionProvider) {
    return 2;
  }
  if (provider.searchable) {
    return 3;
  }
  return 4;
}

function renderState(decision) {
  if (!decision) {
    return "<span class=\"tag-muted\">상태 미상</span>";
  }
  if (decision.state === "borrow_now") {
    return `<span class=\"tag-ok\">지금 대출 가능</span> (신뢰도: ${decision.confidence})`;
  }
  if (decision.state === "reserve") {
    return `<span class=\"tag-warn\">예약/대기 상태</span> (신뢰도: ${decision.confidence})`;
  }
  if (decision.state === "unavailable") {
    return `<span class=\"tag-muted\">미소장/이용불가</span> (신뢰도: ${decision.confidence})`;
  }
  return `<span class=\"tag-muted\">판단 보류</span> (신뢰도: ${decision.confidence})`;
}

function renderCounts(book) {
  const segments = [];
  segments.push(`소장: ${book.holdingsCount ?? "미확인"}`);
  segments.push(`대출가능: ${book.availableCount ?? "미확인"}`);
  segments.push(`대출중: ${book.loanedCount ?? "미확인"}`);
  segments.push(`예약: ${book.reservationCount ?? "미확인"}`);
  return segments.join(" / ");
}
