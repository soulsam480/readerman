import { marked } from "/vendor/marked.min.js";
import { highlight, lang as canonicalLanguage } from "/vendor/sugar.min.js";

marked.setOptions({ gfm: true, breaks: false });

const FENCE_LANGUAGE = /language-([\w+-]+)/;

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

  highlightCodeBlocks(template.content);
  wireDocumentLinks(template.content, openSibling);

  return template.innerHTML;
}
