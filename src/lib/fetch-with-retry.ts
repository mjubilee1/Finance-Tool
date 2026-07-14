export type FetchWithRetryOptions = RequestInit & {
  retries?: number;
  retryDelayMs?: number;
  /** Return true to retry. Defaults to transient network failures only. */
  retryOn?: (error: unknown, response: Response | null) => boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Safari often surfaces dropped requests as TypeError: Load failed. */
export function isTransientFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    error.name === "TypeError" ||
    message.includes("load failed") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("fetch failed") ||
    message.includes("the network connection was lost")
  );
}

export function friendlyChatFetchError(error: unknown): string {
  if (isTransientFetchError(error)) {
    return "Connection dropped while talking to your coach. Try sending that again.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Sorry, I encountered an error answering your question.";
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    retries = 2,
    retryDelayMs = 700,
    retryOn = (error) => isTransientFetchError(error),
    ...init
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, init);
      const shouldRetry = attempt < retries && retryOn(null, response);
      if (shouldRetry) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < retries && retryOn(error, null);
      if (!shouldRetry) {
        throw error;
      }
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
}
