import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const resourcePageSource = readFileSync(
  fileURLToPath(new URL("./resources/[resourceId=consoleObjectId]/+page.svelte", import.meta.url)),
  "utf8",
);
const englishLocaleSource = readFileSync(
  fileURLToPath(new URL("../../../../packages/i18n/src/locales/en-US.ts", import.meta.url)),
  "utf8",
);
const chineseLocaleSource = readFileSync(
  fileURLToPath(new URL("../../../../packages/i18n/src/locales/zh-CN.ts", import.meta.url)),
  "utf8",
);
const dnsConnectorCallbackEffectSource = resourcePageSource.slice(
  resourcePageSource.indexOf("const callbackPayload = readDnsConnectorCallbackPayload"),
  resourcePageSource.indexOf(
    "$effect(() => {\n    if (!browser)",
    resourcePageSource.indexOf("const callbackPayload = readDnsConnectorCallbackPayload"),
  ),
);

describe("resource static artifact domains panel", () => {
  test("[RESOURCE-STATIC-DOMAINS-001] offers the normal domain binding flow for static artifacts", () => {
    expect(resourcePageSource).toContain(
      "const domainBindingUsesResourceRouteProvider = $derived(",
    );
    expect(resourcePageSource).toContain('currentAccessRoute?.kind === "static-artifact"');
    expect(resourcePageSource).toContain("isDirectStaticArtifactRuntime");
    expect(resourcePageSource).toContain(
      "effectiveDomainBindingServerId && effectiveDomainBindingDestinationId",
    );
    expect(resourcePageSource).not.toContain("isServerlessStaticArtifactAccess");
    expect(resourcePageSource).not.toContain("staticArtifactDomainBindingsUnavailableTitle");
    expect(resourcePageSource).not.toContain("staticArtifactDomainBindingsUnavailableDescription");
    expect(resourcePageSource).not.toContain("data-resource-static-artifact-domain-unavailable");
    expect(resourcePageSource).toContain("data-resource-domain-binding-create-dialog");
    expect(resourcePageSource).toContain("onsubmit={createResourceDomainBinding}");
    expect(resourcePageSource).toContain("serverId: effectiveDomainBindingServerId");
    expect(resourcePageSource).toContain("destinationId: effectiveDomainBindingDestinationId");
    expect(resourcePageSource).toContain("connectDnsProviderForSelectedBinding");
    expect(resourcePageSource).toContain("orpcClient.domainBindings.dnsPlan");
    expect(resourcePageSource).toContain('capabilityKey: "dns.domain-connect.start"');
    expect(resourcePageSource).toContain("providerPlan?.domainConnectSetup?.redirectUrl");
    expect(resourcePageSource).toContain("dnsConnectorSelectedConnectorKey");
    expect(resourcePageSource).toContain("dnsConnectorProviderLabel()");
    expect(resourcePageSource).toContain("dnsConnectorUnsupportedProviderLabel()");
    expect(resourcePageSource).toContain("manualDnsRecordsForBinding");
    expect(resourcePageSource).toContain("data-resource-domain-binding-manual-dns");
    expect(resourcePageSource).toContain("manualDnsRecords.length > 0");
    expect(resourcePageSource).not.toContain(
      'class={buttonVariants({ variant: "ghost", size: "sm" })}\n                        href={webDocsHrefs.domainCustomDomainBinding}',
    );
    expect(resourcePageSource).not.toContain('connectorKey: "cloudflare-dns"');
    expect(resourcePageSource).not.toContain("<span>Cloudflare DNS</span>");
    expect(resourcePageSource).toContain('capabilityKey: "dns.domain-connect.start"');
    expect(resourcePageSource).toContain("verifyDnsAfterDomainConnect");
    expect(resourcePageSource).toContain("orpcClient.domainBindings.confirmOwnership");
    expect(resourcePageSource).toContain('searchParams.get("dnsBindingId")');
    expect(resourcePageSource).toContain('searchParams.get("connectionStatus")');
    expect(resourcePageSource).toContain('searchParams.get("connectionErrorPhase")');
    expect(resourcePageSource).toContain('searchParams.get("connectionErrorStatusCode")');
    expect(resourcePageSource).toContain("dnsConnectorConnectErrorTokenExchangeWithStatus");
    expect(resourcePageSource).toContain("dnsConnectorConnectErrorZoneDiscoveryWithStatus");
    expect(resourcePageSource).toContain("window.open(");
    expect(resourcePageSource).toContain("dnsConnectorAuthWindowName");
    expect(resourcePageSource).toContain("dnsConnectorAuthorizationPopupFeatures()");
    expect(resourcePageSource).toContain("`left=${left}`");
    expect(resourcePageSource).toContain("`top=${top}`");
    expect(resourcePageSource).toContain(
      'const dnsConnectorCallbackMessageType = "appaloft:dns-connector-callback"',
    );
    expect(resourcePageSource).toContain("publishDnsConnectorCallbackPayload(callbackPayload)");
    expect(dnsConnectorCallbackEffectSource).not.toContain(
      "const currentResourceId = resource?.id",
    );
    expect(resourcePageSource).toContain("new BroadcastChannel(dnsConnectorCallbackChannelName)");
    expect(resourcePageSource).toContain("dnsConnectorCallbackStorageKey");
    expect(resourcePageSource).toContain("dnsConnectorCallbackStandalonePayload");
    expect(resourcePageSource).toContain("isDnsConnectorAuxiliaryCallbackWindow");
    expect(resourcePageSource).toContain("popupSizedWindow");
    expect(resourcePageSource).toContain("window.setTimeout(() =>");
    expect(resourcePageSource).toContain("handleDnsConnectorCallback(callbackPayload)");
    expect(resourcePageSource).toContain("dnsConnectorConnectErrorDetailWithCode");
    expect(englishLocaleSource).toContain("{{code}}");
    expect(chineseLocaleSource).toContain("{{code}}");
    expect(englishLocaleSource).toContain("{{statusCode}}");
    expect(chineseLocaleSource).toContain("{{statusCode}}");
    expect(resourcePageSource).toContain('id="resource-domain-binding-dns-connect-provider"');
    expect(resourcePageSource).toContain("cloudflareConnectorIcon.svg");
    expect(resourcePageSource).not.toContain('id="resource-domain-binding-create-form"');
    expect(resourcePageSource).not.toContain(
      "disabled={isResourceArchived || domainBindingUsesResourceRouteProvider}",
    );
  });
});
