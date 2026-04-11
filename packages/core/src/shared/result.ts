import {
  Err,
  err,
  errAsync,
  fromAsyncThrowable,
  fromPromise,
  fromSafePromise,
  fromThrowable,
  type Result as NeverthrowResult,
  type ResultAsync as NeverthrowResultAsync,
  Ok,
  ok,
  okAsync,
  safeTry,
} from "neverthrow";
import { type DomainError } from "./errors";

// Centralize neverthrow here so all downstream packages keep importing Result helpers from core.
export {
  Err,
  err,
  errAsync,
  fromAsyncThrowable,
  fromPromise,
  fromSafePromise,
  fromThrowable,
  Ok,
  ok,
  okAsync,
  safeTry,
};

export type Result<T, E extends DomainError = DomainError> = NeverthrowResult<T, E>;
export type ResultAsync<T, E extends DomainError = DomainError> = NeverthrowResultAsync<T, E>;
