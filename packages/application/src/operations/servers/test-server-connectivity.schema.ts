import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { configureServerCredentialCommandInputSchema } from "./configure-server-credential.schema";

const draftServerConnectivityInputSchema = z.object({
  name: nonEmptyTrimmedString("Server name").optional(),
  host: nonEmptyTrimmedString("Server host"),
  providerKey: nonEmptyTrimmedString("Provider key"),
  port: z.number().int().positive("Server port must be a positive integer").optional(),
  credential: configureServerCredentialCommandInputSchema.shape.credential.optional(),
});

export const testRegisteredServerConnectivityCommandInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server ID"),
});

export const testDraftServerConnectivityCommandInputSchema = z.object({
  server: draftServerConnectivityInputSchema,
});

export const testServerConnectivityCommandInputSchema = z.union([
  testRegisteredServerConnectivityCommandInputSchema,
  testDraftServerConnectivityCommandInputSchema,
]);

export type TestRegisteredServerConnectivityCommandInput = z.input<
  typeof testRegisteredServerConnectivityCommandInputSchema
>;

export type TestDraftServerConnectivityCommandInput = z.input<
  typeof testDraftServerConnectivityCommandInputSchema
>;

export type TestServerConnectivityCommandInput = z.input<
  typeof testServerConnectivityCommandInputSchema
>;

export type ParsedTestServerConnectivityCommandInput = z.output<
  typeof testServerConnectivityCommandInputSchema
>;
