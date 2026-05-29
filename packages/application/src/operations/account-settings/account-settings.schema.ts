import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const optionalAvatarUrlSchema = z
  .union([z.string().trim().url(), z.literal("").transform(() => undefined), z.null()])
  .optional();

export const accountSessionIdSchema = nonEmptyTrimmedString("sessionId");
