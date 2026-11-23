/**
 * Estimación del gasto variable (comida, transporte, salidas…): lo que no es recurrente ni
 * transferencia. Se usa para proyectar los periodos futuros con hábitos realistas.
 */

import { addDays, diffDays, type Cents, type Id, type LocalDate, type Transaction, cents, divFloor } from '../domain';

export const DEFAULT_WINDOW_DAYS = 90;
/** Con menos historial que esto, un solo gasto grande distorsionaría el promedio. */
export const MIN_HISTORY_DAYS = 14;

export interface VariableSpendingEstimate {
  /** Gasto variable promedio por día (positivo = sale dinero). */
  dailyTotal: Cents;
  /** Total por categoría dentro de la ventana, para reportes. */
  byCategory: Map<Id, Cents>;
  /** Días de historial realmente usados para el promedio. */
  daysUsed: number;
}

export function isVariableExpense(tx: Transaction): boolean {
  return tx.amount < 0 && tx.recurringId === undefined && tx.isTransfer !== true;
}

/**
 * Promedio diario del gasto variable en los últimos `windowDays` días antes de `today`
 * (sin contar hoy, que todavía está en curso).
 */
export function estimateVariableSpending(
  transactions: readonly Transaction[],
  today: LocalDate,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): VariableSpendingEstimate {
  const windowStart = addDays(today, -windowDays);
  const byCategory = new Map<Id, Cents>();
  let total = 0;
  let earliest: LocalDate | undefined;

  for (const tx of transactions) {
    if (earliest === undefined || tx.date < earliest) earliest = tx.date;
    if (tx.date < windowStart || tx.date >= today || !isVariableExpense(tx)) continue;
    const spent = -tx.amount;
    total += spent;
    byCategory.set(tx.categoryId, cents((byCategory.get(tx.categoryId) ?? 0) + spent));
  }

  if (earliest === undefined) return { dailyTotal: cents(0), byCategory, daysUsed: 0 };

  // Si el historial es más corto que la ventana, se promedia sobre los días que sí existen.
  const historyDays = Math.min(windowDays, Math.max(diffDays(earliest, today), 0));
  const daysUsed = Math.max(historyDays, MIN_HISTORY_DAYS);
  return { dailyTotal: divFloor(cents(total), daysUsed), byCategory, daysUsed };
}
