import { z } from "zod";

import { previewPolicyScopeSchema } from "./configure-preview-policy.schema";

export const showPreviewPolicyQueryInputSchema = z.object({
  scope: previewPolicyScopeSchema,
});

export type ShowPreviewPolicyQueryInput = z.input<typeof showPreviewPolicyQueryInputSchema>;
export type ShowPreviewPolicyQueryPayload = z.output<typeof showPreviewPolicyQueryInputSchema>;
