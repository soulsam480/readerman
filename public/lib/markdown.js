import { marked } from "/vendor/marked.min.js";
import { highlight, lang as canonicalLanguage } from "/vendor/sugar.min.js";
import { render as renderDiagram } from "/vendor/pele.min.js";

marked.setOptions({ gfm: true, breaks: false });

const FENCE_LANGUAGE = /language-([\w+-]+)/;
const MERMAID_LANGUAGE = "mermaid";
/** The prose column is max-w-4xl; diagrams render for that width and scale down. */
const DIAGRAM_MAX_WIDTH = 860;
const DIAGRAM_FONT_SIZE = 13;

/**
 * Fenced ```mermaid blocks become SVG. A diagram that fails to parse keeps its source
 * visible, because a broken chart should not hide what the document says.
 */
function renderDiagrams(root) {
  for (const code of root.querySelectorAll(`pre > code.language-${MERMAID_LANGUAGE}`)) {
    const source = code.textContent ?? "";
    const block = code.parentElement;
    const figure = document.createElement("figure");
    figure.className = "pele-diagram";

    try {
      const { svg, type } = renderDiagram(source, {
        responsive: true,
        maxWidth: DIAGRAM_MAX_WIDTH,
        fontSize: DIAGRAM_FONT_SIZE,
        fontFamily: getComputedStyle(document.body).fontFamily,
      });
      figure.innerHTML = svg;
      figure.dataset.diagram = type;
      block.replaceWith(figure);
    } catch (error) {
      // Keep the source visible; a broken chart should not hide what the document says.
      const note = document.createElement("p");
      note.className = "text-error text-sm";
      note.textContent = `Could not render this diagram: ${error.message}`;
      block.before(note);
    }
  }
}

/**
 * Colours fenced blocks that name a language sugar-high knows. Bare fences are usually
 * shell output, file trees, or prose, where colouring would be guesswork.
 */
function highlightCodeBlocks(root) {
  for (const code of root.querySelectorAll("pre > code")) {
    const language = FENCE_LANGUAGE.exec(code.className)?.[1];
    if (!language) continue;

    const canonical = canonicalLanguage(language.toLowerCase());
    if (!canonical || canonical === "plaintext") continue;

    try {
      code.innerHTML = highlight(code.textContent ?? "", { lang: canonical });
      code.dataset.lang = language.toLowerCase();
    } catch {
      // A bad fence label should never break the document.
    }
  }
}

/** Rewrites markdown links to other documents so they navigate inside the reader. */
function wireDocumentLinks(root, resolveRelative) {
  for (const anchor of root.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    if (!href) continue;

    const isExternal = href.startsWith("http");
    if (isExternal) {
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      continue;
    }

    const target = resolveRelative(href);
    if (!target) continue;
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      target();
    });
  }
}

/**
 * Markdown → HTML, with code colouring and internal links wired up.
 * `openSibling` receives a document path from a relative link and returns a handler.
 */
export function renderMarkdown(source, openSibling = () => undefined) {
  const template = document.createElement("template");
  template.innerHTML = marked.parse(source);

  renderDiagrams(template.content);
  highlightCodeBlocks(template.content);
  wireDocumentLinks(template.content, openSibling);

  return template.innerHTML;
}
