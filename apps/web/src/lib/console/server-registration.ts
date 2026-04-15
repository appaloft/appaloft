import {
  type ConfigureServerCredentialInput,
  type QuickDeployServerCredential,
  type RegisterServerInput,
  type SshCredentialSummary,
} from "@yundu/contracts";

import { type ProviderSummary } from "$lib/console/queries";

export type ServerCredentialKind = "local-ssh-agent" | "ssh-private-key";
export type ServerPrivateKeyInputMode = "saved" | "file" | "paste";

export type ServerRegistrationDraft = {
  name: string;
  host: string;
  port: string;
  providerKey: string;
  credentialKind: ServerCredentialKind;
  credentialUsername: string;
  credentialPublicKey: string;
  credentialPrivateKey: string;
  selectedSshCredentialId: string;
  privateKeyInputMode: ServerPrivateKeyInputMode;
  sshCredentialName: string;
  credentialPrivateKeyFileName: string;
  credentialPrivateKeyImportError: string | null;
};

export type DraftServerConnectivityInput = {
  server: {
    name?: string;
    host: string;
    providerKey: string;
    port?: number;
    credential?: ConfigureServerCredentialInput["credential"];
  };
};

export const fallbackServerProviderOptions: ProviderSummary[] = [
  {
    key: "local-shell",
    title: "Local Shell",
    category: "deploy-target",
    capabilities: ["local-command", "docker-host", "docker-compose", "single-server"],
  },
  {
    key: "generic-ssh",
    title: "Generic SSH",
    category: "deploy-target",
    capabilities: ["ssh", "single-server"],
  },
];

export function createServerRegistrationDraft(
  overrides: Partial<ServerRegistrationDraft> = {},
): ServerRegistrationDraft {
  return {
    name: "local-machine",
    host: "127.0.0.1",
    port: "22",
    providerKey: "local-shell",
    credentialKind: "local-ssh-agent",
    credentialUsername: "",
    credentialPublicKey: "",
    credentialPrivateKey: "",
    selectedSshCredentialId: "",
    privateKeyInputMode: "file",
    sshCredentialName: "",
    credentialPrivateKeyFileName: "",
    credentialPrivateKeyImportError: null,
    ...overrides,
  };
}

export function parseServerRegistrationPort(draft: ServerRegistrationDraft): number | null {
  const port = Number(draft.port.trim() || "22");

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return null;
  }

  return port;
}

export function activeServerPrivateKeyInputMode(
  draft: ServerRegistrationDraft,
  sshCredentials: SshCredentialSummary[],
): ServerPrivateKeyInputMode {
  return draft.privateKeyInputMode === "saved" && sshCredentials.length === 0
    ? "file"
    : draft.privateKeyInputMode;
}

export function defaultSshCredentialName(draft: ServerRegistrationDraft): string {
  return (
    draft.sshCredentialName.trim() ||
    draft.credentialPrivateKeyFileName ||
    `${draft.name.trim() || draft.host.trim() || "server"} SSH key`
  );
}

export function createDraftServerCredential(
  draft: ServerRegistrationDraft,
  sshCredentials: SshCredentialSummary[],
): ConfigureServerCredentialInput["credential"] | undefined {
  if (draft.providerKey !== "generic-ssh") {
    return undefined;
  }

  const username = draft.credentialUsername.trim();

  if (draft.credentialKind === "local-ssh-agent") {
    return {
      kind: "local-ssh-agent",
      ...(username ? { username } : {}),
    };
  }

  if (
    activeServerPrivateKeyInputMode(draft, sshCredentials) === "saved" &&
    draft.selectedSshCredentialId
  ) {
    return {
      kind: "stored-ssh-private-key",
      credentialId: draft.selectedSshCredentialId,
      ...(username ? { username } : {}),
    };
  }

  if (!draft.credentialPrivateKey.trim()) {
    return undefined;
  }

  return {
    kind: "ssh-private-key",
    ...(username ? { username } : {}),
    ...(draft.credentialPublicKey.trim() ? { publicKey: draft.credentialPublicKey.trim() } : {}),
    privateKey: draft.credentialPrivateKey.trim(),
  };
}

export function createQuickDeployServerCredential(
  draft: ServerRegistrationDraft,
  sshCredentials: SshCredentialSummary[],
): QuickDeployServerCredential | undefined {
  if (draft.providerKey !== "generic-ssh") {
    return undefined;
  }

  const username = draft.credentialUsername.trim();

  if (draft.credentialKind === "local-ssh-agent") {
    return {
      mode: "configure",
      credential: {
        kind: "local-ssh-agent",
        ...(username ? { username } : {}),
      },
    };
  }

  if (
    activeServerPrivateKeyInputMode(draft, sshCredentials) === "saved" &&
    draft.selectedSshCredentialId
  ) {
    return {
      mode: "configure",
      credential: {
        kind: "stored-ssh-private-key",
        credentialId: draft.selectedSshCredentialId,
        ...(username ? { username } : {}),
      },
    };
  }

  if (!draft.credentialPrivateKey.trim()) {
    return undefined;
  }

  return {
    mode: "create-ssh-and-configure",
    input: {
      name: defaultSshCredentialName(draft),
      kind: "ssh-private-key",
      ...(username ? { username } : {}),
      ...(draft.credentialPublicKey.trim() ? { publicKey: draft.credentialPublicKey.trim() } : {}),
      privateKey: draft.credentialPrivateKey.trim(),
    },
  };
}

export function createRegisterServerInput(
  draft: ServerRegistrationDraft,
): RegisterServerInput | null {
  const name = draft.name.trim();
  const host = draft.host.trim();
  const port = parseServerRegistrationPort(draft);

  if (!name || !host || !port) {
    return null;
  }

  return {
    name,
    host,
    providerKey: draft.providerKey,
    proxyKind: "traefik",
    port,
  };
}

export function createDraftServerConnectivityInput(
  draft: ServerRegistrationDraft,
  sshCredentials: SshCredentialSummary[],
): DraftServerConnectivityInput | null {
  const host = draft.host.trim();
  const port = parseServerRegistrationPort(draft);

  if (!host || !port) {
    return null;
  }

  const credential = createDraftServerCredential(draft, sshCredentials);

  return {
    server: {
      name: draft.name.trim() || host,
      host,
      providerKey: draft.providerKey,
      port,
      ...(credential ? { credential } : {}),
    },
  };
}

export function isServerRegistrationDraftComplete(
  draft: ServerRegistrationDraft,
  sshCredentials: SshCredentialSummary[],
): boolean {
  if (!draft.name.trim() || !draft.host.trim() || !parseServerRegistrationPort(draft)) {
    return false;
  }

  if (draft.providerKey !== "generic-ssh") {
    return true;
  }

  return (
    draft.credentialKind === "local-ssh-agent" ||
    (activeServerPrivateKeyInputMode(draft, sshCredentials) === "saved" &&
      Boolean(draft.selectedSshCredentialId)) ||
    Boolean(draft.credentialPrivateKey.trim())
  );
}

export function canTestServerRegistrationDraft(
  draft: ServerRegistrationDraft,
  sshCredentials: SshCredentialSummary[],
): boolean {
  return (
    draft.providerKey === "generic-ssh" &&
    Boolean(draft.host.trim()) &&
    Boolean(parseServerRegistrationPort(draft)) &&
    (draft.credentialKind === "local-ssh-agent" ||
      (activeServerPrivateKeyInputMode(draft, sshCredentials) === "saved" &&
        Boolean(draft.selectedSshCredentialId)) ||
      Boolean(draft.credentialPrivateKey.trim()))
  );
}
