import { type DomainError, type Result } from "@appaloft/core";

export type DevelopmentWatchMode = "native" | "restart" | "none";

export interface DevelopmentServicePlan {
  key: string;
  commandIntent: string;
  commandArgs?: readonly string[];
  cleanupArgs?: readonly string[];
  watch: DevelopmentWatchMode;
  workingDirectory: string;
  port?: number;
  healthPath?: string;
  environment?: Readonly<Record<string, string>>;
}

export interface DevelopmentPlan {
  sourceRoot: string;
  configFilePath: string | null;
  deploymentGraph: unknown;
  services: DevelopmentServicePlan[];
}

export interface DevelopmentSessionView {
  state: string;
  sourceRoot: string;
  sessionId?: string;
  supervisorPid?: number;
  gatewayUrl?: string;
  services?: readonly {
    key: string;
    state: string;
    pid?: number;
    url?: string;
    readiness?: "ready" | "running-unverified" | "failed";
    watch?: DevelopmentWatchMode;
  }[];
  [key: string]: unknown;
}

export interface DevelopmentSessionRuntime {
  start(input: {
    plan: DevelopmentPlan;
    detach: boolean;
    envFiles: readonly string[];
    environmentOverlay: Readonly<Record<string, string>>;
    https?: boolean;
    trust?: boolean;
  }): Promise<Result<DevelopmentSessionView, DomainError>>;
  status(input: { sourceRoot: string }): Promise<Result<unknown, DomainError>>;
  logs(input: {
    sourceRoot: string;
    follow: boolean;
    tail: number;
  }): Promise<Result<unknown, DomainError>>;
  stop(input: { sourceRoot: string }): Promise<Result<unknown, DomainError>>;
  reset(input: { sourceRoot: string }): Promise<Result<unknown, DomainError>>;
  supervise?(input: { stateDirectory: string }): Promise<Result<unknown, DomainError>>;
}
