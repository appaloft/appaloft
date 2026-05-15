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

    expect(script).toContain("docker compose -f \"$compose_file\" config --services");
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
});
