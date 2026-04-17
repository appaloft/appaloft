import { z } from "zod";

export const toolNameSchema = z.enum([
  "detect_project",
  "package_workspace",
  "create_project",
  "register_server",
  "create_environment",
  "plan_deployment",
  "deploy_release",
  "stream_logs",
]);

export const toolContractSchema = z.object({
  name: toolNameSchema,
  description: z.string(),
  cliCommand: z.string(),
  httpRoute: z.string(),
});

export const toolContracts = [
  {
    name: "detect_project",
    description: "Detect the current workspace source and build strategy.",
    cliCommand: "appaloft deploy <path-or-source>",
    httpRoute: "POST /api/deployments",
  },
  {
    name: "package_workspace",
    description: "Package a workspace for one of the supported deployment modes.",
    cliCommand: "appaloft deploy <path-or-source>",
    httpRoute: "POST /api/deployments",
  },
  {
    name: "create_project",
    description: "Create a project record.",
    cliCommand: "appaloft project create",
    httpRoute: "POST /api/projects",
  },
  {
    name: "register_server",
    description: "Register a server target.",
    cliCommand: "appaloft server register",
    httpRoute: "POST /api/servers",
  },
  {
    name: "create_environment",
    description: "Create an environment profile.",
    cliCommand: "appaloft env create",
    httpRoute: "POST /api/environments",
  },
  {
    name: "plan_deployment",
    description: "Resolve source detection and deployment plan.",
    cliCommand: "appaloft deploy <path-or-source>",
    httpRoute: "POST /api/deployments",
  },
  {
    name: "deploy_release",
    description: "Execute a deployment release.",
    cliCommand: "appaloft deploy <path-or-source>",
    httpRoute: "POST /api/deployments",
  },
  {
    name: "stream_logs",
    description: "Read deployment logs.",
    cliCommand: "appaloft logs <deployment-id>",
    httpRoute: "GET /api/deployments/:deploymentId/logs",
  },
] as const;

export type ToolContract = z.infer<typeof toolContractSchema>;
