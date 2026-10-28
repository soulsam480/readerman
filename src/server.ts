import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { scan, isAllowed, PROJECTS_ROOT, type DocFile, type ExtraRoot } from "./scan";

const APP_DIR = resolve(import.meta.dir, "..");
const PUBLIC_DIR = join(APP_DIR, "public");
const CONFIG_PATH = join(APP_DIR, "data", "config.json");
const PORT = Number(process.env.PORT ?? 4599);
/** marked is served straight out of node_modules so there is no client build step. */
const MARKED_PATH = join(APP_DIR, "node_modules", "marked", "lib", "marked.esm.js");

type Config = { extraRoots: ExtraRoot[] };

async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    return { extraRoots: Array.isArray(parsed.extraRoots) ? parsed.extraRoots : [] };
  } catch {
    return { extraRoots: [] };
  }
}

async function saveConfig(config: Config): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

let config = await loadConfig();
let files: DocFile[] = await scan(config.extraRoots);
let scannedAt = Date.now();

async function reindex(): Promise<void> {
  files = await scan(config.extraRoots);
  scannedAt = Date.now();
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

async function serveStatic(pathname: string): Promise<Response> {
  const rel = pathname === "/" ? "index.html" : pathname.slice(1);
  if (rel.includes("..")) return new Response("not found", { status: 404 });
  const full = join(PUBLIC_DIR, rel);
  const ext = "." + (rel.split(".").pop() ?? "");
  try {
    const body = await readFile(full);
    return new Response(body, {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 60,
  async fetch(request) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/api/tree") {
      return json({
        projectsRoot: PROJECTS_ROOT.replace(homedir(), "~"),
        scannedAt,
        extraRoots: config.extraRoots,
        files: files.map(({ path, rel, project, kind, name, size, mtime }) => ({
          path,
          rel,
          project,
          kind,
          name,
          size,
          mtime,
        })),
      });
    }

    if (pathname === "/api/file") {
      const target = url.searchParams.get("path");
      if (!target) return json({ error: "missing path" }, 400);
      if (!isAllowed(target, config.extraRoots)) return json({ error: "path not allowed" }, 403);
      try {
        const [content, info] = await Promise.all([readFile(target, "utf8"), stat(target)]);
        return json({ path: resolve(target), content, mtime: info.mtimeMs, size: info.size });
      } catch {
        return json({ error: "cannot read file" }, 404);
      }
    }

    if (pathname === "/api/stat") {
      const target = url.searchParams.get("path");
      if (!target) return json({ error: "missing path" }, 400);
      if (!isAllowed(target, config.extraRoots)) return json({ error: "path not allowed" }, 403);
      try {
        const info = await stat(target);
        return json({ mtime: info.mtimeMs, size: info.size });
      } catch {
        return json({ error: "gone" }, 404);
      }
    }

    if (pathname === "/api/roots" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { path?: string } | null;
      const raw = body?.path?.trim();
      if (!raw) return json({ error: "missing path" }, 400);
      const expanded = raw.startsWith("~") ? join(homedir(), raw.slice(1)) : raw;
      const abs = resolve(expanded);
      const info = await stat(abs).catch(() => null);
      if (!info?.isDirectory()) return json({ error: "not a directory" }, 400);
      if (config.extraRoots.some((root) => root.path === abs)) return json({ error: "already added" }, 409);
      config.extraRoots.push({ path: abs, label: abs.replace(homedir(), "~") });
      await saveConfig(config);
      await reindex();
      return json({ ok: true, extraRoots: config.extraRoots });
    }

    if (pathname === "/api/roots" && request.method === "DELETE") {
      const target = url.searchParams.get("path");
      if (!target) return json({ error: "missing path" }, 400);
      const before = config.extraRoots.length;
      config.extraRoots = config.extraRoots.filter((root) => root.path !== target);
      if (config.extraRoots.length === before) return json({ error: "not found" }, 404);
      await saveConfig(config);
      await reindex();
      return json({ ok: true, extraRoots: config.extraRoots });
    }

    if (pathname === "/api/reindex") {
      await reindex();
      return json({ ok: true, count: files.length, scannedAt });
    }

    if (pathname === "/vendor/marked.js") {
      try {
        return new Response(await readFile(MARKED_PATH), {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        });
      } catch {
        return new Response("marked not installed", { status: 500 });
      }
    }

    return serveStatic(pathname);
  },
});

console.log(`reader → http://localhost:${server.port}`);
console.log(`indexed ${files.length} markdown files from ${PROJECTS_ROOT.replace(homedir(), "~")}`);
