import { createYunduOrpcClient, createYunduOrpcQueryUtils } from "@yundu/orpc/client";

import { API_BASE } from "$lib/api/client";
import { currentLocale } from "$lib/i18n";

export const orpcClient = createYunduOrpcClient(API_BASE, currentLocale);
export const orpc = createYunduOrpcQueryUtils(API_BASE, currentLocale);
