export interface InboxMessageState {
  id: string;
  consumerName: string;
  messageId: string;
  receivedAt: Date;
  processedAt?: Date;
}

export interface CreateInboxMessageProps {
  id: string;
  consumerName: string;
  messageId: string;
}

export class InboxMessage {
  private constructor(
    public readonly id: string,
    public readonly consumerName: string,
    public readonly messageId: string,
    public readonly receivedAt: Date,
    public readonly processedAt?: Date,
  ) {}

  static create(
    props: CreateInboxMessageProps,
  ): InboxMessage {
    if (
      props.consumerName.trim().length === 0
    ) {
      throw new Error(
        'Inbox consumer name is required',
      );
    }

    if (
      props.messageId.trim().length === 0
    ) {
      throw new Error(
        'Inbox message id is required',
      );
    }

    return new InboxMessage(
      props.id,
      props.consumerName,
      props.messageId,
      new Date(),
    );
  }

  static rehydrate(
    state: InboxMessageState,
  ): InboxMessage {
    return new InboxMessage(
      state.id,
      state.consumerName,
      state.messageId,
      state.receivedAt,
      state.processedAt,
    );
  }

  isProcessed(): boolean {
    return (
      this.processedAt !== undefined
    );
  }

  markProcessed(
    at: Date = new Date(),
  ): InboxMessage {
    if (
      this.processedAt !== undefined
    ) {
      return this;
    }

    return new InboxMessage(
      this.id,
      this.consumerName,
      this.messageId,
      this.receivedAt,
      at,
    );
  }
}