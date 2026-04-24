import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ServerConnectivityResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ParsedTestServerConnectivityCommandInput,
  type TestServerConnectivityCommandInput,
  testServerConnectivityCommandInputSchema,
} from "./test-server-connectivity.schema";

export {
  type ParsedTestServerConnectivityCommandInput,
  type TestDraftServerConnectivityCommandInput,
  type TestRegisteredServerConnectivityCommandInput,
  type TestServerConnectivityCommandInput,
  testDraftServerConnectivityCommandInputSchema,
  testRegisteredServerConnectivityCommandInputSchema,
  testServerConnectivityCommandInputSchema,
} from "./test-server-connectivity.schema";

export class TestServerConnectivityCommand extends Command<ServerConnectivityResult> {
  constructor(public readonly input: ParsedTestServerConnectivityCommandInput) {
    super();
  }

  static create(input: TestServerConnectivityCommandInput): Result<TestServerConnectivityCommand> {
    return parseOperationInput(testServerConnectivityCommandInputSchema, input).map(
      (parsed) => new TestServerConnectivityCommand(parsed),
    );
  }
}
