import { marked } from "/vendor/marked.js";

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
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
};

function matches(doc, needle) {
  if (!needle) return true;
  return doc.rel.toLowerCase().includes(needle) || doc.name.toLowerCase().includes(needle);
}

function fileButton(doc) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.className = "flex flex-col items-start gap-0.5 text-left w-full";
  if (current?.path === doc.path) button.classList.add("menu-active");
  button.dataset.path = doc.path;

  const name = document.createElement("span");
  name.className = "truncate w-full";
  name.textContent = doc.name;

  const meta = document.createElement("span");
  meta.className = "text-[11px] text-base-content/40 truncate w-full";
  meta.textContent = `${doc.rel.split("/").slice(doc.rel.split("/").indexOf(doc.kind) + 1, -1).join("/") || doc.kind} · ${fmtAge(doc.mtime)}`;

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
    list.className = "space-y-0.5";
    for (const doc of shown.slice(0, 400)) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.className = "flex flex-col items-start gap-0.5 text-left w-full rounded-box px-2 py-1 hover:bg-base-300";
      if (current?.path === doc.path) button.classList.add("bg-base-300");
      const name = document.createElement("span");
      name.className = "truncate w-full text-sm";
      name.textContent = doc.name;
      const meta = document.createElement("span");
      meta.className = "text-[11px] text-base-content/40 truncate w-full";
      meta.textContent = doc.rel;
      button.append(name, meta);
      button.addEventListener("click", () => open(doc));
      li.append(button);
      list.append(li);
    }
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
    details.className = "border-b border-base-300/60 pb-1";
    details.open = current ? current.project === project : project === "personal/tts" || project === "work/web";

    const summary = document.createElement("summary");
    summary.className =
      "flex items-center gap-1.5 cursor-pointer select-none px-2 py-1.5 text-sm font-medium rounded-box hover:bg-base-300 list-none [&::-webkit-details-marker]:hidden";
    const caret = document.createElement("span");
    caret.className = "text-base-content/40 text-[10px] transition-transform details-caret";
    caret.textContent = "▶";
    const labelSpan = document.createElement("span");
    labelSpan.className = "truncate";
    labelSpan.textContent = project;
    const total = document.createElement("span");
    total.className = "ml-auto text-[11px] text-base-content/40";
    total.textContent = String([...kinds.values()].reduce((sum, list) => sum + list.length, 0));
    summary.append(caret, labelSpan, total);
    details.append(summary);
    details.addEventListener("toggle", () => {
      caret.style.transform = details.open ? "rotate(90deg)" : "none";
    });
    caret.style.transform = details.open ? "rotate(90deg)" : "none";

    const body = document.createElement("div");
    body.className = "pl-2";
    const sortedKinds = [...kinds].sort(
      (a, b) => (KIND_ORDER.indexOf(a[0]) + 1 || 99) - (KIND_ORDER.indexOf(b[0]) + 1 || 99),
    );
    for (const [kind, files] of sortedKinds) {
      const label = document.createElement("p");
      label.className = "text-[11px] uppercase tracking-wide text-base-content/40 px-2 pt-1";
      label.textContent = `${kind} · ${files.length}`;
      body.append(label);
      const list = document.createElement("ul");
      list.className = "space-y-0.5";
      for (const doc of files) list.append(fileButton(doc));
      body.append(list);
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

function paint(doc, content) {
  docEl.innerHTML = marked.parse(content);
  wireLinks(docEl, doc);
  emptyEl.classList.add("hidden");
  docEl.classList.remove("hidden");
}

async function open(doc) {
  const scrollWas = doc.path === current?.path ? paneEl.scrollTop : 0;
  current = doc;
  setHeader(doc);
  history.replaceState(null, "", `?path=${encodeURIComponent(doc.path)}`);
  renderTree();

  const response = await fetch(`/api/file?path=${encodeURIComponent(doc.path)}`);
  if (!response.ok) {
    docEl.innerHTML = `<div class="alert alert-error">Could not read this file.</div>`;
    emptyEl.classList.add("hidden");
    docEl.classList.remove("hidden");
    return;
  }
  const payload = await response.json();
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
