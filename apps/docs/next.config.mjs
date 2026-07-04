import { createMDX } from "fumadocs-mdx/next";

const docsBase = normalizeDocsBase(process.env.APPALOFT_DOCS_BASE);
const docsSite = normalizeDocsSite(process.env.APPALOFT_DOCS_SITE);
const localeCookieDomain =
  process.env.NEXT_PUBLIC_APPALOFT_LOCALE_COOKIE_DOMAIN ||
  process.env.PUBLIC_APPALOFT_LOCALE_COOKIE_DOMAIN ||
  process.env.APPALOFT_LOCALE_COOKIE_DOMAIN ||
  "";

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
    NEXT_PUBLIC_APPALOFT_LOCALE_COOKIE_DOMAIN: localeCookieDomain,
  },
  ...(docsBase === "/" ? {} : { assetPrefix: docsBase }),
};

export default createMDX()(config);
