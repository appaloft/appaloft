import { domainError, err, ok, type Result, safeTry } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type CertificateReadModel,
  type DomainBindingDeleteSafety,
  type DomainBindingReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CheckDomainBindingDeleteSafetyQueryInput } from "./check-domain-binding-delete-safety.query";
import { domainBindingDeleteSafety } from "./domain-binding-delete-safety";

@injectable()
export class CheckDomainBindingDeleteSafetyQueryService {
  constructor(
    @inject(tokens.domainBindingReadModel)
    private readonly domainBindingReadModel: DomainBindingReadModel,
    @inject(tokens.certificateReadModel)
    private readonly certificateReadModel: CertificateReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CheckDomainBindingDeleteSafetyQueryInput,
  ): Promise<Result<DomainBindingDeleteSafety>> {
    const repositoryContext = toRepositoryContext(context);
    const { certificateReadModel, domainBindingReadModel } = this;

    return safeTry(async function* () {
      const bindings = await domainBindingReadModel.list(repositoryContext);
      const binding = bindings.find((candidate) => candidate.id === input.domainBindingId);

      if (!binding) {
        return err(domainError.notFound("DomainBinding", input.domainBindingId));
      }

      const certificates = await certificateReadModel.list(repositoryContext, {
        domainBindingId: binding.id,
      });

      return ok(domainBindingDeleteSafety({ domainBindingId: binding.id, certificates }));
    });
  }
}
