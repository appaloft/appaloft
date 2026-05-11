import { err, ok, type Result, safeTry } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AuthBootstrapStatusReader,
  type FirstAdminBootstrapper,
  type FirstAdminPasswordIssuer,
  type ProductLoginMethodStatus,
} from "../../ports";
import { tokens } from "../../tokens";
import { firstAdminBootstrapDisabled } from "./auth-errors";

export interface BootstrapFirstAdminUseCaseInput {
  displayName: string;
  email: string;
  organizationName?: string;
  organizationSlug?: string;
  password?: string;
}

export interface BootstrapFirstAdminUseCaseResult {
  bootstrapRequired: false;
  created: boolean;
  email: string;
  loginMethods: ProductLoginMethodStatus[];
  organizationId: string;
  organizationSlug: string;
  userId: string;
  generatedPassword?: string;
  loginUrl?: string;
}

@injectable()
export class BootstrapFirstAdminUseCase {
  constructor(
    @inject(tokens.authBootstrapStatusReader)
    private readonly statusReader: AuthBootstrapStatusReader,
    @inject(tokens.firstAdminBootstrapper)
    private readonly firstAdminBootstrapper: FirstAdminBootstrapper,
    @inject(tokens.firstAdminPasswordIssuer)
    private readonly passwordIssuer: FirstAdminPasswordIssuer,
  ) {}

  async execute(
    context: ExecutionContext,
    input: BootstrapFirstAdminUseCaseInput,
  ): Promise<Result<BootstrapFirstAdminUseCaseResult>> {
    const statusReader = this.statusReader;
    const firstAdminBootstrapper = this.firstAdminBootstrapper;
    const passwordIssuer = this.passwordIssuer;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const status = yield* await statusReader.getStatus(repositoryContext);
      if (!status.bootstrapRequired) {
        return err(
          firstAdminBootstrapDisabled({
            ...(status.organizationId ? { organizationId: status.organizationId } : {}),
          }),
        );
      }

      const suppliedPassword = input.password?.trim();
      let password = suppliedPassword;
      let generatedPassword: string | undefined;
      if (!password) {
        const generated = yield* await passwordIssuer.issue(context);
        generatedPassword = generated.password;
        password = generated.password;
      }
      const record = yield* await firstAdminBootstrapper.bootstrapFirstAdmin(context, {
        email: input.email,
        displayName: input.displayName,
        password,
        organizationName: input.organizationName?.trim() || "Self-hosted Appaloft",
        ...(input.organizationSlug?.trim()
          ? { organizationSlug: input.organizationSlug.trim() }
          : {}),
      });

      return ok({
        bootstrapRequired: false as const,
        created: true,
        email: record.email,
        loginMethods: status.loginMethods,
        organizationId: record.organizationId,
        organizationSlug: record.organizationSlug,
        userId: record.userId,
        ...(generatedPassword ? { generatedPassword } : {}),
        ...(status.loginUrl ? { loginUrl: status.loginUrl } : {}),
      });
    });
  }
}
