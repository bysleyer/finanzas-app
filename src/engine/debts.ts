/**
 * Planes de pago de deudas.
 *
 * Simulación mensual simplificada: cada mes se suman los intereses (APR ÷ 12 sobre el saldo)
 * y luego se paga. Es suficiente para comparar estrategias y estimar plazos; la proyección
 * día a día (events.ts) usa interés diario para mayor precisión en las fechas reales.
 */

import { type Cents, type Debt, type Id, cents } from '../domain';

/** Tope de simulación: 50 años. Si no se liquida antes, se considera "nunca". */
export const MAX_MONTHS = 600;

export function monthlyInterest(balance: number, aprBasisPoints: number): number {
  return Math.round((balance * aprBasisPoints) / (10_000 * 12));
}

export type PayoffEstimate =
  | { payable: true; months: number; totalInterest: Cents }
  | { payable: false; monthlyInterest: Cents };

/** Cuánto tarda en liquidarse una deuda pagando siempre `payment` (por defecto, el planeado). */
export function payoffEstimate(debt: Debt, payment: Cents = debt.payment): PayoffEstimate {
  let balance: number = debt.balance;
  let totalInterest = 0;
  const firstInterest = monthlyInterest(balance, debt.aprBasisPoints);
  if (balance > 0 && payment <= firstInterest) return { payable: false, monthlyInterest: cents(firstInterest) };

  let months = 0;
  while (balance > 0 && months < MAX_MONTHS) {
    const interest = monthlyInterest(balance, debt.aprBasisPoints);
    totalInterest += interest;
    balance += interest;
    balance -= Math.min(payment, balance);
    months++;
  }
  if (balance > 0) return { payable: false, monthlyInterest: cents(firstInterest) };
  return { payable: true, months, totalInterest: cents(totalInterest) };
}

export type Strategy = 'avalanche' | 'snowball';

export interface StrategyResult {
  strategy: Strategy;
  /** Orden en que se atacan las deudas. */
  order: Id[];
  feasible: boolean;
  months: number;
  totalInterest: Cents;
  /** Mes (1 = el próximo) en que queda liquidada cada deuda. */
  paidOffMonth: Map<Id, number>;
}

/**
 * Avalancha: el dinero extra va a la deuda con mayor tasa → paga menos intereses.
 * Bola de nieve: el dinero extra va a la deuda más pequeña → liquida deudas antes (motiva).
 * En ambas, todas las deudas reciben al menos su mínimo, y el mínimo de una deuda liquidada
 * pasa a sumar al extra.
 */
export function simulateStrategy(debts: readonly Debt[], monthlyBudget: Cents, strategy: Strategy): StrategyResult {
  const active = debts.filter((d) => d.balance > 0);
  const order = [...active]
    .sort((a, b) =>
      strategy === 'avalanche'
        ? b.aprBasisPoints - a.aprBasisPoints || a.balance - b.balance
        : a.balance - b.balance || b.aprBasisPoints - a.aprBasisPoints,
    )
    .map((d) => d.id);

  const balances = new Map<Id, number>(active.map((d) => [d.id, d.balance]));
  const byId = new Map(active.map((d) => [d.id, d]));
  const paidOffMonth = new Map<Id, number>();
  const minimums = active.reduce((total, d) => total + d.minimumPayment, 0);
  let totalInterest = 0;
  let month = 0;

  if (monthlyBudget < minimums) {
    return { strategy, order, feasible: false, months: 0, totalInterest: cents(0), paidOffMonth };
  }

  while (paidOffMonth.size < active.length && month < MAX_MONTHS) {
    month++;
    for (const [id, balance] of balances) {
      if (balance <= 0) continue;
      const interest = monthlyInterest(balance, byId.get(id)?.aprBasisPoints ?? 0);
      totalInterest += interest;
      balances.set(id, balance + interest);
    }

    let available: number = monthlyBudget;
    // 1) Mínimos a todas.
    for (const id of order) {
      const balance = balances.get(id) ?? 0;
      if (balance <= 0) continue;
      const pay = Math.min(byId.get(id)?.minimumPayment ?? 0, balance, available);
      balances.set(id, balance - pay);
      available -= pay;
    }
    // 2) El resto, en orden de la estrategia.
    for (const id of order) {
      if (available <= 0) break;
      const balance = balances.get(id) ?? 0;
      if (balance <= 0) continue;
      const pay = Math.min(balance, available);
      balances.set(id, balance - pay);
      available -= pay;
    }
    for (const [id, balance] of balances) {
      if (balance <= 0 && !paidOffMonth.has(id)) paidOffMonth.set(id, month);
    }
  }

  const feasible = paidOffMonth.size === active.length;
  return { strategy, order, feasible, months: feasible ? month : 0, totalInterest: cents(totalInterest), paidOffMonth };
}

export interface StrategyComparison {
  avalanche: StrategyResult;
  snowball: StrategyResult;
  /** Cuánto interés ahorra la avalancha frente a la bola de nieve (≥ 0 normalmente). */
  interestSaved: Cents;
  recommended: Strategy;
}

/** Compara ambas estrategias con el presupuesto mensual actual (suma de los pagos planeados). */
export function compareStrategies(debts: readonly Debt[], monthlyBudget?: Cents): StrategyComparison {
  const budget = monthlyBudget ?? cents(debts.filter((d) => d.balance > 0).reduce((t, d) => t + d.payment, 0));
  const avalanche = simulateStrategy(debts, budget, 'avalanche');
  const snowball = simulateStrategy(debts, budget, 'snowball');
  const interestSaved = cents(snowball.totalInterest - avalanche.totalInterest);
  // Si la diferencia es pequeña (< $50), la bola de nieve da victorias rápidas sin costar casi nada.
  const recommended: Strategy = interestSaved >= 5_000 ? 'avalanche' : 'snowball';
  return { avalanche, snowball, interestSaved, recommended };
}
