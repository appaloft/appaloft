import { describe, expect, test } from "bun:test";
import { HostAddress } from "../src";

describe("HostAddress", () => {
  test("[SERVER-BOOT-HOST-001] canonicalizes IPv6 literals and preserves an embedded SSH user", () => {
    expect(HostAddress.create("2001:0db8:0:0:0:0:0:1")._unsafeUnwrap().value).toBe("2001:db8::1");
    expect(HostAddress.create("[2001:db8::1]")._unsafeUnwrap().value).toBe("2001:db8::1");
    expect(HostAddress.create("deploy@[2001:0db8::1]")._unsafeUnwrap().value).toBe(
      "deploy@2001:db8::1",
    );
  });

  test("[SERVER-BOOT-HOST-002] canonicalizes DNS names without accepting a URL or host-port pair", () => {
    expect(HostAddress.create("Example.COM.")._unsafeUnwrap().value).toBe("example.com");

    for (const host of ["ssh://example.com", "https://example.com", "example.com:2222"]) {
      const result = HostAddress.create(host);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toMatchObject({
        code: "validation_error",
        details: { field: "host", phase: "register" },
      });
    }

    expect(HostAddress.create("999.0.0.1").isErr()).toBe(true);
  });

  test("[SERVER-BOOT-HOST-003] rejects a network prefix instead of inventing a host address", () => {
    for (const host of ["2001:db8::/64", "192.0.2.0/24"]) {
      const result = HostAddress.create(host);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toMatchObject({
        code: "validation_error",
        details: { field: "host", hostInputKind: "network-prefix", phase: "register" },
      });
    }
  });

  test("[SERVER-BOOT-HOST-004] formats IPv6 endpoints without ambiguous host-port text", () => {
    expect(HostAddress.rehydrate("2001:db8::1").formatWithPort(22)).toBe("[2001:db8::1]:22");
    expect(HostAddress.rehydrate("example.com").formatWithPort(22)).toBe("example.com:22");
  });
});
