import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type ServerSummary } from "../../ports";
import {
  boundedListLimit,
  boundedListOffset,
  listLimitSchema,
  listOffsetSchema,
  parseOperationInput,
} from "../shared-schema";
import { type ServerRuntimeAvailabilityFilter } from "./server-runtime-availability";

export const listServersQueryInputSchema = z.object({
  limit: listLimitSchema,
  offset: listOffsetSchema,
  runtimeAvailability: z.enum(["available", "unavailable", "all"]).default("all"),
});

export type ListServersQueryInput = z.input<typeof listServersQueryInputSchema>;

export class ListServersQuery extends Query<{
  items: ServerSummary[];
  total: number;
  limit: number;
  offset: number;
}> {
  constructor(
    public readonly limit: number,
    public readonly offset: number,
    public readonly runtimeAvailability: ServerRuntimeAvailabilityFilter,
  ) {
    super();
  }

  static create(input?: ListServersQueryInput): Result<ListServersQuery> {
    return parseOperationInput(listServersQueryInputSchema, input ?? {}).map(
      (parsed) =>
        new ListServersQuery(
          boundedListLimit(parsed.limit),
          boundedListOffset(parsed.offset),
          parsed.runtimeAvailability,
        ),
    );
  }
}
