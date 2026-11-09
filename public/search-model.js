// Shared, DOM-free search presentation rules. Every source record remains inspectable.
export function formatOf(entry) {
  if (entry.provider.isPhysicalProvider || entry.book.localLibraryAccess) return 'physical';
  return entry.book.contentKind === 'audiobook' ? 'audio' : 'ebook';
}

export function isStrong(entry) {
  return ['exact', 'starts_with', 'contains'].includes(entry.book.titleMatch?.level);
}

export function entriesFrom(providers) {
  return providers.flatMap(provider => (provider.books || []).map((book, index) => ({
    provider, book, key: `${provider.providerId}:${book.detailURL || book.title}:${index}`
  })));
}

export function titleKey(title) {
  // Keep subtitles, volume numbers and edition labels; do not guess bibliographic identity.
  return (title || '제목 미확인').normalize('NFKC').toLocaleLowerCase('ko').replace(/[\s\p{P}]/gu, '');
}

export function filterEntries(entries, filters, ignore = '') {
  return entries.filter(entry =>
    (ignore === 'format' || filters.format === 'all' || formatOf(entry) === filters.format) &&
    (ignore === 'status' || filters.status === 'all' || (entry.book.decision?.state || 'unknown') === filters.status) &&
    (ignore === 'provider' || filters.provider === 'all' || entry.provider.providerId === filters.provider)
  );
}

export function compareEntries(a, b) {
  const stateRank = entry => ({ borrow_now: 0, reserve: 1, unknown: 2, unavailable: 3 })[entry.book.decision?.state] ?? 2;
  const rank = entry => entry.provider.isExternalProvider ? 0 : formatOf(entry) === 'physical' ? 3 : entry.book.decision?.reason === 'library_subscription_provider_listed' ? 2 : 1;
  return stateRank(a) - stateRank(b) || rank(a) - rank(b) ||
    Number(Boolean(b.book.isPreferredDaejo)) - Number(Boolean(a.book.isPreferredDaejo)) ||
    Number(Boolean(a.book.isLargePrint)) - Number(Boolean(b.book.isLargePrint)) ||
    (b.book.availableCount || 0) - (a.book.availableCount || 0) ||
    a.provider.providerName.localeCompare(b.provider.providerName, 'ko');
}

export function groupEntries(entries, sort = 'relevance', query = '') {
  const groups = new Map();
  for (const entry of entries) {
    const key = titleKey(entry.book.title);
    if (!groups.has(key)) groups.set(key, { key, title: entry.book.title, entries: [] });
    groups.get(key).entries.push(entry);
  }
  const result = [...groups.values()];
  for (const group of result) {
    group.entries.sort(compareEntries);
    group.score = Math.max(...group.entries.map(e => e.book.titleMatchScore || 0));
    group.strong = group.entries.some(isStrong);
    group.available = group.entries.some(e => e.book.decision?.state === 'borrow_now');
  }
  return result.sort((a, b) =>
    (sort === 'available' ? Number(b.available) - Number(a.available) : 0) ||
    (query ? Number(b.key === titleKey(query)) - Number(a.key === titleKey(query)) : 0) ||
    b.score - a.score || Number(b.available) - Number(a.available) ||
    b.entries.length - a.entries.length || a.title.localeCompare(b.title, 'ko')
  );
}

export function bestEntry(entries) {
  const candidates = entries.filter(e => isStrong(e) && ['borrow_now', 'reserve'].includes(e.book.decision?.state));
  // Prefer the searched title before sequels or related works that happen to be available.
  return candidates.sort((a, b) => (b.book.titleMatchScore || 0) - (a.book.titleMatchScore || 0) || compareEntries(a, b))[0] || null;
}

export function previewEntries(entries, limit = 3) {
  const selected = [];
  const locations = new Set();
  for (const entry of entries) {
    const location = entry.book.localLibraryName || entry.provider.providerId;
    if (!locations.has(location)) {
      selected.push(entry);
      locations.add(location);
      if (selected.length === limit) break;
    }
  }
  for (const entry of entries) {
    if (selected.length === limit) break;
    if (!selected.includes(entry)) selected.push(entry);
  }
  return [...selected, ...entries.filter(entry => !selected.includes(entry))];
}

export function sourceIssues(providers) {
  return providers.filter(p => !p.ok || !p.searchable || p.partialResults);
}

export function stateLabel(entry) {
  const state = entry.book.decision?.state;
  if (state === 'borrow_now') {
    return entry.provider.isExternalProvider || entry.book.decision?.reason === 'library_subscription_provider_listed'
      ? '바로 읽기 가능' : '대출 가능';
  }
  if (state === 'reserve') return '예약 가능';
  if (state === 'unavailable') return '현재 이용 불가';
  return '상태 확인 필요';
}
