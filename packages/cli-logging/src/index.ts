import { type DeploymentProgressEvent } from "@yundu/application";
import {
  type Deployment,
  type DeploymentTarget,
  type DeploymentTargetVisitor,
  type DeploymentVisitor,
  type Environment,
  type EnvironmentVisitor,
  type IntegrationConnection,
  type IntegrationConnectionVisitor,
  type Organization,
  type OrganizationMember,
  type OrganizationMemberVisitor,
  type OrganizationVisitor,
  type PluginInstallation,
  type PluginInstallationVisitor,
  type Project,
  type ProjectVisitor,
  type ProviderConnection,
  type ProviderConnectionVisitor,
  type Release,
  type ReleaseVisitor,
  type ResourceBinding,
  type ResourceBindingVisitor,
  type ResourceInstance,
  type ResourceInstanceVisitor,
  type Workload,
  type WorkloadVisitor,
} from "@yundu/core";

type OutputStream = Pick<NodeJS.WriteStream, "columns" | "isTTY" | "write">;

export interface DeploymentLogRendererOptions {
  appLogLines?: number;
  color?: boolean;
  interactive?: boolean;
  output?: OutputStream;
}

export interface CliLogRendererOptions extends Omit<DeploymentLogRendererOptions, "output"> {
  stdout?: OutputStream;
  stderr?: OutputStream;
}

export interface CliPlainLogInput {
  label?: string;
  level?: "debug" | "info" | "warn" | "error";
  message: string;
}

export interface CliLogVisitContext {
  operation?: string;
  mode?: "summary" | "detail";
  tool?: "bun" | "docker" | "npm" | "pnpm" | "system" | "unknown";
}

export type CliLogVisitResult = CliPlainLogInput;

interface DeploymentRenderSection {
  event: DeploymentProgressEvent;
  appLogs: DeploymentProgressEvent[];
}

export class CliAggregateLogVisitor
  implements
    ProjectVisitor<CliLogVisitContext, CliLogVisitResult>,
    EnvironmentVisitor<CliLogVisitContext, CliLogVisitResult>,
    DeploymentTargetVisitor<CliLogVisitContext, CliLogVisitResult>,
    WorkloadVisitor<CliLogVisitContext, CliLogVisitResult>,
    ResourceInstanceVisitor<CliLogVisitContext, CliLogVisitResult>,
    ResourceBindingVisitor<CliLogVisitContext, CliLogVisitResult>,
    ReleaseVisitor<CliLogVisitContext, CliLogVisitResult>,
    DeploymentVisitor<CliLogVisitContext, CliLogVisitResult>,
    ProviderConnectionVisitor<CliLogVisitContext, CliLogVisitResult>,
    IntegrationConnectionVisitor<CliLogVisitContext, CliLogVisitResult>,
    PluginInstallationVisitor<CliLogVisitContext, CliLogVisitResult>,
    OrganizationMemberVisitor<CliLogVisitContext, CliLogVisitResult>,
    OrganizationVisitor<CliLogVisitContext, CliLogVisitResult>
{
  visitProject(project: Project, context: CliLogVisitContext): CliLogVisitResult {
    const state = project.toState();
    return this.entry(context, "project", `${state.name.value} (${state.slug.value})`);
  }

  visitEnvironment(environment: Environment, context: CliLogVisitContext): CliLogVisitResult {
    const state = environment.toState();
    return this.entry(
      context,
      "environment",
      `${state.name.value} ${state.kind.value} with ${state.variables.toState().length} variables`,
    );
  }

  visitDeploymentTarget(target: DeploymentTarget, context: CliLogVisitContext): CliLogVisitResult {
    const state = target.toState();
    return this.entry(
      context,
      "target",
      `${state.name.value} ${state.providerKey.value} ${state.host.value}:${state.port.value}`,
    );
  }

  visitWorkload(workload: Workload, context: CliLogVisitContext): CliLogVisitResult {
    const state = workload.toState();
    return this.entry(context, "workload", `${state.name.value} ${state.kind.value}`);
  }

  visitResourceInstance(
    resourceInstance: ResourceInstance,
    context: CliLogVisitContext,
  ): CliLogVisitResult {
    const state = resourceInstance.toState();
    return this.entry(
      context,
      "resource",
      `${state.name.value} ${state.kind.value} ${state.status.value}`,
    );
  }

  visitResourceBinding(
    resourceBinding: ResourceBinding,
    context: CliLogVisitContext,
  ): CliLogVisitResult {
    const state = resourceBinding.toState();
    return this.entry(
      context,
      "binding",
      `${state.alias.value} ${state.scope.value} via ${state.injectionMode.value}`,
    );
  }

  visitRelease(release: Release, context: CliLogVisitContext): CliLogVisitResult {
    const state = release.toState();
    const status = state.sealedAt ? "sealed" : "prepared";
    return this.entry(context, "release", `${state.version.value} ${status}`);
  }

  visitDeployment(deployment: Deployment, context: CliLogVisitContext): CliLogVisitResult {
    const state = deployment.toState();
    return this.entry(
      context,
      "deployment",
      `${state.id.value} ${state.status.value} ${state.runtimePlan.buildStrategy}`,
    );
  }

  visitProviderConnection(
    providerConnection: ProviderConnection,
    context: CliLogVisitContext,
  ): CliLogVisitResult {
    const state = providerConnection.toState();
    return this.entry(
      context,
      "provider",
      `${state.name.value} ${state.providerKey.value} ${state.status.value}`,
    );
  }

  visitIntegrationConnection(
    integrationConnection: IntegrationConnection,
    context: CliLogVisitContext,
  ): CliLogVisitResult {
    const state = integrationConnection.toState();
    return this.entry(
      context,
      "integration",
      `${state.name.value} ${state.integrationKey.value} ${state.status.value}`,
    );
  }

  visitPluginInstallation(
    pluginInstallation: PluginInstallation,
    context: CliLogVisitContext,
  ): CliLogVisitResult {
    const state = pluginInstallation.toState();
    return this.entry(
      context,
      "plugin",
      `${state.pluginName.value}@${state.version.value} ${state.status.value}`,
    );
  }

  visitOrganizationMember(
    member: OrganizationMember,
    context: CliLogVisitContext,
  ): CliLogVisitResult {
    const state = member.toState();
    return this.entry(context, "member", `${state.userId.value} ${state.role.value}`);
  }

  visitOrganization(organization: Organization, context: CliLogVisitContext): CliLogVisitResult {
    const state = organization.toState();
    return this.entry(
      context,
      "organization",
      `${state.name.value} ${state.plan.toState().tier.value} with ${state.members.length} members`,
    );
  }

  private entry(context: CliLogVisitContext, label: string, message: string): CliLogVisitResult {
    const operation = context.operation ? `${context.operation}:` : "";
    const tool = context.tool && context.tool !== "unknown" ? ` via ${context.tool}` : "";
    return {
      label: `${operation}${label}`,
      message: context.mode === "detail" ? `${message}${tool}` : message,
    };
  }
}

const spinnerFrames = ["-", "\\", "|", "/"] as const;

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  clearLine: "\x1b[2K",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
} as const;

function applyColor(enabled: boolean, value: string, ...codes: string[]): string {
  const prefix = codes.join("");
  return enabled && prefix ? `${prefix}${value}${ansi.reset}` : value;
}

function labelFor(event: DeploymentProgressEvent): string {
  const source = event.source === "application" ? "app" : "yundu";
  const stream = event.stream ? ` ${event.stream}` : "";
  return `${source}${stream}`;
}

function statusMark(event: DeploymentProgressEvent, spinnerFrame: string): string {
  switch (event.status) {
    case "succeeded":
      return "ok";
    case "failed":
      return "error";
    case "running":
      return spinnerFrame;
    default:
      return event.level === "error" ? "error" : event.level === "warn" ? "warn" : "info";
  }
}

function truncate(value: string, width: number): string {
  if (width <= 0 || value.length <= width) {
    return value;
  }

  return `${value.slice(0, Math.max(0, width - 3))}...`;
}

export class DeploymentLogRenderer {
  private readonly output: OutputStream;
  private readonly appLogLines: number;
  private readonly color: boolean;
  private readonly interactive: boolean;
  private spinnerIndex = 0;
  private current: DeploymentRenderSection | undefined;
  private lastLineCount = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private started = false;

  constructor(options: DeploymentLogRendererOptions = {}) {
    this.output = options.output ?? process.stderr;
    this.appLogLines = Math.max(0, Math.trunc(options.appLogLines ?? 3));
    this.color = options.color ?? Boolean(this.output.isTTY && !process.env.NO_COLOR);
    this.interactive = options.interactive ?? Boolean(this.output.isTTY && !process.env.CI);
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    if (!this.interactive) {
      return;
    }

    this.output.write(ansi.hideCursor);
    this.timer = setInterval(() => {
      this.spinnerIndex = (this.spinnerIndex + 1) % spinnerFrames.length;
      this.render();
    }, 80);
  }

  handle(event: DeploymentProgressEvent): void {
    this.start();

    if (!this.interactive) {
      this.writePlain(event);
      return;
    }

    if (event.source === "application") {
      this.addApplicationEvent(event);
    } else {
      this.addYunduEvent(event);
    }
  }

  stop(input: { failed?: boolean } = {}): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    if (!this.started) {
      return;
    }

    if (this.interactive) {
      if (input.failed && this.current) {
        this.current.event = {
          ...this.current.event,
          status: "failed",
          level: "error",
        };
      }
      this.flushCurrent({ keepAppLogs: Boolean(input.failed) });
      this.output.write(ansi.showCursor);
    }
  }

  private writePlain(event: DeploymentProgressEvent): void {
    const status = statusMark(event, "info");
    const line =
      event.source === "application"
        ? `  ${labelFor(event)} | ${event.message}\n`
        : `${status} yundu [${this.stepText(event)}] ${event.message}\n`;
    this.output.write(line);
  }

  private render(): void {
    const current = this.current;
    if (!current) {
      return;
    }

    const lines = [
      this.formatYunduLine(current.event),
      ...current.appLogs.map((event) => this.formatAppLine(event)),
    ];

    this.clearPreviousLines();
    this.output.write(lines.join("\n"));
    this.lastLineCount = lines.length;
  }

  private addApplicationEvent(event: DeploymentProgressEvent): void {
    if (!this.current || this.appLogLines === 0) {
      return;
    }

    this.current.appLogs.push(event);
    if (this.current.appLogs.length > this.appLogLines) {
      this.current.appLogs.splice(0, this.current.appLogs.length - this.appLogLines);
    }
    this.render();
  }

  private addYunduEvent(event: DeploymentProgressEvent): void {
    if (
      this.current &&
      this.current.event.phase === event.phase &&
      this.current.event.status === "running" &&
      (event.status === "succeeded" || event.status === "failed")
    ) {
      this.current.event = event;
      this.flushCurrent({ keepAppLogs: event.status === "failed" });
      return;
    }

    if (event.status === "running") {
      if (this.current?.event.status === "running" && this.current.appLogs.length === 0) {
        this.current.event = event;
      } else {
        this.clearPreviousLines();
        this.current = {
          event,
          appLogs: [],
        };
      }
      this.render();
      return;
    }

    this.clearPreviousLines();
    this.current = undefined;
    this.writeHistoryLine(this.formatYunduLine(event));
  }

  private flushCurrent(input: { keepAppLogs: boolean }): void {
    const current = this.current;
    if (!current) {
      return;
    }

    this.clearPreviousLines();
    this.current = undefined;
    this.writeHistoryLine(this.formatYunduLine(current.event));

    if (input.keepAppLogs) {
      for (const event of current.appLogs) {
        this.writeHistoryLine(this.formatAppLine(event));
      }
    }
  }

  private writeHistoryLine(line: string): void {
    this.output.write(`${line}\n`);
  }

  private clearPreviousLines(): void {
    if (this.lastLineCount === 0) {
      return;
    }

    this.output.write(`\r${ansi.clearLine}`);
    for (let index = 1; index < this.lastLineCount; index += 1) {
      this.output.write(`\x1b[1A\r${ansi.clearLine}`);
    }
    this.lastLineCount = 0;
  }

  private stepText(event: DeploymentProgressEvent): string {
    return event.step
      ? `${event.step.current}/${event.step.total} ${event.step.label}`
      : event.phase;
  }

  private formatYunduLine(event: DeploymentProgressEvent): string {
    const frame = spinnerFrames[this.spinnerIndex] ?? "-";
    const mark = statusMark(event, frame);
    const markColor =
      event.status === "failed" || event.level === "error"
        ? ansi.red
        : event.status === "succeeded"
          ? ansi.green
          : ansi.cyan;
    const label = applyColor(this.color, "yundu", ansi.bold, ansi.cyan);
    const status = applyColor(this.color, mark, markColor);
    const prefix = `${status} ${label} ${applyColor(this.color, `[${this.stepText(event)}]`, ansi.bold)}`;
    return truncate(`${prefix} ${event.message}`, this.output.columns ?? 120);
  }

  private formatAppLine(event: DeploymentProgressEvent): string {
    const label = applyColor(this.color, labelFor(event), ansi.dim, ansi.magenta);
    const levelColor =
      event.level === "error" ? ansi.red : event.level === "warn" ? ansi.yellow : ansi.dim;
    const message = applyColor(this.color, event.message, levelColor);
    return truncate(`  ${label} | ${message}`, this.output.columns ?? 120);
  }
}

export class CliLogRenderer {
  private readonly stdout: OutputStream;
  private readonly stderr: OutputStream;
  private readonly deploymentRenderer: DeploymentLogRenderer;

  constructor(options: CliLogRendererOptions = {}) {
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
    this.deploymentRenderer = new DeploymentLogRenderer({
      output: this.stderr,
      ...(options.appLogLines === undefined ? {} : { appLogLines: options.appLogLines }),
      ...(options.color === undefined ? {} : { color: options.color }),
      ...(options.interactive === undefined ? {} : { interactive: options.interactive }),
    });
  }

  json(value: unknown): void {
    this.stdout.write(`${JSON.stringify(value, null, 2) ?? "null"}\n`);
  }

  plain(input: CliPlainLogInput): void {
    const level = input.level ?? "info";
    const label = input.label ? `[${input.label}] ` : "";
    this.stderr.write(`${label}${level}: ${input.message}\n`);
  }

  deploymentProgress(event: DeploymentProgressEvent): void {
    this.deploymentRenderer.handle(event);
  }

  stopDeploymentProgress(input: { failed?: boolean } = {}): void {
    this.deploymentRenderer.stop(input);
  }
}

export function createDeploymentLogRenderer(
  options?: DeploymentLogRendererOptions,
): DeploymentLogRenderer {
  return new DeploymentLogRenderer(options);
}

export function createCliLogRenderer(options?: CliLogRendererOptions): CliLogRenderer {
  return new CliLogRenderer(options);
}

export function createCliAggregateLogVisitor(): CliAggregateLogVisitor {
  return new CliAggregateLogVisitor();
}
