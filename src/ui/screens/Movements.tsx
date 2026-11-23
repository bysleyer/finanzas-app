import { deleteTransaction } from '../../data';
import { type Category, type LocalDate, type Transaction, abs } from '../../domain';
import { db } from '../db';
import { money, relativeDate } from '../format';
import type { AppData } from '../hooks';

export function TransactionRow({ tx, category, onDelete }: { tx: Transaction; category: Category | undefined; onDelete?: () => void }) {
  const income = tx.amount > 0;
  return (
    <li className="row">
      <span className="row-icon" aria-hidden="true">{category?.icon ?? '•'}</span>
      <div className="row-main">
        <span className="row-title">{tx.note ?? category?.name ?? 'Sin categoría'}</span>
        {tx.note && category && <span className="row-sub">{category.name}</span>}
      </div>
      <span className={income ? 'amount income' : 'amount'}>
        {income ? '+' : '−'}
        {money(abs(tx.amount))}
      </span>
      {onDelete && (
        <button type="button" className="icon-button" aria-label="Borrar" onClick={onDelete}>
          ✕
        </button>
      )}
    </li>
  );
}

export function Movements({ data, today }: { data: AppData; today: LocalDate }) {
  const groups = new Map<LocalDate, Transaction[]>();
  for (const tx of data.recent) {
    const list = groups.get(tx.date);
    if (list) list.push(tx);
    else groups.set(tx.date, [tx]);
  }

  async function remove(tx: Transaction) {
    const what = tx.note ?? data.categories.get(tx.categoryId)?.name ?? 'este movimiento';
    if (confirm(`¿Borrar ${what} de ${money(abs(tx.amount))}? El saldo se ajusta solo.`)) {
      await deleteTransaction(db, tx.id);
    }
  }

  return (
    <main className="screen">
      <h1>Movimientos</h1>
      {groups.size === 0 && <p className="empty">Todavía no hay movimientos. Toca + para registrar el primero.</p>}
      {[...groups].map(([date, txs]) => (
        <section key={date} className="card">
          <h2>{relativeDate(date, today)}</h2>
          <ul className="list">
            {txs.map((t) => (
              <TransactionRow key={t.id} tx={t} category={data.categories.get(t.categoryId)} onDelete={() => remove(t)} />
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
