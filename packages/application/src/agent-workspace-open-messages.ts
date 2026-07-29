import { type Result } from "@appaloft/core";
import { z } from "zod";
import { type WorkspaceOpenInput, type WorkspaceOpenResult } from "./agent-workspace-open";
import { Command } from "./cqrs";
import { parseOperationInput } from "./operations/shared-schema";

const gitRef = z
  .string()
  .trim()
  .min(1)
  .max(1_024)
  .refine((value) => !value.startsWith("-"), {
    message: "Git ref must not start with '-'",
  });
const exactGitCommitSha = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u);
const repositoryIdentity = z
  .string()
  .trim()
  .min(3)
  .max(2_048)
  .refine((value) => !/[\s?#@]/u.test(value), {
    message: "Repository identity is invalid",
  });
const credentialFreeHttpsRepository = z
  .url()
  .max(2_048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  }, "Repository must be a credential-free HTTPS URL");

export const openAgentWorkspaceInputSchema = z
  .object({
    repository: credentialFreeHttpsRepository,
    repositoryIdentity,
    ref: gitRef,
    branch: gitRef,
    commitSha: exactGitCommitSha,
    profile: z.string().trim().min(1).max(160).optional(),
    forceNew: z.boolean().optional(),
    attach: z.boolean().optional(),
  })
  .strict();

export class OpenAgentWorkspaceCommand extends Command<WorkspaceOpenResult> {
  constructor(readonly input: WorkspaceOpenInput) {
    super();
  }

  static create(input: unknown): Result<OpenAgentWorkspaceCommand> {
    return parseOperationInput(openAgentWorkspaceInputSchema, input).map(
      (parsed) =>
        new OpenAgentWorkspaceCommand({
          repository: parsed.repository,
          repositoryIdentity: parsed.repositoryIdentity,
          ref: parsed.ref,
          branch: parsed.branch,
          commitSha: parsed.commitSha,
          ...(parsed.profile ? { profile: parsed.profile } : {}),
          ...(parsed.forceNew !== undefined ? { forceNew: parsed.forceNew } : {}),
          ...(parsed.attach !== undefined ? { attach: parsed.attach } : {}),
        }),
    );
  }
}
