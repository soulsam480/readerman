import { marked } from "/vendor/marked.js";
import { highlight, lang as canonicalLang } from "/vendor/sugar.min.js";

marked.setOptions({ gfm: true, breaks: false });

/** @typedef {{path:string,rel:string,project:string,kind:string,name:string,size:number,mtime:number}} Doc */

/** @type {Doc[]} */
let docs = [];
/** @type {Doc | null} */
let current = null;
/** @type {Doc[]} */
let extraRoots = [];
let query = "";

const $ = (id) => document.getElementById(id);
const treeEl = $("tree");
const searchEl = $("search");
const docEl = $("doc");
const emptyEl = $("empty");
const paneEl = $("pane");
const titleEl = $("doc-title");
const pathEl = $("doc-path");
const countEl = $("count");
const liveBadge = $("live-badge");
const rootsEl = $("roots");

const KIND_ORDER = [".opencode", ".superpowers", "docs"];

const fmtSize = (bytes) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : bytes > 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${bytes} B`;

const fmtAge = (ms) => {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
};

/** File names all end in .md; the extension is noise in a list of markdown files. */
const displayName = (name) => name.replace(/\.md$/, "");

/** The folder(s) a doc sits in, below its doc dir: "plans", "sdd/2026-10-24-foo". */
function subPath(doc) {
  const parts = doc.rel.split("/");
  const kindIndex = parts.indexOf(doc.kind);
  return parts.slice(kindIndex + 1, -1).join("/");
}

function matches(doc, needle) {
  if (!needle) return true;
  return doc.rel.toLowerCase().includes(needle) || doc.name.toLowerCase().includes(needle);
}

/** One file row: name, age on the right. Folder context comes from the tree above it. */
function fileRow(doc) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  const active = current?.path === doc.path;
  button.className =
    "flex w-full items-baseline gap-2 rounded-field px-1.5 py-[2px] text-left transition-colors hover:bg-base-300/70 focus-visible:outline-2 focus-visible:outline-primary/50";
  if (active) button.classList.add("bg-base-300");

  const name = document.createElement("span");
  name.className = `min-w-0 flex-1 truncate text-[13px] leading-[20px] ${
    active ? "font-medium text-base-content" : "text-base-content/85"
  }`;
  name.textContent = displayName(doc.name);
  name.title = doc.name;

  const age = document.createElement("span");
  age.className = "shrink-0 text-[10.5px] tabular-nums leading-[20px] text-base-content/40";
  age.textContent = fmtAge(doc.mtime);

  button.append(name, age);
  button.addEventListener("click", () => open(doc));
  li.append(button);
  return li;
}

/** Search result: no hierarchy around it, so the path is spelled out. */
function searchRow(doc) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "w-full rounded-field px-1.5 py-[3px] text-left transition-colors hover:bg-base-300/70 focus-visible:outline-2 focus-visible:outline-primary/50";
  if (current?.path === doc.path) button.classList.add("bg-base-300");

  const name = document.createElement("span");
  name.className = "block truncate text-[13px] leading-[18px] text-base-content/85";
  name.textContent = displayName(doc.name);

  const meta = document.createElement("span");
  meta.className = "block truncate text-[10.5px] leading-[14px] text-base-content/45";
  meta.textContent = doc.rel.split("/").slice(0, -1).join("/");

  button.append(name, meta);
  button.addEventListener("click", () => open(doc));
  li.append(button);
  return li;
}

function renderTree() {
  const needle = query.trim().toLowerCase();
  const shown = docs.filter((doc) => matches(doc, needle));
  treeEl.replaceChildren();

  if (!shown.length) {
    const empty = document.createElement("p");
    empty.className = "text-sm text-base-content/50 p-3";
    empty.textContent = needle ? "No files match." : "No markdown found.";
    treeEl.append(empty);
    countEl.textContent = `0 / ${docs.length}`;
    return;
  }

  countEl.textContent = needle ? `${shown.length} / ${docs.length}` : `${docs.length}`;

  if (needle) {
    // Flat list while searching: the whole point is to jump, not to browse.
    const list = document.createElement("ul");
    list.className = "space-y-px";
    for (const doc of shown.slice(0, 400)) list.append(searchRow(doc));
    treeEl.append(list);
    return;
  }

  /** @type {Map<string, Map<string, Doc[]>>} */
  const grouped = new Map();
  for (const doc of shown) {
    if (!grouped.has(doc.project)) grouped.set(doc.project, new Map());
    const kinds = grouped.get(doc.project);
    if (!kinds.has(doc.kind)) kinds.set(doc.kind, []);
    kinds.get(doc.kind).push(doc);
  }

  for (const [project, kinds] of [...grouped].sort((a, b) => a[0].localeCompare(b[0]))) {
    const details = document.createElement("details");
    details.className = "rounded-field";
    details.open = current ? current.project === project : project === "personal/tts";

    const summary = document.createElement("summary");
    summary.className =
      "flex cursor-pointer select-none list-none items-center gap-1.5 rounded-field px-1.5 py-[5px] hover:bg-base-300/70 [&::-webkit-details-marker]:hidden";
    const caret = document.createElement("span");
    caret.className = "w-2 shrink-0 text-[9px] text-base-content/40 transition-transform";
    caret.textContent = "▶";
    const labelSpan = document.createElement("span");
    labelSpan.className = "truncate text-[12.5px] font-medium leading-[18px]";
    labelSpan.textContent = project;
    const total = document.createElement("span");
    total.className = "ml-auto shrink-0 text-[10.5px] tabular-nums text-base-content/35";
    total.textContent = String([...kinds.values()].reduce((sum, list) => sum + list.length, 0));
    summary.append(caret, labelSpan, total);
    details.append(summary);

    const setCaret = () => (caret.style.transform = details.open ? "rotate(90deg)" : "none");
    setCaret();
    details.addEventListener("toggle", setCaret);

    const body = document.createElement("div");
    body.className = "ml-[13px] border-l border-base-300 pl-1.5 pb-1";
    const sortedKinds = [...kinds].sort(
      (a, b) => (KIND_ORDER.indexOf(a[0]) + 1 || 99) - (KIND_ORDER.indexOf(b[0]) + 1 || 99),
    );
    // The doc dir name is structural noise unless a project has more than one.
    const showKind = sortedKinds.length > 1;

    for (const [kind, files] of sortedKinds) {
      if (showKind) {
        const label = document.createElement("p");
        label.className =
          "px-1.5 pt-1 pb-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-base-content/40";
        label.textContent = kind;
        body.append(label);
      }

      // Almost every file sits in one folder ("plans"), which is not worth a heading.
      const folders = new Map();
      for (const doc of files) {
        const sub = subPath(doc);
        if (!folders.has(sub)) folders.set(sub, []);
        folders.get(sub).push(doc);
      }

      if (folders.size <= 1) {
        const list = document.createElement("ul");
        list.className = "space-y-px";
        for (const doc of files) list.append(fileRow(doc));
        body.append(list);
        continue;
      }

      const ordered = [...folders.keys()].sort((a, b) => {
        if (a === "") return -1;
        if (b === "") return 1;
        return a.localeCompare(b);
      });
      for (const folder of ordered) {
        if (folder) {
          const heading = document.createElement("p");
          heading.className = "truncate px-1.5 pt-1.5 pb-0.5 text-[10px] tracking-wide text-base-content/40";
          heading.textContent = folder;
          heading.title = folder;
          body.append(heading);
        }
        const list = document.createElement("ul");
        list.className = "space-y-px";
        for (const doc of folders.get(folder)) list.append(fileRow(doc));
        body.append(list);
      }
    }

    details.append(body);
    treeEl.append(details);
  }
}

function renderRoots() {
  rootsEl.replaceChildren();
  if (!extraRoots.length) return;
  const label = document.createElement("p");
  label.className = "text-[11px] uppercase tracking-wide text-base-content/40 px-1";
  label.textContent = "extra folders";
  rootsEl.append(label);
  for (const root of extraRoots) {
    const row = document.createElement("div");
    row.className = "flex items-center gap-1 text-xs";
    const text = document.createElement("span");
    text.className = "truncate flex-1";
    text.textContent = root.label;
    text.title = root.path;
    const remove = document.createElement("button");
    remove.className = "btn btn-ghost btn-xs";
    remove.textContent = "remove";
    remove.addEventListener("click", async () => {
      await fetch(`/api/roots?path=${encodeURIComponent(root.path)}`, { method: "DELETE" });
      await loadTree();
    });
    row.append(text, remove);
    rootsEl.append(row);
  }
}

function setHeader(doc) {
  titleEl.textContent = doc ? doc.name : "Reader";
  titleEl.title = doc?.path ?? "";
  pathEl.textContent = doc ? doc.rel : "pick a document";
  pathEl.title = doc?.path ?? "";
}

/** Rewrites links inside a rendered doc so relative .md links open in the reader. */
function wireLinks(root, doc) {
  const base = doc.path.slice(0, doc.path.lastIndexOf("/"));
  for (const anchor of root.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    if (!href) continue;
    if (!href.startsWith("http") && !href.startsWith("#")) {
      const clean = href.split("#")[0];
      if (clean.endsWith(".md")) {
        const parts = `${base}/${clean}`.split("/");
        /** @type {string[]} */
        const stack = [];
        for (const part of parts) {
          if (part === "." || part === "") continue;
          if (part === "..") stack.pop();
          else stack.push(part);
        }
        const target = `/${stack.join("/")}`;
        const match = docs.find((candidate) => candidate.path === target);
        if (match) {
          anchor.setAttribute("href", "#");
          anchor.addEventListener("click", (event) => {
            event.preventDefault();
            open(match);
          });
          continue;
        }
      }
    }
    if (href.startsWith("http")) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noreferrer");
    }
  }
}

/**
 * Sugar-high is language-agnostic enough to guess badly, so only fenced blocks that name a
 * language it knows get coloured. Bare fences are usually output, trees, or prose.
 */
function highlightCode(root) {
  for (const code of root.querySelectorAll("pre > code")) {
    const match = /language-([\w+-]+)/.exec(code.className);
    if (!match) continue;
    const name = canonicalLang(match[1].toLowerCase());
    if (!name || name === "plaintext") continue;
    try {
      code.innerHTML = highlight(code.textContent ?? "", { lang: name });
      code.dataset.lang = match[1].toLowerCase();
    } catch {
      // A bad fence label should never break the document.
    }
  }
}

function paint(doc, content) {
  docEl.innerHTML = marked.parse(content);
  highlightCode(docEl);
  wireLinks(docEl, doc);
  emptyEl.classList.add("hidden");
  docEl.classList.remove("hidden");
}

async function fetchFile(path) {
  // A restart of the server can land between a click and the read; retrying for a few
  // seconds covers the build and rescan that a fresh start does first.
  for (const wait of [0, 500, 1200, 2500]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const response = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
      if (response.ok) return await response.json();
      if (response.status === 403 || response.status === 404) return null;
    } catch {
      // Connection refused while the server restarts.
    }
  }
  return null;
}

async function open(doc) {
  const scrollWas = doc.path === current?.path ? paneEl.scrollTop : 0;
  current = doc;
  setHeader(doc);
  history.replaceState(null, "", `?path=${encodeURIComponent(doc.path)}`);
  renderTree();

  const payload = await fetchFile(doc.path);
  if (!payload) {
    docEl.innerHTML = "";
    const box = document.createElement("div");
    box.className = "alert alert-error";
    const text = document.createElement("span");
    text.textContent = "Could not read this file. The server may be restarting.";
    const retry = document.createElement("button");
    retry.className = "btn btn-sm";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => open(doc));
    box.append(text, retry);
    docEl.append(box);
    emptyEl.classList.add("hidden");
    docEl.classList.remove("hidden");
    return;
  }
  doc.mtime = payload.mtime;
  doc.size = payload.size;
  paint(doc, payload.content);
  paneEl.scrollTop = scrollWas;
  document.getElementById("nav").checked = false;
}

async function loadTree() {
  const response = await fetch("/api/tree");
  const payload = await response.json();
  docs = payload.files;
  extraRoots = payload.extraRoots ?? [];
  renderTree();
  renderRoots();
  $("empty-count").textContent = `${docs.length} files · ${payload.projectsRoot} · rescanned ${fmtAge(payload.scannedAt)}`;
}

/* Live refresh: the plan files change while I am writing them. */
let pollTimer = null;
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (!current || document.hidden) return;
    const target = current;
    const response = await fetch(`/api/stat?path=${encodeURIComponent(target.path)}`).catch(() => null);
    if (!response?.ok) return;
    const info = await response.json();
    if (info.mtime === target.mtime) return;
    const fresh = await fetch(`/api/file?path=${encodeURIComponent(target.path)}`);
    if (!fresh.ok) return;
    const payload = await fresh.json();
    target.mtime = payload.mtime;
    const scroll = paneEl.scrollTop;
    paint(target, payload.content);
    paneEl.scrollTop = scroll;
    liveBadge.classList.remove("hidden");
    setTimeout(() => liveBadge.classList.add("hidden"), 1800);
  }, 2500);
}

searchEl.addEventListener("input", () => {
  query = searchEl.value;
  renderTree();
});

$("reload").addEventListener("click", () => {
  if (current) open(current);
});

$("refresh").addEventListener("click", async () => {
  await fetch("/api/reindex");
  await loadTree();
});

$("add-root").addEventListener("click", () => {
  $("root-error").classList.add("hidden");
  $("root-input").value = "";
  $("root-dialog").showModal();
  $("root-input").focus();
});

$("root-save").addEventListener("click", async () => {
  const value = $("root-input").value.trim();
  if (!value) return;
  const response = await fetch("/api/roots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: value }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    $("root-error").textContent = payload.error ?? "could not add that folder";
    $("root-error").classList.remove("hidden");
    return;
  }
  $("root-dialog").close();
  await loadTree();
});

document.addEventListener("keydown", (event) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
  if (event.key === "/" && !typing) {
    event.preventDefault();
    document.getElementById("nav").checked = true;
    searchEl.focus();
    searchEl.select();
  }
  if (event.key === "Escape" && document.activeElement === searchEl) {
    searchEl.value = "";
    query = "";
    renderTree();
    searchEl.blur();
  }
});

/** Deep link support: ?path=/abs/file.md */
const deepLink = new URLSearchParams(location.search).get("path");

await loadTree();
startPolling();
if (deepLink) {
  const match = docs.find((doc) => doc.path === deepLink);
  if (match) open(match);
}
