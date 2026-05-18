import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { type ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { docsTree } from "@/lib/navigation";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout {...baseOptions("zh-CN")} tree={docsTree("zh-CN")}>
      {children}
    </DocsLayout>
  );
}
