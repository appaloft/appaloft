const privateKeyPattern =
  /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi;
const authorizationHeaderPattern =
  /\bAuthorization\s*:\s*(?:Bearer|Basic|Token)?\s*[A-Za-z0-9._~+/=-]+/gi;
const cookieHeaderPattern = /\b(?:Cookie|Set-Cookie)\s*:\s*[^,\n\r]+/gi;
const apiKeyHeaderPattern = /\b(?:X-Api-Key|Api-Key)\s*:\s*\S+/gi;
const providerRawPayloadPattern = /\bprovider\s+(?:native\s+)?raw\s+payload\b/gi;
const urlCredentialPattern = /\b([a-z][a-z0-9+.-]*:\/\/)([^:@/\s]+):([^@/\s]+)@/gi;
const sensitiveQueryPattern =
  /([?&](?:access_token|auth|authorization|cookie|key|password|secret|sig|signature|token|api_key)=)[^&\s]+/gi;

function replaceAllText(value: string, search: string, replacement: string): string {
  return value.split(search).join(replacement);
}

function redactKnownValues(
  value: string,
  redactions: readonly string[],
): {
  value: string;
  masked: boolean;
} {
  let nextValue = value;
  let masked = false;

  for (const redaction of redactions) {
    if (!redaction || !nextValue.includes(redaction)) {
      continue;
    }

    nextValue = replaceAllText(nextValue, redaction, "********");
    masked = true;
  }

  return {
    value: nextValue,
    masked,
  };
}

export function sanitizeFailureMessage(
  value: string,
  redactions: readonly string[] = [],
): {
  value: string;
  masked: boolean;
} {
  const known = redactKnownValues(value, redactions);
  let nextValue = known.value;
  let masked = known.masked;

  const firstLine = nextValue.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine !== nextValue) {
    nextValue = `${firstLine} [redacted-remote-output]`;
    masked = true;
  }

  const replacements: Array<[RegExp, string]> = [
    [privateKeyPattern, "[redacted-private-key]"],
    [authorizationHeaderPattern, "[redacted-header]"],
    [cookieHeaderPattern, "[redacted-header]"],
    [apiKeyHeaderPattern, "[redacted-header]"],
    [providerRawPayloadPattern, "[redacted-provider-payload]"],
    [urlCredentialPattern, "$1[redacted]@"],
    [sensitiveQueryPattern, "$1[redacted]"],
  ];

  for (const [pattern, replacement] of replacements) {
    const replaced = nextValue.replace(pattern, replacement);
    if (replaced !== nextValue) {
      nextValue = replaced;
      masked = true;
    }
  }

  if (nextValue.length > 500) {
    nextValue = `${nextValue.slice(0, 500)} [truncated]`;
    masked = true;
  }

  return {
    value: nextValue,
    masked,
  };
}
