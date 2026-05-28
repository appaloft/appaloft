import { type AuthSessionResponse } from "@appaloft/contracts";
import { describe, expect, test } from "vitest";

import { canRunProductQueries } from "./auth-query-gate";

function authSession(
  input: Pick<AuthSessionResponse, "loginRequired" | "session">,
): AuthSessionResponse {
  return {
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
