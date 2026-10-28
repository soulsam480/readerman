import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

/** Everything under here is considered a project sandbox. */
export const PROJECTS_ROOT = join(homedir(), "projects");

/** The only directory names we harvest markdown from by default. */
export const DOC_DIRS = [".opencode", ".superpowers", "docs"] as const;

export type DocKind = (typeof DOC_DIRS)[number];

const DOC_DIR_SET = new Set<string>(DOC_DIRS);

/** Noise we never want to walk into, even on the way to a doc dir. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".worktrees",
  "vendor",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".playwright-cli",
  ".codemogger",
  ".memsearch",
]);

/** Guards against symlink loops and deep vendor trees. */
const MAX_DEPTH = 8;

export type DocFile = {
  /** Absolute path on disk. */
  path: string;
  /** Path relative to the projects root, for display. */
  rel: string;
  /** Owning project, e.g. "work/web". */
  project: string;
  /** Which default doc dir it came from, or the extra root label. */
  kind: string;
  name: string;
  size: number;
  /** Epoch millis. */
  mtime: number;
};

export type ExtraRoot = { path: string; label: string };

/** The project label for a path inside the projects root: "work/web", "personal/tts", "cf-compat-probe". */
function projectOf(absPath: string, root: string): string {
  const rel = resolve(absPath).slice(resolve(root).length + 1);
  const parts = rel.split(sep);
  return parts.length > 2 ? parts.slice(0, 2).join("/") : parts[0] ?? rel;
}

async function walkDocs(dir: string, kind: string, root: string, out: DocFile[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith(".") && entry.isDirectory() && entry.name !== ".opencode") {
        // Hidden dirs inside a doc dir are noise (e.g. .git), except the doc dirs themselves.
        return;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) return;
        await walkDocs(full, kind, root, out);
        return;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) return;
      const info = await stat(full).catch(() => null);
      if (!info) return;
      out.push({
        path: full,
        rel: full.slice(resolve(root).length + 1),
        project: projectOf(full, root),
        kind,
        name: entry.name,
        size: info.size,
        mtime: info.mtimeMs,
      });
    }),
  );
}

/** Walks the projects tree, stopping at the first doc dir it meets and harvesting its markdown. */
async function walkProjects(dir: string, depth: number, root: string, out: DocFile[]): Promise<void> {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory()) return;
      if (SKIP_DIRS.has(entry.name)) return;
      const full = join(dir, entry.name);
      if (DOC_DIR_SET.has(entry.name)) {
        await walkDocs(full, entry.name, root, out);
        return;
      }
      await walkProjects(full, depth + 1, root, out);
    }),
  );
}

/** Extra roots are not project-scoped: everything markdown under them counts. */
async function walkExtraRoot(root: ExtraRoot, out: DocFile[]): Promise<void> {
  const collected: DocFile[] = [];
  await walkDocs(root.path, root.label, root.path, collected);
  for (const file of collected) {
    out.push({ ...file, rel: file.path.replace(homedir(), "~"), project: root.label, kind: root.label });
  }
}

export async function scan(extraRoots: ExtraRoot[], base: string = PROJECTS_ROOT): Promise<DocFile[]> {
  const files: DocFile[] = [];
  await walkProjects(base, 0, base, files);
  for (const root of extraRoots) await walkExtraRoot(root, files);
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  return files;
}

/**
 * True when this absolute path is safe to read: inside the projects root or one of the
 * extra roots, a markdown file, and living under a doc dir (or under an extra root).
 */
export function isAllowed(absPath: string, extraRoots: ExtraRoot[], base: string = PROJECTS_ROOT): boolean {
  const target = resolve(absPath);
  if (!target.endsWith(".md")) return false;
  const inside = (root: string) => target.startsWith(resolve(root) + sep);
  if (!inside(base) && !extraRoots.some((root) => inside(root.path))) return false;
  if (extraRoots.some((root) => inside(root.path))) return true;
  return target.split(sep).some((part) => DOC_DIR_SET.has(part));
}
