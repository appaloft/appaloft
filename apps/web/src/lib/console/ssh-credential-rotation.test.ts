import { type SshCredentialDetail } from "@appaloft/contracts";
import { describe, expect, test } from "vitest";

import {
  isSshCredentialRotateConfirmationValid,
  resolveSshCredentialRotateReadiness,
} from "./ssh-credential-rotation";

const unusedCredentialDetail: SshCredentialDetail = {
  schemaVersion: "credentials.show/v1",
  credential: {
    id: "cred_primary",
    name: "primary",
    kind: "ssh-private-key",
    publicKeyConfigured: true,
    privateKeyConfigured: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  usage: {
    totalServers: 0,
    activeServers: 0,
    inactiveServers: 0,
    servers: [],
  },
  generatedAt: "2026-01-01T00:00:01.000Z",
};

describe("SSH credential rotate Web guard", () => {
  test("[SSH-CRED-ENTRY-014] enables rotate only after exact typed confirmation", () => {
    expect(isSshCredentialRotateConfirmationValid("cred_primary", "cred_primary")).toBe(true);
    expect(isSshCredentialRotateConfirmationValid("cred_primary", " cred_primary ")).toBe(true);
    expect(isSshCredentialRotateConfirmationValid("cred_primary", "primary")).toBe(false);
    expect(isSshCredentialRotateConfirmationValid("", "")).toBe(false);
  });

  test("[SSH-CRED-ENTRY-014] treats zero visible usage as ready without acknowledgement", () => {
    expect(
      resolveSshCredentialRotateReadiness({
        detail: unusedCredentialDetail,
        isPending: false,
        hasError: false,
        acknowledgedServerUsage: false,
      }),
    ).toEqual({ kind: "ready", requiresAcknowledgement: false });
  });

  test("[SSH-CRED-ENTRY-014] requires acknowledgement for nonzero visible usage", () => {
    const inUseDetail: SshCredentialDetail = {
      ...unusedCredentialDetail,
      usage: {
        totalServers: 2,
        activeServers: 1,
        inactiveServers: 1,
        servers: [],
      },
    };

    expect(
      resolveSshCredentialRotateReadiness({
        detail: inUseDetail,
        isPending: false,
        hasError: false,
        acknowledgedServerUsage: false,
      }),
    ).toEqual({
      kind: "requires-acknowledgement",
      totalServers: 2,
      activeServers: 1,
      inactiveServers: 1,
    });

    expect(
      resolveSshCredentialRotateReadiness({
        detail: inUseDetail,
        isPending: false,
        hasError: false,
        acknowledgedServerUsage: true,
      }),
    ).toEqual({ kind: "ready", requiresAcknowledgement: true });
  });

  test("[SSH-CRED-ENTRY-014] blocks unavailable usage reads", () => {
    expect(
      resolveSshCredentialRotateReadiness({
        detail: null,
        isPending: false,
        hasError: true,
        acknowledgedServerUsage: true,
      }),
    ).toEqual({ kind: "usage-unavailable" });
  });
});
