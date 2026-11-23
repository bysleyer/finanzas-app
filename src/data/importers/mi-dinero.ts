/**
 * Importador desde "Mi dinero" (la primera app). Acepta:
 *   - el archivo de respaldo (Respaldo → Descargar respaldo): { formato: "mi-dinero-respaldo", … }
 *   - el archivo sincronizado (datos.json del repo privado): { listas: {…}, valores: {…} }
 *
 * Es una traducción pura: no guarda nada. `applyImport` (abajo) es lo único que escribe.
 * Todo lo que no tiene equivalente exacto se explica en `warnings`, para que el usuario lo
 * revise antes de confirmar.
 */

import {
  type Account,
  type Category,
  type Debt,
  type LocalDate,
  type Recurring,
  type RecurrenceRule,
  type Settings,
  type Transaction,
  addDays,
  addMonths,
  daysInMonth,
  fromDollars,
  localDate,
  parts,
} from '../../domain';
import type { FinanzasDb } from '../db';
import { DEBT_PAYMENT_CATEGORY, DEFAULT_CATEGORIES, DEFAULT_SETTINGS, MAIN_ACCOUNT_ID } from '../defaults';

// ── Formato de "Mi dinero" (solo lo que se usa; todo lo demás se ignora) ─────────────

interface OldMovement {
  id: string;
  tipo: 'gasto' | 'ingreso' | 'pagoDeuda' | 'ajuste' | string;
  monto: number;
  fecha: string;
  creado?: string;
  categoria?: string;
  nota?: string;
  tipoIngreso?: string;
  deudaId?: string;
  diferencia?: number;
  borrado?: boolean;
  incluidoEnCorreccion?: boolean;
}

interface OldFixed {
  id: string;
  nombre: string;
  monto?: number;
  frecuencia?: 'mensual' | 'semanal' | string;
  venceDia?: number;
  partes?: { cuotaPlan?: number };
  deudaPlan?: string;
  cambio?: { desde: string; monto: number };
  semanasRestantes?: number;
}

interface OldDebt {
  id: string;
  nombre: string;
  monto: number;
  nota?: string;
  prioridad?: number | null;
  venceInmediato?: boolean;
  puedeEsperar?: boolean;
  automatico?: boolean;
  borrado?: boolean;
}

interface OldOwnPayment {
  id: string;
  nombre: string;
  versiones?: { desde: string; monto: number; venceDia: number }[];
  pausas?: { desde: string; hasta: string | null }[];
  canceladoDesde?: string | null;
  borrado?: boolean;
}

interface OldData {
  ingresos?: { netoSemanal?: number | { monto: number }; diaDeCobro?: string };
  gastosFijos?: OldFixed[];
  deudasAtrasadas?: OldDebt[];
  colchon?: { meta?: number };
  fechasImportantes?: { nombre: string; diaDelMes: number; critica?: boolean }[];
}

interface Normalized {
  datos: OldData;
  movimientos: OldMovement[];
  pagosPropios: OldOwnPayment[];
  cambiosDatos: { campo: string; valor: number; desde: string }[];
  dineroInicial: { monto: number; momento: string } | null;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Lleva los dos formatos posibles a una misma forma. */
export function normalizeMiDinero(raw: unknown): Normalized {
  if (!isObject(raw)) throw new Error('El archivo no es un respaldo de Mi dinero.');

  if (raw.formato === 'mi-dinero-respaldo') {
    return {
      datos: (raw.datos ?? {}) as OldData,
      movimientos: (raw.movimientos ?? []) as OldMovement[],
      pagosPropios: (raw.pagosPropios ?? []) as OldOwnPayment[],
      cambiosDatos: (raw.cambiosDatos ?? []) as Normalized['cambiosDatos'],
      dineroInicial: (raw.dineroInicial ?? null) as Normalized['dineroInicial'],
    };
  }

  if (isObject(raw.listas) && isObject(raw.valores)) {
    const listas = raw.listas as Record<string, unknown>;
    const valor = (k: string) => {
      const v = (raw.valores as Record<string, unknown>)[k];
      return isObject(v) ? v.valor : undefined;
    };
    return {
      datos: (valor('datos') ?? {}) as OldData,
      movimientos: (listas.movimientos ?? []) as OldMovement[],
      pagosPropios: (listas.pagosPropios ?? []) as OldOwnPayment[],
      cambiosDatos: (listas.cambiosDatos ?? []) as Normalized['cambiosDatos'],
      dineroInicial: (valor('dineroInicial') ?? null) as Normalized['dineroInicial'],
    };
  }

  throw new Error('No reconozco este archivo. Usa "Respaldo → Descargar respaldo" en Mi dinero.');
}

// ── Traducción ───────────────────────────────────────────────────────────────────────

export interface ImportResult {
  account: Account;
  recurring: Recurring[];
  debts: Debt[];
  transactions: Transaction[];
  settings: Settings;
  /** Qué se hizo con cada cosa que no tiene equivalente exacto. Se muestra antes de confirmar. */
  warnings: string[];
  summary: { balance: number; transactions: number; firstDate: LocalDate | undefined; lastDate: LocalDate | undefined };
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Categorías de gasto del día a día (cuentan para el gasto habitual). */
const VARIABLE_CATEGORIES: Record<string, string> = {
  comida: 'food',
  supermercado: 'groceries',
  transporte: 'transport',
  casa: 'home',
  hogar: 'home',
  salud: 'health',
  compras: 'shopping',
  salidas: 'fun',
};

/** Categorías de facturas: se enlazan al gasto fijo correspondiente para no contarlas como gasto variable. */
const BILL_CATEGORIES: Record<string, { category: string; fixedId: string }> = {
  renta: { category: 'rent', fixedId: 'renta' },
  'teléfono': { category: 'phone', fixedId: 'telefono' },
  telefono: { category: 'phone', fixedId: 'telefono' },
  internet: { category: 'phone', fixedId: 'internet' },
  luz: { category: 'utilities', fixedId: 'luz' },
};

const FIXED_CATEGORY: Record<string, string> = { renta: 'rent', telefono: 'phone', internet: 'phone', luz: 'utilities' };

const money = (x: number) => fromDollars(x);
const fmt = (x: number) => `$${x.toFixed(2)}`;

/** Próxima fecha (hoy o después) que cae en el día `day` del mes, sin ser anterior a `notBefore`. */
function nextMonthlyDate(today: LocalDate, day: number, notBefore?: LocalDate): LocalDate {
  const start = notBefore && notBefore > today ? notBefore : today;
  const { year, month } = parts(start);
  const thisMonth = localDate(`${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, daysInMonth(year, month))).padStart(2, '0')}`);
  return thisMonth >= start ? thisMonth : addMonths(thisMonth, 1, day);
}

function nextWeekday(today: LocalDate, weekdayName: string): LocalDate {
  const target = WEEKDAYS.indexOf(weekdayName.toLowerCase());
  const { year, month, day } = parts(today);
  const current = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(today, ((target < 0 ? 5 : target) - current + 7) % 7);
}

function safeDate(text: string | undefined): LocalDate | undefined {
  try {
    return text ? localDate(text.slice(0, 10)) : undefined;
  } catch {
    return undefined;
  }
}

export function translateMiDinero(raw: unknown, today: LocalDate): ImportResult {
  const old = normalizeMiDinero(raw);
  const warnings: string[] = [];
  const datos = old.datos;
  const movements = old.movimientos.filter((m) => !m.borrado);

  // 1) Saldo: igual que "Mi dinero": dinero inicial + ingresos − gastos − pagos de deuda desde la corrección.
  const since = old.dineroInicial?.momento ?? '';
  let balance = Number(old.dineroInicial?.monto ?? 0);
  for (const m of movements) {
    if ((since && !(m.creado && m.creado > since)) || m.incluidoEnCorreccion) continue;
    if (m.tipo === 'ingreso') balance += m.monto;
    else if (m.tipo === 'gasto' || m.tipo === 'pagoDeuda') balance -= m.monto;
  }
  balance = Math.round(balance * 100) / 100;
  const account: Account = { id: MAIN_ACCOUNT_ID, name: 'Cuenta principal', type: 'checking', balance: money(balance), spendable: true };

  // 2) Sueldo semanal.
  const recurring: Recurring[] = [];
  const neto = datos.ingresos?.netoSemanal;
  const paycheck = typeof neto === 'number' ? neto : neto?.monto;
  const payday = datos.ingresos?.diaDeCobro ?? 'viernes';
  if (paycheck && paycheck > 0) {
    recurring.push({
      id: 'md-sueldo',
      name: 'Sueldo',
      kind: 'income',
      amount: money(paycheck),
      rule: { unit: 'week', interval: 1, anchor: nextWeekday(today, payday) },
      accountId: MAIN_ACCOUNT_ID,
      categoryId: 'salary',
    });
    warnings.push(
      `Sueldo: ${fmt(paycheck)} cada ${payday} (tu neto de 40 horas). Las semanas con horas extra o feriados cambian: usa "Otro monto" al confirmar cada cheque.`,
    );
  } else {
    warnings.push('No encontré tu sueldo semanal. Agrégalo en Fijos.');
  }

  // 3) Gastos fijos mensuales (renta, teléfono, luz, internet…). Los semanales de Mi dinero son
  //    presupuestos (comida, transporte) o pagos de préstamo: aquí se cubren con el gasto habitual y con Deudas.
  const changes = old.cambiosDatos;
  const debtPlanFromBill = new Map<string, { amount: number; day: number; anchor: LocalDate }>();
  for (const f of datos.gastosFijos ?? []) {
    if (f.frecuencia !== 'mensual' || !f.venceDia || !f.monto) {
      if (f.frecuencia === 'semanal' && !f.semanasRestantes) {
        warnings.push(`"${f.nombre}" era un presupuesto semanal: aquí entra en tu gasto habitual, calculado con tus movimientos.`);
      }
      continue;
    }
    const anchor = nextMonthlyDate(today, f.venceDia);
    let amount = f.monto;
    // Cambios de monto programados que ya aplican a la próxima factura.
    if (f.cambio && safeDate(f.cambio.desde) && (safeDate(f.cambio.desde) as LocalDate) <= anchor) {
      amount = f.cambio.monto;
      warnings.push(`${f.nombre}: desde ${f.cambio.desde} cuesta ${fmt(f.cambio.monto)} (antes ${fmt(f.monto)}).`);
    }
    const change = [...changes]
      .filter((c) => c.campo === `${f.id}Monto` && (safeDate(c.desde) ?? anchor) <= anchor)
      .sort((a, b) => (a.desde < b.desde ? 1 : -1))[0];
    if (change) {
      warnings.push(`${f.nombre}: usé ${fmt(change.valor)} desde ${change.desde} (lo cambiaste en Mi dinero; antes ${fmt(amount)}).`);
      amount = change.valor;
    }
    // La cuota de un plan de pagos dentro de la factura (luz) pasa a ser el pago de esa deuda.
    const cuota = f.partes?.cuotaPlan;
    if (f.deudaPlan && cuota) {
      amount -= cuota;
      debtPlanFromBill.set(f.deudaPlan, { amount: cuota, day: f.venceDia, anchor });
    }
    recurring.push({
      id: `md-${f.id}`,
      name: f.nombre,
      kind: 'expense',
      amount: money(amount),
      rule: { unit: 'month', interval: 1, anchor },
      accountId: MAIN_ACCOUNT_ID,
      categoryId: FIXED_CATEGORY[f.id] ?? 'other-expense',
    });
  }

  // 4) Suscripciones y pagos propios activos (los pausados o cancelados no entran).
  const skipped: string[] = [];
  for (const p of old.pagosPropios) {
    if (p.borrado || p.canceladoDesde) continue;
    const paused = (p.pausas ?? []).some((x) => x.desde <= today && (x.hasta === null || x.hasta >= today));
    const version = [...(p.versiones ?? [])].sort((a, b) => (a.desde < b.desde ? 1 : -1))[0];
    if (paused || !version) {
      skipped.push(p.nombre);
      continue;
    }
    recurring.push({
      id: `md-${p.id}`,
      name: p.nombre,
      kind: 'expense',
      amount: money(version.monto),
      rule: { unit: 'month', interval: 1, anchor: nextMonthlyDate(today, version.venceDia, safeDate(version.desde)) },
      accountId: MAIN_ACCOUNT_ID,
      categoryId: 'subscriptions',
    });
  }
  if (skipped.length) warnings.push(`No importé suscripciones pausadas: ${skipped.join(', ')}.`);

  // 5) Deudas: saldo de hoy = monto original − lo pagado (y ajustado) en los movimientos, como en Mi dinero.
  const paidNet = (id: string) =>
    old.movimientos
      .filter((m) => !m.borrado && m.deudaId === id)
      .reduce((s, m) => (m.tipo === 'pagoDeuda' ? s + m.monto : m.tipo === 'ajuste' ? s - (m.diferencia ?? 0) : s), 0);
  const weeklyLoan = (datos.gastosFijos ?? []).find((f) => f.frecuencia === 'semanal' && f.semanasRestantes && f.monto);
  const critical = (datos.fechasImportantes ?? []).find((f) => f.critica);
  const debts: Debt[] = [];

  for (const d of datos.deudasAtrasadas ?? []) {
    if (d.borrado) continue;
    const remaining = Math.round((d.monto - paidNet(d.id)) * 100) / 100;
    if (remaining <= 0) continue;
    const base = { id: `md-${d.id}`, name: d.nombre, kind: 'loan' as const, balance: money(remaining), aprBasisPoints: 0 };
    const plan = debtPlanFromBill.get(d.id);
    let payment = 0;
    let rule: RecurrenceRule = { unit: 'month', interval: 1, anchor: today };

    if (plan) {
      payment = plan.amount;
      rule = { unit: 'month', interval: 1, anchor: plan.anchor };
    } else if (d.automatico && weeklyLoan?.monto) {
      payment = weeklyLoan.monto;
      rule = { unit: 'week', interval: 1, anchor: nextWeekday(addDays(today, 1), payday) };
    } else if (d.venceInmediato) {
      payment = remaining;
      warnings.push(`${d.nombre} (${fmt(remaining)}) vence de inmediato: aparece hoy en "¿Ya pasó esto?". Si ya lo pagaste, toca "Sí".`);
    } else {
      const why = d.puedeEsperar ? 'puede esperar' : 'no tiene un plan de pagos';
      warnings.push(`${d.nombre} (${fmt(remaining)}) ${why}: la importé sin pagos programados, así que NO entra en la proyección. Ponle un plan en Deudas cuando lo tengas.`);
    }
    if (d.prioridad === 1 && critical) {
      warnings.push(`⚠ ${d.nombre}: en Mi dinero marcaste "${critical.nombre}" el día ${critical.diaDelMes}.`);
    }
    debts.push({ ...base, minimumPayment: money(payment), payment: money(payment), rule });
  }

  // 6) Historial de movimientos (sin ajustes de saldo, que no mueven dinero).
  const recurringIds = new Set(recurring.map((r) => r.id));
  const debtIds = new Set(debts.map((x) => x.id));
  const transactions: Transaction[] = [];
  for (const m of movements) {
    const date = safeDate(m.fecha);
    if (!date || !(m.monto > 0)) continue;
    const note = m.nota?.trim() ? { note: m.nota.trim() } : {};
    if (m.tipo === 'ingreso') {
      transactions.push({
        id: `md-${m.id}`,
        accountId: MAIN_ACCOUNT_ID,
        amount: money(m.monto),
        date,
        categoryId: m.tipoIngreso === 'cheque' ? 'salary' : 'other-income',
        ...note,
        ...(m.tipoIngreso === 'cheque' && recurringIds.has('md-sueldo') ? { recurringId: 'md-sueldo' } : {}),
      });
    } else if (m.tipo === 'gasto') {
      const key = (m.categoria ?? '').toLowerCase();
      const bill = BILL_CATEGORIES[key];
      const fixedId = bill ? `md-${bill.fixedId}` : undefined;
      transactions.push({
        id: `md-${m.id}`,
        accountId: MAIN_ACCOUNT_ID,
        amount: money(-m.monto),
        date,
        categoryId: bill?.category ?? VARIABLE_CATEGORIES[key] ?? 'other-expense',
        ...note,
        // Las facturas se enlazan a su gasto fijo: no cuentan como gasto del día a día.
        ...(fixedId ? { recurringId: fixedId } : {}),
      });
    } else if (m.tipo === 'pagoDeuda') {
      const debtId = m.deudaId ? `md-${m.deudaId}` : undefined;
      transactions.push({
        id: `md-${m.id}`,
        accountId: MAIN_ACCOUNT_ID,
        amount: money(-m.monto),
        date,
        categoryId: DEBT_PAYMENT_CATEGORY.id,
        ...note,
        isTransfer: true,
        ...(debtId && debtIds.has(debtId) ? { debtId } : {}),
      });
    }
  }
  transactions.sort((a, b) => (a.date < b.date ? -1 : 1));
  warnings.push('Las jornadas, los sobres, el consejero y los logros no tienen equivalente aquí: siguen en Mi dinero.');

  const cushion = datos.colchon?.meta;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(cushion !== undefined ? { safetyCushion: money(cushion) } : {}) };

  return {
    account,
    recurring,
    debts,
    transactions,
    settings,
    warnings,
    summary: {
      balance,
      transactions: transactions.length,
      firstDate: transactions[0]?.date,
      lastDate: transactions.at(-1)?.date,
    },
  };
}

/**
 * Reemplaza TODOS los datos de esta app por lo importado, en una sola transacción:
 * si algo falla, no cambia nada.
 */
export async function applyImport(db: FinanzasDb, result: ImportResult): Promise<void> {
  const tables = [db.accounts, db.categories, db.transactions, db.recurring, db.debts, db.goals, db.occurrences, db.meta];
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    await db.categories.bulkPut([...DEFAULT_CATEGORIES] as Category[]);
    await db.accounts.put(result.account);
    await db.recurring.bulkPut(result.recurring);
    await db.debts.bulkPut(result.debts);
    await db.transactions.bulkPut(result.transactions);
    await db.meta.put({ key: 'settings', value: result.settings });
  });
}

