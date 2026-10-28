import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** An error the client is allowed to see, with the status it should get. */
export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

export const NO_STORE = { "cache-control": "no-store" } as const;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...NO_STORE },
  });
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

const contentFor = (fileName: string): string =>
  CONTENT_TYPES[fileName.slice(fileName.lastIndexOf("."))] ?? "application/octet-stream";

/** Serves one file from `root`. This is a local tool edited live, so nothing is cacheable. */
export async function serveStatic(root: string, pathname: string): Promise<Response> {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  if (relative.includes("..")) return new Response("not found", { status: 404 });

  const body = await readFile(join(root, relative)).catch(() => null);
  if (!body) return new Response("not found", { status: 404 });

  return new Response(body, {
    headers: { "content-type": contentFor(relative), ...NO_STORE },
  });
}
