/**
 * Convierte recurrentes, deudas y metas en una lista de movimientos futuros con fecha.
 *
 * La proyección sigue solo el dinero "gastable" (cuentas con `spendable: true`).
 * Un recurrente asignado a una cuenta de ahorro o de crédito no mueve ese dinero hoy,
 * así que no entra aquí; las tarjetas se reflejan a través de su pago (Debt).
 */

import {
  type Account,
  type Cents,
  type Debt,
  type Goal,
  type Id,
  type LocalDate,
  type OccurrenceKey,
  type Recurring,
  cents,
  diffDays,
  occurrenceKey,
  occurrencesBetween,
} from '../domain';

export type EventSource = 'recurring' | 'debt' | 'goal' | 'one-off';

export interface ProjectedEvent {
  date: LocalDate;
  /** Positivo = entra; negativo = sale. */
  amount: Cents;
  source: EventSource;
  sourceId: Id;
  label: string;
  isIncome: boolean;
}

export interface EventInputs {
  accounts: readonly Account[];
  recurring: readonly Recurring[];
  debts: readonly Debt[];
  goals: readonly Goal[];
  /** Ocurrencias ya registradas como transacciones reales; no se vuelven a proyectar. */
  confirmed: ReadonlySet<OccurrenceKey>;
  /** Movimientos únicos hipotéticos (simulador "¿y si compro esto?"). */
  oneOff?: readonly ProjectedEvent[];
}

export function buildEvents(input: EventInputs, from: LocalDate, to: LocalDate): ProjectedEvent[] {
  const spendableAccounts = new Set(input.accounts.filter((a) => a.spendable).map((a) => a.id));
  const events: ProjectedEvent[] = [];

  for (const r of input.recurring) {
    if (!spendableAccounts.has(r.accountId)) continue;
    for (const date of occurrencesBetween(r.rule, from, to)) {
      if (input.confirmed.has(occurrenceKey(r.id, date))) continue;
      events.push({
        date,
        amount: cents(r.kind === 'income' ? r.amount : -r.amount),
        source: 'recurring',
        sourceId: r.id,
        label: r.name,
        isIncome: r.kind === 'income',
      });
    }
  }

  for (const debt of input.debts) events.push(...debtPayments(debt, input.confirmed, from, to));
  for (const goal of input.goals) events.push(...goalContributions(goal, input.confirmed, from, to));
  for (const e of input.oneOff ?? []) if (e.date >= from && e.date <= to) events.push(e);

  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Pagos de una deuda hasta liquidarla. Antes de cada pago se suman los intereses
 * acumulados desde el pago anterior (interés simple diario sobre el saldo: APR × días / 365).
 */
export function debtPayments(
  debt: Debt,
  confirmed: ReadonlySet<OccurrenceKey>,
  from: LocalDate,
  to: LocalDate,
): ProjectedEvent[] {
  const events: ProjectedEvent[] = [];
  let balance: number = debt.balance;
  let lastDate = from;

  for (const date of occurrencesBetween(debt.rule, from, to)) {
    if (balance <= 0) break;
    const days = diffDays(lastDate, date);
    balance += Math.round((balance * debt.aprBasisPoints * days) / (10_000 * 365));
    lastDate = date;
    // Un pago ya confirmado está reflejado en `debt.balance`; no se descuenta dos veces.
    if (confirmed.has(occurrenceKey(debt.id, date))) continue;
    const payment = Math.min(debt.payment, balance);
    balance -= payment;
    events.push({
      date,
      amount: cents(-payment),
      source: 'debt',
      sourceId: debt.id,
      label: debt.name,
      isIncome: false,
    });
  }
  return events;
}

/** Aportes a una meta hasta completarla o hasta su fecha objetivo. */
export function goalContributions(
  goal: Goal,
  confirmed: ReadonlySet<OccurrenceKey>,
  from: LocalDate,
  to: LocalDate,
): ProjectedEvent[] {
  if (!goal.contribution) return [];
  const end = goal.targetDate < to ? goal.targetDate : to;
  const events: ProjectedEvent[] = [];
  let remaining: number = goal.target - goal.saved;

  for (const date of occurrencesBetween(goal.contribution.rule, from, end)) {
    if (remaining <= 0) break;
    // Un aporte ya confirmado está sumado en `goal.saved`; no se cuenta dos veces.
    if (confirmed.has(occurrenceKey(goal.id, date))) continue;
    const amount = Math.min(goal.contribution.amount, remaining);
    remaining -= amount;
    events.push({
      date,
      amount: cents(-amount),
      source: 'goal',
      sourceId: goal.id,
      label: goal.name,
      isIncome: false,
    });
  }
  return events;
}
