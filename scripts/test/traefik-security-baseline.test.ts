import { expect, test } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const reviewedDefaultImage = "traefik:v3.6.23";
const reviewedSwarmCompatibilityImage = "traefik:v2.11.52";

const baselineFiles = {
  installer: "install.sh",
  provider: "packages/providers/edge-proxy-traefik/src/index.ts",
  providerTest: "packages/providers/edge-proxy-traefik/test/provider.test.ts",
  routeProofSmoke: "packages/adapters/runtime/test/deployment-route-proof.real-traefik.test.ts",
  routeFailureSmoke: "apps/shell/test/e2e/routing-domain-and-tls-proxy.workflow.e2e.ts",
  swarmSmoke: "packages/adapters/runtime/test/docker-swarm-execution-backend.test.ts",
} as const;

async function read(relativePath: string): Promise<string> {
  return await Bun.file(join(root, relativePath)).text();
}

test("[EDGE-PROXY-PROVIDER-011] keeps reviewed Traefik defaults and smoke pins synchronized", async () => {
  const sources = Object.fromEntries(
    await Promise.all(
      Object.entries(baselineFiles).map(async ([key, path]) => [key, await read(path)]),
    ),
  ) as Record<keyof typeof baselineFiles, string>;

  expect(sources.installer).toContain(
    `APPALOFT_TRAEFIK_IMAGE="\${APPALOFT_TRAEFIK_IMAGE:-${reviewedDefaultImage}}"`,
  );
  expect(sources.provider).toContain(`const traefikImage = "${reviewedDefaultImage}"`);
  expect(sources.providerTest).toContain(reviewedDefaultImage);
  expect(sources.routeProofSmoke).toContain(reviewedDefaultImage);
  expect(sources.routeFailureSmoke).toContain(reviewedDefaultImage);
  expect(sources.swarmSmoke).toContain(reviewedSwarmCompatibilityImage);

  const combined = Object.values(sources).join("\n");
  expect(combined).not.toMatch(/traefik:v3\.6\.2(?=["'\s)])/);
  expect(combined).not.toMatch(/traefik:v2\.11(?=["'])/);
});
