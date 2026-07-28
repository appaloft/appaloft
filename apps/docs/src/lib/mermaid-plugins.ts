/**
 * Mermaid fence transforms for the Nimbus/Astro `unified()` markdown processor.
 *
 * `astro-mermaid` injects the client renderer and also tries to wire remark/rehype
 * into Astro's top-level `markdown.processor`. Nimbus docs content is compiled
 * through the processor passed to `nimbus(..., { markdown.processor })`, which is
 * a separate instance — so we attach the same transforms here explicitly.
 */

import { type Element, type Root as HastRoot } from "hast";
import { type Root as MdastRoot } from "mdast";
import { type Plugin } from "unified";
import { visit } from "unist-util-visit";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** Remark: ```mermaid → raw <pre class="mermaid"> HTML node. */
export const remarkMermaid: Plugin<[], MdastRoot> = () => {
  return (tree) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "mermaid" || parent == null || typeof index !== "number") {
        return;
      }

      parent.children[index] = {
        type: "html",
        value: `<pre class="mermaid">${escapeHtml(node.value)}</pre>`,
      };
    });
  };
};

/** Rehype fallback: <pre><code class="language-mermaid"> → <pre class="mermaid">. */
export const rehypeMermaid: Plugin<[], HastRoot> = () => {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "pre" || node.children?.length !== 1) {
        return;
      }

      const codeNode = node.children[0] as Element | undefined;
      if (!codeNode || codeNode.tagName !== "code") {
        return;
      }

      const className = codeNode.properties?.className;
      const classes = Array.isArray(className)
        ? className.map(String)
        : typeof className === "string"
          ? [className]
          : [];

      if (!classes.includes("language-mermaid")) {
        return;
      }

      const text = (codeNode.children ?? [])
        .map((child) => ("value" in child ? String(child.value ?? "") : ""))
        .join("");

      node.properties = {
        ...node.properties,
        className: ["mermaid"],
      };
      node.children = [
        {
          type: "text",
          value: escapeHtml(text),
        },
      ];
    });
  };
};
