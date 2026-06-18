import {
  type ConnectorAuthorizationAttemptSnapshot,
  type ConnectorAuthorizationAttemptStore,
} from "../ports";

export class InMemoryConnectorAuthorizationAttemptStore
  implements ConnectorAuthorizationAttemptStore
{
  private readonly byId = new Map<string, ConnectorAuthorizationAttemptSnapshot>();
  private readonly idByState = new Map<string, string>();

  constructor(seed: readonly ConnectorAuthorizationAttemptSnapshot[] = []) {
    for (const attempt of seed) {
      this.save(attempt);
    }
  }

  save(attempt: ConnectorAuthorizationAttemptSnapshot): void {
    const previous = this.byId.get(attempt.id);
    if (previous) {
      this.idByState.delete(previous.state);
    }
    this.byId.set(attempt.id, cloneAttempt(attempt));
    this.idByState.set(attempt.state, attempt.id);
  }

  findById(attemptId: string): ConnectorAuthorizationAttemptSnapshot | null {
    const attempt = this.byId.get(attemptId);
    return attempt ? cloneAttempt(attempt) : null;
  }

  findByState(state: string): ConnectorAuthorizationAttemptSnapshot | null {
    const attemptId = this.idByState.get(state);
    return attemptId ? this.findById(attemptId) : null;
  }
}

function cloneAttempt(
  attempt: ConnectorAuthorizationAttemptSnapshot,
): ConnectorAuthorizationAttemptSnapshot {
  return {
    ...attempt,
    owner: { ...attempt.owner },
    diagnostics: attempt.diagnostics.map((diagnostic) => ({ ...diagnostic })),
  };
}
