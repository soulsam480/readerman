import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { isAllowed, scan, type DocFile } from "./scan";
import { collapseHome, expandHome, type ConfigStore, type ReaderConfig } from "./config";
import { RequestError } from "./http";

export type DisplayRoot = { path: string; label: string };

export type IndexPayload = {
  projectsRoot: string;
  scannedAt: number;
  extraRoots: DisplayRoot[];
  files: DocFile[];
};

export type DocumentPayload = {
  path: string;
  content: string;
  mtime: number;
  size: number;
};

export type StampPayload = { mtime: number; size: number };

/**
 * Owns the scanned files and the folders added from the UI. Everything the API needs
 * goes through here, so no route touches the filesystem or the config directly.
 */
export class DocIndex {
  private files: DocFile[] = [];
  private scannedAt = 0;
  private config: ReaderConfig = { extraRoots: [] };

  constructor(
    private readonly store: ConfigStore,
    private readonly base: string,
  ) {}

  async load(): Promise<void> {
    this.config = await this.store.read();
    await this.rescan();
  }

  async rescan(): Promise<void> {
    this.files = await scan(this.config.extraRoots, this.base);
    this.scannedAt = Date.now();
  }

  summary(): IndexPayload {
    return {
      projectsRoot: collapseHome(this.base),
      scannedAt: this.scannedAt,
      extraRoots: this.config.extraRoots.map((root) => ({
        path: root.path,
        label: collapseHome(root.path),
      })),
      files: this.files,
    };
  }

  get fileCount(): number {
    return this.files.length;
  }

  async readDocument(target: string): Promise<DocumentPayload> {
    this.assertReadable(target);
    const [content, info] = await Promise.all([readFile(target, "utf8"), stat(target)]).catch(() => {
      throw new RequestError(404, "cannot read that file");
    });
    return { path: resolve(target), content, mtime: info.mtimeMs, size: info.size };
  }

  async readStamp(target: string): Promise<StampPayload> {
    this.assertReadable(target);
    const info = await stat(target).catch(() => {
      throw new RequestError(404, "that file is gone");
    });
    return { mtime: info.mtimeMs, size: info.size };
  }

  /** Adds a folder outside the project defaults and rescans. Returns the new list. */
  async addExtraRoot(rawPath: string): Promise<DisplayRoot[]> {
    const absolute = resolve(expandHome(rawPath.trim()));
    const info = await stat(absolute).catch(() => null);

    if (!info?.isDirectory()) throw new RequestError(400, "not a directory");
    if (this.config.extraRoots.some((root) => root.path === absolute)) {
      throw new RequestError(409, "already added");
    }

    this.config.extraRoots.push({ path: absolute });
    await this.persist();
    return this.summary().extraRoots;
  }

  async removeExtraRoot(absolutePath: string): Promise<DisplayRoot[]> {
    const remaining = this.config.extraRoots.filter((root) => root.path !== absolutePath);
    if (remaining.length === this.config.extraRoots.length) throw new RequestError(404, "not found");

    this.config.extraRoots = remaining;
    await this.persist();
    return this.summary().extraRoots;
  }

  private async persist(): Promise<void> {
    await this.store.write(this.config);
    await this.rescan();
  }

  private assertReadable(target: string): void {
    if (!isAllowed(target, this.config.extraRoots, this.base)) {
      throw new RequestError(403, "path not allowed");
    }
  }
}
