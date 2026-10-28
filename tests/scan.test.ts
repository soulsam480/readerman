import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isAllowed, scan, type ExtraRoot } from "../src/scan";

let base = "";
let extra = "";

/** Creates one markdown file, making sure its parent directories exist. */
async function touch(file: string): Promise<void> {
  const { dirname } = await import("node:path");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `# ${file}\n`, "utf8");
}

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "reader-base-"));
  extra = await mkdtemp(join(tmpdir(), "reader-extra-"));

  // Harvested: the three known doc dirs, at any depth.
  await touch(join(base, "work", "web", ".opencode", "plans", "a.md"));
  await touch(join(base, "work", "web", ".superpowers", "sdd", "b.md"));
  await touch(join(base, "work", "setup", "api", "docs", "c.md"));
  await touch(join(base, "personal", "tts", ".opencode", "d.md"));

  // Ignored: plain project markdown, vendor trees, node_modules, worktrees.
  await touch(join(base, "work", "web", "README.md"));
  await touch(join(base, "work", "web", "src", "notes.md"));
  await touch(join(base, "work", "web", "vendor", "docs", "v.md"));
  await touch(join(base, "work", "web", "node_modules", "pkg", ".opencode", "n.md"));
  await touch(join(base, "work", "web", ".worktrees", "feat", ".opencode", "w.md"));
  await writeFile(join(base, "work", "web", ".opencode", "plans", "not-markdown.txt"), "x", "utf8");

  await touch(join(extra, "scratch.md"));
  await touch(join(extra, "deep", "note.md"));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
  await rm(extra, { recursive: true, force: true });
});

describe("scan", () => {
  test("harvests only the known doc dirs", async () => {
    const files = await scan([], base);
    expect(files.map((file) => file.name).sort()).toEqual(["a.md", "b.md", "c.md", "d.md"]);
  });

  test("labels each file with its project and doc dir", async () => {
    const files = await scan([], base);
    const a = files.find((file) => file.name === "a.md");
    expect(a?.project).toBe("work/web");
    expect(a?.kind).toBe(".opencode");
    expect(a?.rel).toBe("work/web/.opencode/plans/a.md");
    expect(files.find((file) => file.name === "c.md")?.project).toBe("work/setup");
  });

  test("picks up extra roots on top of the defaults", async () => {
    const files = await scan([{ path: extra, label: "~/extra" }], base);
    const names = files.map((file) => file.name);
    expect(names).toContain("scratch.md");
    expect(names).toContain("note.md");
    expect(names).toContain("a.md");
    expect(files.find((file) => file.name === "scratch.md")?.project).toBe("~/extra");
  });
});

describe("isAllowed", () => {
  const roots = (): ExtraRoot[] => [{ path: extra, label: "~/extra" }];

  test("allows markdown under a doc dir", () => {
    expect(isAllowed(join(base, "work", "web", ".opencode", "plans", "a.md"), [], base)).toBe(true);
    expect(isAllowed(join(base, "work", "setup", "api", "docs", "c.md"), [], base)).toBe(true);
  });

  test("refuses markdown outside the doc dirs", () => {
    expect(isAllowed(join(base, "work", "web", "README.md"), [], base)).toBe(false);
    expect(isAllowed(join(base, "work", "web", "src", "notes.md"), [], base)).toBe(false);
  });

  test("refuses anything outside the roots, and space-adjacent siblings", () => {
    expect(isAllowed("/etc/passwd", [], base)).toBe(false);
    expect(isAllowed(join(base, "..", "secrets.md"), [], base)).toBe(false);
    expect(isAllowed(`${base}-evil/.opencode/x.md`, [], base)).toBe(false);
  });

  test("refuses non-markdown even inside a doc dir", () => {
    expect(isAllowed(join(base, "work", "web", ".opencode", "plans", "not-markdown.txt"), [], base)).toBe(false);
  });

  test("allows markdown under an extra root", () => {
    expect(isAllowed(join(extra, "scratch.md"), roots(), base)).toBe(true);
    expect(isAllowed(join(extra, "deep", "note.md"), roots(), base)).toBe(true);
  });
});
