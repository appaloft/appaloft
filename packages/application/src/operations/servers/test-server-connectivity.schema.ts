import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const testServerConnectivityCommandInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server ID"),
});

export type TestServerConnectivityCommandInput = z.input<
  typeof testServerConnectivityCommandInputSchema
>;
