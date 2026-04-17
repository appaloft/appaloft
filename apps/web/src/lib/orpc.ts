import { createAppaloftOrpcClient, createAppaloftOrpcQueryUtils } from "@appaloft/orpc/client";

import { API_BASE } from "$lib/api/client";
import { currentLocale } from "$lib/i18n";

export const orpcClient = createAppaloftOrpcClient(API_BASE, currentLocale);
export const orpc = createAppaloftOrpcQueryUtils(API_BASE, currentLocale);
