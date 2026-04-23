export const productIdentity = {
  name: "Appaloft",
  nameZhCn: "Appaloft",
  tagline: "AI Native local-to-cloud deployment platform",
} as const;

export const supportedLocales = ["zh-CN", "en"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const designPackage = {
  name: "@appaloft/design",
  cssEntrypoints: {
    web: "@appaloft/design/styles/web.css",
    docs: "@appaloft/design/styles/docs.css",
    www: "@appaloft/design/styles/www.css",
    tokens: "@appaloft/design/styles/tokens.css",
    tailwind: "@appaloft/design/styles/tailwind.css",
  },
  assets: {
    iconLight: "@appaloft/design/assets/appaloft-icon-light.svg",
    iconDark: "@appaloft/design/assets/appaloft-icon-dark.svg",
    logoHorizontal: "@appaloft/design/assets/appaloft-logo-horizontal.svg",
    logoHorizontalInverse: "@appaloft/design/assets/appaloft-logo-horizontal-inverse.svg",
  },
  documentation: "@appaloft/design/design.md",
} as const;
