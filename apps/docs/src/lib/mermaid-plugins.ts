/**
 * Mermaid fence transforms for the Nimbus/Astro `unified()` markdown processor.
 *
 * `astro-mermaid` injects the client renderer and also tries to wire remark/rehype
 * into Astro's top-level `markdown.processor`. Nimbus docs content is compiled
 * through the processor passed to `nimbus(..., { markdown.processor })`, which is
 * a separate instance — so we attach the same transforms here explicitly.
 */

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

type TreeNode = {
  type: string;
  lang?: string;
  value?: string;
  tagName?: string;
  children?: TreeNode[];
  properties?: Record<string, unknown>;
};

type TreeParent = {
  children: TreeNode[];
};

/** Remark: ```mermaid → raw <pre class="mermaid"> HTML node. */
export function remarkMermaid() {
  return (tree: TreeNode) => {
    visit(
      tree as never,
      "code",
      (node: TreeNode, index: number | undefined, parent: TreeParent | undefined) => {
        if (node.lang !== "mermaid" || parent == null || typeof index !== "number") {
          return;
        }

        parent.children[index] = {
          type: "html",
          value: `<pre class="mermaid">${escapeHtml(node.value ?? "")}</pre>`,
        };
      },
    );
  };
}

/** Rehype fallback: <pre><code class="language-mermaid"> → <pre class="mermaid">. */
export function rehypeMermaid() {
  return (tree: TreeNode) => {
    visit(tree as never, "element", (node: TreeNode) => {
      if (node.tagName !== "pre" || node.children?.length !== 1) {
        return;
      }

      const codeNode = node.children[0];
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
        .map((child) => (typeof child.value === "string" ? child.value : ""))
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
}
