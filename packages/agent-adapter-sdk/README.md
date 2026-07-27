# `@appaloft/agent-adapter-sdk`

Public, package-neutral validation contract for `appaloft.agent-adapter/v1` declarative Agent
Adapters.

```ts
import { validateAgentAdapterManifest } from "@appaloft/agent-adapter-sdk";

const result = validateAgentAdapterManifest(manifest, {
  availableCapabilities: ["managed-terminal", "credential-grants"],
  sandboxTemplates: [
    {
      id: "node-agent",
      version: "22.4.1",
      digest: "sha256:...",
    },
  ],
  runtimes: [{ id: "codex", version: "0.82.0" }],
});

if (!result.ok) {
  console.error(result.issues);
} else {
  console.log(result.definition.digest);
}
```

Validation is side-effect free. It never runs a declared command, loads a module, downloads a
package, resolves a credential value, or creates a Sandbox.

Declarative commands are argv arrays whose executable must match a declared runtime requirement.
Shell interpreters and control-plane module entrypoints are rejected. Credentials are requirements
with process-scoped delivery metadata; manifest fields never contain secret values.

Bind an approved Profile or Workspace to named secret references before runtime effects:

```ts
import { resolveAgentAdapterCredentialBindings } from "@appaloft/agent-adapter-sdk";

const bindings = resolveAgentAdapterCredentialBindings(manifest, [
  {
    requirementId: "model-api",
    secretRef: "vault://agents/codex#model-api-key",
  },
]);
```

The resolver requires every required credential exactly once and rejects unknown, duplicate,
raw-value, or ambiguous stdin bindings. Its successful result contains reference and delivery
metadata only; resolving the referenced value remains a runtime grant concern.

Compile an immutable Workspace Profile only after the exact Adapter installation and Sandbox
Template are admitted:

```ts
import {
  compileAgentWorkspaceProfile,
  validateAgentWorkspaceProfile,
} from "@appaloft/agent-adapter-sdk";

const validated = validateAgentWorkspaceProfile(profile);
if (!validated.ok) {
  throw new Error("Invalid Workspace Profile");
}

const compiled = compileAgentWorkspaceProfile(validated.definition.manifest, {
  profileInstallationId: "awpi_profile",
  adapterInstallationId: "aai_adapter",
  adapterDefinition,
  availableCapabilities: ["managed-terminal", "headless", "credential-grants"],
  sandboxTemplates: [
    {
      id: "node-agent",
      version: "22.4.1",
      digest: "sha256:...",
    },
  ],
});
```

Compilation is side-effect free. A successful result contains bounded inputs for existing
Sandbox/Runtime/Port operations plus an immutable pin with exact Profile, Adapter, Sandbox
Template, Harness, and capability facts. A caller persists the pin when it creates the Runtime.

Returned digests cover normalized manifests using canonical object-key ordering. Array order remains
significant because command, initialization, port, and interaction ordering may be semantic.
