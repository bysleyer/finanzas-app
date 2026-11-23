import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fromDollars as $, localDate as d, occurrenceKey } from '../domain';
import { forecast, pendingOccurrences } from '../engine';
import { FinanzasDb } from './db';
import { MAIN_ACCOUNT_ID } from './defaults';
import {
  addTransaction,
  completeSetup,
  confirmDebtPayment,
  confirmOccurrence,
  confirmPending,
  deleteDebt,
  deleteTransaction,
  getSettings,
  isSetupDone,
  loadForecastInput,
  recentTransactions,
  saveDebt,
  saveRecurring,
  skipOccurrence,
} from './repository';

const TODAY = d('2026-11-23');
let db: FinanzasDb;
let n = 0;

beforeEach(async () => {
  db = new FinanzasDb(`test-${n++}`);
  await completeSetup(db, { balance: $(1000), paycheck: $(500), nextPayday: d('2026-11-27'), safetyCushion: $(100) });
});

afterEach(async () => {
  await db.delete();
});

const balance = async () => (await db.accounts.get(MAIN_ACCOUNT_ID))?.balance;

describe('configuración inicial', () => {
  it('crea cuenta, sueldo semanal, categorías y ajustes', async () => {
    expect(await isSetupDone(db)).toBe(true);
    expect(await balance()).toBe($(1000));
    const [sueldo] = await db.recurring.toArray();
    expect(sueldo?.rule).toEqual({ unit: 'week', interval: 1, anchor: '2026-11-27' });
    expect((await getSettings(db)).safetyCushion).toBe($(100));
    expect(await db.categories.count()).toBeGreaterThan(5);
  });

  it('una base nueva no está configurada', async () => {
    const empty = new FinanzasDb(`empty-${n++}`);
    expect(await isSetupDone(empty)).toBe(false);
    await empty.delete();
  });
});

describe('transacciones', () => {
  it('registrar un gasto baja el saldo; borrarlo lo devuelve', async () => {
    const tx = await addTransaction(db, { kind: 'expense', amount: $(12.5), categoryId: 'food', date: TODAY });
    expect(tx.amount).toBe($(-12.5));
    expect(await balance()).toBe($(987.5));
    await deleteTransaction(db, tx.id);
    expect(await balance()).toBe($(1000));
    expect(await db.transactions.count()).toBe(0);
  });

  it('un ingreso sube el saldo', async () => {
    await addTransaction(db, { kind: 'income', amount: $(40), categoryId: 'other-income', date: TODAY });
    expect(await balance()).toBe($(1040));
  });

  it('rechaza montos no positivos sin tocar nada', async () => {
    await expect(addTransaction(db, { kind: 'expense', amount: $(0), categoryId: 'food', date: TODAY })).rejects.toThrow();
    expect(await balance()).toBe($(1000));
  });

  it('si falla a mitad de camino no deja nada a medias', async () => {
    await expect(
      addTransaction(db, { accountId: 'no-existe', kind: 'expense', amount: $(10), categoryId: 'food', date: TODAY }),
    ).rejects.toThrow();
    expect(await db.transactions.count()).toBe(0);
  });

  it('lista las más recientes primero', async () => {
    await addTransaction(db, { kind: 'expense', amount: $(1), categoryId: 'food', date: d('2026-11-20') });
    await addTransaction(db, { kind: 'expense', amount: $(2), categoryId: 'food', date: d('2026-11-22') });
    expect((await recentTransactions(db)).map((t) => t.date)).toEqual(['2026-11-22', '2026-11-20']);
  });
});

describe('recurrentes previstos', () => {
  it('confirmar crea la transacción, mueve el saldo y deja de estar pendiente', async () => {
    const renta = await saveRecurring(db, {
      name: 'Renta',
      kind: 'expense',
      amount: $(600),
      rule: { unit: 'month', interval: 1, anchor: d('2026-11-23') },
      accountId: MAIN_ACCOUNT_ID,
      categoryId: 'rent',
    });
    let input = await loadForecastInput(db, TODAY);
    expect(pendingOccurrences(input.recurring, input.confirmed, TODAY)).toHaveLength(1);
    const before = forecast(input).availableToday;

    await confirmOccurrence(db, renta.id, TODAY);
    await confirmOccurrence(db, renta.id, TODAY); // dos toques seguidos no duplican
    expect(await balance()).toBe($(400));
    expect(await db.transactions.count()).toBe(1);

    input = await loadForecastInput(db, TODAY);
    expect(pendingOccurrences(input.recurring, input.confirmed, TODAY)).toHaveLength(0);
    // Confirmar no cambia el disponible: antes se proyectaba, ahora ya está en el saldo.
    expect(forecast(input).availableToday).toBe(before);
  });

  it('confirmar con otro monto (por ejemplo, la luz vino más cara)', async () => {
    const luz = await saveRecurring(db, {
      name: 'Luz', kind: 'expense', amount: $(80), rule: { unit: 'month', interval: 1, anchor: TODAY }, accountId: MAIN_ACCOUNT_ID, categoryId: 'utilities',
    });
    await confirmOccurrence(db, luz.id, TODAY, $(95));
    expect(await balance()).toBe($(905));
  });

  it('borrar una transacción confirmada la devuelve a pendiente', async () => {
    const luz = await saveRecurring(db, {
      name: 'Luz', kind: 'expense', amount: $(80), rule: { unit: 'month', interval: 1, anchor: TODAY }, accountId: MAIN_ACCOUNT_ID, categoryId: 'utilities',
    });
    await confirmOccurrence(db, luz.id, TODAY);
    const [tx] = await db.transactions.toArray();
    if (!tx) throw new Error("falta la transacción");
    await deleteTransaction(db, tx.id);
    expect(await db.occurrences.get(occurrenceKey(luz.id, TODAY))).toBeUndefined();
    expect(await balance()).toBe($(1000));
  });

  it('descartar no mueve el saldo pero deja de estar pendiente', async () => {
    const luz = await saveRecurring(db, {
      name: 'Luz', kind: 'expense', amount: $(80), rule: { unit: 'month', interval: 1, anchor: TODAY }, accountId: MAIN_ACCOUNT_ID, categoryId: 'utilities',
    });
    await skipOccurrence(db, luz.id, TODAY);
    const input = await loadForecastInput(db, TODAY);
    expect(pendingOccurrences(input.recurring, input.confirmed, TODAY)).toHaveLength(0);
    expect(await balance()).toBe($(1000));
  });
});

describe('lectura para el motor', () => {
  it('el motor calcula el disponible con lo guardado', async () => {
    await addTransaction(db, { kind: 'expense', amount: $(50), categoryId: 'food', date: TODAY });
    const f = forecast(await loadForecastInput(db, TODAY));
    // (950 − 100 + 50 ya gastados) / 4 días = 225 de ración; menos 50 = 175
    expect(f.dailyAllowance).toBe($(225));
    expect(f.availableToday).toBe($(175));
  });

  it('incluye la transacción más antigua para saber cuánto historial hay', async () => {
    await addTransaction(db, { kind: 'expense', amount: $(5), categoryId: 'food', date: d('2025-01-01') });
    await addTransaction(db, { kind: 'expense', amount: $(5), categoryId: 'food', date: d('2026-11-20') });
    const input = await loadForecastInput(db, TODAY);
    expect(input.transactions.map((t) => t.date).sort()).toEqual(['2025-01-01', '2026-11-20']);
  });
});

describe('deudas', () => {
  const visa = {
    name: 'Visa',
    kind: 'credit-card' as const,
    balance: $(500),
    aprBasisPoints: 2499,
    minimumPayment: $(35),
    payment: $(200),
    rule: { unit: 'month' as const, interval: 1, anchor: TODAY },
  };
  const debtBalance = async (id: string) => (await db.debts.get(id))?.balance;

  it('no acepta un pago planeado menor que el mínimo', async () => {
    await expect(saveDebt(db, { ...visa, payment: $(20) })).rejects.toThrow();
  });

  it('pagar baja la cuenta y la deuda, y no cuenta como gasto variable', async () => {
    const saved = await saveDebt(db, visa);
    await confirmDebtPayment(db, saved.id, TODAY);
    await confirmDebtPayment(db, saved.id, TODAY); // doble toque no duplica
    expect(await balance()).toBe($(800));
    expect(await debtBalance(saved.id)).toBe($(300));
    const f = forecast(await loadForecastInput(db, TODAY));
    expect(f.spentToday).toBe(0);
  });

  it('el último pago no pasa del saldo de la deuda', async () => {
    const saved = await saveDebt(db, { ...visa, balance: $(120) });
    await confirmDebtPayment(db, saved.id, TODAY);
    expect(await balance()).toBe($(880));
    expect(await debtBalance(saved.id)).toBe(0);
  });

  it('borrar el pago devuelve el dinero a la cuenta y a la deuda, y vuelve a quedar pendiente', async () => {
    const saved = await saveDebt(db, visa);
    await confirmDebtPayment(db, saved.id, TODAY, $(150));
    const [tx] = await db.transactions.toArray();
    if (!tx) throw new Error('falta la transacción');
    await deleteTransaction(db, tx.id);
    expect(await balance()).toBe($(1000));
    expect(await debtBalance(saved.id)).toBe($(500));
    const input = await loadForecastInput(db, TODAY);
    expect(pendingOccurrences(input.recurring, input.confirmed, TODAY, input.debts)).toHaveLength(1);
  });

  it('confirmPending sirve para recurrentes y para deudas', async () => {
    const saved = await saveDebt(db, visa);
    const input = await loadForecastInput(db, TODAY);
    const [pending] = pendingOccurrences(input.recurring, input.confirmed, TODAY, input.debts);
    if (!pending) throw new Error('falta el pendiente');
    await confirmPending(db, pending);
    expect(await debtBalance(saved.id)).toBe($(300));
  });

  it('borrar una deuda conserva los pagos ya hechos', async () => {
    const saved = await saveDebt(db, visa);
    await confirmDebtPayment(db, saved.id, TODAY);
    await deleteDebt(db, saved.id);
    expect(await db.transactions.count()).toBe(1);
    expect(await balance()).toBe($(800));
  });
});

describe('migraciones', () => {
  it('una base de la versión 1 (la que ya está en el iPhone) se actualiza sin perder datos', async () => {
    const name = `v1-${n++}`;
    // Base creada exactamente como la creaba la versión 1 de la app.
    const v1 = new Dexie(name);
    v1.version(1).stores({
      accounts: 'id', categories: 'id, kind', transactions: 'id, date, accountId, categoryId, recurringId',
      recurring: 'id', debts: 'id', goals: 'id', occurrences: 'key', meta: 'key',
    });
    await v1.table('categories').bulkAdd([{ id: 'food', name: 'Comida', kind: 'expense' }]);
    await v1.table('accounts').add({ id: MAIN_ACCOUNT_ID, name: 'Cuenta', type: 'checking', balance: $(1234), spendable: true });
    await v1.table('transactions').add({ id: 't1', accountId: MAIN_ACCOUNT_ID, amount: $(-5), date: TODAY, categoryId: 'food' });
    v1.close();

    const upgraded = new FinanzasDb(name);
    expect(await upgraded.categories.get('debt-payment')).toBeDefined();
    expect((await upgraded.accounts.get(MAIN_ACCOUNT_ID))?.balance).toBe($(1234));
    expect(await upgraded.transactions.count()).toBe(1);
    await upgraded.delete();
  });
});
