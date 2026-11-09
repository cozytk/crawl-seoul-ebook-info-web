import { entriesFrom, filterEntries, formatOf, groupEntries, bestEntry, previewEntries, sourceIssues, stateLabel } from './search-model.js';

const $ = selector => document.querySelector(selector);
const icons = {
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  book: '<path d="M3 5h6c2 0 3 1 3 3v13c0-2-1-3-3-3H3V5Zm18 0h-6c-2 0-3 1-3 3v13c0-2 1-3 3-3h6V5Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>'
};
const formatLabels = { ebook: '전자책', audio: '오디오북', physical: '실물도서' };
const defaults = () => ({ format: 'all', status: 'all', provider: 'all' });
const state = {
  query: '', providers: [], config: [], total: 0, loading: false, complete: false,
  error: '', stopped: false, filters: defaults(), sort: 'relevance', limit: 10,
  expanded: new Set(), requestId: 0, controller: null, searchedAt: ''
};
let recent = readRecent();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function svg(name) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = icons[name];
  return node;
}
function button(text, className, action) {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
function safeURL(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
function link(text, url, className = '', accessibleName = '') {
  const node = el('a', className, text);
  const href = safeURL(url);
  if (href) node.href = href;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  if (accessibleName) node.setAttribute('aria-label', `${accessibleName} (새 창)`);
  else node.setAttribute('aria-label', `${text} (새 창)`);
  node.append(svg('arrow'));
  return node;
}
function announce(message) { $('#announcement').textContent = message; }
function readRecent() {
  try {
    const items = JSON.parse(localStorage.getItem('seoul-library:recent') || '[]');
    return Array.isArray(items) ? items.filter(x => typeof x === 'string' && x.length <= 80).slice(0, 4) : [];
  } catch { return []; }
}
function saveRecent(query) {
  if (query.length > 80) return;
  recent = [query, ...recent.filter(x => x !== query)].slice(0, 4);
  try { localStorage.setItem('seoul-library:recent', JSON.stringify(recent)); } catch { /* Search works without storage. */ }
  renderSuggestions();
}
function renderSuggestions() {
  const container = $('#search-suggestions');
  container.replaceChildren(el('span', 'suggestions-label', recent.length ? '최근 검색' : '이런 책은 어때요'));
  const items = el('div', 'suggestion-items');
  for (const query of (recent.length ? recent.slice(0, 3) : ['불편한 편의점', '소년이 온다', '쇳돌'])) {
    items.append(button(query, '', () => { $('#q').value = query; search(query); }));
  }
  container.append(items);
  if (recent.length) container.append(button('지우기', 'history-clear', () => {
    recent = [];
    try { localStorage.removeItem('seoul-library:recent'); } catch { /* Optional storage. */ }
    renderSuggestions();
    $('#q').focus();
    announce('최근 검색 기록을 지웠습니다.');
  }));
}

$('#search-form').addEventListener('submit', event => {
  event.preventDefault();
  const query = $('#q').value.trim();
  if (query) search(query);
});
$('#q').addEventListener('input', () => { $('#clear-search').hidden = !$('#q').value; });
$('#clear-search').addEventListener('click', () => {
  $('#q').value = '';
  $('#clear-search').hidden = true;
  $('#q').focus();
});
$('#cancel-search').addEventListener('click', () => {
  state.requestId++;
  state.controller?.abort();
  state.controller = null;
  state.loading = false;
  state.stopped = true;
  render();
  announce('검색을 중지했습니다. 도착한 결과는 계속 확인할 수 있습니다.');
  $('#q').focus();
});
for (const trigger of document.querySelectorAll('[data-open-sources]')) trigger.addEventListener('click', openSources);
$('#close-sources').addEventListener('click', () => $('#sources-dialog').close());
$('#sources-dialog').addEventListener('click', event => {
  if (event.target !== $('#sources-dialog')) return;
  const rect = event.target.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
});
$('#format-filters').addEventListener('click', event => {
  const target = event.target.closest('[data-format]');
  if (!target) return;
  state.filters.format = target.dataset.format;
  resetPageAndRender();
});
$('#status-filter').addEventListener('change', event => { state.filters.status = event.target.value; resetPageAndRender(); });
$('#provider-filter').addEventListener('change', event => { state.filters.provider = event.target.value; resetPageAndRender(); });
$('#sort-order').addEventListener('change', event => { state.sort = event.target.value; resetPageAndRender(); });
$('#reset-filters').addEventListener('click', resetFilters);
$('#load-more').addEventListener('click', () => {
  const oldLimit = state.limit;
  state.limit += 10;
  renderBooks();
  const firstNew = $('#book-results').children[oldLimit]?.querySelector('h3');
  if (firstNew) { firstNew.tabIndex = -1; firstNew.focus({ preventScroll: true }); }
  announce('다음 검색 결과를 표시했습니다.');
});
window.addEventListener('popstate', () => {
  const query = new URL(location.href).searchParams.get('q')?.trim() || '';
  $('#q').value = query;
  if (query) search(query, false);
  else {
    state.requestId++;
    state.controller?.abort();
    state.controller = null;
    Object.assign(state, { query: '', providers: [], loading: false, complete: false, error: '', stopped: false });
    $('#search-results').hidden = true;
    $('#welcome').hidden = false;
    document.body.classList.remove('has-query');
    $('#clear-search').hidden = true;
    document.title = '서울의 서재 — 읽고 싶은 책, 가까운 곳에서';
  }
});

function resetPageAndRender() {
  state.limit = 10;
  state.expanded.clear();
  renderResults();
  announce($('#result-meta').textContent);
}
function resetFilters() {
  state.filters = defaults();
  $('#status-filter').value = 'all';
  $('#provider-filter').value = 'all';
  resetPageAndRender();
  $('#format-filters button').focus();
}

async function search(query, updateURL = true) {
  state.controller?.abort();
  const requestId = ++state.requestId;
  const controller = new AbortController();
  Object.assign(state, {
    query, providers: [], loading: true, complete: false, error: '', stopped: false,
    filters: defaults(), total: state.config.length, limit: 10, controller, searchedAt: ''
  });
  state.expanded.clear();
  $('#q').value = query;
  $('#clear-search').hidden = false;
  $('#status-filter').value = 'all';
  $('#provider-filter').value = 'all';
  $('#welcome').hidden = true;
  $('#search-results').hidden = false;
  document.body.classList.add('has-query');
  document.title = `${query} 검색 — 서울의 서재`;
  if (updateURL) {
    const url = new URL(location.href);
    if (url.searchParams.get('q') !== query) {
      url.searchParams.set('q', query);
      history.pushState({}, '', url);
    }
  }
  saveRecent(query);
  render();
  announce(`${query} 검색을 시작합니다. 도착하는 결과부터 표시합니다.`);
  try {
    const response = await fetch(`/api/search/stream?q=${encodeURIComponent(query)}`, { signal: controller.signal });
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || '검색 서비스에 연결하지 못했습니다.');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedDone = false;
    function consume(chunk) {
      if (requestId !== state.requestId) return;
      const lines = chunk.split('\n');
      const type = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
      const payload = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!payload) return;
      const data = JSON.parse(payload);
      if (type === 'start') {
        state.total = data.totalProviders || state.total;
        state.searchedAt = data.searchedAt || '';
      } else if (type === 'provider') {
        const index = state.providers.findIndex(p => p.providerId === data.providerId);
        if (index >= 0) state.providers[index] = data;
        else state.providers.push(data);
      } else if (type === 'done') {
        receivedDone = true;
        state.searchedAt = data.searchedAt || state.searchedAt;
        // Some servers include final results; others only signal completion.
        if (Array.isArray(data.libraryResults)) state.providers = data.libraryResults;
        state.complete = true;
        state.loading = false;
      } else if (type === 'error') {
        throw new Error(data.error || '검색을 완료하지 못했습니다.');
      }
    }
    while (true) {
      const { value, done } = await reader.read();
      if (requestId !== state.requestId) { await reader.cancel(); return; }
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        consume(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
      }
      if (done && buffer.trim()) consume(buffer);
      render();
      if (done) break;
    }
    if (!receivedDone) throw new Error('검색 연결이 중간에 끊겼습니다.');
    announce(`${query} 검색 완료. ${$('#result-meta').textContent}${sourceIssues(state.providers).length ? ' 일부 검색처의 결과를 모두 확인하지 못했습니다.' : ''}`);
  } catch (error) {
    if (requestId !== state.requestId || error.name === 'AbortError') return;
    state.complete = false;
    state.error = error.message || '검색을 완료하지 못했습니다.';
    announce(`${state.error} 도착한 결과는 유지됩니다. 다시 검색해 주세요.`);
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      state.controller = null;
      render();
    }
  }
}

function render() {
  const completed = state.providers.length;
  const issues = sourceIssues(state.providers);
  $('#cancel-search').hidden = !state.loading;
  $('#status-dot').className = `status-dot${state.loading ? ' pending' : state.error || state.stopped || issues.length ? ' interrupted' : ''}`;
  $('#search-progress').style.width = `${state.complete ? 100 : Math.max(3, completed / (state.total || 1) * 100)}%`;
  $('#progress-label').textContent = state.loading
    ? `${state.total || '전체'}곳 중 ${completed}곳 확인 · 검색 중`
    : state.stopped ? `검색 중지 · ${completed}곳의 결과 확인`
      : state.error ? `연결 중단 · ${completed}곳의 결과 확인`
        : `${completed}곳 확인 완료${state.searchedAt ? ` · ${new Date(state.searchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : ''}`;
  $('#coverage-status').textContent = issues.length ? `미완료 ${issues.length}곳 · 검색처 상태 ↗` : '검색처 상태 보기 ↗';
  const warning = $('#search-warning');
  warning.replaceChildren();
  warning.hidden = !issues.length && !state.error && !state.stopped;
  if (!warning.hidden) {
    warning.append(el('p', '', state.error
      ? `${state.error} 도착한 결과는 아래에서 확인할 수 있어요.`
      : state.stopped ? '검색을 중지했어요. 아직 확인하지 못한 검색처가 있습니다.'
        : `${issues.length}곳의 검색 결과를 모두 확인하지 못했어요. 해당 도서관에도 책이 있을 수 있습니다.`));
    warning.append(button(state.error || state.stopped ? '다시 검색' : '검색처 상태 확인', 'text-button', state.error || state.stopped ? () => search(state.query) : openSources));
  }
  renderResults();
  if ($('#sources-dialog').open) renderSources();
}
function renderResults() {
  const entries = entriesFrom(state.providers);
  for (const node of document.querySelectorAll('#format-filters [data-format]')) {
    const format = node.dataset.format;
    node.setAttribute('aria-pressed', String(state.filters.format === format));
    node.querySelector('span').textContent = groupEntries(filterEntries(entries, { ...state.filters, format })).length;
  }
  $('#reset-filters').hidden = Object.values(state.filters).every(value => value === 'all');
  renderRecommendation(filterEntries(entries, state.filters));
  renderBooks(entries);
}
function renderRecommendation(entries) {
  const container = $('#recommendation');
  const candidate = bestEntry(entries);
  container.hidden = !candidate;
  if (!candidate) return;
  const { provider, book } = candidate;
  const signature = `${candidate.key}:${book.decision.state}`;
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;
  container.replaceChildren();
  const available = book.decision.state === 'borrow_now';
  const mark = el('span', 'recommendation-icon');
  mark.append(svg(available ? 'check' : 'clock'));
  const copy = el('div', 'recommendation-copy');
  copy.append(el('p', '', available ? '먼저 확인해 보세요 · 바로 이용 가능' : '기다려도 읽고 싶은 책이라면'));
  copy.append(el('h3', '', book.title));
  const name = book.localLibraryName || provider.providerName;
  const condition = provider.isExternalProvider ? '서비스 구독 필요' : formatOf(candidate) === 'physical' ? '도서관 방문 · 회원 대출' : '도서관 회원 이용';
  copy.append(el('p', 'recommendation-detail', `${name} · ${formatLabels[formatOf(candidate)]} · ${condition}`));
  const action = link(available ? (formatOf(candidate) === 'physical' ? '소장 위치 확인' : '읽으러 가기') : '예약하러 가기', book.detailURL || provider.searchURL, 'button button-primary', `${name}에서 ${book.title} ${available ? '이용' : '예약'}`);
  container.append(mark, copy, action);
}
function renderBooks(entries = entriesFrom(state.providers)) {
  const filtered = filterEntries(entries, state.filters);
  const groups = groupEntries(filtered, state.sort, state.query);
  const activeFilter = Object.values(state.filters).some(value => value !== 'all');
  $('#results-title').textContent = `‘${state.query}’ 검색 결과`;
  $('#result-meta').textContent = `${groups.length}개 제목 · ${filtered.length}개 소장·구독 정보${activeFilter ? ' · 필터 적용 중' : ''}`;
  $('#filter-result-count').textContent = `${groups.length}개 제목`;
  $('#filter-bar').hidden = !entries.length;
  $('.sort-label').hidden = !entries.length;
  $('#result-note').hidden = !groups.length;
  const container = $('#book-results');
  const focusedKey = document.activeElement?.dataset.focusKey;
  const oldCards = new Map([...container.children].map(card => [card.dataset.key, card]));
  const wanted = [];
  if (!groups.length) {
    if (state.loading && !entries.length) {
      const skeleton = el('div', 'skeleton');
      skeleton.setAttribute('aria-hidden', 'true');
      const lines = el('div', 'skeleton-copy');
      lines.append(el('span'), el('span'), el('span'));
      skeleton.append(el('div', 'skeleton-cover'), lines);
      wanted.push(skeleton);
    } else {
      const empty = el('div', 'empty-state');
      empty.append(svg('search'));
      const incomplete = state.error || state.stopped || sourceIssues(state.providers).length;
      empty.append(el('h3', '', activeFilter ? '선택한 조건에 맞는 책이 없어요' : state.loading ? '다른 도서관도 살펴보고 있어요' : incomplete ? '아직 책이 없는지 확정할 수 없어요' : '이 검색어로 찾은 책이 없어요'));
      empty.append(el('p', '', activeFilter ? '다른 이용 상태나 검색처를 선택해 보세요.' : state.loading ? '먼저 확인한 검색처에는 결과가 없습니다. 도착하는 대로 보여드릴게요.' : incomplete ? '일부 검색처를 확인하지 못했습니다. 다시 검색하거나 해당 도서관에서 직접 찾아보세요.' : '제목의 띄어쓰기를 바꾸거나, 핵심 단어만 입력해 보세요.'));
      if (activeFilter) empty.append(button('필터 초기화', 'button', resetFilters));
      else if (!state.loading) empty.append(button(incomplete ? '다시 검색' : '검색어 바꾸기', 'button', incomplete ? () => search(state.query) : () => { $('#q').focus(); $('#q').select(); }));
      wanted.push(empty);
    }
  } else {
    for (const group of groups.slice(0, state.limit)) {
      const signature = JSON.stringify(group.entries.map(e => [e.key, e.book.decision?.state]));
      const previous = oldCards.get(group.key);
      const card = previous?.dataset.signature === signature ? previous : renderBook(group);
      card.dataset.key = group.key;
      card.dataset.signature = signature;
      wanted.push(card);
    }
  }
  // Move only changed nodes; preserve open details and keyboard focus as sources arrive.
  const keep = new Set(wanted);
  for (const child of [...container.children]) if (!keep.has(child)) child.remove();
  wanted.forEach((node, index) => { if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null); });
  if (focusedKey) {
    const target = [...container.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === focusedKey);
    if (target && target !== document.activeElement) target.focus({ preventScroll: true });
  }
  const more = $('#load-more');
  more.hidden = groups.length <= state.limit;
  more.textContent = `검색 결과 ${Math.min(10, groups.length - state.limit)}개 더 보기 (${Math.min(state.limit, groups.length)}/${groups.length})`;
}
function renderBook(group) {
  const card = el('article', 'book-card');
  const header = el('header', 'book-header');
  const cover = el('div', 'book-cover');
  cover.setAttribute('aria-hidden', 'true');
  cover.append(svg('book'));
  const imageURL = group.entries.map(e => safeURL(e.book.coverImageURL)).find(Boolean);
  if (imageURL) {
    const image = el('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.src = imageURL;
    image.addEventListener('error', () => image.remove(), { once: true });
    cover.append(image);
  }
  const heading = el('div', 'book-heading');
  const tags = el('div', 'book-labels');
  if (group.entries.some(e => e.book.isExactTitleMatch)) tags.append(el('span', 'tag tag-exact', '제목 일치'));
  if (!group.strong) tags.append(el('span', 'tag tag-weak', '관련 검색 결과'));
  for (const format of new Set(group.entries.map(formatOf))) tags.append(el('span', 'tag', formatLabels[format]));
  if (group.entries.some(e => e.book.isLargePrint)) tags.append(el('span', 'tag', '큰글자책'));
  heading.append(tags, el('h3', '', group.title));
  const summary = el('p', 'book-summary');
  const count = group.entries.filter(e => e.book.decision?.state === 'borrow_now').length;
  const sources = new Set(group.entries.map(e => e.book.localLibraryName || e.provider.providerName)).size;
  summary.append(document.createTextNode(`${sources}개 검색처 · ${group.entries.length}개 이용 정보`));
  if (count) summary.append(document.createTextNode(' · '), el('strong', '', `${count}개 바로 이용 가능`));
  heading.append(summary);
  header.append(cover, heading);
  const rows = el('div', 'book-rows');
  const ordered = previewEntries(group.entries);
  ordered.slice(0, 3).forEach(entry => rows.append(renderEntry(entry, group.title)));
  card.append(header, rows);
  if (group.entries.length > 3) {
    const details = el('details', 'more-locations');
    details.open = state.expanded.has(group.key);
    const summary = el('summary', '', `이용 정보 ${group.entries.length - 3}개 더 보기`);
    summary.dataset.focusKey = `more:${group.key}`;
    const remaining = el('div', 'book-rows');
    ordered.slice(3).forEach(entry => remaining.append(renderEntry(entry, group.title)));
    details.append(summary, remaining);
    details.addEventListener('toggle', () => {
      if (!details.isConnected) return;
      if (details.open) state.expanded.add(group.key); else state.expanded.delete(group.key);
      summary.textContent = details.open ? '추가 이용 정보 접기' : `이용 정보 ${group.entries.length - 3}개 더 보기`;
    });
    card.append(details);
  }
  return card;
}
function renderEntry(entry, groupTitle) {
  const { provider, book } = entry;
  const row = el('div', 'availability-row');
  row.dataset.entryKey = entry.key;
  row.dataset.state = book.decision?.state || 'unknown';
  row.dataset.format = formatOf(entry);
  const location = el('div', 'location');
  const title = el('div', 'location-heading');
  const name = book.localLibraryName || provider.providerName;
  title.append(el('span', 'location-name', name));
  if (book.isPreferredDaejo) title.append(el('span', 'preferred-tag', '대조동'));
  location.append(title);
  const sub = [];
  if (formatOf(entry) === 'physical') {
    if (book.localShelfLocation) sub.push(book.localShelfLocation);
    if (book.localCallNo) sub.push(`청구기호 ${book.localCallNo}`);
  } else {
    if (book.storeName) sub.push(book.storeName);
    if (provider.isExternalProvider) sub.push('서비스 구독 필요');
    else if (book.decision?.reason === 'library_subscription_provider_listed' || provider.libraryModel === 'subscription') sub.push('구독형 · 도서관 회원 이용');
    else sub.push('도서관 회원 대출');
  }
  if (sub.length) location.append(el('p', 'location-detail', sub.join(' · ')));
  if (book.title !== groupTitle) location.append(el('p', 'location-detail', book.title));
  const physicalActions = [];
  if (book.isMutualLoanAvailable) physicalActions.push('상호대차 가능');
  if (book.isUnmannedReservationAvailable) physicalActions.push('무인예약 가능');
  if (book.isChaekdanbiReservable) physicalActions.push('책단비 예약 가능');
  if (book.isOtherLibraryReturnAvailable) physicalActions.push('타관 반납 가능');
  if (book.localReturnPlanDate) physicalActions.push(`반납 예정 ${book.localReturnPlanDate}`);
  if (physicalActions.length) location.append(el('p', 'copy-detail', physicalActions.join(' · ')));
  const status = el('div', 'location-status');
  status.append(el('span', `availability ${book.decision?.state || 'unknown'}`, stateLabel(entry)));
  const counts = [];
  if (typeof book.availableCount === 'number' && typeof book.holdingsCount === 'number' && formatOf(entry) !== 'physical') counts.push(`${book.availableCount}/${book.holdingsCount}권 대출 가능`);
  if (typeof book.reservationCount === 'number' && book.reservationCount > 0) counts.push(`예약 ${book.reservationCount}명`);
  if (formatOf(entry) === 'physical' && book.localLoanStatus) counts.push(book.localLoanStatus);
  if (counts.length) status.append(el('span', 'status-detail', counts.join(' · ')));
  const action = link('도서 보기', book.detailURL || provider.searchURL, 'book-link', `${name} ${book.title} 도서 보기`);
  action.dataset.focusKey = `entry:${entry.key}`;
  row.append(location, status, action);
  return row;
}

function openSources() {
  renderSources();
  $('#sources-dialog').showModal();
}
async function loadConfig() {
  try {
    const response = await fetch('/api/config/providers');
    if (!response.ok) throw new Error('검색처 목록을 불러오지 못했습니다.');
    const data = await response.json();
    state.config = [...(data.libraryProviders || []), ...(data.externalProviders || []), ...(data.physicalProviders || [])];
    $('#source-count').textContent = state.config.length;
    $('#library-count').textContent = `${(data.libraryProviders || []).length}곳`;
    const selected = $('#provider-filter').value;
    $('#provider-filter').replaceChildren(new Option('모든 검색처', 'all'));
    state.config.forEach(provider => $('#provider-filter').append(new Option(provider.name, provider.id)));
    $('#provider-filter').value = selected;
    renderSources();
  } catch {
    $('#source-count').textContent = '!';
    $('#sources-list').replaceChildren(el('p', '', '검색처 목록을 불러오지 못했습니다.'), button('다시 불러오기', 'text-button', loadConfig));
  }
}
function renderSources() {
  const list = $('#sources-list');
  if (!state.config.length) return;
  const focusedKey = document.activeElement?.dataset.focusKey;
  list.replaceChildren();
  const sections = [
    ['전자도서관', p => !p.externalProvider && !p.physicalProvider],
    ['구독 서비스', p => p.externalProvider],
    ['실물도서', p => p.physicalProvider]
  ];
  for (const [label, matches] of sections) {
    const providers = state.config.filter(matches);
    if (!providers.length) continue;
    const section = el('section', 'source-section');
    section.append(el('h3', '', `${label} · ${providers.length}곳`));
    for (const config of providers) {
      const result = state.providers.find(p => p.providerId === config.id);
      const row = el('div', 'source-row');
      const url = result?.searchURL || config.baseURL?.replace('{searchTerm}', encodeURIComponent(state.query)) || config.loginURL;
      const anchor = link(config.name, url);
      anchor.dataset.focusKey = `source:${config.id}`;
      row.append(anchor);
      const issue = result && sourceIssues([result]).length;
      const status = !state.query ? (config.libraryModel === 'mixed' ? '대출형·구독형' : config.libraryModel === 'subscription' ? '구독형' : config.physicalProvider ? '실물 대출' : '대출형')
        : !result ? state.loading ? '확인 중' : '확인하지 못함'
          : !result.ok || !result.searchable ? '연결 오류'
            : result.partialResults ? '일부 확인'
              : result.books?.length ? `${result.books.length}개 이용 정보` : '결과 없음';
      row.append(el('span', `source-state${issue ? ' is-warning' : result?.books?.length ? ' is-ok' : ''}`, status));
      if (issue) row.append(el('p', 'source-warning', result.partialResults
        ? `${result.totalResults ?? '?'}개 중 ${result.checkedResults ?? result.books?.length ?? 0}개 확인. ${result.warning || '전체 결과를 확인하지 못했습니다.'}`
        : '연결되지 않아 소장 여부를 확인할 수 없습니다. 도서관에서 직접 검색해 주세요.'));
      section.append(row);
    }
    list.append(section);
  }
  if (focusedKey) [...list.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === focusedKey)?.focus({ preventScroll: true });
}

renderSuggestions();
loadConfig();
const initialQuery = new URL(location.href).searchParams.get('q')?.trim();
if (initialQuery) search(initialQuery, false);
