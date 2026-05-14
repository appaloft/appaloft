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
      quote: shellQuote,
    });

    expect(script).toContain("docker compose -f \"$compose_file\" config --services");
    expect(script).toContain("services:");
    expect(script).toContain('"appaloft.managed": "true"');
    expect(script).toContain('"appaloft.resource-id": "res_www"');
    expect(script).toContain('"appaloft.deployment-id": "dep_www"');
    expect(script).toContain('mv "$tmp_file" "$override_file"');
  });
});
