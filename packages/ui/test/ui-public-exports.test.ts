import { readFile } from "node:fs/promises";
import * as AlertDialog from "@appaloft/ui/alert-dialog";
import { AppShell, AppShellRegion } from "@appaloft/ui/app-shell";
import { Badge, badgeVariants } from "@appaloft/ui/badge";
import { Button, type ButtonProps, type ButtonVariant, buttonVariants } from "@appaloft/ui/button";
import { ChartContainer, type ChartContainerProps } from "@appaloft/ui/chart";
import * as Dialog from "@appaloft/ui/dialog";
import * as DropdownMenu from "@appaloft/ui/dropdown-menu";
import * as Empty from "@appaloft/ui/empty";
import { Icon, type IconProps } from "@appaloft/ui/icon";
import { Input } from "@appaloft/ui/input";
import { Progress, type ProgressProps } from "@appaloft/ui/progress";
import * as ScrollArea from "@appaloft/ui/scroll-area";
import * as Select from "@appaloft/ui/select";
import * as Tabs from "@appaloft/ui/tabs";
import { Textarea } from "@appaloft/ui/textarea";
import {
  appaloftPortableDesignTokens,
  appaloftPortableTailwindTheme,
  createAppaloftPortableTailwindConfig,
  uiPackage,
} from "@appaloft/ui/theme";
import { cn } from "@appaloft/ui/utils";
import { describe, expect, expectTypeOf, test } from "vitest";

describe("@appaloft/ui public exports", () => {
  test("exposes neutral primitive entrypoints", () => {
    expect(uiPackage.name).toBe("@appaloft/ui");
    expect(uiPackage.primitiveEntrypoints.alertDialog).toBe("@appaloft/ui/alert-dialog");
    expect(uiPackage.primitiveEntrypoints.button).toBe("@appaloft/ui/button");
    expect(uiPackage.primitiveEntrypoints.empty).toBe("@appaloft/ui/empty");
    expect(uiPackage.primitiveEntrypoints.dropdownMenu).toBe("@appaloft/ui/dropdown-menu");
    expect(uiPackage.primitiveEntrypoints.chart).toBe("@appaloft/ui/chart");
    expect(uiPackage.primitiveEntrypoints.progress).toBe("@appaloft/ui/progress");
    expect(uiPackage.primitiveEntrypoints.scrollArea).toBe("@appaloft/ui/scroll-area");
    expect(uiPackage.shellEntrypoints.appShell).toBe("@appaloft/ui/app-shell");
    expect(uiPackage.shellEntrypoints.icon).toBe("@appaloft/ui/icon");
    expect(appaloftPortableDesignTokens.color.primary).toBe("#4e84ff");
    expect(appaloftPortableTailwindTheme.colors.primary).toBe("#4e84ff");
    expect(appaloftPortableTailwindTheme.borderRadius.lg).toBe("8px");
    expect(createAppaloftPortableTailwindConfig().theme.extend.colors.background).toBe("#ffffff");
    expect(createAppaloftPortableTailwindConfig({ presets: ["email"] }).presets).toEqual(["email"]);
  });

  test("resolves Svelte component exports through package subpaths", () => {
    expect(Button).toBeDefined();
    expect(AlertDialog.AlertDialogContent).toBeDefined();
    expect(AlertDialog.AlertDialogAction).toBeDefined();
    expect(Badge).toBeDefined();
    expect(ChartContainer).toBeDefined();
    expect(Dialog.DialogContent).toBeDefined();
    expect(DropdownMenu.DropdownMenuContent).toBeDefined();
    expect(Empty.Empty).toBeDefined();
    expect(Empty.EmptyContent).toBeDefined();
    expect(Tabs.TabsList).toBeDefined();
    expect(Select.SelectTrigger).toBeDefined();
    expect(Input).toBeDefined();
    expect(Progress).toBeDefined();
    expect(ScrollArea.ScrollArea).toBeDefined();
    expect(ScrollArea.ScrollBar).toBeDefined();
    expect(Textarea).toBeDefined();
    expect(AppShell).toBeDefined();
    expect(AppShellRegion).toBeDefined();
    expect(Icon).toBeDefined();
  });

  test("keeps variant helpers usable without rendering", () => {
    expect(buttonVariants({ variant: "outline", size: "sm" })).toContain("h-7");
    expect(badgeVariants({ variant: "secondary" })).toContain("bg-secondary");
    expect(cn("px-2", false, "px-3")).toBe("px-3");
  });

  test("publishes component prop types", () => {
    expectTypeOf<ButtonProps>()
      .toHaveProperty("variant")
      .toEqualTypeOf<ButtonVariant | undefined>();
    expectTypeOf<IconProps>().toHaveProperty("label").toEqualTypeOf<string | undefined>();
    expectTypeOf<ProgressProps>()
      .toHaveProperty("value")
      .toEqualTypeOf<number | null | undefined>();
    expectTypeOf<ChartContainerProps>().toHaveProperty("config");
    expect(true).toBe(true);
  });

  test("keeps alert dialog layout slots rendering children", async () => {
    const [headerSource, footerSource] = await Promise.all([
      readFile(new URL("../src/alert-dialog/alert-dialog-header.svelte", import.meta.url), "utf8"),
      readFile(new URL("../src/alert-dialog/alert-dialog-footer.svelte", import.meta.url), "utf8"),
    ]);

    expect(headerSource).toContain("{@render children?.()}");
    expect(footerSource).toContain("{@render children?.()}");
  });
});
