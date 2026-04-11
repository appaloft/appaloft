export const productIdentity = {
  name: "Yundu",
  nameZhCn: "云渡",
  tagline: "AI Native local-to-cloud deployment platform",
} as const;

export const supportedLocales = ["zh-CN", "en"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];
