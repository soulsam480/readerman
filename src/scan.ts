import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

/** Everything under here is a project sandbox. */
export const PROJECTS_ROOT = join(homedir(), "projects");

/** The only directory names harvested by default. */
export const DOC_DIRS = [".opencode", ".superpowers", "docs"] as const;

export type DocFile = {
  /** Absolute path on disk. */
  path: string;
  /** Path relative to the scanned root, for display. */
  rel: string;
  /** Owning project, e.g. "work/web". */
  project: string;
  /** Which doc dir it came from, or the extra root's label. */
  kind: string;
  name: string;
  size: number;
  /** Epoch millis. */
  mtime: number;
};

export type ExtraRoot = { path: string };

const DOC_DIR_SET = new Set<string>(DOC_DIRS);

/** Noise we never walk into, even on the way to a doc dir. */
const SKIPPED_DIRS = new Set([
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

/** Guards against symlink loops and absurd nesting. */
const MAX_DEPTH = 8;

const isDirectory = (entry: Dirent) => entry.isDirectory();
const isMarkdown = (entry: Dirent) => entry.isFile() && entry.name.endsWith(".md");
const isSkipped = (entry: Dirent) => SKIPPED_DIRS.has(entry.name);
const isDocDir = (entry: Dirent) => DOC_DIR_SET.has(entry.name);

/** Hidden directories inside a doc dir are noise, except a nested doc dir. */
const isHiddenNoise = (entry: Dirent) => entry.name.startsWith(".") && !isDocDir(entry);

async function listDirectory(directory: string): Promise<Dirent[]> {
  return readdir(directory, { withFileTypes: true }).catch(() => []);
}

function projectOf(filePath: string, base: string): string {
  const [first, second, ...rest] = filePath.slice(resolve(base).length + 1).split(sep);
  const hasNestedProject = rest.length > 0;
  return hasNestedProject ? `${first}/${second}` : (first ?? "");
}

async function toDocFile(filePath: string, kind: string, base: string): Promise<DocFile | null> {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) return null;
  return {
    path: filePath,
    rel: filePath.slice(resolve(base).length + 1),
    project: projectOf(filePath, base),
    kind,
    name: filePath.slice(filePath.lastIndexOf("/") + 1),
    size: info.size,
    mtime: info.mtimeMs,
  };
}

/** Collects every markdown file under a doc dir (or an added folder). */
async function collectMarkdown(directory: string, kind: string, base: string): Promise<DocFile[]> {
  const entries = await listDirectory(directory);
  const subdirectories = entries.filter((entry) => isDirectory(entry) && !isSkipped(entry) && !isHiddenNoise(entry));
  const markdown = entries.filter(isMarkdown);

  const [nested, files] = await Promise.all([
    Promise.all(subdirectories.map((entry) => collectMarkdown(join(directory, entry.name), kind, base))),
    Promise.all(markdown.map((entry) => toDocFile(join(directory, entry.name), kind, base))),
  ]);

  return [...files.filter((file): file is DocFile => file !== null), ...nested.flat()];
}

/** Walks the projects tree, harvesting each doc dir it meets and never entering one twice. */
async function collectProjects(directory: string, depth: number, base: string): Promise<DocFile[]> {
  if (depth > MAX_DEPTH) return [];
  const entries = (await listDirectory(directory)).filter((entry) => isDirectory(entry) && !isSkipped(entry));

  const nested = await Promise.all(
    entries.map((entry) => {
      const child = join(directory, entry.name);
      return isDocDir(entry)
        ? collectMarkdown(child, entry.name, base)
        : collectProjects(child, depth + 1, base);
    }),
  );

  return nested.flat();
}

/** Extra roots are not project-scoped: everything markdown under them counts. */
async function collectExtraRoot(root: ExtraRoot): Promise<DocFile[]> {
  const name = basename(root.path);
  const files = await collectMarkdown(root.path, name, root.path);
  return files.map((file) => ({ ...file, rel: `${name}/${file.rel}`, project: name, kind: name }));
}

const byRelativePath = (left: DocFile, right: DocFile) => left.rel.localeCompare(right.rel);

export async function scan(extraRoots: ExtraRoot[] = [], base: string = PROJECTS_ROOT): Promise<DocFile[]> {
  const [projectFiles, extraFiles] = await Promise.all([
    collectProjects(base, 0, base),
    Promise.all(extraRoots.map(collectExtraRoot)),
  ]);

  return [...projectFiles, ...extraFiles.flat()].sort(byRelativePath);
}

/**
 * True when this absolute path is safe to read: inside the scanned root or an added
 * folder, a markdown file, and living under a doc dir when it comes from the root.
 */
export function isAllowed(target: string, extraRoots: ExtraRoot[] = [], base: string = PROJECTS_ROOT): boolean {
  const absolute = resolve(target);
  if (!absolute.endsWith(".md")) return false;

  const isInside = (root: string) => absolute.startsWith(resolve(root) + sep);
  const isInExtraRoot = extraRoots.some((root) => isInside(root.path));

  if (!isInside(base) && !isInExtraRoot) return false;
  if (isInExtraRoot) return true;

  return absolute.split(sep).some((part) => DOC_DIR_SET.has(part));
}
