import { type Resource } from "i18next";

import { enUS } from "./locales/en-US";
import { zhCN } from "./locales/zh-CN";

export { enUS } from "./locales/en-US";
export { zhCN } from "./locales/zh-CN";

export const appaloftI18nResources = {
  "zh-CN": zhCN,
  "en-US": enUS,
} as const satisfies Resource;
