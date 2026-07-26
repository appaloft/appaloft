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

The returned digest covers the normalized manifest using canonical object-key ordering. Array order
remains significant because command and interaction ordering may be semantic.
