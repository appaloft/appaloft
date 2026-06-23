import { type Metadata } from "next";
import { type ReactNode } from "react";
import { Provider } from "@/components/provider";
import { docsSite, withDocsBase } from "@/lib/config";
import "./global.css";

export const metadata: Metadata = {
  metadataBase: new URL(docsSite),
  title: {
    default: "Appaloft Docs",
    template: "%s | Appaloft Docs",
  },
  description: "Task-oriented Appaloft documentation for CLI, HTTP API, and Web console users.",
  icons: {
    icon: [{ url: withDocsBase("favicon.svg"), type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
