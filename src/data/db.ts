/**
 * Base de datos local en el navegador (IndexedDB, a través de Dexie).
 *
 * Esta es la única parte de la app que sabe CÓMO se guardan los datos. Si mañana se cambia
 * IndexedDB por SQLite (por ejemplo, al empaquetar con Capacitor), solo cambia esta capa.
 *
 * Cambios de esquema: nunca se edita una versión existente. Se agrega `this.version(N + 1)`
 * con su migración, para que los datos de quien ya usa la app se conserven.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Account, Category, Debt, Goal, OccurrenceKey, Recurring, Settings, Transaction } from '../domain';

export interface OccurrenceRecord {
  key: OccurrenceKey;
  status: 'confirmed' | 'skipped';
  /** Transacción creada al confirmar. */
  transactionId?: string;
}

export interface MetaRecord {
  key: 'settings';
  value: Settings;
}

export class FinanzasDb extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  recurring!: EntityTable<Recurring, 'id'>;
  debts!: EntityTable<Debt, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  occurrences!: EntityTable<OccurrenceRecord, 'key'>;
  meta!: EntityTable<MetaRecord, 'key'>;

  constructor(name = 'finanzas') {
    super(name);
    // Solo se indexan los campos por los que se busca u ordena.
    this.version(1).stores({
      accounts: 'id',
      categories: 'id, kind',
      transactions: 'id, date, accountId, categoryId, recurringId',
      recurring: 'id',
      debts: 'id',
      goals: 'id',
      occurrences: 'key',
      meta: 'key',
    });
  }
}

export function newId(): string {
  return crypto.randomUUID();
}
