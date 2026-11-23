/**
 * Reglas de recurrencia genéricas: "cada N días/semanas/meses/años desde una fecha ancla".
 *
 * Con esta sola forma se cubren todos los casos habituales:
 *   semanal          → { unit: 'week',  interval: 1 }
 *   cada 14 días     → { unit: 'week',  interval: 2 }
 *   mensual          → { unit: 'month', interval: 1 }
 *   trimestral       → { unit: 'month', interval: 3 }
 *   anual            → { unit: 'year',  interval: 1 }
 *   dos veces al mes → dos reglas mensuales (por ejemplo, ancla el 15 y ancla el 30)
 */

import { addDays, addMonths, diffDays, parts, type LocalDate } from './date';

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

export interface RecurrenceRule {
  unit: RecurrenceUnit;
  /** Cada cuántas unidades se repite. Entero ≥ 1. */
  interval: number;
  /** Primera ocurrencia. Define el día de la semana o del mes. */
  anchor: LocalDate;
  /** Última fecha posible (inclusive). Sin `until`, se repite indefinidamente. */
  until?: LocalDate;
}

export function validateRule(rule: RecurrenceRule): void {
  if (!Number.isInteger(rule.interval) || rule.interval < 1) {
    throw new RangeError(`Intervalo inválido: ${rule.interval}. Debe ser un entero ≥ 1.`);
  }
  if (rule.until !== undefined && rule.until < rule.anchor) {
    throw new RangeError('La fecha final no puede ser anterior a la fecha ancla.');
  }
}

/** n-ésima ocurrencia (n = 0 es el ancla). */
function nth(rule: RecurrenceRule, n: number): LocalDate {
  switch (rule.unit) {
    case 'day':
      return addDays(rule.anchor, n * rule.interval);
    case 'week':
      return addDays(rule.anchor, n * rule.interval * 7);
    case 'month':
      return addMonths(rule.anchor, n * rule.interval, parts(rule.anchor).day);
    case 'year':
      return addMonths(rule.anchor, n * rule.interval * 12, parts(rule.anchor).day);
  }
}

/** Índice de la primera ocurrencia que podría caer en `from` o después (estimación hacia abajo). */
function firstIndexNear(rule: RecurrenceRule, from: LocalDate): number {
  if (from <= rule.anchor) return 0;
  const days = diffDays(rule.anchor, from);
  // Se usa la duración MÁXIMA de cada unidad para que la estimación quede corta y nunca se pase
  // (si se pasara, se perderían ocurrencias). El bucle avanza lo que falte.
  const maxDaysPerUnit = { day: 1, week: 7, month: 31, year: 366 }[rule.unit];
  return Math.max(0, Math.floor(days / (maxDaysPerUnit * rule.interval)) - 1);
}

/** Todas las ocurrencias entre `from` y `to`, ambos inclusive, en orden. */
export function occurrencesBetween(rule: RecurrenceRule, from: LocalDate, to: LocalDate): LocalDate[] {
  validateRule(rule);
  const end = rule.until !== undefined && rule.until < to ? rule.until : to;
  const result: LocalDate[] = [];
  for (let n = firstIndexNear(rule, from); ; n++) {
    const date = nth(rule, n);
    if (date > end) break;
    if (date >= from) result.push(date);
  }
  return result;
}

/** Siguiente ocurrencia en `from` o después, o `undefined` si la regla ya terminó. */
export function nextOccurrence(rule: RecurrenceRule, from: LocalDate): LocalDate | undefined {
  validateRule(rule);
  for (let n = firstIndexNear(rule, from); ; n++) {
    const date = nth(rule, n);
    if (rule.until !== undefined && date > rule.until) return undefined;
    if (date >= from) return date;
  }
}
