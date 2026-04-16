import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type BootstrapServerProxyCommandInput,
  type BootstrapServerProxyResult,
  bootstrapServerProxyCommandInputSchema,
  type ParsedBootstrapServerProxyCommandInput,
} from "./bootstrap-server-proxy.schema";

export {
  type BootstrapServerProxyCommandInput,
  type BootstrapServerProxyReason,
  type BootstrapServerProxyResult,
  bootstrapServerProxyCommandInputSchema,
  bootstrapServerProxyReasonSchema,
  bootstrapServerProxyResultSchema,
  type ParsedBootstrapServerProxyCommandInput,
} from "./bootstrap-server-proxy.schema";

export class BootstrapServerProxyCommand extends Command<BootstrapServerProxyResult> {
  constructor(public readonly input: ParsedBootstrapServerProxyCommandInput) {
    super();
  }

  static create(input: BootstrapServerProxyCommandInput): Result<BootstrapServerProxyCommand> {
    return parseOperationInput(bootstrapServerProxyCommandInputSchema, input).map(
      (parsed) => new BootstrapServerProxyCommand(parsed),
    );
  }
}
