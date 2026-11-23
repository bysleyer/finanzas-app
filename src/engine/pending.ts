/**
 * Recurrentes "previstos": ocurrencias cuya fecha ya llegó (hoy o antes) y que el usuario
 * todavía no confirmó ni descartó. La pantalla de inicio las muestra para que, con un toque,
 * pasen a ser transacciones reales y el saldo quede al día.
 *
 * El motor de proyección ignora las ocurrencias pasadas sin confirmar (solo mira de hoy en
 * adelante); por eso es importante resolverlas.
 */

import { type LocalDate, type OccurrenceKey, type Recurring, addDays, occurrenceKey, occurrencesBetween } from '../domain';

export interface PendingOccurrence {
  recurring: Recurring;
  date: LocalDate;
  key: OccurrenceKey;
}

/** Cuánto hacia atrás se buscan pendientes, para no inundar la pantalla tras meses sin abrir la app. */
export const PENDING_LOOKBACK_DAYS = 62;

export function pendingOccurrences(
  recurring: readonly Recurring[],
  resolved: ReadonlySet<OccurrenceKey>,
  today: LocalDate,
): PendingOccurrence[] {
  const from = addDays(today, -PENDING_LOOKBACK_DAYS);
  const result: PendingOccurrence[] = [];
  for (const r of recurring) {
    for (const date of occurrencesBetween(r.rule, from, today)) {
      const key = occurrenceKey(r.id, date);
      if (!resolved.has(key)) result.push({ recurring: r, date, key });
    }
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
