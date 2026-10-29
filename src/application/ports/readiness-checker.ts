export const READINESS_CHECKER =
  Symbol('READINESS_CHECKER');

export interface ReadinessStatus {
  postgres: boolean;
  sqs: boolean;
}

export interface ReadinessChecker {
  check(): Promise<ReadinessStatus>;
}