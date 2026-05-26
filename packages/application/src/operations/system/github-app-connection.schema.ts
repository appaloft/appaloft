import { z } from "zod";
import { nonEmptyTrimmedString } from "../shared-schema";

export const githubAppConnectionQueryInputSchema = z.object({}).strict();

export const upsertGitHubAppInstallationCommandInputSchema = z
  .object({
    installationId: nonEmptyTrimmedString("GitHub App installation id"),
    setupAction: z.enum(["install", "update"]).optional(),
  })
  .strict();

export interface GitHubAppConnectionStatus {
  accountLogin?: string;
  accountType?: string;
  callbackUrl?: string;
  configurationStatus: "configured" | "not-configured" | "partial" | "unknown";
  connected: boolean;
  installUrl?: string;
  installationId?: string;
  repositoryCount?: number;
  repositoriesSelection?: "all" | "selected";
  suspendedAt?: string;
  tenantId: string;
  updatedAt?: string;
  webhookUrl?: string;
}

export type GitHubAppConnectionQueryInput = z.input<typeof githubAppConnectionQueryInputSchema>;
export type UpsertGitHubAppInstallationCommandInput = z.input<
  typeof upsertGitHubAppInstallationCommandInputSchema
>;
