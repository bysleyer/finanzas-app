/** Ayudas para construir escenarios de prueba con poco ruido. Solo se usan en tests. */

import {
  type Account,
  type Debt,
  type Goal,
  type LocalDate,
  type Recurring,
  type RecurrenceRule,
  type Transaction,
  fromDollars,
  localDate,
} from '../domain';
import type { ForecastInput } from './forecast';

export const d = localDate;
export const $ = fromDollars;

/** Lunes 23 de noviembre de 2026. */
export const TODAY = d('2026-11-23');

export const weekly = (anchor: string): RecurrenceRule => ({ unit: 'week', interval: 1, anchor: d(anchor) });
export const monthly = (anchor: string): RecurrenceRule => ({ unit: 'month', interval: 1, anchor: d(anchor) });
export const yearly = (anchor: string): RecurrenceRule => ({ unit: 'year', interval: 1, anchor: d(anchor) });

export function checking(balance: number, id = 'checking'): Account {
  return { id, name: 'Débito', type: 'checking', balance: $(balance), spendable: true };
}

export function income(id: string, amount: number, rule: RecurrenceRule, accountId = 'checking'): Recurring {
  return { id, name: id, kind: 'income', amount: $(amount), rule, accountId, categoryId: 'salary' };
}

export function expense(id: string, amount: number, rule: RecurrenceRule, accountId = 'checking'): Recurring {
  return { id, name: id, kind: 'expense', amount: $(amount), rule, accountId, categoryId: id };
}

export function spend(amount: number, date: LocalDate | string, categoryId = 'food', accountId = 'checking'): Transaction {
  return { id: `${date}-${categoryId}-${amount}`, accountId, amount: $(-amount), date: d(date), categoryId };
}

export function scenario(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return {
    today: TODAY,
    accounts: [checking(1000)],
    recurring: [],
    debts: [] as Debt[],
    goals: [] as Goal[],
    transactions: [],
    confirmed: new Set(),
    settings: { safetyCushion: $(0), horizonMonths: 6, manualDailyVariableSpending: $(0) },
    ...overrides,
  };
}
