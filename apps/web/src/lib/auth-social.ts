import { buildApiUrl } from "$lib/api/client";
import { localeHeaders } from "$lib/i18n";

function readRedirectUrl(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  if (typeof record.url === "string") {
    return record.url;
  }

  const data = record.data;
  if (
    data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>).url === "string"
  ) {
    return (data as Record<string, unknown>).url as string;
  }

  return null;
}

function readAuthError(body: unknown): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim().length > 0) {
      return record.message.trim();
    }
    const error = record.error;
    if (error && typeof error === "object") {
      const errorRecord = error as Record<string, unknown>;
      if (typeof errorRecord.message === "string" && errorRecord.message.trim().length > 0) {
        return errorRecord.message.trim();
      }
    }
  }

  return "GitHub authorization failed.";
}

export async function startGitHubSignIn(callbackURL: string): Promise<void> {
  const response = await fetch(buildApiUrl("/api/auth/sign-in/social"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...localeHeaders(),
    },
    body: JSON.stringify({
      provider: "github",
      callbackURL,
      scopes: ["read:user", "user:email"],
      disableRedirect: true,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readAuthError(body));
  }

  const redirectUrl = readRedirectUrl(body);
  if (!redirectUrl) {
    throw new Error("GitHub authorization did not return a redirect URL.");
  }

  window.location.assign(redirectUrl);
}
