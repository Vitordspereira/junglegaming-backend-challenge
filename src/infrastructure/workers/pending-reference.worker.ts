import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

import {
  ProcessPendingReferenceRetriesUseCase,
} from '../../application/use-cases/process-pending-reference-retries.use-case.js';

@Injectable()
export class PendingReferenceWorker
  implements
    OnApplicationBootstrap,
    OnApplicationShutdown
{
  private readonly logger =
    new Logger(
      PendingReferenceWorker.name,
    );

  /*
   * Poll curto.
   *
   * O backoff real continua sendo definido
   * por nextAttemptAt no PostgreSQL.
   */
  private readonly pollIntervalMs =
    1_000;

  private readonly batchSize =
    25;

  private timer:
    ReturnType<typeof setInterval> |
    undefined;

  /*
   * Evita que a mesma instância execute
   * dois ciclos simultaneamente.
   *
   * Concorrência entre INSTÂNCIAS continua
   * protegida pelo PostgreSQL:
   *
   * FOR UPDATE SKIP LOCKED.
   */
  private activeRun:
    Promise<void> |
    null =
      null;

  private shuttingDown =
    false;

  constructor(
    private readonly processPendingReferences:
      ProcessPendingReferenceRetriesUseCase,
  ) {}

  onApplicationBootstrap(): void {
    this.logger.log(
      'Pending reference worker started',
    );

    /*
     * Executa uma vez imediatamente.
     *
     * Isso é importante após restart:
     * PENDING_REFERENCE já persistidos não
     * precisam esperar o primeiro intervalo.
     */
    void this.runOnce();

    this.timer =
      setInterval(
        () => {
          void this.runOnce();
        },

        this.pollIntervalMs,
      );

    /*
     * Em runtimes que suportam unref(),
     * o timer sozinho não impede o processo
     * de finalizar.
     */
    this.timer.unref?.();
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown =
      true;

    if (
      this.timer
    ) {
      clearInterval(
        this.timer,
      );

      this.timer =
        undefined;
    }

    /*
     * Graceful shutdown:
     *
     * se existe um ciclo já dentro de uma
     * transação, esperamos ele terminar
     * antes de encerrar o processo.
     */
    if (
      this.activeRun
    ) {
      await this.activeRun;
    }

    this.logger.log(
      'Pending reference worker stopped',
    );
  }

  async runOnce(): Promise<void> {
    /*
     * Não inicia trabalho durante shutdown.
     */
    if (
      this.shuttingDown
    ) {
      return;
    }

    /*
     * Evita overlap dentro da mesma
     * instância.
     */
    if (
      this.activeRun
    ) {
      return this.activeRun;
    }

    const run =
      this.executeCycle();

    this.activeRun =
      run;

    try {
      await run;
    } finally {
      if (
        this.activeRun ===
        run
      ) {
        this.activeRun =
          null;
      }
    }
  }

  private async executeCycle(): Promise<void> {
    try {
      const result =
        await this
          .processPendingReferences
          .execute({
            now:
              new Date(),

            limit:
              this.batchSize,
          });

      /*
       * Evitamos logar a cada segundo
       * quando não existe trabalho.
       */
      if (
        result.found >
        0
      ) {
        this.logger.log(
          [
            'Pending reference cycle completed',
            `found=${result.found}`,
            `rescheduled=${result.rescheduled}`,
            `referenceFound=${result.referenceFound}`,
            `exhausted=${result.exhausted}`,
            `cleaned=${result.cleaned}`,
          ].join(
            ' ',
          ),
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.stack ??
            error.message
          : String(
              error,
            );

      this.logger.error(
        'Pending reference worker cycle failed',
        message,
      );
    }
  }
}