import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("browser ORPC client boundary", () => {
  test("does not pull the server-side application barrel into the browser module graph", () => {
    const contractSource = readFileSync(
      new URL("../../../../packages/orpc/src/client-contract.ts", import.meta.url),
      "utf8",
    );

    expect(contractSource).not.toContain('from "@appaloft/application"');
    expect(contractSource).toContain('from "@appaloft/contracts"');
  });
});
