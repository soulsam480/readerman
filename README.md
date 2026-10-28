# Reader

A local server that collects the markdown I write with the agent and serves it in a
browser. Plans, specs, design docs, and SDD progress land in one list, from every project
under `~/projects`.

You find a document two ways. Browse the tree on the left, or type part of a filename. The
browser reads a file only when you click it.

## Run

```sh
bun install
bun run start          # builds the stylesheet and bundles, then serves http://localhost:4599
bun run dev            # same, but restarts when the server code changes
```

Set `PORT` to change the port. Run `bun run build` after you edit anything under `public/`
or `src/styles.css`.

## Start automatically

`plugin/reader/index.ts` starts the reader when the OpenCode server starts. It checks every
10 seconds and starts the reader again if the process died. Add one line to
`~/.config/opencode/opencode.json`:

```jsonc
{
  "plugins": ["/Users/<you>/projects/personal/reader/plugin/reader"]
}
```

The plugin does not stop the reader when it unloads. A configuration save reloads plugins,
and a restart in the middle of a document loses your place. OpenCode loads a plugin once for
each open location, so the copies coordinate through `/tmp/reader-spawn.lock`. One copy
starts the server and the others wait.

The log is at `/tmp/reader.log`. `pkill -f "src/server.ts"` stops the reader and the check
starts it again within 10 seconds. Remove the plugin line to stop it for good.

## What it reads

Three directories, at any depth inside `~/projects`:

- `.opencode/` holds plans, designs, and learnings.
- `.superpowers/` holds SDD briefs and progress.
- `docs/` holds project documentation.

It skips everything else: vendored gems, `node_modules`, `.git`, `.worktrees`, and README
files in project roots. That leaves about 480 files on this machine, and the walk takes a
few milliseconds. There is no database and no cached copy.

Use Add folder in the sidebar for markdown outside those directories. Absolute paths and
`~/` both work. The list lives in `data/config.json`.

## Behavior

- The page checks the open file every 2.5 seconds. When the file changes, the text updates
  in place, the scroll position stays, and an `updated` badge appears. You can read a plan
  while the agent writes it.
- Rescan walks the projects root again, so a new doc directory appears without a restart.
- The URL holds the open file as `?path=/abs/file.md`, so a bookmark or a reload returns to
  the same document.
- Code blocks that name a language are colored with sugar-high (12.6 KB gzipped, bundled at
  build time). Blocks without a language stay plain, because they are usually shell output
  or file trees.
- A link to another `.md` file opens in the reader when that file is in the index. Other
  links open in a new tab.
- `/api/file` serves only `.md` files inside a doc directory or an added folder. Anything
  else returns 403, including a README in a project root.

## Layout

```
src/scan.ts          walks the projects and shares the allowlist
src/index-store.ts   holds the file list and the added folders
src/api.ts           the six JSON routes
src/server.ts        Bun.serve, the port, and the router
public/index.html    Alpine templates for the tree and the document
public/app.js        the reader component
public/lib/          fetch, grouping, formatting, markdown
plugin/reader/       starts and supervises the server
```
