export type ReleaseArtifactKind =
  | "backend-service"
  | "web-static"
  | "all-in-one-image"
  | "compose-bundle"
  | "binary-bundle";

export interface ReleaseArtifactDescriptor {
  kind: ReleaseArtifactKind;
  name: string;
  path: string;
  description: string;
}

export interface ReleaseManifest {
  version: string;
  generatedAt: string;
  artifacts: ReleaseArtifactDescriptor[];
}

export function createStandardReleaseManifest(input: {
  version: string;
  generatedAt: string;
}): ReleaseManifest {
  return {
    version: input.version,
    generatedAt: input.generatedAt,
    artifacts: [
      {
        kind: "backend-service",
        name: "yundu-backend",
        path: "yundu-backend",
        description: "Standalone backend service artifact",
      },
      {
        kind: "web-static",
        name: "yundu-web-static",
        path: "yundu-web-static",
        description: "Static frontend artifact for CDN, Nginx, or object storage",
      },
      {
        kind: "all-in-one-image",
        name: "yundu-all-in-one-image",
        path: "Dockerfile",
        description: "All-in-one Docker image definition",
      },
      {
        kind: "compose-bundle",
        name: "docker-compose.selfhost.yml",
        path: "docker-compose.selfhost.yml",
        description: "Self-hosted Compose bundle using external PostgreSQL",
      },
      {
        kind: "binary-bundle",
        name: "yundu-binary-bundle",
        path: "yundu-binary-bundle",
        description:
          "Self-contained Bun binary bundle with embedded web console assets and embedded-PGlite-friendly launcher",
      },
    ],
  };
}
