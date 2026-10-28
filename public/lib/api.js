/** One retry ladder for the whole client: a server restart must not strand a click. */
const RETRY_DELAYS_MS = [0, 500, 1200, 2500];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error ?? `request failed (${response.status})`, response.status);
  return body;
}

export async function fetchIndex() {
  return readJson(await fetch("/api/tree"));
}

/**
 * Reads one document, retrying through a restart. Client errors (403/404) are final and
 * are not retried; connection failures are, because that is what a restart looks like.
 */
export async function fetchDocument(path) {
  let lastError = new ApiError("could not read that file", 0);

  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await sleep(delay);
    try {
      return await readJson(await fetch(`/api/file?path=${encodeURIComponent(path)}`));
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error;
      lastError = error;
    }
  }

  throw lastError;
}

export async function fetchStamp(path) {
  return readJson(await fetch(`/api/stat?path=${encodeURIComponent(path)}`));
}

export async function rescan() {
  return readJson(await fetch("/api/reindex"));
}

export async function addFolder(path) {
  return readJson(
    await fetch("/api/roots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    }),
  );
}

export async function removeFolder(path) {
  return readJson(await fetch(`/api/roots?path=${encodeURIComponent(path)}`, { method: "DELETE" }));
}
