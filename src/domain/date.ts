/**
 * Fechas de calendario sin hora ni zona horaria, en formato 'YYYY-MM-DD'.
 *
 * Una fecha de pago es "el viernes 5", no "el viernes 5 a las 00:00 UTC".
 * Mezclar zonas horarias es la fuente más común de errores de "un día de más o de menos",
 * así que el dominio trabaja solo con fechas de calendario. Internamente se calculan
 * como número de días desde 1970-01-01 (aritmética exacta, sin horario de verano).
 */

declare const localDateBrand: unique symbol;
export type LocalDate = string & { readonly [localDateBrand]: true };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function localDate(value: string): LocalDate {
  const match = ISO_DATE.exec(value);
  if (!match) throw new RangeError(`Fecha inválida: "${value}". Formato esperado YYYY-MM-DD.`);
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`Fecha inexistente: "${value}".`);
  }
  return value as LocalDate;
}

export function fromParts(year: number, month: number, day: number): LocalDate {
  return localDate(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

export function parts(date: LocalDate): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/** Días desde 1970-01-01. */
export function toEpochDay(date: LocalDate): number {
  const { year, month, day } = parts(date);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function fromEpochDay(epochDay: number): LocalDate {
  const d = new Date(epochDay * MS_PER_DAY);
  return fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Días de `from` a `to` (positivo si `to` es posterior). */
export function diffDays(from: LocalDate, to: LocalDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const length = lengths[month - 1];
  if (length === undefined) throw new RangeError(`Mes inválido: ${month}`);
  return length;
}

/**
 * Suma meses conservando el día cuando existe. Si no existe, usa el último día del mes:
 * 31 de enero + 1 mes = 28 (o 29) de febrero.
 * `preferredDay` permite volver al día 31 en marzo aunque febrero lo haya recortado.
 */
export function addMonths(date: LocalDate, months: number, preferredDay?: number): LocalDate {
  const { year, month, day } = parts(date);
  const zeroBased = year * 12 + (month - 1) + months;
  const newYear = Math.floor(zeroBased / 12);
  const newMonth = (zeroBased % 12) + 1;
  const targetDay = Math.min(preferredDay ?? day, daysInMonth(newYear, newMonth));
  return fromParts(newYear, newMonth, targetDay);
}

export function compare(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return a <= b ? a : b;
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a >= b ? a : b;
}

/** Fecha de hoy según el reloj y la zona horaria del dispositivo. */
export function today(now: Date = new Date()): LocalDate {
  return fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
