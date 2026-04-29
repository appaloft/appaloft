import { ok, type Result } from "@appaloft/core";
import { type RepositoryContext } from "./execution-context";
import {
  type ProcessAttemptListFilter,
  type ProcessAttemptReadModel,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
} from "./ports";

export class NoopProcessAttemptRecorder implements ProcessAttemptRecorder {
  async record(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    return ok(attempt);
  }
}

export class EmptyProcessAttemptReadModel implements ProcessAttemptReadModel {
  async list(
    _context: RepositoryContext,
    _filter?: ProcessAttemptListFilter,
  ): Promise<ProcessAttemptRecord[]> {
    return [];
  }

  async findOne(_context: RepositoryContext, _id: string): Promise<ProcessAttemptRecord | null> {
    return null;
  }
}
