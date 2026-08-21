import { describe, expect, test } from "bun:test";

import { ok } from "@appaloft/core";

import {
  deployLoginRequiredError,
  ensureDeployControlPlaneLogin,
  hasCliControlPlaneLogin,
  hasExplicitLocalDeployIntent,
  isHeadlessWorkspaceInvocation,
  loginRequiredWorkspaceOccupancyTree,
  requiresCloudDeployLogin,
  workspaceRemoteLoginRequiredError,
} from "../src/cli-session-login.js";
import { rewriteCliAuthVerificationUri } from "../src/control-plane-profile.js";

describe("CLI session login gates", () => {
  test("[WS-REMOTE-LOGIN-001] env token counts as login", async () => {
    expect(await hasCliControlPlaneLogin({ APPALOFT_TOKEN: "tok_test" })).toBe(true);
    expect(
      await hasCliControlPlaneLogin({}, async () => ({ auth: { kind: "bearer", token: "tok" } })),
    ).toBe(true);
    expect(await hasCliControlPlaneLogin({}, async () => null)).toBe(false);
  });

  test("[WS-REMOTE-LOGIN-001][WS-REMOTE-DEPLOY-057] login-required errors name Run appaloft login", () => {
    expect(workspaceRemoteLoginRequiredError()).toMatchObject({
      code: "workspace_remote_login_required",
      details: { guidance: expect.stringContaining("Run appaloft login") },
    });
    expect(deployLoginRequiredError()).toMatchObject({
      code: "product_auth_missing",
      details: { guidance: expect.stringContaining("Run appaloft login") },
    });
    expect(loginRequiredWorkspaceOccupancyTree("non-interactive-terminal")).toMatchObject({
      status: "login-required",
      nextAction: "Run appaloft login",
      servers: [],
    });
  });

  test("[DEPLOY-DOOR-LOGIN-001] unauthenticated deploy starts the existing login instead of a separate command", async () => {
    const status: string[] = [];
    let loginCalls = 0;
    const folded = await ensureDeployControlPlaneLogin({
      env: {},
      readActiveProfile: async () => null,
      login: async () => {
        loginCalls += 1;
        return ok({
          name: "cloud",
          mode: "cloud",
          baseUrl: "https://app.appaloft.com",
          active: true,
          auth: { kind: "bearer", redacted: "***" },
        });
      },
      writeStatus: (text) => {
        status.push(text);
      },
    });
    expect(folded.isOk()).toBe(true);
    expect(folded._unsafeUnwrap().folded).toBe(true);
    expect(loginCalls).toBe(1);
    expect(status.join("")).toContain("Signing in");
    expect(status.join("")).not.toContain("Run appaloft login");
  });

  test("[DEPLOY-DOOR-LOGIN-002] agent-env deploy without --yes does not start login", async () => {
    let loginCalls = 0;
    const blocked = await ensureDeployControlPlaneLogin({
      env: { CURSOR_AGENT: "1" },
      readActiveProfile: async () => null,
      login: async () => {
        loginCalls += 1;
        return ok({
          name: "cloud",
          mode: "cloud",
          baseUrl: "https://app.appaloft.com",
          active: true,
          auth: { kind: "bearer", redacted: "***" },
        });
      },
    });
    expect(blocked.isErr()).toBe(true);
    expect(blocked._unsafeUnwrapErr().code).toBe("cli_mutation_confirmation_required");
    expect(blocked._unsafeUnwrapErr().message).not.toContain("Run appaloft login");
    expect(loginCalls).toBe(0);
  });

  test("headless workspace and explicit local deploy intent", () => {
    expect(
      isHeadlessWorkspaceInvocation(["workspace", "--json"], { isTTY: true }, { isTTY: true }),
    ).toBe(true);
    expect(isHeadlessWorkspaceInvocation(["workspace"], { isTTY: false }, { isTTY: false })).toBe(
      true,
    );
    expect(isHeadlessWorkspaceInvocation(["workspace"], { isTTY: true }, { isTTY: true })).toBe(
      false,
    );
    expect(
      isHeadlessWorkspaceInvocation(["workspace", "open"], { isTTY: false }, { isTTY: false }),
    ).toBe(false);
    expect(hasExplicitLocalDeployIntent(["deploy", "--server-host", "1.2.3.4"])).toBe(true);
    expect(hasExplicitLocalDeployIntent(["deploy"])).toBe(false);
    expect(requiresCloudDeployLogin(["deploy"], { APPALOFT_CONTROL_PLANE_MODE: "none" })).toBe(
      false,
    );
    expect(requiresCloudDeployLogin(["deploy"], { APPALOFT_CONTROL_PLANE_MODE: "cloud" })).toBe(
      true,
    );
    expect(
      requiresCloudDeployLogin(["deploy"], {
        APPALOFT_CONTROL_PLANE_URL: "https://app.appaloft.com",
      }),
    ).toBe(true);
    expect(requiresCloudDeployLogin(["deploy"], {})).toBe(false);
    expect(
      requiresCloudDeployLogin(["deploy", "--server-host", "1.2.3.4"], {
        APPALOFT_CONTROL_PLANE_MODE: "cloud",
      }),
    ).toBe(false);
  });

  test("[CONTROL-PLANE-CLI-012] default Cloud http authorize URL becomes https", () => {
    expect(
      rewriteCliAuthVerificationUri(
        "http://app.appaloft.com/cli-auth/authorize?user_code=ABCD-EFGH",
        "https://app.appaloft.com",
      ),
    ).toBe("https://app.appaloft.com/cli-auth/authorize?user_code=ABCD-EFGH");
    expect(
      rewriteCliAuthVerificationUri(
        "http://10.0.0.8:8787/cli-auth/authorize?user_code=ABCD-EFGH",
        "http://10.0.0.8:8787",
      ),
    ).toBe("http://10.0.0.8:8787/cli-auth/authorize?user_code=ABCD-EFGH");
    expect(
      rewriteCliAuthVerificationUri(
        "http://app.appaloft.com/cli-auth/authorize?user_code=ABCD-EFGH",
        "http://app.appaloft.com",
      ),
    ).toBe("http://app.appaloft.com/cli-auth/authorize?user_code=ABCD-EFGH");
  });
});
