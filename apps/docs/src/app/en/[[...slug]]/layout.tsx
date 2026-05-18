import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { type ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { docsTree } from "@/lib/navigation";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout {...baseOptions("en-US")} tree={docsTree("en-US")}>
      {children}
    </DocsLayout>
  );
}
