import { AppShell, AppShellRegion } from "@appaloft/ui/app-shell";
import { Badge, badgeVariants } from "@appaloft/ui/badge";
import { Button, type ButtonProps, type ButtonVariant, buttonVariants } from "@appaloft/ui/button";
import * as Dialog from "@appaloft/ui/dialog";
import * as DropdownMenu from "@appaloft/ui/dropdown-menu";
import { Icon, type IconProps } from "@appaloft/ui/icon";
import { Input } from "@appaloft/ui/input";
import * as Select from "@appaloft/ui/select";
import * as Tabs from "@appaloft/ui/tabs";
import { Textarea } from "@appaloft/ui/textarea";
import { appaloftPortableDesignTokens, uiPackage } from "@appaloft/ui/theme";
import { cn } from "@appaloft/ui/utils";
import { describe, expect, expectTypeOf, test } from "vitest";

describe("@appaloft/ui public exports", () => {
  test("exposes neutral primitive entrypoints", () => {
    expect(uiPackage.name).toBe("@appaloft/ui");
    expect(uiPackage.primitiveEntrypoints.button).toBe("@appaloft/ui/button");
    expect(uiPackage.primitiveEntrypoints.dropdownMenu).toBe("@appaloft/ui/dropdown-menu");
    expect(uiPackage.shellEntrypoints.appShell).toBe("@appaloft/ui/app-shell");
    expect(uiPackage.shellEntrypoints.icon).toBe("@appaloft/ui/icon");
    expect(appaloftPortableDesignTokens.color.primary).toBe("#4e84ff");
  });

  test("resolves Svelte component exports through package subpaths", () => {
    expect(Button).toBeDefined();
    expect(Badge).toBeDefined();
    expect(Dialog.DialogContent).toBeDefined();
    expect(DropdownMenu.DropdownMenuContent).toBeDefined();
    expect(Tabs.TabsList).toBeDefined();
    expect(Select.SelectTrigger).toBeDefined();
    expect(Input).toBeDefined();
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
    expect(true).toBe(true);
  });
});
