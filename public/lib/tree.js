/** Doc dirs in the order the sidebar should show them. */
export const KIND_ORDER = [".opencode", ".superpowers", "docs"];

const kindRank = (kind) => {
  const rank = KIND_ORDER.indexOf(kind);
  return rank === -1 ? KIND_ORDER.length : rank;
};

/**
 * A folder heading is only worth its line when a doc dir actually has more than one
 * folder. 57% of documents live in a single "plans" folder, so that heading is noise.
 */
function toFolders(files, folderOf) {
  const byFolder = new Map();
  for (const file of files) {
    const folder = folderOf(file);
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(file);
  }

  const showLabel = byFolder.size > 1;
  const ordered = [...byFolder.keys()].sort((left, right) => {
    if (left === "") return -1;
    if (right === "") return 1;
    return left.localeCompare(right);
  });

  return ordered.map((name) => ({ name, showLabel, files: byFolder.get(name) }));
}

/**
 * Shapes the flat file list into what the sidebar renders:
 * project → doc dir → folder → file. Expansion is passed in so re-renders keep it.
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
