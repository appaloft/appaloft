import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("browser ORPC client boundary", () => {
  test("does not pull the server-side application barrel into the browser module graph", () => {
    const contractSource = readFileSync(
      new URL("../../../../packages/orpc/src/client-contract.ts", import.meta.url),
      "utf8",
    );

    expect(contractSource).not.toContain('from "@appaloft/application"');
    expect(contractSource).not.toContain('from "@appaloft/application/schemas"');
    expect(contractSource).toContain('from "@appaloft/application/client-types"');
    expect(contractSource).toContain('from "@appaloft/contracts"');
  });
});
