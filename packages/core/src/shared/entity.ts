import { createDomainEvent, type DomainEvent } from "./events";
import { type IdentifierValue } from "./identifiers";
import { type ScalarValueObject } from "./value-object";

export interface EntityState<TId extends IdentifierValue = IdentifierValue> {
  id: TId;
}

export abstract class Entity<
  TState extends EntityState<TId>,
  TId extends IdentifierValue = TState["id"],
> {
  protected constructor(protected readonly state: TState) {}

  get id(): TId {
    return this.state.id;
  }
}

export abstract class AggregateRoot<
  TState extends EntityState<TId>,
  TId extends IdentifierValue = TState["id"],
> extends Entity<TState, TId> {
  private readonly domainEvents: DomainEvent[] = [];

  protected recordDomainEvent<TPayload extends Record<string, unknown>>(
    type: string,
    occurredAt: ScalarValueObject<string>,
    payload: TPayload,
  ): void {
    this.domainEvents.push(createDomainEvent(type, this.id.toString(), occurredAt.value, payload));
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.domainEvents];
    this.domainEvents.length = 0;
    return events;
  }
}
