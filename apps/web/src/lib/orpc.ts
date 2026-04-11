import { createYunduOrpcClient, createYunduOrpcQueryUtils } from "@yundu/orpc/client";

import { API_BASE } from "$lib/api/client";

export const orpcClient = createYunduOrpcClient(API_BASE);
export const orpc = createYunduOrpcQueryUtils(API_BASE);
