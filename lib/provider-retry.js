import { setTimeout as delay } from "node:timers/promises";

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  "EAI_AGAIN", "ENOTFOUND", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT",
  "EHOSTUNREACH", "ENETUNREACH", "EPIPE", "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET"
]);

function isRetryable(error) {
  if (error.retryable || RETRYABLE_STATUS_CODES.has(error.statusCode)) return true;
  const code = error.cause?.code || error.code;
  if (code) return RETRYABLE_NETWORK_CODES.has(code);
  return error instanceof TypeError && error.message === "fetch failed";
}

// Retry the whole page read, including its body and schema checks. An HTTP 200
// maintenance page is not a valid empty catalogue. The caller's overall budget
// still applies across pages and retries.
export async function withProviderRetry(operation, {
  signal, attempts = 2, attemptTimeoutMs = 8000, retryDelayMs = 250
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const timeoutError = Object.assign(new Error(`도서관 응답 시간 초과 (${attemptTimeoutMs}ms)`), { code: "ETIMEDOUT" });
    const timeoutId = setTimeout(() => controller.abort(timeoutError), attemptTimeoutMs);
    const attemptSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    let failure;
    try {
      return await operation(attemptSignal);
    } catch (error) {
      signal?.throwIfAborted();
      failure = controller.signal.aborted ? timeoutError : error;
      if (attempt === attempts || !isRetryable(failure)) throw failure;
    } finally {
      clearTimeout(timeoutId);
    }
    await delay(Math.max(retryDelayMs, failure.retryAfterMs || 0), undefined, { signal });
  }
}
