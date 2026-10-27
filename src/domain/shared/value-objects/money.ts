import Decimal from 'decimal.js';

export interface MoneyProps {
  amount: string;
  currency: string;
}

export class Money {
  private constructor(
    private readonly value: Decimal,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    const { amount, currency } = props;

    if (!/^[A-Za-z]{3}$/.test(currency.trim())) {
      throw new Error('Invalid currency');
    }

    if (!/^\d+(\.\d{2})$/.test(amount)) {
      throw new Error('Invalid money amount');
    }

    const value = new Decimal(amount);

    if (!value.isFinite()) {
      throw new Error('Invalid money amount');
    }

    return new Money(value, currency.trim().toUpperCase());
  }

  static zero(currency: string): Money {
    return Money.from({
      amount: '0.00',
      currency,
    });
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);

    return new Money(
      this.value.plus(other.value),
      this.currency,
    );
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);

    return new Money(
      this.value.minus(other.value),
      this.currency,
    );
  }

  negate(): Money {
    return new Money(
      this.value.negated(),
      this.currency,
    );
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.isPositive();
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);

    return this.value.lessThan(other.value);
  }

  equals(other: Money): boolean {
    this.assertSameCurrency(other);

    return this.value.equals(other.value);
  }

  toJSON(): MoneyProps {
    return {
      amount: this.value.toFixed(2),
      currency: this.currency,
    };
  }

  toString(): string {
    return this.value.toFixed(2);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error('Currency mismatch');
    }
  }
}