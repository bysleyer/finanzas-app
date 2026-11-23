/**
 * Entidades del dominio. Describen QUÉ es cada cosa, no cómo se guarda ni cómo se muestra.
 * Todos los montos están en centavos y todas las fechas son de calendario.
 */

import type { LocalDate } from './date';
import type { Cents } from './money';
import type { RecurrenceRule } from './recurrence';

export type Id = string;

export type AccountType = 'cash' | 'checking' | 'savings' | 'credit';

export interface Account {
  id: Id;
  name: string;
  type: AccountType;
  /** Saldo actual. En tarjetas de crédito es negativo cuando se debe dinero. */
  balance: Cents;
  /**
   * Si este dinero cuenta como "gastable" para el disponible de hoy.
   * Por defecto: efectivo y débito sí; ahorro y crédito no.
   */
  spendable: boolean;
}

export interface Category {
  id: Id;
  name: string;
  kind: 'income' | 'expense';
}

export interface Transaction {
  id: Id;
  accountId: Id;
  /** Positivo = entra dinero; negativo = sale dinero. */
  amount: Cents;
  date: LocalDate;
  categoryId: Id;
  note?: string;
  /** Si se generó al confirmar un recurrente. Esos gastos no cuentan como "gasto variable". */
  recurringId?: Id;
  /** Pagos de deuda y movimientos entre cuentas propias. Tampoco cuentan como gasto variable. */
  isTransfer?: boolean;
}

export interface Recurring {
  id: Id;
  name: string;
  kind: 'income' | 'expense';
  /** Siempre positivo; `kind` indica si entra o sale. */
  amount: Cents;
  rule: RecurrenceRule;
  accountId: Id;
  categoryId: Id;
}

export interface Debt {
  id: Id;
  name: string;
  /** Lo que se debe hoy (positivo). */
  balance: Cents;
  /** Tasa anual en puntos básicos: 24.99% = 2499. Enteros para evitar decimales. */
  aprBasisPoints: number;
  /** Pago mensual planeado (al menos el mínimo). */
  payment: Cents;
  /** Cuándo se paga. */
  rule: RecurrenceRule;
}

export interface Goal {
  id: Id;
  name: string;
  target: Cents;
  saved: Cents;
  targetDate: LocalDate;
  /** Aporte que el usuario aceptó. Se reserva y no cuenta como disponible. */
  contribution?: { amount: Cents; rule: RecurrenceRule };
}

export interface Settings {
  /** Colchón de seguridad (R): el saldo nunca debería bajar de aquí. */
  safetyCushion: Cents;
  /** Meses que se proyectan hacia adelante (6 por defecto, hasta 12). */
  horizonMonths: number;
  /**
   * Gasto variable diario fijado a mano. Si no se indica, se estima con el historial
   * (promedio de los últimos 90 días).
   */
  manualDailyVariableSpending?: Cents;
}

/** Ocurrencia de un recurrente ya registrada como transacción real ("confirmada"). */
export type OccurrenceKey = `${Id}@${string}`;

export function occurrenceKey(sourceId: Id, date: LocalDate): OccurrenceKey {
  return `${sourceId}@${date}`;
}
