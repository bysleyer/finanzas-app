/**
 * Dinero en centavos enteros.
 *
 * Nunca se usan decimales para montos: 0.1 + 0.2 !== 0.3 en JavaScript.
 * $12.34 se guarda como 1234.
 */

declare const centsBrand: unique symbol;
export type Cents = number & { readonly [centsBrand]: true };

export const ZERO = 0 as Cents;

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Monto inválido: ${value}. Debe ser un entero de centavos.`);
  }
  return value as Cents;
}

/** Convierte dólares (por ejemplo, lo que escribe el usuario) a centavos, redondeando al centavo. */
export function fromDollars(dollars: number): Cents {
  if (!Number.isFinite(dollars)) throw new RangeError(`Monto inválido: ${dollars}`);
  return cents(Math.round(dollars * 100));
}

export function add(...values: Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return cents(total);
}

export function sub(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function neg(a: Cents): Cents {
  return cents(-a);
}

/** Multiplica por un factor (por ejemplo, una tasa) y redondea al centavo más cercano. */
export function mulRound(a: Cents, factor: number): Cents {
  return cents(Math.round(a * factor));
}

/** División entera hacia abajo: nunca promete más dinero del que hay. */
export function divFloor(a: Cents, divisor: number): Cents {
  if (divisor <= 0 || !Number.isFinite(divisor)) throw new RangeError(`Divisor inválido: ${divisor}`);
  return cents(Math.floor(a / divisor));
}

export function abs(a: Cents): Cents {
  return cents(Math.abs(a));
}

export function min(a: Cents, b: Cents): Cents {
  return (a < b ? a : b);
}

export function max(a: Cents, b: Cents): Cents {
  return (a > b ? a : b);
}

export function sum(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of values) total += v;
  return cents(total);
}

export interface FormatOptions {
  locale?: string;
  currency?: string;
}

export function formatMoney(amount: Cents, { locale = 'es-US', currency = 'USD' }: FormatOptions = {}): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount / 100);
}

/**
 * Lee un monto escrito por el usuario: "12", "12.5", "12,50", "$1,234.56".
 * Devuelve `undefined` si no es un monto válido y positivo (o cero, con `allowZero`).
 */
export function parseMoneyInput(text: string, { allowZero = false } = {}): Cents | undefined {
  let clean = text.replace(/[\s$]/g, '');
  if (clean === '') return undefined;
  // Si solo hay una coma y está seguida de 1-2 dígitos al final, es separador decimal ("12,50").
  if (/^\d+,\d{1,2}$/.test(clean)) clean = clean.replace(',', '.');
  else clean = clean.replace(/,/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return undefined;
  const value = fromDollars(Number(clean));
  return value > 0 || (allowZero && value === 0) ? value : undefined;
}

/** Monto en dólares para mostrar dentro de un campo editable: 1234 → "12.34". */
export function toInputString(amount: Cents): string {
  return (amount / 100).toFixed(2);
}

/**
 * Lee una tasa anual escrita como porcentaje ("24.99", "24,99 %", "8") y la devuelve en
 * puntos básicos (24.99% → 2499). Acepta de 0 a 100.
 */
export function parseRateInput(text: string): number | undefined {
  const clean = text.replace(/[\s%]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return undefined;
  const bps = Math.round(Number(clean) * 100);
  return bps <= 10_000 ? bps : undefined;
}

/** 2499 → "24.99" */
export function formatRate(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2).replace(/\.00$/, '');
}
