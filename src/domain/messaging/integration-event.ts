export interface IntegrationEventProps<
  TData extends Record<string, unknown>,
> {
  eventId: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  occurredAt: Date;
  data: TData;
}

export interface IntegrationEventJson<
  TData extends Record<string, unknown>,
> extends Record<string, unknown> {
  eventId: string;
  eventType: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
  version: number;
  data: TData;
}

export abstract class IntegrationEvent<
  TData extends Record<string, unknown>,
> {
  abstract readonly eventType: string;
  abstract readonly version: number;

  public readonly eventId: string;
  public readonly aggregateId: string;
  public readonly correlationId: string;
  public readonly causationId?: string;
  public readonly occurredAt: Date;
  public readonly data: Readonly<TData>;

  protected constructor(
    props: IntegrationEventProps<TData>,
  ) {
    this.eventId =
      props.eventId;

    this.aggregateId =
      props.aggregateId;

    this.correlationId =
      props.correlationId;

    this.causationId =
      props.causationId;

    this.occurredAt =
      props.occurredAt;

    this.data =
      props.data;
  }

  toJSON():
    IntegrationEventJson<TData> {
    return {
      eventId:
        this.eventId,

      eventType:
        this.eventType,

      aggregateId:
        this.aggregateId,

      correlationId:
        this.correlationId,

      ...(this.causationId
        ? {
            causationId:
              this.causationId,
          }
        : {}),

      occurredAt:
        this.occurredAt.toISOString(),

      version:
        this.version,

      data:
        this.data as TData,
    };
  }
}