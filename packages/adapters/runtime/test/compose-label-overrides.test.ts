import { describe, expect, test } from "bun:test";

import { renderComposeOwnershipLabelOverrideScript } from "../src/compose-label-overrides";
import { dockerLabelsFromAssignments } from "../src/runtime-commands";

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

describe("compose ownership label overrides", () => {
  test("[RT-USAGE-002] renders an override generator with Appaloft ownership labels", () => {
    const script = renderComposeOwnershipLabelOverrideScript({
      composeFile: "/srv/app/docker-compose.yml",
      overrideFile: "/srv/app/.appaloft.compose.labels.override.yml",
      labels: dockerLabelsFromAssignments([
        "appaloft.managed=true",
        "appaloft.resource-id=res_www",
        "appaloft.deployment-id=dep_www",
      ]),
      mounts: [
        {
          type: "volume",
          source: "appaloft-stv_data",
          target: "/var/lib/app/data",
        },
        {
          type: "bind",
          source: "/srv/appaloft/cache",
          target: "/cache",
          readOnly: true,
        },
      ],
      volumeRealizations: [
        {
          storageVolumeId: "stv_data",
          volumeName: "appaloft-stv_data",
          labels: {
            "appaloft.managed": "true",
            "appaloft.storage-runtime-realized-by": "deployment-execution",
            "appaloft.storage-volume-id": "stv_data",
            "appaloft.storage-volume-kind": "named-volume",
          },
        },
      ],
      quote: shellQuote,
    });

    expect(script).toContain(
      'if docker compose -f "$compose_file" config --services >/dev/null 2>&1; then',
    );
    expect(script).toContain(
      'docker-compose -f "$compose_file" config --services >/dev/null 2>&1',
    );
    expect(script).toContain(
      'services="$($appaloft_docker_compose_cmd -f "$compose_file" config --services)"',
    );
    expect(script).toContain("services:");
    expect(script).toContain('"appaloft.managed": "true"');
    expect(script).toContain('"appaloft.resource-id": "res_www"');
    expect(script).toContain('"appaloft.deployment-id": "dep_www"');
    expect(script).toContain("    volumes:");
    expect(script).toContain("      - type: volume");
    expect(script).toContain('        source: "appaloft-stv_data"');
    expect(script).toContain('        target: "/var/lib/app/data"');
    expect(script).toContain("      - type: bind");
    expect(script).toContain('        source: "/srv/appaloft/cache"');
    expect(script).toContain("        read_only: true");
    expect(script).toContain("volumes:");
    expect(script).toContain('  "appaloft-stv_data":');
    expect(script).toContain('    name: "appaloft-stv_data"');
    expect(script).toContain('      "appaloft.storage-volume-id": "stv_data"');
    expect(script).toContain('      "appaloft.storage-runtime-realized-by": "deployment-execution"');
    expect(script).toContain('mv "$tmp_file" "$override_file"');
  });

  test("[DEP-CREATE-ASYNC-016A] scopes proxy labels and network attachment to the Compose target service", () => {
    const script = renderComposeOwnershipLabelOverrideScript({
      composeFile: "/srv/app/docker-compose.yml",
      overrideFile: "/srv/app/.appaloft.compose.labels.override.yml",
      labels: dockerLabelsFromAssignments(["appaloft.managed=true"]),
      targetServiceName: "web",
      targetLabels: dockerLabelsFromAssignments([
        "traefik.enable=true",
        "traefik.http.routers.dep.rule=Host(`compose.example.com`)",
      ]),
      targetNetworkName: "appaloft-edge",
      quote: shellQuote,
    });

    expect(script).toContain("target_service='web'");
    expect(script).toContain('if [ "$service" = "$target_service" ]; then');
    expect(script).toContain('"traefik.enable": "true"');
    expect(script).toContain("    networks:");
    expect(script).toContain('      - "appaloft-edge"');
    expect(script).toContain("networks:");
    expect(script).toContain('  "appaloft-edge":');
    expect(script).toContain("    external: true");
    expect(script).toContain('    name: "appaloft-edge"');
  });

  test("[DEP-BIND-SECRET-RESOLVE-008] attaches every Compose service to a managed dependency network", () => {
    const script = renderComposeOwnershipLabelOverrideScript({
      composeFile: "/srv/app/docker-compose.yml",
      overrideFile: "/srv/app/.appaloft.compose.labels.override.yml",
      labels: dockerLabelsFromAssignments(["appaloft.managed=true"]),
      targetServiceName: "web",
      targetLabels: dockerLabelsFromAssignments(["traefik.enable=true"]),
      targetNetworkName: "appaloft-edge",
      sharedNetworkNames: ["appaloft-edge"],
      quote: shellQuote,
    });

    expect(script).toContain("managed dependency networks");
    expect(script.match(/      - \"appaloft-edge\"/g)).toHaveLength(1);
    expect(script.match(/  \"appaloft-edge\":/g)).toHaveLength(1);
  });

  test("[ROUTE-TLS-ENTRY-023] scopes route labels to multiple compose services", () => {
    const script = renderComposeOwnershipLabelOverrideScript({
      composeFile: "/srv/app/docker-compose.yml",
      overrideFile: "/srv/app/.appaloft.compose.labels.override.yml",
      labels: dockerLabelsFromAssignments(["appaloft.managed=true"]),
      targetServiceName: "web",
      environmentKeys: ["DATABASE_URL"],
      sharedNetworkNames: ["appaloft-postgres"],
      serviceTargets: [
        {
          serviceName: "web",
          labels: dockerLabelsFromAssignments([
            "traefik.http.routers.web.rule=Host(`app.example.com`)",
          ]),
          networkName: "appaloft-edge",
        },
        {
          serviceName: "api",
          labels: dockerLabelsFromAssignments([
            "traefik.http.routers.api.rule=Host(`app.example.com`) && PathPrefix(`/api`)",
          ]),
          networkName: "appaloft-edge",
        },
      ],
      quote: shellQuote,
    });

    expect(script).toContain('if [ "$service" = \'web\' ]; then');
    expect(script).toContain('if [ "$service" = \'api\' ]; then');
    expect(script).toContain('"traefik.http.routers.web.rule"');
    expect(script).toContain('"traefik.http.routers.api.rule"');
    expect(script.match(/  "appaloft-edge":/g)).toHaveLength(1);
    expect(script.indexOf('"traefik.http.routers.api.rule"')).toBeLessThan(
      script.indexOf('      - "appaloft-postgres"'),
    );
    expect(script.indexOf('"DATABASE_URL"')).toBeLessThan(
      script.indexOf('      - "appaloft-postgres"'),
    );
  });

  test("[EDGE-PROXY-ROUTE-008B] escapes literal dollar signs only at the Compose boundary", () => {
    const script = renderComposeOwnershipLabelOverrideScript({
      composeFile: "/srv/app/docker-compose.yml",
      overrideFile: "/srv/app/.appaloft.compose.labels.override.yml",
      labels: dockerLabelsFromAssignments(["appaloft.managed=true"]),
      targetServiceName: "web",
      targetLabels: dockerLabelsFromAssignments([
        "traefik.http.middlewares.canonical.redirectregex.replacement=https://example.test/${1}",
      ]),
      quote: shellQuote,
    });

    expect(script).toContain(
      '"traefik.http.middlewares.canonical.redirectregex.replacement": "https://example.test/$${1}"',
    );
    expect(script).not.toContain(
      '"traefik.http.middlewares.canonical.redirectregex.replacement": "https://example.test/${1}"',
    );
  });

  test("[CPS-SUBSTRATE-009] injects runtime environment keys into the target service without values", () => {
    const script = renderComposeOwnershipLabelOverrideScript({
      composeFile: "/srv/app/docker-compose.yml",
      overrideFile: "/srv/app/.appaloft.compose.labels.override.yml",
      labels: dockerLabelsFromAssignments(["appaloft.managed=true"]),
      targetServiceName: "web",
      environmentKeys: ["PUBLIC_MARKER", "SECRET_MARKER", "SECRET_MARKER"],
      quote: shellQuote,
    });

    expect(script).toContain("target_service='web'");
    expect(script).toContain('    environment:');
    expect(script).toContain('      "PUBLIC_MARKER": "${PUBLIC_MARKER}"');
    expect(script.match(/"SECRET_MARKER": "\$\{SECRET_MARKER\}"/g)).toHaveLength(1);
    expect(script).not.toContain("marker-secret-value");
  });

  test("[DEP-CREATE-ASYNC-016A] infers the only service for a derived Compose route", () => {
    const script = renderComposeOwnershipLabelOverrideScript({
      composeFile: "/srv/app/docker-compose.yml",
      overrideFile: "/srv/app/.appaloft.compose.labels.override.yml",
      labels: dockerLabelsFromAssignments(["appaloft.managed=true"]),
      targetLabels: dockerLabelsFromAssignments(["traefik.enable=true"]),
      targetNetworkName: "appaloft-edge",
      quote: shellQuote,
    });

    expect(script).toContain('service_count="$(printf "%s\\n" "$services"');
    expect(script).toContain("Compose routing requires targetServiceName when the project has multiple services");
  });
});
