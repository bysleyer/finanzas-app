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
