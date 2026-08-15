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
            "resources_list",
            "resources_show",
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

  test("[WS-REMOTE-PROFILE-008] builds terminal appaloft-remote for Pi", () => {
    const profile = createCommunityRemoteDefaultProfile({
      harnessKey: "pi",
      templateId: "aht_pi_managed_v1",
      sandboxTemplateId: "tpl_pi",
      version: "1.0.0",
      templateDigest: `sha256:${"b".repeat(64)}`,
    });

    expect(profile).toBeDefined();
    expect(profile?.adapterManifest).toMatchObject({
      id: "appaloft-remote",
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
  });
});
