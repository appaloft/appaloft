import { describe, expect, test } from "bun:test";
import { ash } from "../src";

describe("@appaloft/ash execution", () => {
  test("[ASH-INT-001] executes a rendered script with arg env raw and list semantics", () => {
    const script = ash`
      set -eu
      ${ash.env("APPALOFT_NAME", "value with spaces and 'quotes'")}
      set -- ${ash.list(["first value", "second'value", "third"])}
      printf 'env=%s\n' "$APPALOFT_NAME"
      printf 'argc=%s\n' "$#"
      printf 'arg1=%s\n' "$1"
      printf 'arg2=%s\n' "$2"
      ${ash.raw("printf 'raw=trusted-static\\n'")}
      printf 'single=%s\n' ${ash.arg("one two")}
    `;

    const result = ash.execute(script);

    expect(result).toMatchObject({
      exitCode: 0,
      signalCode: null,
      stderr: "",
      success: true,
    });
    expect(result.stdout).toBe(
      [
        "env=value with spaces and 'quotes'",
        "argc=3",
        "arg1=first value",
        "arg2=second'value",
        "raw=trusted-static",
        "single=one two",
        "",
      ].join("\n"),
    );
  });

  test("[ASH-INT-002] returns failure status without throwing", () => {
    const result = ash.execute(ash`
      printf 'before-failure\n'
      printf 'bad\n' >&2
      exit 7
    `);

    expect(result).toMatchObject({
      exitCode: 7,
      stderr: "bad\n",
      stdout: "before-failure\n",
      success: false,
    });
  });
});
