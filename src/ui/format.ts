import { type Cents, type LocalDate, type RecurrenceRule, diffDays, formatMoney, parts } from '../domain';

export const money = (amount: Cents) => formatMoney(amount);

/** Sin centavos, para números grandes de un vistazo: $1,235. */
export const moneyRounded = (amount: Cents) =>
  new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.floor(amount / 100));

function asUtcDate(date: LocalDate): Date {
  const { year, month, day } = parts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

const shortFmt = new Intl.DateTimeFormat('es-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const longFmt = new Intl.DateTimeFormat('es-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const weekdayFmt = new Intl.DateTimeFormat('es-US', { weekday: 'long', timeZone: 'UTC' });

/** "vie, 27 nov" */
export const shortDate = (date: LocalDate) => shortFmt.format(asUtcDate(date));
/** "viernes, 27 de noviembre" */
export const longDate = (date: LocalDate) => longFmt.format(asUtcDate(date));

/** "Hoy", "Mañana", "Ayer" o la fecha corta. */
export function relativeDate(date: LocalDate, today: LocalDate): string {
  const diff = diffDays(today, date);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return shortDate(date);
}

export function describeRule(rule: RecurrenceRule): string {
  const { day } = parts(rule.anchor);
  const weekday = weekdayFmt.format(asUtcDate(rule.anchor));
  switch (rule.unit) {
    case 'day':
      return rule.interval === 1 ? 'Cada día' : `Cada ${rule.interval} días`;
    case 'week':
      return rule.interval === 1 ? `Cada ${weekday}` : `Cada ${rule.interval} semanas (${weekday})`;
    case 'month':
      return rule.interval === 1 ? `Cada mes, día ${day}` : `Cada ${rule.interval} meses, día ${day}`;
    case 'year':
      return `Cada año, ${shortDate(rule.anchor).replace(/^\S+\s/, '')}`;
  }
}
