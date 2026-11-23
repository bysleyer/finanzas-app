/**
 * Movimientos "previstos": ocurrencias cuya fecha ya llegó (hoy o antes) y que el usuario
 * todavía no confirmó ni descartó. Vienen de recurrentes (sueldo, renta…) o de pagos de deuda.
 * La pantalla de inicio las muestra para que, con un toque, pasen a ser transacciones reales.
 *
 * El motor de proyección ignora las ocurrencias pasadas sin confirmar (solo mira de hoy en
 * adelante); por eso es importante resolverlas.
 */

import {
  type Cents,
  type Debt,
  type Id,
  type LocalDate,
  type OccurrenceKey,
  type Recurring,
  type RecurrenceRule,
  addDays,
  cents,
  nextOccurrence,
  occurrenceKey,
  occurrencesBetween,
} from '../domain';

export interface PendingOccurrence {
  source: 'recurring' | 'debt';
  sourceId: Id;
  name: string;
  kind: 'income' | 'expense';
  /** Siempre positivo. */
  amount: Cents;
  date: LocalDate;
  key: OccurrenceKey;
}

/** Cuánto hacia atrás se buscan pendientes, para no inundar la pantalla tras meses sin abrir la app. */
export const PENDING_LOOKBACK_DAYS = 62;

export function pendingOccurrences(
  recurring: readonly Recurring[],
  resolved: ReadonlySet<OccurrenceKey>,
  today: LocalDate,
  debts: readonly Debt[] = [],
): PendingOccurrence[] {
  const from = addDays(today, -PENDING_LOOKBACK_DAYS);
  const result: PendingOccurrence[] = [];

  for (const r of recurring) {
    for (const date of occurrencesBetween(r.rule, from, today)) {
      const key = occurrenceKey(r.id, date);
      if (resolved.has(key)) continue;
      result.push({ source: 'recurring', sourceId: r.id, name: r.name, kind: r.kind, amount: r.amount, date, key });
    }
  }

  for (const debt of debts) {
    let remaining: number = debt.balance;
    for (const date of occurrencesBetween(debt.rule, from, today)) {
      if (remaining <= 0) break;
      const key = occurrenceKey(debt.id, date);
      if (resolved.has(key)) continue;
      const amount = Math.min(debt.payment, remaining);
      remaining -= amount;
      result.push({ source: 'debt', sourceId: debt.id, name: `Pago ${debt.name}`, kind: 'expense', amount: cents(amount), date, key });
    }
  }

  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Próxima fecha (desde `from`) que todavía no se confirmó ni descartó. */
export function nextUnresolved(
  rule: RecurrenceRule,
  sourceId: Id,
  resolved: ReadonlySet<OccurrenceKey>,
  from: LocalDate,
): LocalDate | undefined {
  let start = from;
  for (let attempts = 0; attempts < 24; attempts++) {
    const next = nextOccurrence(rule, start);
    if (next === undefined) return undefined;
    if (!resolved.has(occurrenceKey(sourceId, next))) return next;
    start = addDays(next, 1);
  }
  return undefined;
}
