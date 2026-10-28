import { readFile, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ExtraRoot } from "./scan";

export type ReaderConfig = { extraRoots: ExtraRoot[] };

export const EMPTY_CONFIG: ReaderConfig = { extraRoots: [] };

/** Turns "~/projects/notes" into an absolute path. */
export function expandHome(rawPath: string): string {
  return rawPath.startsWith("~") ? join(homedir(), rawPath.slice(1)) : rawPath;
}

/** Turns "/Users/me/projects/notes" into "~/projects/notes" for display. */
export function collapseHome(absolutePath: string): string {
  return absolutePath.replace(homedir(), "~");
}

/** Durable storage for the folders added from the UI. */
export class ConfigStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<ReaderConfig> {
    const raw = await readFile(this.filePath, "utf8").catch(() => null);
    if (!raw) return EMPTY_CONFIG;

    const parsed = JSON.parse(raw) as { extraRoots?: { path?: unknown }[] };
    const stored = Array.isArray(parsed.extraRoots) ? parsed.extraRoots : [];
    const extraRoots = stored
      .filter((root): root is { path: string } => typeof root?.path === "string")
      .map((root) => ({ path: root.path }));
    return { extraRoots };
  }

  async write(config: ReaderConfig): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }
}
