import type { DocIndex } from "./index-store";
import { json, RequestError } from "./http";

export type RouteHandler = (request: Request, url: URL) => Promise<Response>;

/** Route key is "<METHOD> <pathname>". */
export type Routes = Record<string, RouteHandler>;

export function createRoutes(index: DocIndex): Routes {
  return {
    "GET /api/tree": async () => json(index.summary()),
    "GET /api/file": async (_request, url) => json(await index.readDocument(requiredQuery(url, "path"))),
    "GET /api/stat": async (_request, url) => json(await index.readStamp(requiredQuery(url, "path"))),
    "GET /api/reindex": async () => {
      await index.rescan();
      return json({ ok: true, count: index.fileCount, scannedAt: index.summary().scannedAt });
    },
    "POST /api/roots": async (request) => {
      const body = (await request.json().catch(() => null)) as { path?: string } | null;
      return json({ ok: true, extraRoots: await index.addExtraRoot(body?.path ?? "") });
    },
    "DELETE /api/roots": async (_request, url) => {
      return json({ ok: true, extraRoots: await index.removeExtraRoot(requiredQuery(url, "path")) });
    },
  };
}

function requiredQuery(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) throw new RequestError(400, `missing ${name}`);
  return value;
}
