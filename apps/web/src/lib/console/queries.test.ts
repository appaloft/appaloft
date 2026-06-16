import { readFile } from "node:fs/promises";
import { type AuthSessionResponse } from "@appaloft/contracts";
import { describe, expect, test } from "vitest";

import { canRunProductQueries } from "./auth-query-gate";

function authSession(
  input: Pick<AuthSessionResponse, "loginRequired" | "session">,
): AuthSessionResponse {
  return {
    accountSecurity: {
      enabled: true,
      passwordState: "unknown",
    },
    accountRecovery: {
      enabled: false,
    },
    enabled: true,
    emailVerification: {
      enabled: false,
      otpEnabled: false,
      required: false,
    },
    provider: "better-auth",
    loginRequired: input.loginRequired,
    deferredAuth: false,
    session: input.session,
    providers: [],
  };
}

describe("canRunProductQueries", () => {
  test("waits for the auth session before product queries run", () => {
    expect.assertions(1);

    expect(canRunProductQueries(undefined)).toBe(false);
  });

  test("blocks product queries when login is required and no session exists", () => {
    expect.assertions(1);

    expect(canRunProductQueries(authSession({ loginRequired: true, session: null }))).toBe(false);
  });

  test("allows product queries when auth is disabled", () => {
    expect.assertions(1);

    expect(canRunProductQueries(authSession({ loginRequired: false, session: null }))).toBe(true);
  });

  test("allows product queries when a session exists", () => {
    expect.assertions(1);

    expect(
      canRunProductQueries(
        authSession({ loginRequired: true, session: { user: { id: "usr_1" } } }),
      ),
    ).toBe(true);
  });
});

describe("console list query limits", () => {
  test("shared console inventory queries send bounded list requests", async () => {
    const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

    expect(source).toContain("orpc.domainBindings.list.queryOptions({");
    expect(source).toContain("orpc.certificates.list.queryOptions({");
    expect(source).toContain("orpc.previewEnvironments.list.queryOptions({");
    expect(source).toContain("input: { limit: defaultConsoleListLimit }");
  });

  test("domain bindings page disables unrelated inventory queries", async () => {
    const source = await readFile(
      new URL("../../routes/domain-bindings/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(source).toContain("deployments: false");
    expect(source).toContain("previewEnvironments: false");
    expect(source).toContain("certificates: false");
    expect(source).toContain("providers: false");
  });
});
