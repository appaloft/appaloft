import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  createExecutionContext,
  getExecutionAuthProviderAccessToken,
  toRepositoryContext,
  withExecutionAuthProviderAccessTokens,
} from "../src";

describe("execution auth context", () => {
  test("attaches transient provider access tokens without mutating the original context", () => {
    const original = createExecutionContext({
      entrypoint: "http",
      auth: {
        authorizationHeader: "Bearer session-token",
      },
    });

    const next = withExecutionAuthProviderAccessTokens(original, {
      github: " github-token-fixture ",
    });

    expect(next).not.toBe(original);
    expect(original.auth?.providerAccessTokens).toBeUndefined();
    expect(next.auth).toEqual({
      authorizationHeader: "Bearer session-token",
      providerAccessTokens: {
        github: "github-token-fixture",
      },
    });
    expect(getExecutionAuthProviderAccessToken(next, "github")).toBe("github-token-fixture");
  });

  test("does not carry transient auth material into repository context", () => {
    const context = withExecutionAuthProviderAccessTokens(
      createExecutionContext({ entrypoint: "http" }),
      {
        github: "github-token-fixture",
      },
    );

    expect(toRepositoryContext(context)).not.toHaveProperty("auth");
  });
});
