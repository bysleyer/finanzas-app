/**
 * Operaciones de lectura y escritura. Cada operación que toca varias tablas (por ejemplo,
 * registrar un gasto y actualizar el saldo de la cuenta) se hace dentro de una transacción:
 * o se guarda todo, o no se guarda nada.
 */

import {
  type Cents,
  type Debt,
  type Id,
  type LocalDate,
  type OccurrenceKey,
  type Recurring,
  type RecurrenceRule,
  type Settings,
  type Transaction,
  addDays,
  cents,
  occurrenceKey,
} from '../domain';
import type { ForecastInput, PendingOccurrence } from '../engine';
import { type FinanzasDb, newId } from './db';
import { DEBT_PAYMENT_CATEGORY, DEFAULT_CATEGORIES, DEFAULT_SETTINGS, MAIN_ACCOUNT_ID } from './defaults';

// ── Configuración inicial ───────────────────────────────────────────────────────────

export interface InitialSetup {
  balance: Cents;
  paycheck: Cents;
  /** Próximo día de pago; define el día de la semana del sueldo. */
  nextPayday: LocalDate;
  paycheckRule?: Omit<RecurrenceRule, 'anchor'>;
  safetyCushion: Cents;
}

export async function isSetupDone(db: FinanzasDb): Promise<boolean> {
  return (await db.accounts.count()) > 0;
}

export async function completeSetup(db: FinanzasDb, setup: InitialSetup): Promise<void> {
  await db.transaction('rw', [db.accounts, db.categories, db.recurring, db.meta], async () => {
    await db.categories.bulkPut([...DEFAULT_CATEGORIES]);
    await db.accounts.put({ id: MAIN_ACCOUNT_ID, name: 'Cuenta principal', type: 'checking', balance: setup.balance, spendable: true });
    await db.recurring.put({
      id: newId(),
      name: 'Sueldo',
      kind: 'income',
      amount: setup.paycheck,
      rule: { unit: 'week', interval: 1, ...setup.paycheckRule, anchor: setup.nextPayday },
      accountId: MAIN_ACCOUNT_ID,
      categoryId: 'salary',
    });
    await db.meta.put({ key: 'settings', value: { ...DEFAULT_SETTINGS, safetyCushion: setup.safetyCushion } });
  });
}

// ── Ajustes y cuentas ───────────────────────────────────────────────────────────────

export async function getSettings(db: FinanzasDb): Promise<Settings> {
  return (await db.meta.get('settings'))?.value ?? DEFAULT_SETTINGS;
}

export async function saveSettings(db: FinanzasDb, settings: Settings): Promise<void> {
  await db.meta.put({ key: 'settings', value: settings });
}

/** Corrige el saldo a mano (por ejemplo, para cuadrarlo con el banco). */
export async function setAccountBalance(db: FinanzasDb, accountId: Id, balance: Cents): Promise<void> {
  const updated = await db.accounts.update(accountId, { balance });
  if (updated === 0) throw new Error(`No existe la cuenta ${accountId}`);
}

async function adjustBalance(db: FinanzasDb, accountId: Id, delta: number): Promise<void> {
  const account = await db.accounts.get(accountId);
  if (!account) throw new Error(`No existe la cuenta ${accountId}`);
  await db.accounts.update(accountId, { balance: cents(account.balance + delta) });
}

// ── Transacciones ───────────────────────────────────────────────────────────────────

export interface NewTransaction {
  accountId?: Id;
  kind: 'income' | 'expense';
  /** Siempre positivo. */
  amount: Cents;
  categoryId: Id;
  date: LocalDate;
  note?: string;
}

export async function addTransaction(db: FinanzasDb, input: NewTransaction): Promise<Transaction> {
  if (input.amount <= 0) throw new RangeError('El monto debe ser mayor que cero.');
  const tx: Transaction = {
    id: newId(),
    accountId: input.accountId ?? MAIN_ACCOUNT_ID,
    amount: cents(input.kind === 'income' ? input.amount : -input.amount),
    date: input.date,
    categoryId: input.categoryId,
    ...(input.note ? { note: input.note } : {}),
  };
  await db.transaction('rw', [db.transactions, db.accounts], async () => {
    await db.transactions.add(tx);
    await adjustBalance(db, tx.accountId, tx.amount);
  });
  return tx;
}

/**
 * Borra una transacción y devuelve su monto al saldo. Si venía de un recurrente o de un pago
 * de deuda, vuelve a quedar pendiente (y la deuda recupera lo que se había abonado).
 */
export async function deleteTransaction(db: FinanzasDb, id: Id): Promise<void> {
  await db.transaction('rw', [db.transactions, db.accounts, db.occurrences, db.debts], async () => {
    const tx = await db.transactions.get(id);
    if (!tx) return;
    await db.transactions.delete(id);
    await adjustBalance(db, tx.accountId, -tx.amount);
    if (tx.recurringId) await db.occurrences.delete(occurrenceKey(tx.recurringId, tx.date));
    if (tx.debtId) {
      await db.occurrences.delete(occurrenceKey(tx.debtId, tx.date));
      const debt = await db.debts.get(tx.debtId);
      if (debt) await db.debts.update(debt.id, { balance: cents(debt.balance - tx.amount) });
    }
  });
}

export async function recentTransactions(db: FinanzasDb, limit = 50): Promise<Transaction[]> {
  return db.transactions.orderBy('date').reverse().limit(limit).toArray();
}

// ── Recurrentes ─────────────────────────────────────────────────────────────────────

export async function saveRecurring(db: FinanzasDb, recurring: Omit<Recurring, 'id'> & { id?: Id }): Promise<Recurring> {
  const saved: Recurring = { ...recurring, id: recurring.id ?? newId() };
  await db.recurring.put(saved);
  return saved;
}

export async function deleteRecurring(db: FinanzasDb, id: Id): Promise<void> {
  await db.recurring.delete(id);
}

/** Convierte un recurrente previsto en una transacción real (por defecto, con su monto habitual). */
export async function confirmOccurrence(db: FinanzasDb, recurringId: Id, date: LocalDate, amount?: Cents): Promise<void> {
  await db.transaction('rw', [db.recurring, db.transactions, db.accounts, db.occurrences], async () => {
    const r = await db.recurring.get(recurringId);
    if (!r) throw new Error(`No existe el recurrente ${recurringId}`);
    const key = occurrenceKey(recurringId, date);
    if (await db.occurrences.get(key)) return; // ya resuelta
    const value = amount ?? r.amount;
    const tx: Transaction = {
      id: newId(),
      accountId: r.accountId,
      amount: cents(r.kind === 'income' ? value : -value),
      date,
      categoryId: r.categoryId,
      note: r.name,
      recurringId,
    };
    await db.transactions.add(tx);
    await adjustBalance(db, tx.accountId, tx.amount);
    await db.occurrences.put({ key, status: 'confirmed', transactionId: tx.id });
  });
}

/** Marca un movimiento previsto (recurrente o pago de deuda) como "esta vez no ocurrió". */
export async function skipOccurrence(db: FinanzasDb, sourceId: Id, date: LocalDate): Promise<void> {
  await db.occurrences.put({ key: occurrenceKey(sourceId, date), status: 'skipped' });
}

// ── Deudas ──────────────────────────────────────────────────────────────────────────

export async function saveDebt(db: FinanzasDb, debt: Omit<Debt, 'id'> & { id?: Id }): Promise<Debt> {
  if (debt.payment < debt.minimumPayment) throw new RangeError('El pago planeado no puede ser menor que el mínimo.');
  const saved: Debt = { ...debt, id: debt.id ?? newId() };
  await db.debts.put(saved);
  return saved;
}

export async function deleteDebt(db: FinanzasDb, id: Id): Promise<void> {
  await db.debts.delete(id);
}

/**
 * Registra el pago de una deuda: sale de la cuenta, baja el saldo de la deuda y el
 * vencimiento deja de estar pendiente. Por defecto se paga lo planeado (sin pasar del saldo).
 */
export async function confirmDebtPayment(db: FinanzasDb, debtId: Id, date: LocalDate, amount?: Cents): Promise<void> {
  await db.transaction('rw', [db.debts, db.transactions, db.accounts, db.occurrences], async () => {
    const debt = await db.debts.get(debtId);
    if (!debt) throw new Error(`No existe la deuda ${debtId}`);
    const key = occurrenceKey(debtId, date);
    if (await db.occurrences.get(key)) return; // ya resuelta
    const value = amount ?? Math.min(debt.payment, debt.balance);
    if (value <= 0) throw new RangeError('El pago debe ser mayor que cero.');
    const tx: Transaction = {
      id: newId(),
      accountId: MAIN_ACCOUNT_ID,
      amount: cents(-value),
      date,
      categoryId: DEBT_PAYMENT_CATEGORY.id,
      note: `Pago ${debt.name}`,
      debtId,
      isTransfer: true,
    };
    await db.transactions.add(tx);
    await adjustBalance(db, tx.accountId, tx.amount);
    await db.debts.update(debtId, { balance: cents(Math.max(0, debt.balance - value)) });
    await db.occurrences.put({ key, status: 'confirmed', transactionId: tx.id });
  });
}

/** Confirma cualquier movimiento previsto, venga de un recurrente o de una deuda. */
export async function confirmPending(db: FinanzasDb, pending: PendingOccurrence, amount?: Cents): Promise<void> {
  if (pending.source === 'debt') await confirmDebtPayment(db, pending.sourceId, pending.date, amount);
  else await confirmOccurrence(db, pending.sourceId, pending.date, amount);
}

// ── Lectura para el motor ───────────────────────────────────────────────────────────

/** Historial que necesita el motor: los últimos ~100 días bastan para el promedio de 90. */
const HISTORY_DAYS_FOR_ENGINE = 100;

export async function loadForecastInput(db: FinanzasDb, today: LocalDate): Promise<ForecastInput> {
  const sinceDate = addDays(today, -HISTORY_DAYS_FOR_ENGINE);

  const [accounts, recurring, debts, goals, occurrences, transactions, settings] = await Promise.all([
    db.accounts.toArray(),
    db.recurring.toArray(),
    db.debts.toArray(),
    db.goals.toArray(),
    db.occurrences.toArray(),
    db.transactions.where('date').aboveOrEqual(sinceDate).toArray(),
    getSettings(db),
  ]);

  // Necesitamos saber desde cuándo hay historial para promediar bien; basta con la transacción más antigua.
  const oldest = await db.transactions.orderBy('date').first();
  if (oldest && oldest.date < sinceDate) transactions.push(oldest);

  return {
    today,
    accounts,
    recurring,
    debts,
    goals,
    transactions,
    confirmed: new Set<OccurrenceKey>(occurrences.map((o) => o.key)),
    settings,
  };
}
