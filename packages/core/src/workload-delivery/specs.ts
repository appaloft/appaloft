import { domainError } from "../shared/errors";
import { type PortNumber } from "../shared/numeric-values";
import { err, ok, type Result } from "../shared/result";
import {
  type BuildStrategyKindValue,
  type RuntimeKindValue,
  type SourceKindValue,
} from "../shared/state-machine";
import { type HealthCheckPathText, type SourceLocator } from "../shared/text-values";
import { ValueObject } from "../shared/value-object";

export interface SourceSpecState {
  kind: SourceKindValue;
  locator: SourceLocator;
}

export interface BuildSpecState {
  kind: BuildStrategyKindValue;
}

export interface RuntimeSpecState {
  kind: RuntimeKindValue;
  port?: PortNumber;
  healthCheckPath?: HealthCheckPathText;
}

export class SourceSpec extends ValueObject<SourceSpecState> {
  private constructor(state: SourceSpecState) {
    super(state);
  }

  static create(input: SourceSpecState): Result<SourceSpec> {
    return ok(new SourceSpec(input));
  }

  static rehydrate(state: SourceSpecState): SourceSpec {
    return new SourceSpec(state);
  }

  toState(): SourceSpecState {
    return { ...this.state };
  }
}

export class BuildSpec extends ValueObject<BuildSpecState> {
  private constructor(state: BuildSpecState) {
    super(state);
  }

  static create(input: BuildSpecState): Result<BuildSpec> {
    return ok(new BuildSpec(input));
  }

  static rehydrate(state: BuildSpecState): BuildSpec {
    return new BuildSpec(state);
  }

  toState(): BuildSpecState {
    return { ...this.state };
  }
}

export class RuntimeSpec extends ValueObject<RuntimeSpecState> {
  private constructor(state: RuntimeSpecState) {
    super(state);
  }

  static create(input: RuntimeSpecState): Result<RuntimeSpec> {
    const runtime = new RuntimeSpec(input);

    if (runtime.requiresPort() && input.port === undefined) {
      return err(domainError.validation("Web-server runtimes must declare a port"));
    }

    return ok(runtime);
  }

  static rehydrate(state: RuntimeSpecState): RuntimeSpec {
    return new RuntimeSpec(state);
  }

  toState(): RuntimeSpecState {
    return { ...this.state };
  }

  requiresPort(): boolean {
    return this.state.kind.requiresPort();
  }

  canRunStaticSiteWorkload(): boolean {
    return this.state.kind.isStaticSite();
  }

  canRunWorkerWorkload(): boolean {
    return !this.state.kind.isWebServer();
  }
}
