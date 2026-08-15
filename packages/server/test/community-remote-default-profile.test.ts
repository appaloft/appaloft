import { describe, expect, test } from "bun:test";

import { createCommunityRemoteDefaultProfile } from "../src/community-remote-default-profile";

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
            "resources_show",
            "deployments_create",
            "deployments_show",
          ],
        },
      ],
    });
    expect(profile?.profileManifest).toMatchObject({
      id: "appaloft-remote",
      harnessTemplateId: "aht_opencode_managed_v1",
      sandbox: {
        networkPolicy: {
          mode: "allowlist",
          rules: expect.arrayContaining([
            { kind: "domain", value: "github.com", ports: [443] },
            { kind: "domain", value: "api.openai.com", ports: [443] },
            { kind: "domain", value: "api.anthropic.com", ports: [443] },
            { kind: "domain", value: "opencode.ai", ports: [443] },
          ]),
        },
      },
    });
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
