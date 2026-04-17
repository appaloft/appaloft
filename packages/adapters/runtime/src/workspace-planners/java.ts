import { err, ok, type Result, type SourceInspectionSnapshot } from "@appaloft/core";
import {
  commandMentions,
  dockerfileFromExecution,
  generatedWorkspaceDockerfileName,
  requiredStartCommand,
  workspaceMetadata,
  type WorkspaceDockerfileInput,
  type WorkspacePlannerInput,
  type WorkspaceRuntimePlan,
  type WorkspaceRuntimePlanner,
} from "./types";

function javaBaseImage(inspection?: SourceInspectionSnapshot): string {
  const version = inspection?.runtimeVersion ?? "21";
  return `eclipse-temurin:${version}-jdk`;
}

function javaBuildCommand(input: WorkspacePlannerInput): string | undefined {
  return (
    input.requestedDeployment.buildCommand ??
    (input.source.inspection?.hasDetectedFile("maven-wrapper")
      ? "./mvnw package -DskipTests"
      : input.source.inspection?.hasDetectedFile("pom-xml")
        ? "mvn package -DskipTests"
        : input.source.inspection?.hasDetectedFile("gradle-wrapper")
          ? "./gradlew build -x test"
          : input.source.inspection?.hasDetectedFile("gradle-build")
            ? "gradle build -x test"
            : undefined)
  );
}

function javaStartCommand(input: WorkspacePlannerInput): string | undefined {
  return (
    input.requestedDeployment.startCommand ??
    (input.source.inspection?.jarPath
      ? `java -jar ${input.source.inspection.jarPath}`
      : input.source.inspection?.hasDetectedFile("pom-xml") ||
          input.source.inspection?.hasDetectedFile("gradle-build")
        ? "java -jar target/*.jar"
        : undefined)
  );
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
    const startCommand = requiredStartCommand(input, javaStartCommand(input));

    if (startCommand.isErr()) {
      return err(startCommand.error);
    }

    const baseImage = javaBaseImage(input.source.inspection);
    const installCommand = input.requestedDeployment.installCommand;
    const buildCommand = javaBuildCommand(input);

    return ok({
      planner: this.name,
      runtimeKind: this.runtimeKind,
      dockerfilePath: generatedWorkspaceDockerfileName,
      baseImage,
      ...(installCommand ? { installCommand } : {}),
      ...(buildCommand ? { buildCommand } : {}),
      startCommand: startCommand.value,
      metadata: workspaceMetadata({
        planner: this.name,
        runtimeKind: this.runtimeKind,
        baseImage,
      }),
    });
  },

  dockerfile(input: WorkspaceDockerfileInput): string | null {
    return dockerfileFromExecution({
      baseImage: input.execution.metadata?.["workspace.baseImage"] ?? javaBaseImage(input.sourceInspection),
      execution: input.execution,
    });
  },
};
