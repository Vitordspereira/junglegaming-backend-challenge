import { describe, expect, it } from 'vitest';
import { Money } from './money.js';

describe('Money', () => {
  it('should create a valid money value', () => {
    const money = Money.from({
      amount: '25.00',
      currency: 'BRL',
    });

    expect(money.toJSON()).toEqual({
      amount: '25.00',
      currency: 'BRL',
    });
  });

  it('should normalize currency to uppercase', () => {
    const money = Money.from({
      amount: '10.50',
      currency: 'brl',
    });

    expect(money.currency).toBe('BRL');
  });

  it('should add money with the same currency', () => {
    const first = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const second = Money.from({
      amount: '5.50',
      currency: 'BRL',
    });

    expect(first.add(second).toString()).toBe('15.50');
  });

  it('should subtract money with the same currency', () => {
    const first = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const second = Money.from({
      amount: '3.25',
      currency: 'BRL',
    });

    expect(first.subtract(second).toString()).toBe('6.75');
  });

  it('should reject amounts without exactly two decimal places', () => {
    expect(() =>
      Money.from({
        amount: '25.5',
        currency: 'BRL',
      }),
    ).toThrow('Invalid money amount');
  });

  it('should reject invalid currencies', () => {
    expect(() =>
      Money.from({
        amount: '25.00',
        currency: '123',
      }),
    ).toThrow('Invalid currency');
  });

  it('should reject operations between different currencies', () => {
    const brl = Money.from({
      amount: '10.00',
      currency: 'BRL',
    });

    const usd = Money.from({
      amount: '5.00',
      currency: 'USD',
    });

    expect(() => brl.add(usd)).toThrow('Currency mismatch');
  });
});