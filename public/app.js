import Alpine from "/vendor/alpine.min.js";
import { addFolder, fetchDocument, fetchIndex, fetchStamp, removeFolder, rescan } from "./lib/api.js";
import { displayName, folderOf, formatAge } from "./lib/format.js";
import { buildGroups, searchFiles } from "./lib/tree.js";
import { renderMarkdown } from "./lib/markdown.js";
import { resolveRelativePath } from "./lib/paths.js";

const WATCH_INTERVAL_MS = 2_500;
const UPDATED_BADGE_MS = 1_800;

const isTypingTarget = (element) => /^(INPUT|TEXTAREA|SELECT)$/.test(element?.tagName ?? "");

Alpine.data("reader", () => ({
  files: [],
  extraRoots: [],
  projectsRoot: "",
  scannedAt: 0,
  query: "",
  activeIndex: 0,
  current: null,
  markdown: "",
  html: "",
  copied: false,
  copyTimer: null,
  errorMessage: "",
  justUpdated: false,
  expandedProjects: {},
  folderDraft: "",
  folderError: "",
  watchTimer: null,
  badgeTimer: null,

  // Handed to the template so it stays free of formatting logic.
  displayName,
  folderOf,
  formatAge,

  get groups() {
    return buildGroups(this.files, this.expandedProjects, folderOf);
  },

  get results() {
    return searchFiles(this.files, this.query);
  },

  get isSearching() {
    return this.query.trim() !== "";
  },

  get countLabel() {
    return this.isSearching ? `${this.results.length} / ${this.files.length}` : `${this.files.length}`;
  },

  get emptyHint() {
    if (!this.files.length) return "Nothing scanned yet.";
    return `${this.files.length} files · ${this.projectsRoot} · rescanned ${formatAge(this.scannedAt)}`;
  },

  async init() {
    await this.loadIndex();
    this.startWatching();
    await this.openLinkedDocument();
    this.$watch("query", () => this.resetSelection());
  },

  destroy() {
    clearInterval(this.watchTimer);
    clearTimeout(this.badgeTimer);
    clearTimeout(this.copyTimer);
  },

  async loadIndex() {
    const index = await fetchIndex();
    this.files = index.files;
    this.extraRoots = index.extraRoots;
    this.projectsRoot = index.projectsRoot;
    this.scannedAt = index.scannedAt;
  },

  resetSelection() {
    this.activeIndex = this.results.length ? 0 : -1;
  },

  /** Arrow keys wrap around, so Down on the last result returns to the first. */
  moveSelection(step) {
    const total = this.results.length;
    if (!total) return;
    this.activeIndex = (this.activeIndex + step + total) % total;
    this.$nextTick(() => this.scrollSelectionIntoView());
  },

  scrollSelectionIntoView() {
    const rows = this.$root.querySelectorAll("[data-result]");
    rows[this.activeIndex]?.scrollIntoView({ block: "nearest" });
  },

  openActiveResult() {
    const file = this.results[this.activeIndex] ?? this.results[0];
    if (file) void this.open(file);
  },

  async open(file) {
    this.current = file;
    this.expandedProjects[file.project] = true;
    this.errorMessage = "";
    this.rememberInUrl(file);
    await this.loadDocument(file);
  },

  async loadDocument(file) {
    try {
      const document = await fetchDocument(file.path);
      file.mtime = document.mtime;
      file.size = document.size;
      this.markdown = document.content;
      this.html = renderMarkdown(document.content, (href) => this.siblingOpener(file, href));
      this.errorMessage = "";
    } catch (error) {
      this.markdown = "";
      this.html = "";
      this.errorMessage = `Could not read ${file.name}. ${error.message}`;
    }
  },

  /** A relative .md link opens in the reader when the target is part of the index. */
  siblingOpener(fromFile, href) {
    const target = resolveRelativePath(fromFile.path, href);
    const match = target ? this.files.find((file) => file.path === target) : undefined;
    return match ? () => this.open(match) : undefined;
  },

  async reloadCurrent() {
    if (this.current) await this.loadDocument(this.current);
  },

  /** Copies the markdown source, so it pastes cleanly into an editor or a chat. */
  async copyDocument() {
    if (!this.markdown) return;

    try {
      await navigator.clipboard.writeText(this.markdown);
      this.copied = true;
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => (this.copied = false), 1_600);
    } catch {
      this.errorMessage = "The browser refused to copy. Open the page over localhost and try again.";
    }
  },

  /** The browser's own print dialog, where "Save as PDF" makes the file. */
  printDocument() {
    if (this.html) window.print();
  },

  async rescanAll() {
    await rescan();
    await this.loadIndex();
  },

  async submitFolder() {
    const path = this.folderDraft.trim();
    if (!path) return;

    try {
      const { extraRoots } = await addFolder(path);
      this.extraRoots = extraRoots;
      this.folderDraft = "";
      this.folderError = "";
      this.$refs.folderDialog.close();
      await this.loadIndex();
    } catch (error) {
      this.folderError = error.message;
    }
  },

  async removeRoot(root) {
    const { extraRoots } = await removeFolder(root.path);
    this.extraRoots = extraRoots;
    await this.loadIndex();
  },

  openFolderDialog() {
    this.folderDraft = "";
    this.folderError = "";
    this.$refs.folderDialog.showModal();
  },

  startWatching() {
    this.watchTimer = setInterval(() => void this.refreshIfChanged(), WATCH_INTERVAL_MS);
  },

  /** The plan is often being written while it is being read. */
  async refreshIfChanged() {
    if (!this.current || document.hidden) return;

    const file = this.current;
    const stamp = await fetchStamp(file.path).catch(() => null);
    if (!stamp || stamp.mtime === file.mtime) return;

    const scrollTop = this.$refs.pane.scrollTop;
    await this.loadDocument(file);
    this.$refs.pane.scrollTop = scrollTop;
    this.flashUpdatedBadge();
  },

  flashUpdatedBadge() {
    this.justUpdated = true;
    clearTimeout(this.badgeTimer);
    this.badgeTimer = setTimeout(() => (this.justUpdated = false), UPDATED_BADGE_MS);
  },

  isCurrent(file) {
    return this.current?.path === file.path;
  },

  rememberInUrl(file) {
    history.replaceState(null, "", `?path=${encodeURIComponent(file.path)}`);
  },

  async openLinkedDocument() {
    const linked = new URLSearchParams(location.search).get("path");
    const match = linked ? this.files.find((file) => file.path === linked) : undefined;
    if (match) await this.open(match);
  },

  /** Explicit key names: Alpine's key modifiers do not cover ArrowDown or ArrowUp. */
  handleSearchKey(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveSelection(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveSelection(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      this.openActiveResult();
      return;
    }

    if (event.key === "Escape") {
      this.query = "";
      this.resetSelection();
      this.$refs.search.blur();
    }
  },

  handleKeydown(event) {
    if (event.key === "/" && !isTypingTarget(document.activeElement)) {
      event.preventDefault();
      document.getElementById("nav").checked = true;
      this.focusSearch();
    }
  },

  focusSearch() {
    this.$refs.search.focus();
    this.$refs.search.select();
  },
}));

Alpine.start();
