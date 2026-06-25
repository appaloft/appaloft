import { describe, expect, test } from "vitest";
import { deploymentAccessUrls } from "./deployment-access-url";

describe("deploymentAccessUrls", () => {
  test("renders serverless static artifact deployment target route url", () => {
    const urls = deploymentAccessUrls(
      {
        target: {
          kind: "serverless-static-artifact",
          routeUrl: "https://www-static-web-mqt83z2b-9wwslz.appaloft.app/",
        },
        runtimePlan: {
          execution: {
            metadata: {
              "execution.kind": "serverless-static-artifact",
            },
          },
        },
      },
      undefined,
    );

    expect(urls).toEqual([
      {
        kind: "deployment",
        url: "https://www-static-web-mqt83z2b-9wwslz.appaloft.app/",
      },
    ]);
  });

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
