const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 12 * MONTH;

/** Compact relative age: "now", "14m", "6h", "3d", "5mo", "2y". */
export function formatAge(mtimeMs, now = Date.now()) {
  const elapsed = Math.max(0, now - mtimeMs);
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < MONTH) return `${Math.floor(elapsed / DAY)}d`;
  if (elapsed < YEAR) return `${Math.floor(elapsed / MONTH)}mo`;
  return `${Math.floor(elapsed / YEAR)}y`;
}

/** Every document is markdown, so the extension only costs width in a list. */
export function displayName(name) {
  return name.replace(/\.md$/, "");
}

/** The folders a document sits in below its doc dir: "plans", "sdd/2026-10-24-feature", "". */
export function folderOf(file) {
  const parts = file.rel.split("/");
  const kindIndex = parts.indexOf(file.kind);
  if (kindIndex === -1) return "";
  return parts.slice(kindIndex + 1, -1).join("/");
}
