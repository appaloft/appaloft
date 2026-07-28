import { type SystemPluginWebExtension } from "@appaloft/contracts";
import { describe, expect, test } from "vitest";

import {
  createRegisterServerInput,
  createServerRegistrationDraft,
  defaultServerCredentialKindOptions,
  serverCredentialKindOptionsFromWebExtensions,
} from "./server-registration";

function extension(metadata?: SystemPluginWebExtension["metadata"]): SystemPluginWebExtension {
  return {
    key: "runtime-capabilities",
    pluginName: "runtime",
    pluginDisplayName: "Runtime",
    title: "Runtime",
    path: "/",
    placement: "navigation",
    target: "console-route",
    requiresAuth: false,
    ...(metadata ? { metadata } : {}),
  };
}

describe("server registration runtime options", () => {
  test("keeps local SSH agent available when runtime metadata is absent", () => {
    expect(serverCredentialKindOptionsFromWebExtensions([])).toEqual(
      defaultServerCredentialKindOptions,
    );
  });

  test("uses runtime-declared server credential kinds", () => {
    expect(
      serverCredentialKindOptionsFromWebExtensions([
        extension({
          consoleRuntime: {
            serverCredentialKinds: ["ssh-private-key"],
          },
        }),
      ]),
    ).toEqual(["ssh-private-key"]);
  });

  test("ignores invalid runtime credential metadata", () => {
    expect(
      serverCredentialKindOptionsFromWebExtensions([
        extension({
          consoleRuntime: {
            serverCredentialKinds: ["unsupported-kind"],
          },
        }),
      ]),
    ).toEqual(defaultServerCredentialKindOptions);
  });
});

describe("server registration workload roles", () => {
  test("SRV-ROLE-001 sends an empty role set for a general-purpose server", () => {
    expect(createRegisterServerInput(createServerRegistrationDraft())?.workloadRoles).toEqual([]);
  });

  test("SRV-ROLE-002 sends every selected role", () => {
    const input = createRegisterServerInput(
      createServerRegistrationDraft({
        workloadRoles: ["deployment-runtime", "artifact-builder"],
      }),
    );

    expect(input?.workloadRoles).toEqual(["deployment-runtime", "artifact-builder"]);
  });
});
