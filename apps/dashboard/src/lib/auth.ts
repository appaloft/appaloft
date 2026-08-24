export function safeDashboardReturnPath(input?: string): string {
  const value = input?.trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/projects";

  try {
    const base = new URL("http://dashboard.appaloft.local");
    const resolved = new URL(value, base);
    return resolved.origin === base.origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : "/projects";
  } catch {
    return "/projects";
  }
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "The authentication request could not be completed.";
}
