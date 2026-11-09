// Keep a bounded search fast, but never present an interrupted search as complete.
export async function collectSearchPages(fetchPage, { maxPages = 5 } = {}) {
  let first;
  let totalResults = null;
  let checkedResults = 0;
  let pagesFetched = 0;
  const books = [];
  const signatures = new Set();
  let warning = null;

  for (let page = 1; page <= maxPages; page += 1) {
    let result;
    try {
      result = await fetchPage(page);
    } catch (error) {
      if (!first) throw error;
      warning = `다음 검색 결과를 가져오지 못했습니다: ${error.message}`;
      break;
    }
    first ||= result;
    totalResults = result.totalResults ?? totalResults;
    const signature = JSON.stringify(result.books.map((book) => [book.detailURL, book.detailOnclick, book.title]));
    if (result.books.length && signatures.has(signature)) {
      warning = "도서관이 같은 페이지를 반복해서 반환했습니다.";
      break;
    }
    signatures.add(signature);
    pagesFetched += 1;
    checkedResults += result.recordCount;
    books.push(...result.books);
    if (result.books.length < result.recordCount) {
      warning = "도서관이 반환한 자료 중 일부 도서 정보를 읽지 못했습니다.";
    }
    if (!result.hasMore) break;
    if (page === maxPages) warning = "검색 결과가 많아 일부만 확인했습니다. 제목을 구체적으로 입력하거나 검색 페이지에서 이어서 확인해 주세요.";
  }

  if (!warning && totalResults !== null && checkedResults < totalResults) {
    warning = "도서관의 전체 결과 수와 수집한 결과 수가 다릅니다. 검색 페이지에서 이어서 확인해 주세요.";
  }

  return {
    response: first.response,
    books,
    totalResults,
    checkedResults,
    pagesFetched,
    partialResults: Boolean(warning),
    warning
  };
}
