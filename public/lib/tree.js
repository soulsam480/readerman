/** Doc dirs in the order the sidebar should show them. */
export const KIND_ORDER = [".opencode", ".superpowers", "docs"];

const kindRank = (kind) => {
  const rank = KIND_ORDER.indexOf(kind);
  return rank === -1 ? KIND_ORDER.length : rank;
};

/** Folders that carry no meaning on their own: the doc dir root and the usual "plans". */
const QUIET_FOLDERS = new Set(["", "plans"]);

function buildFolderTrie(files, folderOf) {
  const root = { children: new Map(), files: [] };

  for (const file of files) {
    let node = root;
    for (const segment of folderOf(file).split("/").filter(Boolean)) {
      if (!node.children.has(segment)) node.children.set(segment, { children: new Map(), files: [] });
      node = node.children.get(segment);
    }
    node.files.push(file);
  }

  return root;
}

/**
 * A folder with one child and no files of its own is a pass-through, so it keeps its
 * path on one line ("skills/impeccable/reference") instead of three empty headings.
 */
function flattenFolders(node, depth, prefix, groups) {
  const names = [...node.children.keys()].sort((left, right) => left.localeCompare(right));

  for (const name of names) {
    let label = name;
    let child = node.children.get(name);

    while (child.files.length === 0 && child.children.size === 1) {
      const [nextName, nextChild] = [...child.children.entries()][0];
      label = `${label}/${nextName}`;
      child = nextChild;
    }

    groups.push({ path: `${prefix}${label}`, label, depth, files: child.files });
    flattenFolders(child, depth + 1, `${prefix}${label}/`, groups);
  }
}

/**
 * Folder headings are only worth a line when the doc dir really has folders. 57% of
 * documents live in a single "plans" folder, so that heading would be noise.
 */
function toFolders(files, folderOf) {
  const folders = new Set(files.map(folderOf));
  const isQuiet = folders.size === 0 || (folders.size === 1 && QUIET_FOLDERS.has([...folders][0]));
  if (isQuiet) return [{ path: "", label: "", depth: 0, files }];

  const trie = buildFolderTrie(files, folderOf);
  const groups = [];
  if (trie.files.length) groups.push({ path: "", label: "", depth: 0, files: trie.files });
  flattenFolders(trie, 0, "", groups);
  return groups;
}

/**
 * Shapes the flat file list into what the sidebar renders:
 * project → doc dir → nested folder → file. Expansion is passed in so re-renders keep it.
 */
export function buildGroups(files, expandedProjects, folderOf) {
  const byProject = new Map();
  for (const file of files) {
    if (!byProject.has(file.project)) byProject.set(file.project, new Map());
    const byKind = byProject.get(file.project);
    if (!byKind.has(file.kind)) byKind.set(file.kind, []);
    byKind.get(file.kind).push(file);
  }

  const projectNames = [...byProject.keys()].sort((left, right) => left.localeCompare(right));

  return projectNames.map((name) => {
    const byKind = byProject.get(name);
    const kinds = [...byKind.keys()]
      .sort((left, right) => kindRank(left) - kindRank(right))
      .map((kind) => ({
        name: kind,
        files: byKind.get(kind),
        folders: toFolders(byKind.get(kind), folderOf),
        showLabel: byKind.size > 1,
      }));

    return {
      name,
      kinds,
      expanded: Boolean(expandedProjects[name]),
      total: kinds.reduce((sum, kind) => sum + kind.files.length, 0),
    };
  });
}

/** Filters on the path and the name, so "web/plans" and "salesforce" both work. */
export function searchFiles(files, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return files.filter(
    (file) => file.rel.toLowerCase().includes(needle) || file.name.toLowerCase().includes(needle),
  );
}
