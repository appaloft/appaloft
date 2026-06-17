import { describe, expect, test } from "vitest";
import { deploymentAccessUrls } from "./deployment-access-url";

describe("deploymentAccessUrls", () => {
  test("[DEF-ACCESS-ENTRY-009] renders deployment detail access with the default open path", () => {
    const urls = deploymentAccessUrls(
      {
        runtimePlan: {
          execution: {
            port: 8090,
            accessRoutes: [
              {
                proxyKind: "traefik",
                domains: ["pocketbase.example.test"],
                pathPrefix: "/",
                tlsMode: "disabled",
                targetPort: 8090,
              },
            ],
            metadata: {
              "access.defaultOpenPathPrefix": "/_/",
            },
          },
        },
      },
      undefined,
    );

    expect(urls).toEqual([{ kind: "domain", url: "http://pocketbase.example.test/_/" }]);
  });
});
