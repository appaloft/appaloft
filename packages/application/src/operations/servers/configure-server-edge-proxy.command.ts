import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ConfigureServerEdgeProxyCommandInput,
  type ConfigureServerEdgeProxyCommandPayload,
  type ConfigureServerEdgeProxyResult,
  configureServerEdgeProxyCommandInputSchema,
} from "./configure-server-edge-proxy.schema";

export {
  type ConfigureServerEdgeProxyCommandInput,
  type ConfigureServerEdgeProxyCommandPayload,
  type ConfigureServerEdgeProxyResult,
  configureServerEdgeProxyCommandInputSchema,
  configureServerEdgeProxyResultSchema,
} from "./configure-server-edge-proxy.schema";

export class ConfigureServerEdgeProxyCommand extends Command<ConfigureServerEdgeProxyResult> {
  constructor(
    public readonly serverId: string,
    public readonly proxyKind: ConfigureServerEdgeProxyCommandPayload["proxyKind"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: ConfigureServerEdgeProxyCommandInput,
  ): Result<ConfigureServerEdgeProxyCommand> {
    return parseOperationInput(configureServerEdgeProxyCommandInputSchema, input).map(
      (parsed) =>
        new ConfigureServerEdgeProxyCommand(
          parsed.serverId,
          parsed.proxyKind,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
