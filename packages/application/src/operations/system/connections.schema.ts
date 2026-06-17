import { z } from "zod";

const ownerScopeSchema = z.enum([
  "account",
  "organization",
  "project",
  "environment",
  "resource",
  "operator",
]);

export const connectionOwnerInputSchema = z
  .object({
    scope: ownerScopeSchema,
    id: z.string().min(1),
  })
  .strict();

export const connectionCredentialGrantInputSchema = z
  .object({
    kind: z.enum([
      "temporary-domain-connect",
      "limited-oauth-grant",
      "persistent-provider-credential",
      "provider-app-installation",
      "manual-secret-reference",
    ]),
    storage: z.enum(["none", "secret-ref", "provider-app", "ephemeral"]),
    secretRef: z.string().min(1).optional(),
    externalAccountId: z.string().min(1).optional(),
    externalInstallationId: z.string().min(1).optional(),
    expiresAt: z.string().min(1).optional(),
  })
  .strict();

export const listConnectionsQueryInputSchema = z
  .object({
    owner: connectionOwnerInputSchema.optional(),
    connectorKey: z.string().min(1).optional(),
    category: z
      .enum([
        "source",
        "dns",
        "infrastructure",
        "notification",
        "billing",
        "identity",
        "observability",
        "storage",
      ])
      .optional(),
  })
  .strict();

export const showConnectionQueryInputSchema = z
  .object({
    connectionId: z.string().min(1),
  })
  .strict();

export const startConnectionCommandInputSchema = z
  .object({
    connectorKey: z.string().min(1),
    owner: connectionOwnerInputSchema.optional(),
    displayName: z.string().min(1).optional(),
    credentialGrant: connectionCredentialGrantInputSchema.optional(),
  })
  .strict();

export const completeConnectionCallbackCommandInputSchema = z
  .object({
    connectionId: z.string().min(1),
    status: z.enum(["success", "cancel", "error"]).default("success"),
    externalAccountId: z.string().min(1).optional(),
    externalInstallationId: z.string().min(1).optional(),
    expiresAt: z.string().min(1).optional(),
    errorCode: z.string().min(1).optional(),
    errorMessage: z.string().min(1).optional(),
  })
  .strict();

export const revokeConnectionCommandInputSchema = z
  .object({
    connectionId: z.string().min(1),
  })
  .strict();

export type ListConnectionsQueryInput = z.infer<typeof listConnectionsQueryInputSchema>;
export type ShowConnectionQueryInput = z.infer<typeof showConnectionQueryInputSchema>;
export type StartConnectionCommandInput = z.infer<typeof startConnectionCommandInputSchema>;
export type CompleteConnectionCallbackCommandInput = z.infer<
  typeof completeConnectionCallbackCommandInputSchema
>;
export type RevokeConnectionCommandInput = z.infer<typeof revokeConnectionCommandInputSchema>;
