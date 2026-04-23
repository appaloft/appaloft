import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  type DeploymentReadModel,
  type DeploymentSummary,
} from "@appaloft/application";

import { ShellDeploymentEventObserver } from "../src/deployment-event-observer";
import { ShellDeploymentProgressReporter } from "../src/deployment-progress-reporter";

class StaticDeploymentReadModel implements DeploymentReadModel {
  constructor(
    private readonly deployment: DeploymentSummary,
    private readonly logs: Array<{
      timestamp: string;
      source: "appaloft" | "application";
      phase: "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
      level: "debug" | "info" | "warn" | "error";
      message: string;
    }>,
  ) {}

  async list(): Promise<DeploymentSummary[]> {
    return [this.deployment];
  }

  async findOne(): Promise<DeploymentSummary | null> {
    return this.deployment;
  }

  async findLogs() {
    return this.logs;
  }
}

function deploymentSummary(overrides?: Partial<DeploymentSummary>): DeploymentSummary {
  return {
    id: "dep_demo",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_demo",
    serverId: "srv_demo",
    destinationId: "dst_demo",
    status: "running",
    runtimePlan: {
      id: "rplan_demo",
      source: {
        kind: "local-folder",
        locator: ".",
        displayName: "workspace",
      },
      buildStrategy: "workspace-commands",
      packagingMode: "host-process-runtime",
      execution: {
        kind: "host-process",
        port: 3000,
      },
      target: {
        kind: "single-server",
        providerKey: "local-shell",
        serverIds: ["srv_demo"],
      },
      detectSummary: "detected workspace",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["detect", "deploy", "verify"],
    },
    environmentSnapshot: {
      id: "snap_demo",
      environmentId: "env_demo",
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: ["defaults", "environment", "deployment"],
      variables: [],
    },
    logs: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    logCount: 2,
    ...overrides,
  };
}

describe("shell deployment event observer", () => {
  test("[DEP-EVENTS-QRY-006] replays historical logs and buffered progress as structured envelopes", async () => {
    const context = createExecutionContext({
      requestId: "req_shell_deployment_events",
      entrypoint: "system",
    });
    const progressReporter = new ShellDeploymentProgressReporter();
    progressReporter.report(context, {
      timestamp: "2026-01-01T00:00:03.000Z",
      source: "application",
      phase: "deploy",
      level: "info",
      message: "Container booting",
      deploymentId: "dep_demo",
      status: "running",
      step: {
        current: 2,
        total: 3,
        label: "deploy",
      },
    });

    const observer = new ShellDeploymentEventObserver(
      new StaticDeploymentReadModel(deploymentSummary(), [
        {
          timestamp: "2026-01-01T00:00:01.000Z",
          source: "appaloft",
          phase: "detect",
          level: "info",
          message: "Deployment requested",
        },
        {
          timestamp: "2026-01-01T00:00:02.000Z",
          source: "appaloft",
          phase: "deploy",
          level: "info",
          message: "Deploying image",
        },
      ]),
      progressReporter,
    );

    const opened = await observer.open(
      context,
      { deployment: deploymentSummary() },
      {
        historyLimit: 10,
        includeHistory: true,
        follow: false,
        untilTerminal: true,
      },
      new AbortController().signal,
    );

    expect(opened.isOk()).toBe(true);
    const envelopes = [];
    for await (const envelope of opened._unsafeUnwrap()) {
      envelopes.push(envelope);
    }

    expect(envelopes.map((envelope) => envelope.kind)).toEqual([
      "event",
      "event",
      "event",
      "closed",
    ]);
    const eventEnvelopes = envelopes.filter((envelope) => envelope.kind === "event");
    expect(eventEnvelopes).toHaveLength(3);
    expect(eventEnvelopes[0]?.event.sequence).toBe(1);
    expect(eventEnvelopes[2]?.event.source).toBe("process-observation");
  });

  test("[DEP-EVENTS-QRY-003] rejects a cursor that cannot be matched safely", async () => {
    const context = createExecutionContext({
      requestId: "req_shell_invalid_cursor",
      entrypoint: "system",
    });
    const observer = new ShellDeploymentEventObserver(
      new StaticDeploymentReadModel(deploymentSummary(), [
        {
          timestamp: "2026-01-01T00:00:01.000Z",
          source: "appaloft",
          phase: "detect",
          level: "info",
          message: "Deployment requested",
        },
      ]),
      new ShellDeploymentProgressReporter(),
    );

    const opened = await observer.open(
      context,
      { deployment: deploymentSummary() },
      {
        cursor: "dep_demo:99",
        historyLimit: 10,
        includeHistory: true,
        follow: false,
        untilTerminal: true,
      },
      new AbortController().signal,
    );

    expect(opened.isErr()).toBe(true);
    expect(opened._unsafeUnwrapErr().code).toBe("deployment_event_cursor_invalid");
  });
});
