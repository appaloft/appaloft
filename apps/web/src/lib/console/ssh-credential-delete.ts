import { type SshCredentialDetail } from "@appaloft/contracts";

export type SshCredentialDeleteReadiness =
  | { kind: "loading" }
  | { kind: "usage-unavailable" }
  | { kind: "in-use"; totalServers: number; activeServers: number; inactiveServers: number }
  | { kind: "ready" };

export function isSshCredentialDeleteConfirmationValid(
  credentialId: string,
  confirmation: string,
): boolean {
  return credentialId.length > 0 && confirmation.trim() === credentialId;
}

export function resolveSshCredentialDeleteReadiness(input: {
  detail: SshCredentialDetail | null | undefined;
  isPending: boolean;
  hasError: boolean;
}): SshCredentialDeleteReadiness {
  if (input.isPending) {
    return { kind: "loading" };
  }

  if (input.hasError || !input.detail?.usage) {
    return { kind: "usage-unavailable" };
  }

  if (input.detail.usage.totalServers > 0) {
    return {
      kind: "in-use",
      totalServers: input.detail.usage.totalServers,
      activeServers: input.detail.usage.activeServers,
      inactiveServers: input.detail.usage.inactiveServers,
    };
  }

  return { kind: "ready" };
}
