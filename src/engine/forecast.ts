/**
 * Motor de proyección: responde "¿cuánto puedo gastar hoy sin comprometer mañana?".
 *
 * Es una función pura: recibe datos y devuelve resultados, sin leer ni escribir nada.
 * Eso la hace fácil de probar y de llevar a cualquier plataforma.
 *
 * ── Cómo se calcula el disponible ────────────────────────────────────────────────
 *
 * 1. Se toma el saldo gastable actual (S) y se simulan día a día los próximos meses:
 *    ingresos, gastos fijos, pagos de deuda y aportes a metas.
 * 2. Hasta el próximo ingreso NO se resta gasto variable: ese es justo el dinero que
 *    vamos a repartir. Después del próximo ingreso se resta el gasto variable habitual,
 *    para que los meses futuros se proyecten con hábitos realistas.
 * 3. P_min = saldo más bajo de toda esa simulación.
 *    Presupuesto del periodo = P_min − R (colchón de seguridad).
 *    Es lo máximo que puedes gastar ANTES del próximo ingreso sin que ningún día
 *    futuro quede por debajo del colchón.
 * 4. Ración diaria = presupuesto del periodo ÷ d (días hasta el próximo ingreso).
 *
 * Diferencia con la fórmula del PRD, min((S−C−M−R)/d, P_min−R): allí el tope P_min−R
 * se aplica a un solo día, así que gastar la ración varios días seguidos podía superarlo.
 * Aquí el tope se reparte entre los d días. Cuando no hay pagos grandes futuros, ambas
 * fórmulas dan lo mismo, porque P_min coincide con S − C − M.
 *
 * Lo ya gastado hoy se descuenta de la ración de hoy: si tu ración es $50 y gastas $20,
 * el disponible pasa a $30, no a $49.
 */

import {
  type Cents,
  type LocalDate,
  type Settings,
  type Transaction,
  addDays,
  addMonths,
  cents,
  diffDays,
  divFloor,
} from '../domain';
import { type EventInputs, type ProjectedEvent, buildEvents } from './events';
import { MIN_HISTORY_DAYS, estimateVariableSpending, isVariableExpense } from './variable-spending';

export const MAX_HORIZON_MONTHS = 12;
export const UPCOMING_PAYMENT_DAYS = 3;

export interface ForecastInput extends EventInputs {
  today: LocalDate;
  transactions: readonly Transaction[];
  settings: Settings;
}

export interface DayBalance {
  date: LocalDate;
  /** Saldo gastable al final del día. */
  balance: Cents;
  events: ProjectedEvent[];
}

export interface ForecastBreakdown {
  /** S: saldo gastable actual. */
  spendableBalance: Cents;
  /** C: gastos fijos y pagos de deuda hasta el próximo ingreso (positivo). */
  commitments: Cents;
  /** M: aportes a metas hasta el próximo ingreso (positivo). */
  goalReserve: Cents;
  /** R: colchón de seguridad. */
  safetyCushion: Cents;
  /** d: días hasta el próximo ingreso (hoy cuenta). */
  daysUntilIncome: number;
  nextIncomeDate: LocalDate | undefined;
  /** P_min: saldo más bajo proyectado (sin el gasto de este periodo). */
  lowestBalance: Cents;
  lowestBalanceDate: LocalDate;
  /**
   * Dinero que se aparta hoy para un pago futuro grande (por ejemplo, un seguro anual):
   * lo que quedaría al cobrar menos P_min. Es 0 cuando ningún mes futuro aprieta.
   */
  futureReserve: Cents;
  /** P_min − R: lo que se puede gastar en total hasta el próximo ingreso. */
  periodBudget: Cents;
}

export interface Forecast {
  /** El número principal de la pantalla de inicio. Nunca negativo. */
  availableToday: Cents;
  /** Ración del día completo, antes de restar lo ya gastado hoy. */
  dailyAllowance: Cents;
  /** Gasto variable ya registrado hoy. */
  spentToday: Cents;
  /** Cuánto se pasó hoy de la ración (0 si no se pasó). */
  overspentToday: Cents;
  /** Gasto variable diario usado para proyectar los periodos futuros. */
  dailyVariableSpending: Cents;
  /**
   * De dónde sale ese gasto diario: fijado a mano, estimado con el historial, o "insufficient"
   * si aún hay menos de 2 semanas de historial (los meses futuros se verán más holgados de lo real).
   */
  variableSpendingSource: 'manual' | 'history' | 'insufficient';
  breakdown: ForecastBreakdown;
  /** Saldo día a día si se sigue el plan (ración diaria y luego gasto habitual). */
  days: DayBalance[];
  firstNegativeDate: LocalDate | undefined;
  firstBelowCushionDate: LocalDate | undefined;
  /** Pagos en los próximos días (recordatorios). */
  upcomingPayments: ProjectedEvent[];
}

export function forecast(input: ForecastInput): Forecast {
  const { today, settings } = input;
  const horizonMonths = Math.min(Math.max(Math.trunc(settings.horizonMonths), 1), MAX_HORIZON_MONTHS);
  const horizonEnd = addMonths(today, horizonMonths);
  const events = buildEvents(input, today, horizonEnd);

  const spendableBalance = cents(
    input.accounts.filter((a) => a.spendable).reduce((total, a) => total + a.balance, 0),
  );
  const nextIncomeDate = events.find((e) => e.isIncome && e.date > today)?.date;
  const periodEnd = nextIncomeDate ?? addDays(horizonEnd, 1); // exclusivo
  const daysUntilIncome = diffDays(today, periodEnd);

  const estimate = estimateVariableSpending(input.transactions, today);
  const dailyVariableSpending = settings.manualDailyVariableSpending ?? estimate.dailyTotal;
  const variableSpendingSource =
    settings.manualDailyVariableSpending !== undefined ? 'manual' : estimate.historyDays >= MIN_HISTORY_DAYS ? 'history' : 'insufficient';

  const spendableAccounts = new Set(input.accounts.filter((a) => a.spendable).map((a) => a.id));
  const spentToday = cents(
    input.transactions
      .filter((t) => t.date === today && spendableAccounts.has(t.accountId) && isVariableExpense(t))
      .reduce((total, t) => total - t.amount, 0),
  );

  // Paso 1-3: simulación sin gasto variable dentro del periodo actual.
  const eventsByDate = groupByDate(events);
  const baseline = simulate(today, horizonEnd, spendableBalance, eventsByDate, (date) =>
    date >= periodEnd ? dailyVariableSpending : 0,
  );
  const lowest = baseline.reduce((low, day) => (day.balance < low.balance ? day : low));
  // Saldo al cerrar el periodo actual (víspera del próximo ingreso), antes del gasto variable.
  const periodClose = baseline[Math.min(daysUntilIncome, baseline.length) - 1] ?? lowest;
  const futureReserve = cents(Math.max(0, periodClose.balance - lowest.balance));

  const periodBudget = cents(Math.max(0, lowest.balance - settings.safetyCushion));
  // La ración se calcula como si hoy empezara sin gastos, y luego se resta lo ya gastado.
  const dailyAllowance = divFloor(cents(periodBudget + spentToday), daysUntilIncome);
  const remainingToday = dailyAllowance - spentToday;

  // Paso 4: camino planeado (lo que se muestra en la gráfica y genera las alertas).
  const planned = simulate(today, horizonEnd, spendableBalance, eventsByDate, (date) => {
    if (date === today) return Math.max(0, remainingToday);
    return date < periodEnd ? dailyAllowance : dailyVariableSpending;
  });

  let commitments = 0;
  let goalReserve = 0;
  for (const e of events) {
    if (e.date >= periodEnd || e.isIncome) continue;
    if (e.source === 'goal') goalReserve -= e.amount;
    else commitments -= e.amount;
  }

  const upcomingLimit = addDays(today, UPCOMING_PAYMENT_DAYS);

  return {
    availableToday: cents(Math.max(0, remainingToday)),
    dailyAllowance,
    spentToday,
    overspentToday: cents(Math.max(0, -remainingToday)),
    dailyVariableSpending,
    variableSpendingSource,
    breakdown: {
      spendableBalance,
      commitments: cents(commitments),
      goalReserve: cents(goalReserve),
      safetyCushion: settings.safetyCushion,
      daysUntilIncome,
      nextIncomeDate,
      lowestBalance: lowest.balance,
      lowestBalanceDate: lowest.date,
      futureReserve,
      periodBudget,
    },
    days: planned,
    firstNegativeDate: planned.find((d) => d.balance < 0)?.date,
    firstBelowCushionDate: planned.find((d) => d.balance < settings.safetyCushion)?.date,
    upcomingPayments: events.filter((e) => !e.isIncome && e.source !== 'goal' && e.date <= upcomingLimit),
  };
}

/** "¿Y si compro esto?": recalcula como si hoy se gastara `amount` extra, sin guardar nada. */
export function whatIf(input: ForecastInput, amount: Cents, label = 'Compra simulada'): Forecast {
  const purchase: ProjectedEvent = {
    date: input.today,
    amount: cents(-amount),
    source: 'one-off',
    sourceId: 'what-if',
    label,
    isIncome: false,
  };
  return forecast({ ...input, oneOff: [...(input.oneOff ?? []), purchase] });
}

function groupByDate(events: readonly ProjectedEvent[]): Map<LocalDate, ProjectedEvent[]> {
  const map = new Map<LocalDate, ProjectedEvent[]>();
  for (const e of events) {
    const list = map.get(e.date);
    if (list) list.push(e);
    else map.set(e.date, [e]);
  }
  return map;
}

function simulate(
  from: LocalDate,
  to: LocalDate,
  startBalance: Cents,
  eventsByDate: ReadonlyMap<LocalDate, ProjectedEvent[]>,
  variableFor: (date: LocalDate) => number,
): DayBalance[] {
  const days: DayBalance[] = [];
  let balance: number = startBalance;
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const dayEvents = eventsByDate.get(date) ?? [];
    for (const e of dayEvents) balance += e.amount;
    balance -= variableFor(date);
    days.push({ date, balance: cents(balance), events: dayEvents });
  }
  return days;
}

export interface MonthSummary {
  /** 'YYYY-MM' */
  month: string;
  endBalance: Cents;
  lowestBalance: Cents;
  lowestDate: LocalDate;
}

/** Resume la proyección por mes calendario: saldo al cierre y el día más bajo de cada mes. */
export function monthlySummary(days: readonly DayBalance[]): MonthSummary[] {
  const result: MonthSummary[] = [];
  for (const day of days) {
    const month = day.date.slice(0, 7);
    const last = result.at(-1);
    if (last?.month !== month) {
      result.push({ month, endBalance: day.balance, lowestBalance: day.balance, lowestDate: day.date });
      continue;
    }
    last.endBalance = day.balance;
    if (day.balance < last.lowestBalance) {
      last.lowestBalance = day.balance;
      last.lowestDate = day.date;
    }
  }
  return result;
}
