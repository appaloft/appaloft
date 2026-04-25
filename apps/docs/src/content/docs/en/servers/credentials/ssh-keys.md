---
title: "SSH credentials"
description: "Configure SSH keys, key paths, and secret masking rules."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "ssh"
  - "credential"
  - "private key"
relatedOperations:
  - servers.configure-credential
  - credentials.create-ssh
  - credentials.show
  - credentials.delete-ssh
  - credentials.rotate-ssh
sidebar:
  label: "SSH credentials"
  order: 3
---

<h2 id="server-ssh-credential-path">SSH credential</h2>

SSH credentials let Appaloft connect to servers and execute deployment plans. Credentials may be one-time inputs or saved reusable credentials.

Credentials are a security boundary. Web, CLI, API, logs, and diagnostics should not show plaintext private keys, passphrases, or tokens.

<h2 id="server-ssh-key-path">Key path</h2>

The CLI can read local key paths explicitly passed by the user. Web and API flows should prefer saved credentials or controlled secret inputs because remote entrypoints cannot assume access to local files.

Distinguish:

- Key path: local file path, appropriate for local CLI execution.
- Private key content: sensitive secret, never echoed after submit.
- Saved credential: reusable credential reference.

<h2 id="server-credential-validation">Credential validation</h2>

After creating or configuring credentials, verify with a connectivity check instead of only saving fields.

Validation should cover:

- Key parses.
- Passphrase is correct or needs interaction.
- User can log in.
- Server accepts the key.
- Appaloft can read required runtime information.

<h2 id="server-credential-rotation">Credential rotation</h2>

Saved reusable SSH credentials can be rotated in place. In-place rotation preserves the credential id and existing server references, and replaces the material used by later connectivity, deployment, and recovery operations. A successful rotation does not prove that the new key can reach the server; run a connectivity test after rotation.

Before rotating, Appaloft reads the same usage surface:

- `totalServers = 0`: rotation is allowed after typing the exact credential id.
- `totalServers > 0`: explicitly acknowledge that active or inactive servers using this credential will use the rotated material.
- Usage cannot be read: rotation is blocked. Retry or fix state visibility first.

The CLI reads the replacement private key from a local file:

```bash
appaloft server credential-rotate <credentialId> \
  --private-key-file ~/.ssh/appaloft-new \
  --confirm <credentialId> \
  --acknowledge-server-usage
```

You may omit `--acknowledge-server-usage` when usage is zero. The HTTP API uses the same command semantics:

```http
POST /api/credentials/ssh/{credentialId}/rotate
```

The Web console saved SSH credentials surface opens a rotation dialog. It rechecks usage, requires the exact credential id, and requires an acknowledgement when usage is nonzero. After rotation, run a connectivity test on affected servers before deploying.

If you want a new credential id instead of preserving the existing references, add a new credential, switch servers to it, run connectivity tests, and then delete the old credential.

<h2 id="server-credential-delete-unused">Delete an unused saved credential</h2>

Only a saved credential with no active or inactive server references can be deleted. Check credential detail and usage first:

- `totalServers = 0`: Web, CLI, or HTTP API deletion is allowed.
- `totalServers > 0`: deletion is rejected with `credential_in_use`; switch or remove the servers that reference it first.
- Usage cannot be read: this is not zero usage, and deletion is rejected. Retry or fix state visibility first.

CLI deletion requires typed confirmation:

```bash
appaloft server credential-delete <credentialId> --confirm <credentialId>
```

HTTP API uses the same command semantics:

```http
DELETE /api/credentials/ssh/{credentialId}
```

The Web console saved SSH credentials surface opens a destructive confirmation dialog. It rechecks usage, disables delete when usage is unavailable or nonzero, and requires typing the exact credential id before dispatching the delete command.

Related page: [Register and test a server](/docs/en/servers/register-connect/).
