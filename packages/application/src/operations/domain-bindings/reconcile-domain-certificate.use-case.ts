import {
  CertificateByIdSpec,
  CertificateId,
  CreatedAt,
  DomainBindingByIdSpec,
  DomainBindingId,
  type DomainEvent,
  domainError,
  err,
  ok,
  type Result,
  safeTry,
  UpsertDomainBindingSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type CertificateMaterializer,
  type CertificateMaterialReference,
  type CertificateRepository,
  type CertificateRouteActivator,
  type Clock,
  type DomainBindingRepository,
  type EventBus,
  type TlsCertificateObservation,
  type TlsCertificateObserver,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";

function payloadText(event: DomainEvent, key: string): Result<string> {
  const value = event.payload[key];
  return typeof value === "string" && value.trim()
    ? ok(value.trim())
    : err(
        domainError.validation(`${event.type} payload ${key} is required`, {
          eventName: event.type,
          phase: "certificate-route-reconciliation",
          field: key,
        }),
      );
}

function materialReference(
  certificateId: string,
  state: ReturnType<NonNullable<Awaited<ReturnType<CertificateRepository["findOne"]>>>["toState"]>,
): Result<CertificateMaterialReference> {
  if (state.source.value === "managed" && state.secretRef) {
    return ok({ certificateId, source: "managed", secretRef: state.secretRef.value });
  }
  if (state.source.value === "imported" && state.importedSecretRefs) {
    return ok({
      certificateId,
      source: "imported",
      certificateChainRef: state.importedSecretRefs.certificateChain.value,
      privateKeyRef: state.importedSecretRefs.privateKey.value,
      ...(state.importedSecretRefs.passphrase
        ? { passphraseRef: state.importedSecretRefs.passphrase.value }
        : {}),
    });
  }
  return err(
    domainError.certificateRouteReconciliationFailed(
      "Certificate material references are unavailable",
      { phase: "certificate-materialization", certificateId },
    ),
  );
}

function proofMatches(
  expectedFingerprint: string,
  domainName: string,
  now: string,
  observation: TlsCertificateObservation,
): boolean {
  return (
    observation.fingerprint === expectedFingerprint &&
    observation.subjectAlternativeNames.includes(domainName) &&
    observation.notBefore <= now &&
    observation.expiresAt > now
  );
}

@injectable()
export class ReconcileDomainCertificateUseCase {
  constructor(
    @inject(tokens.domainBindingRepository)
    private readonly domainBindings: DomainBindingRepository,
    @inject(tokens.certificateRepository)
    private readonly certificates: CertificateRepository,
    @inject(tokens.certificateMaterializer)
    private readonly materializer: CertificateMaterializer,
    @inject(tokens.certificateRouteActivator)
    private readonly activator: CertificateRouteActivator,
    @inject(tokens.tlsCertificateObserver)
    private readonly observer: TlsCertificateObserver,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(context: ExecutionContext, event: DomainEvent): Promise<Result<void>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      activator,
      certificates,
      clock,
      domainBindings,
      eventBus,
      logger,
      materializer,
      observer,
    } = this;

    return safeTry(async function* () {
      const domainBindingId = yield* DomainBindingId.create(
        yield* payloadText(event, "domainBindingId"),
      );
      const certificateId = yield* CertificateId.create(yield* payloadText(event, "certificateId"));
      const domainBinding = await domainBindings.findOne(
        repositoryContext,
        DomainBindingByIdSpec.create(domainBindingId),
      );
      if (!domainBinding) return err(domainError.notFound("Domain binding", domainBindingId.value));
      if (domainBinding.isReady()) return ok(undefined);

      const certificate = await certificates.findOne(
        repositoryContext,
        CertificateByIdSpec.create(certificateId),
      );
      if (!certificate) return err(domainError.notFound("Certificate", certificateId.value));

      const bindingState = domainBinding.toState();
      const certificateState = certificate.toState();
      if (
        !certificateState.domainBindingId.equals(domainBindingId) ||
        !certificateState.fingerprint
      ) {
        return err(
          domainError.certificateRouteReconciliationFailed(
            "Certificate does not provide a binding-scoped proof fingerprint",
            {
              phase: "certificate-route-reconciliation",
              certificateId: certificateId.value,
              domainBindingId: domainBindingId.value,
            },
          ),
        );
      }

      const reference = yield* materialReference(certificateId.value, certificateState);
      const material = yield* await materializer.materialize(context, reference);
      const activationInput = {
        certificateId: certificateId.value,
        certificateSource: reference.source,
        domainBindingId: domainBindingId.value,
        projectId: bindingState.projectId.value,
        environmentId: bindingState.environmentId.value,
        resourceId: bindingState.resourceId.value,
        domainName: bindingState.domainName.value,
        pathPrefix: bindingState.pathPrefix.value,
        ...(bindingState.targetServiceName
          ? { targetServiceName: bindingState.targetServiceName.value }
          : {}),
        proxyKind: bindingState.proxyKind.value,
        ...(bindingState.serverId ? { serverId: bindingState.serverId.value } : {}),
        ...(bindingState.destinationId ? { destinationId: bindingState.destinationId.value } : {}),
        material,
      };
      const activation = yield* await activator.activate(context, activationInput);
      const observationResult = await observer.observe(context, {
        serverName: bindingState.domainName.value,
        proxyKind: bindingState.proxyKind.value,
        ...(bindingState.serverId ? { serverId: bindingState.serverId.value } : {}),
        activationId: activation.activationId,
      });
      if (observationResult.isErr()) {
        yield* await activator.rollback(context, { ...activationInput, ...activation });
        return err(observationResult.error);
      }

      const now = clock.now();
      if (
        !proofMatches(
          certificateState.fingerprint.value,
          bindingState.domainName.value,
          now,
          observationResult.value,
        )
      ) {
        yield* await activator.rollback(context, { ...activationInput, ...activation });
        return err(
          domainError.certificateRouteReconciliationFailed(
            "Served certificate proof did not match the selected certificate",
            {
              phase: "tls-certificate-proof",
              certificateId: certificateId.value,
              domainBindingId: domainBindingId.value,
            },
          ),
        );
      }

      const finalized = await activator.finalize(context, { ...activationInput, ...activation });
      if (finalized.isErr()) {
        yield* await activator.rollback(context, { ...activationInput, ...activation });
        return err(finalized.error);
      }

      yield* domainBinding.markReady({
        readyAt: yield* CreatedAt.create(now),
        correlationId: context.requestId,
        causationId: event.aggregateId,
      });
      await domainBindings.upsert(
        repositoryContext,
        domainBinding,
        UpsertDomainBindingSpec.fromDomainBinding(domainBinding),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, domainBinding, undefined);
      return ok(undefined);
    });
  }
}
