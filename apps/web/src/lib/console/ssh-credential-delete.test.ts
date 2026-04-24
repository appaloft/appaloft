import { type SshCredentialDetail } from "@appaloft/contracts";
import { describe, expect, test } from "vitest";

import {
  isSshCredentialDeleteConfirmationValid,
  resolveSshCredentialDeleteReadiness,
} from "./ssh-credential-delete";

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

describe("SSH credential delete Web guard", () => {
  test("[SSH-CRED-ENTRY-009] enables destructive delete only after exact typed confirmation", () => {
    expect(isSshCredentialDeleteConfirmationValid("cred_primary", "cred_primary")).toBe(true);
    expect(isSshCredentialDeleteConfirmationValid("cred_primary", " cred_primary ")).toBe(true);
    expect(isSshCredentialDeleteConfirmationValid("cred_primary", "primary")).toBe(false);
    expect(isSshCredentialDeleteConfirmationValid("", "")).toBe(false);
  });

  test("[SSH-CRED-ENTRY-009] treats zero visible usage as ready", () => {
    expect(
      resolveSshCredentialDeleteReadiness({
        detail: unusedCredentialDetail,
        isPending: false,
        hasError: false,
      }),
    ).toEqual({ kind: "ready" });
  });

  test("[SSH-CRED-ENTRY-009] blocks visible usage and unavailable usage reads", () => {
    expect(
      resolveSshCredentialDeleteReadiness({
        detail: {
          ...unusedCredentialDetail,
          usage: {
            totalServers: 2,
            activeServers: 1,
            inactiveServers: 1,
            servers: [],
          },
        },
        isPending: false,
        hasError: false,
      }),
    ).toEqual({
      kind: "in-use",
      totalServers: 2,
      activeServers: 1,
      inactiveServers: 1,
    });

    expect(
      resolveSshCredentialDeleteReadiness({
        detail: null,
        isPending: false,
        hasError: true,
      }),
    ).toEqual({ kind: "usage-unavailable" });
  });
});
