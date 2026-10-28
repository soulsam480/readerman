/** Resolves a relative link inside a document to an absolute path. */
export function resolveRelativePath(fromPath, href) {
  const withoutFragment = href.split("#")[0];
  if (!withoutFragment.endsWith(".md")) return null;

  const base = fromPath.slice(0, fromPath.lastIndexOf("/"));
  const segments = `${base}/${withoutFragment}`.split("/");
  const resolved = [];

  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }

  return `/${resolved.join("/")}`;
}
