import { describe, expect, test } from "bun:test";

import {
  deployLoginRequiredError,
  hasCliControlPlaneLogin,
  hasExplicitLocalDeployIntent,
  isHeadlessWorkspaceInvocation,
  loginRequiredWorkspaceOccupancyTree,
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
