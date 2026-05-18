import { createMDX } from "fumadocs-mdx/next";

const docsBase = normalizeDocsBase(process.env.APPALOFT_DOCS_BASE);
const docsSite = normalizeDocsSite(process.env.APPALOFT_DOCS_SITE);

function normalizeDocsBase(value) {
  const trimmed = value?.trim() || "/docs";
  if (trimmed === "/") return "/";

  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function normalizeDocsSite(value) {
  return (value?.trim() || "https://appaloft.dev").replace(/\/+$/, "");
}

/** @type {import("next").NextConfig} */
const config = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  images: {
    unoptimized: true,
  },
  env: {
    APPALOFT_DOCS_BASE: docsBase,
    APPALOFT_DOCS_SITE: docsSite,
    NEXT_PUBLIC_APPALOFT_DOCS_BASE: docsBase,
  },
  ...(docsBase === "/" ? {} : { assetPrefix: docsBase }),
};

export default createMDX()(config);
