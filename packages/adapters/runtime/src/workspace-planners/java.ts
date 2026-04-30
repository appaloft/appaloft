import { domainError, err, ok, type Result, type SourceInspectionSnapshot } from "@appaloft/core";
import {
  commandMentions,
  dockerBuildFromExecution,
  generatedWorkspaceDockerfileName,
  requiredStartCommand,
  workspaceMetadata,
  type WorkspaceDockerfileInput,
  type WorkspacePlannerInput,
  type WorkspaceRuntimePlan,
  type WorkspaceRuntimePlanner,
} from "./types";

type JavaBuildTool = "gradle" | "maven";

function javaBaseImage(inspection?: SourceInspectionSnapshot): string {
  const version = inspection?.runtimeVersion ?? "21";
  return `eclipse-temurin:${version}-jdk`;
}

function javaBuildTool(inspection?: SourceInspectionSnapshot): JavaBuildTool | undefined {
  if (inspection?.packageManager === "maven" || inspection?.packageManager === "gradle") {
    return inspection.packageManager;
  }

  const hasMaven = Boolean(
    inspection?.hasDetectedFile("pom-xml") || inspection?.hasDetectedFile("maven-wrapper"),
  );
  const hasGradle = Boolean(
    inspection?.hasDetectedFile("gradle-build") || inspection?.hasDetectedFile("gradle-wrapper"),
  );

  if (hasMaven === hasGradle) {
    return undefined;
  }

  return hasMaven ? "maven" : "gradle";
}

function hasAmbiguousBuildTool(inspection?: SourceInspectionSnapshot): boolean {
  return Boolean(
    (inspection?.hasDetectedFile("pom-xml") || inspection?.hasDetectedFile("maven-wrapper")) &&
      (inspection?.hasDetectedFile("gradle-build") || inspection?.hasDetectedFile("gradle-wrapper")),
  );
}

function javaBuildCommand(input: WorkspacePlannerInput): string | undefined {
  if (input.requestedDeployment.buildCommand) {
    return input.requestedDeployment.buildCommand;
  }

  const inspection = input.source.inspection;
  const buildTool = javaBuildTool(inspection);
  const isSpringBoot = inspection?.framework === "spring-boot";

  if (buildTool === "maven") {
    return inspection?.hasDetectedFile("maven-wrapper")
      ? "./mvnw package -DskipTests"
      : "mvn package -DskipTests";
  }

  if (buildTool === "gradle") {
    const task = isSpringBoot ? "bootJar" : "build";
    return inspection?.hasDetectedFile("gradle-wrapper")
      ? `./gradlew ${task} -x test`
      : `gradle ${task} -x test`;
  }

  return undefined;
}

function javaStartCommand(input: WorkspacePlannerInput): string | undefined {
  if (input.requestedDeployment.startCommand) {
    return input.requestedDeployment.startCommand;
  }

  return input.source.inspection?.jarPath
    ? `java -jar ${input.source.inspection.jarPath}`
    : undefined;
}

function javaPlannerName(inspection?: SourceInspectionSnapshot): "java" | "spring-boot" {
  return inspection?.framework === "spring-boot" ? "spring-boot" : "java";
}

function javaHealthCheckPath(inspection?: SourceInspectionSnapshot): string | undefined {
  return inspection?.hasDetectedFile("spring-boot-actuator") ? "/actuator/health" : undefined;
}

function javaUnsupportedError(input: WorkspacePlannerInput): Result<never> | null {
  const inspection = input.source.inspection;

  if (
    (inspection?.framework === "quarkus" || inspection?.framework === "micronaut") &&
    !input.requestedDeployment.startCommand
  ) {
    return err(
      domainError.validation(
        "Detected JVM framework is not supported by an active planner. Configure explicit production commands.",
        {
          phase: "runtime-plan-resolution",
          runtimeFamily: "java",
          framework: inspection.framework,
          reasonCode: "unsupported-framework",
        },
      ),
    );
  }

  if (hasAmbiguousBuildTool(inspection) && !input.requestedDeployment.buildCommand) {
    return err(
      domainError.validation(
        "JVM build tool evidence is ambiguous. Select a source root or configure explicit production commands.",
        {
          phase: "runtime-plan-resolution",
          runtimeFamily: "java",
          reasonCode: "ambiguous-jvm-build-tool",
        },
      ),
    );
  }

  if (!javaBuildTool(inspection) && !input.requestedDeployment.buildCommand && !inspection?.jarPath) {
    return err(
      domainError.validation(
        "JVM planning requires Maven, Gradle, runnable jar, or explicit production commands.",
        {
          phase: "runtime-plan-resolution",
          runtimeFamily: "java",
          reasonCode: "missing-jvm-build-tool",
        },
      ),
    );
  }

  if (!javaStartCommand(input)) {
    return err(
      domainError.validation(
        "JVM planning requires a deterministic runnable jar or explicit production start command.",
        {
          phase: "runtime-plan-resolution",
          runtimeFamily: "java",
          ...(inspection?.framework ? { framework: inspection.framework } : {}),
          reasonCode: "missing-runnable-jar",
        },
      ),
    );
  }

  return null;
}

export const javaWorkspacePlanner: WorkspaceRuntimePlanner = {
  name: "java",
  runtimeKind: "java",

  detect(input) {
    return Boolean(
      input.source.inspection?.runtimeFamily === "java" ||
        input.source.inspection?.hasDetectedFile("pom-xml") ||
        input.source.inspection?.hasDetectedFile("gradle-build") ||
        input.source.inspection?.hasDetectedFile("maven-wrapper") ||
        input.source.inspection?.hasDetectedFile("gradle-wrapper") ||
        commandMentions(input, ["java", "mvn", "gradle", "gradlew"]),
    );
  },

  plan(input): Result<WorkspaceRuntimePlan> {
    const unsupported = javaUnsupportedError(input);
    if (unsupported) {
      return unsupported;
    }

    const startCommand = requiredStartCommand(input, javaStartCommand(input));

    if (startCommand.isErr()) {
      return err(startCommand.error);
    }

    const baseImage = javaBaseImage(input.source.inspection);
    const installCommand = input.requestedDeployment.installCommand;
    const buildCommand = javaBuildCommand(input);
    const planner = javaPlannerName(input.source.inspection);
    const runtimeKind = planner;
    const buildTool = javaBuildTool(input.source.inspection);
    const healthCheckPath = javaHealthCheckPath(input.source.inspection);

    return ok({
      planner,
      runtimeKind,
      dockerfilePath: generatedWorkspaceDockerfileName,
      baseImage,
      applicationShape: "serverful-http",
      ...(installCommand ? { installCommand } : {}),
      ...(buildCommand ? { buildCommand } : {}),
      startCommand: startCommand.value,
      ...(healthCheckPath ? { healthCheckPath } : {}),
      metadata: workspaceMetadata({
        planner,
        runtimeKind,
        baseImage,
        applicationShape: "serverful-http",
        extra: {
          ...(input.source.inspection?.framework
            ? { framework: input.source.inspection.framework }
            : {}),
          ...(buildTool ? { packageManager: buildTool, buildTool } : {}),
          ...(input.source.inspection?.projectName
            ? { projectName: input.source.inspection.projectName }
            : {}),
          ...(input.source.inspection?.jarPath ? { jarPath: input.source.inspection.jarPath } : {}),
          ...(healthCheckPath ? { healthCheckPath } : {}),
        },
      }),
    });
  },

  dockerBuild(input: WorkspaceDockerfileInput) {
    return dockerBuildFromExecution({
      baseImage: input.execution.metadata?.["workspace.baseImage"] ?? javaBaseImage(input.sourceInspection),
      execution: input.execution,
    });
  },
};
