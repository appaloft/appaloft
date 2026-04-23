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

Run connectivity checks after rotating credentials so later deployments use the new credential.

Recommended flow:

1. Add the new credential.
2. Switch the server to the new credential.
3. Run connectivity test.
4. Confirm a new deployment can execute.
5. Remove the old credential.

Do not delete the old credential while the new connectivity test fails, or you may lose both deployment and recovery access.

Related page: [Register and test a server](/docs/en/servers/register-connect/).
