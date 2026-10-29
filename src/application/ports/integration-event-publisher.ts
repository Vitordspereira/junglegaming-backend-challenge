export const INTEGRATION_EVENT_PUBLISHER =
  Symbol('INTEGRATION_EVENT_PUBLISHER');

export interface IntegrationEventPublisher {
  publish(
    event:
      Record<string, unknown>,
  ): Promise<void>;
}