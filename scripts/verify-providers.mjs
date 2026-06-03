const baseURL = process.env.BASE_URL || "http://localhost:3199";
const query = process.env.VERIFY_QUERY || "채식주의자";
const minimumProviderCount = Number(process.env.MIN_PROVIDER_COUNT || 14);

const config = await fetchJSON("/api/config/providers");
const providers = config.libraryProviders || [];

if (providers.length < minimumProviderCount) {
  fail(`provider count ${providers.length} is below expected minimum ${minimumProviderCount}`);
}

const search = await fetchJSON(`/api/search?q=${encodeURIComponent(query)}`);
const results = search.libraryResults || [];

if (results.length !== providers.length) {
  fail(`search returned ${results.length} providers, config returned ${providers.length}`);
}

const failedConnections = results.filter((result) => !result.ok);
if (failedConnections.length) {
  fail(
    `failed provider connections: ${failedConnections
      .map((result) => `${result.providerId}(${result.error || result.statusCode})`)
      .join(", ")}`
  );
}

const parsedProviders = results.filter((result) => result.books.length > 0);
if (!parsedProviders.length) {
  fail(`no providers returned parsed books for "${query}"`);
}

const supportedIds = new Set(providers.map((provider) => provider.id));
for (const requiredId of ["eunpyeong-ebook", "seocho", "seoul"]) {
  if (!supportedIds.has(requiredId)) {
    fail(`required provider missing: ${requiredId}`);
  }
}

console.log(
  [
    `ok providers=${providers.length}`,
    `query="${query}"`,
    `parsedProviders=${parsedProviders.length}`,
    `books=${results.reduce((sum, result) => sum + result.books.length, 0)}`
  ].join(" ")
);

async function fetchJSON(pathname) {
  const response = await fetch(new URL(pathname, baseURL));
  let payload;

  try {
    payload = await response.json();
  } catch {
    fail(`${pathname} did not return JSON`);
  }

  if (!response.ok) {
    fail(`${pathname} returned ${response.status}: ${payload?.error || "unknown error"}`);
  }

  return payload;
}

function fail(message) {
  console.error(`verify-providers failed: ${message}`);
  process.exit(1);
}
