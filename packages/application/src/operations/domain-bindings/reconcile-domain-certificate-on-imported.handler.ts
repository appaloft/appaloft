import { type DomainEvent, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { EventHandler, type EventHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { ReconcileDomainCertificateUseCase } from "./reconcile-domain-certificate.use-case";

@EventHandler("certificate-imported")
@injectable()
export class ReconcileDomainCertificateOnImportedHandler
  implements EventHandlerContract<DomainEvent>
{
  constructor(
    @inject(ReconcileDomainCertificateUseCase)
    private readonly reconcile: ReconcileDomainCertificateUseCase,
  ) {}

  handle(context: ExecutionContext, event: DomainEvent): Promise<Result<void>> {
    return this.reconcile.execute(context, event);
  }
}
