/**
 * Browser-safe type facade for API clients.
 *
 * Keep this module type-only: client bundlers may resolve it while building the
 * ORPC contract, and the application schema barrel includes Node-only runtime
 * implementations.
 */
export type * from "./schemas";
