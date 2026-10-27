import { Money } from '../shared/value-objects/money.js';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpenWalletProps {
  id: string;
  playerId: string;
  initialBalance: Money;
}

export interface WalletBalanceChange {
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: OpenWalletProps): Wallet {
    if (props.initialBalance.isNegative()) {
      throw new Error('Initial balance cannot be negative');
    }

    const now = new Date();

    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      now,
      now,
    );
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(money: Money): WalletBalanceChange {
    this.assertSameCurrency(money);
    this.assertPositiveAmount(money);

    const balanceBefore = this._balance;
    const balanceAfter = balanceBefore.subtract(money);

    if (balanceAfter.isNegative()) {
      throw new Error('Insufficient funds');
    }

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = new Date();

    return {
      money,
      balanceBefore,
      balanceAfter,
    };
  }

  credit(money: Money): WalletBalanceChange {
    this.assertSameCurrency(money);
    this.assertPositiveAmount(money);

    const balanceBefore = this._balance;
    const balanceAfter = balanceBefore.add(money);

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = new Date();

    return {
      money,
      balanceBefore,
      balanceAfter,
    };
  }

  private assertSameCurrency(money: Money): void {
    if (this.currency !== money.currency) {
      throw new Error('Currency mismatch');
    }
  }

  private assertPositiveAmount(money: Money): void {
    if (!money.isPositive()) {
      throw new Error('Money amount must be positive');
    }
  }
}