"use client";

import { RootProvider } from "fumadocs-ui/provider/next";
import { type ReactNode } from "react";
import { DocsLocalePreference } from "@/components/docs-locale-preference";
import SearchDialog from "@/components/search";

export function Provider({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      search={{
        SearchDialog,
      }}
    >
      <DocsLocalePreference />
      {children}
    </RootProvider>
  );
}
