/**
 * Chinese docs are the unprefixed default (`/`, `/agents/overview`). English
 * is `/en/*`. www.appaloft.com uses `/zh-CN/*`, and some crawlers also try
 * `/zh/*`. Those prefixes must 308 onto the existing Chinese tree — they
 * are aliases, not a second locale collection.
 */
export const chineseDocsLocalePathAliases = ["zh-CN", "zh"] as const;

export const chineseDocsLocaleAliasRedirectStatus = 308 as const;

export function stripChineseLocaleAliasPrefix(localPath: string): string {
  const normalized = normalizeLocalPath(localPath);

  for (const alias of chineseDocsLocalePathAliases) {
    const prefix = `/${alias}`;

    if (normalized === prefix) {
      return "/";
    }

    if (normalized.startsWith(`${prefix}/`)) {
      return normalizeLocalPath(normalized.slice(prefix.length));
    }
  }

  return normalized;
}

export function astroChineseLocaleAliasRedirects(): Record<
  string,
  { status: typeof chineseDocsLocaleAliasRedirectStatus; destination: string }
> {
  const redirects: Record<
    string,
    { status: typeof chineseDocsLocaleAliasRedirectStatus; destination: string }
  > = {};

  for (const alias of chineseDocsLocalePathAliases) {
    redirects[`/${alias}`] = {
      status: chineseDocsLocaleAliasRedirectStatus,
      destination: "/",
    };
    redirects[`/${alias}/[...slug]`] = {
      status: chineseDocsLocaleAliasRedirectStatus,
      destination: "/[...slug]",
    };
  }

  return redirects;
}

export function cloudflareChineseLocaleAliasRedirects(): string {
  const lines = [
    "# Chinese locale aliases for docs.appaloft.com.",
    "# Default Chinese docs are unprefixed; do not add a second Chinese tree.",
  ];

  for (const alias of chineseDocsLocalePathAliases) {
    lines.push(`/${alias} / ${chineseDocsLocaleAliasRedirectStatus}`);
    lines.push(`/${alias}/ / ${chineseDocsLocaleAliasRedirectStatus}`);
    lines.push(`/${alias}/* /:splat ${chineseDocsLocaleAliasRedirectStatus}`);
  }

  return `${lines.join("\n")}\n`;
}

function normalizeLocalPath(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return `/${pathname.replace(/^\/+/, "")}`;
}
