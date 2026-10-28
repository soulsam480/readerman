# Reader

A small local server that collects the markdown I write with the agent — plans, specs,
design docs, SDD progress — from every project under `~/projects`, and serves them in a
browser with a tree and a file filter.

Two ways in, on one screen: browse the tree, or type part of a filename. Nothing is loaded
until you click it, so the browser never holds the corpus in memory.

## Run

```sh
bun install
bun run start          # builds app.css + the vendor bundle, then serves http://localhost:4599
bun run dev            # same, but restarts the server on change
```

`PORT` overrides the port. `bun run build` rebuilds the stylesheet and the client vendor
bundle after editing `public/index.html`, `public/app.js`, or `src/styles.css`.

To keep it running in the background:

```sh
nohup bun run start > /tmp/reader.log 2>&1 &
```

## What gets indexed

Only these directories, at any depth, inside `~/projects`:

| Directory | Holds |
| --- | --- |
| `.opencode/` | plans, designs, learnings |
| `.superpowers/` | SDD briefs and progress |
| `docs/` | project documentation |

Everything else is left alone — no vendored gems, no `node_modules`, no `.git`, no
`.worktrees`, no root READMEs. That comes to roughly 480 files on this machine, and the
walk takes a few milliseconds, so there is no database and no cached copy of anything.

Folders outside those three can be added from the UI (**Add folder**); absolute paths and
`~/` both work. They are stored in `data/config.json` and scanned recursively for
markdown, alongside the defaults.

## Behaviour worth knowing

- **Live reload.** While a document is open the page polls its mtime every 2.5 seconds.
  When the file changes — because I am writing it — the text re-renders in place, keeping
  the scroll position, with a brief `updated` badge. A plan being written can be read as
  it is written.
- **Rescan.** `Rescan` re-walks the projects root, so a newly created doc dir appears
  without restarting the server.
- **Deep links.** The open file lives in the URL as `?path=/abs/file.md`, so a bookmark or
  a reload returns to the same document.
- **Syntax highlighting.** Fenced blocks that name a language are coloured with
  sugar-high (12.6 KB gzipped, bundled at build time). Bare fences are left alone, because
  they are usually shell output or file trees rather than code.
- **Relative links.** A `.md` link inside a document opens in the reader when the target is
  already indexed; anything else opens in a new tab.
- **Reading is guarded.** `/api/file` only serves `.md` files that sit inside a default doc
  dir (or an added folder). Everything else is a 403, including `README.md` in a project
  root and any path that escapes `~/projects`.

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /api/tree` | File metadata only: path, project, kind, size, mtime |
| `GET /api/file?path=` | One file's markdown, read from disk per request |
| `GET /api/stat?path=` | mtime and size, for the live-reload poll |
| `GET /api/reindex` | Re-walk and report the new count |
| `POST /api/roots` | Add a folder: `{ "path": "~/projects/work/web/design-notes" }` |
| `DELETE /api/roots?path=` | Remove an added folder |

## Layout

```
src/scan.ts              walk, classify, and whitelist markdown
src/server.ts            Bun.serve: JSON API + static files
src/styles.css          Tailwind 4 + daisyUI 5 + typography + token colors
src/vendor/sugar-entry.js  bundle entry for sugar-high
public/index.html       drawer shell, search, add-folder dialog
public/app.js           tree render, markdown render, highlighting, live poll
tests/scan.test.ts       scanner and allowlist tests against a fixture tree
```

## Test

```sh
bun test
```
