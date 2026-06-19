import { describe, expect, test } from "bun:test";

import {
  detectDnsProviderFromNameservers,
  inferDnsBaseDomain,
  inspectDnsProviderFromNameservers,
} from "../src";

describe("DNS provider discovery", () => {
  test("detects Cloudflare nameservers", () => {
    const detected = detectDnsProviderFromNameservers([
      "marge.ns.cloudflare.com",
      "theo.ns.cloudflare.com",
    ]);

    expect(detected).toMatchObject({
      providerId: "cloudflare",
      title: "Cloudflare DNS",
      confidence: "high",
    });
  });

  test("detects GoDaddy nameservers", () => {
    const detected = detectDnsProviderFromNameservers([
      "ns17.domaincontrol.com",
      "ns18.domaincontrol.com",
    ]);

    expect(detected).toMatchObject({
      providerId: "godaddy",
      title: "GoDaddy DNS",
      confidence: "high",
    });
  });

  test("returns unknown for unrecognized nameservers", () => {
    const detected = detectDnsProviderFromNameservers(["ns1.example-dns.invalid"]);

    expect(detected).toMatchObject({
      providerId: "unknown",
      confidence: "medium",
    });
  });

  test("reduces a resource hostname to its base domain for provider discovery", () => {
    const discovery = inspectDnsProviderFromNameservers({
      hostname: "pocketbase.appalofttest.xyz",
      nameservers: ["marge.ns.cloudflare.com"],
    });

    expect(inferDnsBaseDomain("pocketbase.appalofttest.xyz")).toBe("appalofttest.xyz");
    expect(discovery).toMatchObject({
      hostname: "pocketbase.appalofttest.xyz",
      baseDomain: "appalofttest.xyz",
      detectedProvider: {
        providerId: "cloudflare",
      },
    });
  });
});
