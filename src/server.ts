import { resolve } from "node:path";
import { DocIndex } from "./index-store";
import { ConfigStore } from "./config";
import { createRoutes } from "./api";
import { json, RequestError, serveStatic } from "./http";
import { PROJECTS_ROOT } from "./scan";

const APP_DIR = resolve(import.meta.dir, "..");
const PUBLIC_DIR = `${APP_DIR}/public`;
const CONFIG_PATH = `${APP_DIR}/data/config.json`;
const PORT = Number(process.env.PORT ?? 4599);

const index = new DocIndex(new ConfigStore(CONFIG_PATH), PROJECTS_ROOT);
await index.load();

const routes = createRoutes(index);

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const handler = routes[`${request.method} ${url.pathname}`];
  if (handler) return handler(request, url);
  return serveStatic(PUBLIC_DIR, url.pathname);
}

function errorResponse(error: unknown): Response {
  if (error instanceof RequestError) return json({ error: error.message }, error.status);
  console.error(error);
  return json({ error: "internal error" }, 500);
}

function start() {
  return Bun.serve({
    port: PORT,
    idleTimeout: 60,
    async fetch(request) {
      try {
        return await handle(request);
      } catch (error) {
        return errorResponse(error);
      }
    },
  });
}

let server: ReturnType<typeof start>;
try {
  server = start();
} catch (error) {
  // Several OpenCode plugin instances can start at once; the ones that lose the port
  // step aside instead of printing a stack trace. Bun throws a SystemError here, which is
  // not always an Error instance, so read the code and message defensively.
  const coded = error as { code?: string; message?: string } | null;
  const message = String(coded?.message ?? error);
  if (coded?.code !== "EADDRINUSE" && !/already in use|EADDRINUSE/i.test(message)) throw error;

  console.log(`reader already running on http://localhost:${PORT}`);
  process.exit(0);
}

console.log(`reader → http://localhost:${server.port}`);
console.log(`indexed ${index.fileCount} markdown files from ~/projects`);
