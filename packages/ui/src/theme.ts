import { designPackage } from "@appaloft/design";

export {
  designPackage,
  productIdentity,
  type SupportedLocale,
  supportedLocales,
} from "@appaloft/design";

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
    input: "@appaloft/ui/input",
    popover: "@appaloft/ui/popover",
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
