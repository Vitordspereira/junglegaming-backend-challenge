export class PermanentMessageProcessingError
  extends Error
{
  constructor(
    message: string,
  ) {
    super(message);

    this.name =
      'PermanentMessageProcessingError';
  }
}