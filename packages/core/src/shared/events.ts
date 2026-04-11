export interface DomainEvent<TPayload = Record<string, unknown>> {
  type: string;
  aggregateId: string;
  occurredAt: string;
  payload: TPayload;
}

export function createDomainEvent<TPayload>(
  type: string,
  aggregateId: string,
  occurredAt: string,
  payload: TPayload,
): DomainEvent<TPayload> {
  return {
    type,
    aggregateId,
    occurredAt,
    payload,
  };
}
