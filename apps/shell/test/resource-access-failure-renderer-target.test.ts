import { describe, expect, test } from "bun:test";
import { resolveConfig } from "@appaloft/config";
import { resourceAccessFailureRendererTargetForStartedServer } from "../src/resource-access-failure-renderer-target";

describe("resource access failure renderer target", () => {
  test("[RES-ACCESS-DIAG-ROUTE-003] derives a host gateway URL for a started wildcard-bound service", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_HTTP_HOST: "0.0.0.0",
        APPALOFT_HTTP_PORT: "3001",
      },
    });

    expect(resourceAccessFailureRendererTargetForStartedServer({ config })).toEqual({
      url: "http://host.docker.internal:3001",
    });
    expect(
      resourceAccessFailureRendererTargetForStartedServer({ config, actualPort: 3900 }),
    ).toEqual({
      url: "http://host.docker.internal:3900",
    });
  });

  test("does not derive a renderer target for loopback-only one-shot CLI style runtime", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_HTTP_HOST: "127.0.0.1",
        APPALOFT_HTTP_PORT: "3001",
      },
    });

    expect(resourceAccessFailureRendererTargetForStartedServer({ config })).toBeUndefined();
  });

  test("uses an explicit renderer URL override when automatic topology is not safe", () => {
    const config = resolveConfig({
      env: {
        APPALOFT_HTTP_HOST: "127.0.0.1",
        APPALOFT_RESOURCE_ACCESS_FAILURE_RENDERER_URL: "http://appaloft.internal:3001",
      },
    });

    expect(resourceAccessFailureRendererTargetForStartedServer({ config })).toEqual({
      url: "http://appaloft.internal:3001/",
    });
  });
});
