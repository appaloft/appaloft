import { describe, expect, test } from "bun:test";
import { ash, isAshScript, render } from "../src";

describe("@appaloft/ash rendering", () => {
  test("[ASH-UNIT-001] renders a typed shell script with explicit interpolation helpers", () => {
    const nested = ash`
      printf 'nested=%s\n' ${ash.arg("child's value")}
    `;

    const script = ash`
      set -eu
      ${ash.env("APPALOFT_EXAMPLE", "value with spaces and 'quotes'")}
      printf 'args=%s\n' ${ash.arg("alpha beta")}
      printf 'list=%s\n' ${ash.list(["one", "two words", "three's"])}
      ${ash.raw("printf 'raw-static\\n'")}
      ${nested}
    `;

    expect(isAshScript(script)).toBe(true);
    expect(render(script)).toMatchInlineSnapshot(`
      "set -eu
      APPALOFT_EXAMPLE='value with spaces and '\\''quotes'\\'''
      printf 'args=%s\\n' 'alpha beta'
      printf 'list=%s\\n' 'one' 'two words' 'three'\\''s'
      printf 'raw-static\\n'
      printf 'nested=%s\\n' 'child'\\''s value'
      "
    `);
  });

  test("[ASH-UNIT-002] quotes empty values and primitive values", () => {
    const script = ash`
      ${ash.env("EMPTY", "")}
      ${ash.env("COUNT", 42)}
      ${ash.arg(true)}
      ${ash.list([])}
    `;

    expect(render(script)).toMatchInlineSnapshot(`
      "EMPTY=''
      COUNT='42'
      'true'
      "
    `);
  });

  test("[ASH-UNIT-003] rejects implicit string interpolation", () => {
    const unsafeValue = "unsafe" as unknown as Parameters<typeof ash>[1];

    expect(() => ash`printf '%s\n' ${unsafeValue}`).toThrow(
      "ash template interpolations must use ash.arg(...), ash.env(...), ash.raw(...), ash.list(...), or another AshScript.",
    );
  });

  test("[ASH-UNIT-004] rejects invalid environment names", () => {
    expect(() => ash.env("APPALOFT-VALUE", "x")).toThrow(
      "Invalid shell environment assignment name: APPALOFT-VALUE",
    );
  });
});
