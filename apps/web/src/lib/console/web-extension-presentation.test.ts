import { type SystemPluginWebExtension } from "@appaloft/contracts";
import { Puzzle, WalletCards } from "@lucide/svelte";
import { describe, expect, test } from "vitest";

import { organizationSettingsItems } from "./settings-nav";
import {
  systemPluginExtensionIcon,
  systemPluginExtensionTitle,
} from "./web-extension-presentation";

const billingExtension: SystemPluginWebExtension = {
  key: "cloud-billing",
  pluginName: "appaloft-cloud",
  pluginDisplayName: "Appaloft Cloud",
  title: "Billing",
  localizations: {
    "zh-CN": {
      title: "账单",
    },
    "en-US": {
      title: "Billing",
    },
  },
  icon: "wallet",
  path: "/organization/billing",
  placement: "settings",
  target: "console-route",
  requiresAuth: true,
};

describe("web extension presentation", () => {
  test("[CONSOLE-EXT-PRESENTATION-001] resolves localized settings labels and configured icons", () => {
    expect(systemPluginExtensionTitle(billingExtension, "zh-CN")).toBe("账单");
    expect(systemPluginExtensionIcon(billingExtension)).toBe(WalletCards);

    const item = organizationSettingsItems([billingExtension], "zh-CN").find(
      (candidate) => candidate.href === "/organization/billing",
    );

    expect(item && "label" in item ? item.label : undefined).toBe("账单");
    expect(item?.icon).toEqual({ kind: "component", component: WalletCards });
  });

  test("[CONSOLE-EXT-PRESENTATION-001] falls back to title and puzzle icon", () => {
    const extensionWithoutPresentation: SystemPluginWebExtension = {
      ...billingExtension,
      key: "example",
      title: "Example",
      path: "/organization/example",
      localizations: undefined,
      icon: undefined,
    };

    expect(systemPluginExtensionTitle(extensionWithoutPresentation, "zh-CN")).toBe("Example");
    expect(systemPluginExtensionIcon(extensionWithoutPresentation)).toBe(Puzzle);
  });
});
