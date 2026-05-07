import { type OperationCatalogEntry, operationCatalog } from "@appaloft/application";
import { z } from "zod";

type OperationTransportRoute = NonNullable<OperationCatalogEntry["transports"]["orpc"]>;

const toolNamePattern = /^[a-z][a-z0-9_]*$/;
const operationKeyPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

export const toolNameSchema = z.string().regex(toolNamePattern);

export const toolContractSchema = z.object({
  name: toolNameSchema,
  operationKey: z.string().regex(operationKeyPattern),
  kind: z.enum(["command", "query"]),
  domain: z.string(),
  description: z.string(),
  cliCommand: z.string().optional(),
  httpRoute: z.string().optional(),
  alternateHttpRoutes: z.array(z.string()).optional(),
  inputSchemaAvailable: z.boolean(),
});

export type ToolContract = z.infer<typeof toolContractSchema>;

export interface ToolDescriptor extends ToolContract {
  readonly inputSchema?: OperationCatalogEntry["inputSchema"];
}

function operationKeyToToolName(operationKey: string): string {
  return operationKey.replaceAll(".", "_").replaceAll("-", "_");
}

function routeLabel(route: OperationTransportRoute): string {
  return `${route.method} ${route.path}`;
}

function firstHttpRoute(entry: OperationCatalogEntry): string | undefined {
  if (entry.transports.orpc) {
    return routeLabel(entry.transports.orpc);
  }

  if (entry.transports.orpcStream) {
    return routeLabel(entry.transports.orpcStream);
  }

  return undefined;
}

function alternateHttpRoutes(entry: OperationCatalogEntry): string[] {
  return [
    ...(entry.transports.orpcAdditional ?? []).map(routeLabel),
    ...(entry.transports.orpc && entry.transports.orpcStream
      ? [routeLabel(entry.transports.orpcStream)]
      : []),
  ];
}

function descriptionFor(entry: OperationCatalogEntry): string {
  const action = entry.kind === "command" ? "Run" : "Read";
  return `${action} ${entry.key} through the Appaloft application operation catalog.`;
}

export function toolDescriptorFromOperation(entry: OperationCatalogEntry): ToolDescriptor {
  const alternateRoutes = alternateHttpRoutes(entry);

  return {
    name: operationKeyToToolName(entry.key),
    operationKey: entry.key,
    kind: entry.kind,
    domain: entry.domain,
    description: descriptionFor(entry),
    ...(entry.transports.cli ? { cliCommand: entry.transports.cli } : {}),
    ...(firstHttpRoute(entry) ? { httpRoute: firstHttpRoute(entry) } : {}),
    ...(alternateRoutes.length > 0 ? { alternateHttpRoutes: alternateRoutes } : {}),
    inputSchemaAvailable: Boolean(entry.inputSchema),
    ...(entry.inputSchema ? { inputSchema: entry.inputSchema } : {}),
  };
}

export const toolContracts = operationCatalog.map(toolDescriptorFromOperation);

export const toolContractsByOperationKey = new Map(
  toolContracts.map((contract) => [contract.operationKey, contract]),
);
