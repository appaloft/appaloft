import { type SshCredentialDetail } from "@appaloft/contracts";

export type SshCredentialRotateReadiness =
  | { kind: "loading" }
  | { kind: "usage-unavailable" }
  | {
      kind: "requires-acknowledgement";
      totalServers: number;
      activeServers: number;
      inactiveServers: number;
    }
  | { kind: "ready"; requiresAcknowledgement: boolean };

export function isSshCredentialRotateConfirmationValid(
  credentialId: string,
  confirmation: string,
): boolean {
  return credentialId.length > 0 && confirmation.trim() === credentialId;
}

export function resolveSshCredentialRotateReadiness(input: {
  detail: SshCredentialDetail | null | undefined;
  isPending: boolean;
  hasError: boolean;
  acknowledgedServerUsage: boolean;
}): SshCredentialRotateReadiness {
  if (input.isPending) {
    return { kind: "loading" };
  }

  if (input.hasError || !input.detail?.usage) {
    return { kind: "usage-unavailable" };
  }

  if (input.detail.usage.totalServers > 0 && !input.acknowledgedServerUsage) {
    return {
      kind: "requires-acknowledgement",
      totalServers: input.detail.usage.totalServers,
      activeServers: input.detail.usage.activeServers,
      inactiveServers: input.detail.usage.inactiveServers,
    };
  }

  return {
    kind: "ready",
    requiresAcknowledgement: input.detail.usage.totalServers > 0,
  };
}
