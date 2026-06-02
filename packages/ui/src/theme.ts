import { appaloftPortableDesignTokens, designPackage } from "@appaloft/design";

export {
  appaloftPortableDesignTokens,
  designPackage,
  productIdentity,
  type SupportedLocale,
  supportedLocales,
} from "@appaloft/design";

export const appaloftPortableTailwindTheme = {
  borderRadius: {
    sm: appaloftPortableDesignTokens.radius.sm,
    md: appaloftPortableDesignTokens.radius.md,
    lg: appaloftPortableDesignTokens.radius.lg,
  },
  boxShadow: {
    sm: appaloftPortableDesignTokens.shadow.sm,
  },
  colors: {
    accent: appaloftPortableDesignTokens.color.accent,
    "accent-foreground": appaloftPortableDesignTokens.color.accentForeground,
    background: appaloftPortableDesignTokens.color.background,
    border: appaloftPortableDesignTokens.color.border,
    card: appaloftPortableDesignTokens.color.card,
    foreground: appaloftPortableDesignTokens.color.foreground,
    muted: appaloftPortableDesignTokens.color.muted,
    "muted-foreground": appaloftPortableDesignTokens.color.mutedForeground,
    primary: appaloftPortableDesignTokens.color.primary,
    "primary-foreground": appaloftPortableDesignTokens.color.primaryForeground,
    secondary: appaloftPortableDesignTokens.color.secondary,
    "secondary-foreground": appaloftPortableDesignTokens.color.secondaryForeground,
  },
  fontFamily: {
    mono: appaloftPortableDesignTokens.fontFamily.mono,
    sans: appaloftPortableDesignTokens.fontFamily.sans,
  },
} as const;

export type AppaloftPortableTailwindTheme = typeof appaloftPortableTailwindTheme;

export interface AppaloftPortableTailwindConfigOptions<TPreset = unknown> {
  readonly presets?: TPreset[];
}

export interface AppaloftPortableTailwindConfig<TPreset = unknown> {
  readonly presets?: TPreset[];
  readonly theme: {
    readonly extend: AppaloftPortableTailwindTheme;
  };
}

export function createAppaloftPortableTailwindConfig<TPreset = unknown>(
  options: AppaloftPortableTailwindConfigOptions<TPreset> = {},
): AppaloftPortableTailwindConfig<TPreset> {
  return {
    ...(options.presets ? { presets: options.presets } : {}),
    theme: {
      extend: appaloftPortableTailwindTheme,
    },
  };
}

export const uiPackage = {
  name: "@appaloft/ui",
  description: "Community design primitives and shell primitives for Appaloft interfaces.",
  designPackage: designPackage.name,
  cssEntrypoints: designPackage.cssEntrypoints,
  primitiveEntrypoints: {
    avatar: "@appaloft/ui/avatar",
    badge: "@appaloft/ui/badge",
    breadcrumb: "@appaloft/ui/breadcrumb",
    button: "@appaloft/ui/button",
    card: "@appaloft/ui/card",
    collapsible: "@appaloft/ui/collapsible",
    dialog: "@appaloft/ui/dialog",
    dropdownMenu: "@appaloft/ui/dropdown-menu",
    empty: "@appaloft/ui/empty",
    input: "@appaloft/ui/input",
    popover: "@appaloft/ui/popover",
    progress: "@appaloft/ui/progress",
    select: "@appaloft/ui/select",
    separator: "@appaloft/ui/separator",
    sheet: "@appaloft/ui/sheet",
    sidebar: "@appaloft/ui/sidebar",
    skeleton: "@appaloft/ui/skeleton",
    table: "@appaloft/ui/table",
    tabs: "@appaloft/ui/tabs",
    textarea: "@appaloft/ui/textarea",
    tooltip: "@appaloft/ui/tooltip",
  },
  shellEntrypoints: {
    appShell: "@appaloft/ui/app-shell",
    icon: "@appaloft/ui/icon",
  },
} as const;
