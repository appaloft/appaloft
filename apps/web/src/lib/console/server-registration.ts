import {
  type ConfigureServerCredentialInput,
  type QuickDeployServerCredential,
  type RegisterServerInput,
  type SshCredentialSummary,
  type SystemPluginWebExtension,
} from "@appaloft/contracts";

export type ServerCredentialKind = "local-ssh-agent" | "ssh-private-key";
export type ServerPrivateKeyInputMode = "saved" | "file" | "paste";
export const sshServerProviderKey = "generic-ssh";
export const defaultServerCredentialKindOptions = [
  "ssh-private-key",
  "local-ssh-agent",
] as const satisfies readonly ServerCredentialKind[];

export type ServerRegistrationDraft = {
  name: string;
  host: string;
  port: string;
  providerKey: string;
  targetKind: RegisterServerInput["targetKind"];
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

export function createServerRegistrationDraft(
  overrides: Partial<ServerRegistrationDraft> = {},
): ServerRegistrationDraft {
  const safeOverrides = { ...overrides };
  delete safeOverrides.providerKey;

  return {
    name: "local-machine",
    host: "127.0.0.1",
    port: "22",
    targetKind: "single-server",
    credentialKind: "ssh-private-key",
    credentialUsername: "",
    credentialPublicKey: "",
    credentialPrivateKey: "",
    selectedSshCredentialId: "",
    privateKeyInputMode: "paste",
    sshCredentialName: "",
    credentialPrivateKeyFileName: "",
    credentialPrivateKeyImportError: null,
    ...safeOverrides,
    providerKey: sshServerProviderKey,
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
    ? "paste"
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
    providerKey: sshServerProviderKey,
    targetKind: draft.targetKind,
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
      providerKey: sshServerProviderKey,
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
    Boolean(draft.host.trim()) &&
    Boolean(parseServerRegistrationPort(draft)) &&
    (draft.credentialKind === "local-ssh-agent" ||
      (activeServerPrivateKeyInputMode(draft, sshCredentials) === "saved" &&
        Boolean(draft.selectedSshCredentialId)) ||
      Boolean(draft.credentialPrivateKey.trim()))
  );
}

export function serverCredentialKindOptionsFromWebExtensions(
  extensions: readonly SystemPluginWebExtension[] = [],
): readonly ServerCredentialKind[] {
  for (const extension of extensions) {
    const options = readServerCredentialKindOptions(extension.metadata);
    if (options) {
      return options;
    }
  }

  return defaultServerCredentialKindOptions;
}

function readServerCredentialKindOptions(
  metadata: SystemPluginWebExtension["metadata"] | undefined,
): readonly ServerCredentialKind[] | null {
  const consoleRuntime = metadata?.consoleRuntime;

  if (!consoleRuntime || typeof consoleRuntime !== "object" || Array.isArray(consoleRuntime)) {
    return null;
  }

  const serverCredentialKinds = (consoleRuntime as Record<string, unknown>).serverCredentialKinds;
  if (!Array.isArray(serverCredentialKinds)) {
    return null;
  }

  const options = Array.from(new Set(serverCredentialKinds.filter(isServerCredentialKind)));
  return options.length > 0 ? options : null;
}

function isServerCredentialKind(value: unknown): value is ServerCredentialKind {
  return value === "ssh-private-key" || value === "local-ssh-agent";
}
