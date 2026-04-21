import {
  type AppLogger,
  type DefaultAccessDomainGeneration,
  type DefaultAccessDomainPolicyConfiguration,
  type DefaultAccessDomainPolicyStore,
  type DefaultAccessDomainPolicySupport,
  type DefaultAccessDomainProvider,
  type DefaultAccessDomainRequest,
  type ExecutionContext,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { SslipDefaultAccessDomainProvider } from "@appaloft/provider-default-access-domain-sslip";

function configuredProviders(config: AppConfig["defaultAccessDomain"]) {
  const providers = new Map<string, DefaultAccessDomainProvider>();

  if (config.providerKey === "sslip") {
    providers.set(
      config.providerKey,
      new SslipDefaultAccessDomainProvider({
        providerKey: config.providerKey,
        zone: config.zone,
        scheme: config.scheme,
      }),
    );
  }

  return providers;
}

function staticFallbackPolicy(
  config: AppConfig["defaultAccessDomain"],
): DefaultAccessDomainPolicyConfiguration {
  if (config.mode === "disabled") {
    return { mode: "disabled" };
  }

  return {
    mode: "provider",
    providerKey: config.providerKey,
  };
}

export class DisabledDefaultAccessDomainProvider implements DefaultAccessDomainProvider {
  constructor(
    private readonly reason: string,
    private readonly providerKey?: string,
  ) {}

  async generate(
    _context: ExecutionContext,
    _input: DefaultAccessDomainRequest,
  ): Promise<Result<DefaultAccessDomainGeneration>> {
    return ok({
      kind: "disabled",
      reason: this.reason,
      ...(this.providerKey ? { providerKey: this.providerKey } : {}),
    });
  }
}

export class ShellDefaultAccessDomainPolicySupport implements DefaultAccessDomainPolicySupport {
  private readonly providers: Map<string, DefaultAccessDomainProvider>;

  constructor(private readonly config: AppConfig["defaultAccessDomain"]) {
    this.providers = configuredProviders(config);
  }

  async validate(
    _context: ExecutionContext,
    input: DefaultAccessDomainPolicyConfiguration,
  ): Promise<Result<DefaultAccessDomainPolicyConfiguration>> {
    if (input.mode === "disabled") {
      return ok({ mode: "disabled" });
    }

    if (input.mode === "custom-template") {
      return err(
        domainError.defaultAccessProviderUnavailable(
          "Default access custom-template providers are not configured",
          {
            phase: "provider-resolution",
            providerKey: input.providerKey ?? "custom-template",
          },
          false,
        ),
      );
    }

    const providerKey = input.providerKey ?? "";
    if (!this.providers.has(providerKey)) {
      return err(
        domainError.defaultAccessProviderUnavailable(
          "Default access domain provider is not registered",
          {
            phase: "provider-resolution",
            providerKey,
            configuredProviderKey: this.config.providerKey,
          },
          false,
        ),
      );
    }

    return ok({
      mode: "provider",
      providerKey,
    });
  }
}

export class PolicyAwareDefaultAccessDomainProvider implements DefaultAccessDomainProvider {
  private readonly providers: Map<string, DefaultAccessDomainProvider>;

  constructor(
    private readonly policyStore: DefaultAccessDomainPolicyStore,
    private readonly config: AppConfig["defaultAccessDomain"],
    private readonly logger: AppLogger,
  ) {
    this.providers = configuredProviders(config);
  }

  async generate(
    context: ExecutionContext,
    input: DefaultAccessDomainRequest,
  ): Promise<Result<DefaultAccessDomainGeneration>> {
    const serverScoped = await this.policyStore.read({
      kind: "deployment-target",
      serverId: input.serverId,
    });
    if (serverScoped.isErr()) {
      return err(serverScoped.error);
    }

    const systemScoped = serverScoped.value
      ? ok<DefaultAccessDomainPolicyConfiguration | null>(serverScoped.value)
      : await this.policyStore.read({ kind: "system" });
    if (systemScoped.isErr()) {
      return err(systemScoped.error);
    }

    const policy = serverScoped.value ?? systemScoped.value ?? staticFallbackPolicy(this.config);
    const isStaticFallback = !serverScoped.value && !systemScoped.value;

    if (policy.mode === "disabled") {
      return ok({
        kind: "disabled",
        reason: "policy-disabled",
        ...(isStaticFallback && this.config.providerKey
          ? { providerKey: this.config.providerKey }
          : {}),
      });
    }

    if (policy.mode === "custom-template") {
      return err(
        domainError.defaultAccessProviderUnavailable(
          "Default access custom-template providers are not configured",
          {
            phase: "provider-resolution",
            providerKey: policy.providerKey ?? "custom-template",
            ...(policy.templateRef ? { templateRef: policy.templateRef } : {}),
          },
          false,
        ),
      );
    }

    const provider = policy.providerKey ? this.providers.get(policy.providerKey) : undefined;
    if (!provider) {
      if (isStaticFallback) {
        this.logger.warn("default_access_domain_provider_unknown", {
          providerKey: policy.providerKey,
        });
        return ok({
          kind: "disabled",
          reason: "unknown-provider",
          ...(policy.providerKey ? { providerKey: policy.providerKey } : {}),
        });
      }

      return err(
        domainError.defaultAccessProviderUnavailable(
          "Default access domain provider is not registered",
          {
            phase: "provider-resolution",
            providerKey: policy.providerKey ?? "",
          },
          false,
        ),
      );
    }

    return provider.generate(context, input);
  }
}
