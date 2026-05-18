import { type BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { appaloftVersion, withDocsBase } from "@/lib/config";

type Locale = "zh-CN" | "en-US";

export function baseOptions(locale: Locale): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="appaloft-docs-title">
          <span>Appaloft Docs</span>
          <span className="appaloft-version-badge">v{appaloftVersion}</span>
        </span>
      ),
    },
    links: [
      {
        text: locale === "en-US" ? "中文" : "English",
        url: locale === "en-US" ? withDocsBase("/") : withDocsBase("en"),
      },
      {
        text: "GitHub",
        url: "https://github.com/appaloft/appaloft",
        external: true,
      },
    ],
  };
}
