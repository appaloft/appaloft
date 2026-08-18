import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY,
  createCommunityRemoteDefaultProfile,
} from "../src/community-remote-default-profile";

describe("community remote default profile", () => {
  test("[WS-REMOTE-PROFILE-008] builds appaloft-remote for OpenCode", () => {
    const profile = createCommunityRemoteDefaultProfile({
      harnessKey: "opencode",
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "tpl_opencode",
      version: "1.0.0",
      templateDigest: `sha256:${"a".repeat(64)}`,
      interaction: {
        transport: "native-attach",
        command: ["opencode", "attach", "http://127.0.0.1:4096"],
        sessionRecovery: "native-session-store",
        serverPort: 4096,
      },
    });

    expect(profile).toBeDefined();
    expect(profile?.adapterManifest).toMatchObject({
      id: "appaloft-remote",
      requirements: {
        capabilities: { required: ["native-attach"], optional: ["headless"] },
      },
      credentials: [
        {
          id: "model-api",
          kind: "model-api",
          required: false,
          purpose: "Brokered or personal model access",
          delivery: { kind: "stdin" },
        },
      ],
      mcpServers: [
        {
          id: "appaloft-tools",
          required: false,
          requestedTools: [
            "projects_list",
            "environments_list",
            "environments_create",
            "environments_show",
            "environments_set_variable",
            "environments_unset_variable",
            "environments_effective_precedence",
            "resources_list",
            "resources_show",
            "resources_runtime_logs",
            "resources_health",
            "resources_effective_config",
            "resources_diagnostic_summary",
            "resources_create",
            "resources_configure_source",
            "resources_configure_runtime",
            "resources_configure_network",
            "resources_configure_access",
            "servers_list",
            "deployments_list",
            "deployments_plan",
            "deployments_create",
            "deployments_show",
            "deployments_proof",
            "deployments_timeline",
            "preview_environments_list",
            "preview_environments_show",
            "sandbox_ports_expose",
            "sandboxes_agent_tasks_deliver",
          ],
        },
      ],
    });
    expect(profile?.profileManifest).toMatchObject({
      id: "appaloft-remote",
      harnessTemplateId: "aht_opencode_managed_v1",
      sandbox: {
        networkPolicy: COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY,
      },
    });
    expect(COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY.rules.map((rule) => rule.value)).toEqual([
      "github.com",
      "api.github.com",
      "api.openai.com",
      "api.anthropic.com",
      "openrouter.ai",
      "api.deepseek.com",
      "api.x.ai",
      "opencode.ai",
    ]);
  });

  test("[WS-REMOTE-HARNESS-175] builds terminal appaloft-remote-pi for Pi", () => {
    const profile = createCommunityRemoteDefaultProfile({
      harnessKey: "pi",
      templateId: "aht_pi_managed_v1",
      sandboxTemplateId: "tpl_pi",
      version: "1.0.0",
      templateDigest: `sha256:${"b".repeat(64)}`,
      interaction: {
        transport: "managed-terminal",
        command: ["pi"],
        sessionRecovery: "managed-run-lineage",
      },
    });

    expect(profile).toBeDefined();
    expect(profile?.adapterManifest).toMatchObject({
      id: "appaloft-remote-pi",
      displayName: "Appaloft Remote pi",
      requirements: {
        capabilities: { required: ["managed-terminal"], optional: ["headless"] },
      },
      credentials: [
        {
          id: "model-api",
          kind: "model-api",
          required: false,
        },
      ],
      mcpServers: [
        {
          id: "appaloft-tools",
          required: false,
        },
      ],
    });
    expect(profile?.profileManifest).toMatchObject({
      id: "appaloft-remote-pi",
      displayName: "Appaloft Remote pi",
    });
  });

  test("[WS-REMOTE-HARNESS-175] builds terminal appaloft-remote-omp from harness interaction", () => {
    const profile = createCommunityRemoteDefaultProfile({
      harnessKey: "omp",
      templateId: "aht_omp_managed_v1",
      sandboxTemplateId: "tpl_pi",
      version: "1.0.0",
      templateDigest: `sha256:${"c".repeat(64)}`,
      interaction: {
        transport: "managed-terminal",
        command: ["omp"],
        sessionRecovery: "managed-run-lineage",
      },
    });

    expect(profile?.adapterManifest).toMatchObject({
      id: "appaloft-remote-omp",
      displayName: "Appaloft Remote omp",
      requirements: {
        capabilities: { required: ["managed-terminal"], optional: ["headless"] },
      },
    });
  });
});
