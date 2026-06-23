import assert from "node:assert/strict";

const baseURL = process.env.BASE_URL || "http://localhost:3199";

await verifySeoulSubscriptionAndMillieUnavailable();
await verifyEunpyeongMutualLoanInProgressReservable();

console.log("ok regression cases verified");

async function verifySeoulSubscriptionAndMillieUnavailable() {
  const search = await fetchSearch("성매매 경험 당사자 무한발설");
  const seoul = findProvider(search, "seoul");
  const millie = findProvider(search, "millie");

  const seoulBook = findBook(seoul, "성매매 경험 당사자 무한발설");
  assert.equal(seoulBook.detailURL, "https://elib.seoul.go.kr/contents/detail.do?no=PRD000151044");
  assert.equal(seoulBook.decision?.state, "borrow_now");
  assert.equal(seoulBook.decision?.reason, "library_subscription_provider_listed");

  const millieBook = findBook(millie, "성매매 경험 당사자 무한발설");
  assert.equal(millieBook.decision?.state, "unavailable");
  assert.equal(millieBook.decision?.reason, "subscription_provider_unavailable");
}

async function verifyEunpyeongMutualLoanInProgressReservable() {
  const search = await fetchSearch("쇳돌");
  const eunpyeong = findProvider(search, "eunpyeong-public");
  const newtownBook = (eunpyeong.books || []).find(
    (book) => book.localLibraryName === "은평뉴타운도서관" && book.localLoanStatus === "상호대차진행자료"
  );

  assert.ok(newtownBook, "expected 은평뉴타운도서관 상호대차진행자료 copy");
  assert.equal(newtownBook.reservationCount, 0);
  assert.equal(newtownBook.decision?.state, "reserve");
  assert.equal(newtownBook.decision?.reason, "eunpyeong_public_reservable");
}

async function fetchSearch(query) {
  const response = await fetch(new URL(`/api/search?q=${encodeURIComponent(query)}`, baseURL));
  const payload = await response.json();

  assert.equal(response.ok, true, payload?.error || `search failed for ${query}`);
  return payload;
}

function findProvider(search, providerId) {
  const provider = (search.libraryResults || []).find((result) => result.providerId === providerId);
  assert.ok(provider, `expected provider ${providerId}`);
  return provider;
}

function findBook(provider, expectedTitle) {
  const normalizedExpected = normalizeKorean(expectedTitle);
  const book = (provider.books || []).find((item) => normalizeKorean(item.title || "").includes(normalizedExpected));
  assert.ok(book, `expected ${expectedTitle} in ${provider.providerName}`);
  return book;
}

function normalizeKorean(value) {
  return value.toLowerCase().replace(/\s+/g, "").normalize("NFKC");
}
