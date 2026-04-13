import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import { type ServerConnectivityResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type TestServerConnectivityCommandInput,
  testServerConnectivityCommandInputSchema,
} from "./test-server-connectivity.schema";

export {
  type TestServerConnectivityCommandInput,
  testServerConnectivityCommandInputSchema,
} from "./test-server-connectivity.schema";

export class TestServerConnectivityCommand extends Command<ServerConnectivityResult> {
  constructor(public readonly serverId: string) {
    super();
  }

  static create(input: TestServerConnectivityCommandInput): Result<TestServerConnectivityCommand> {
    return parseOperationInput(testServerConnectivityCommandInputSchema, input).map(
      (parsed) => new TestServerConnectivityCommand(parsed.serverId),
    );
  }
}
