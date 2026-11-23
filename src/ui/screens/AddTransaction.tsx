import { useState } from 'react';
import { QUICK_EXPENSE_CATEGORIES, addTransaction } from '../../data';
import { type Category, type LocalDate, localDate, parseMoneyInput } from '../../domain';
import { MoneyField } from '../components/MoneyField';
import { Sheet } from '../components/Sheet';
import { db } from '../db';

interface Props {
  today: LocalDate;
  categories: Map<string, Category>;
  onClose: () => void;
}

/**
 * Registro en 2 toques: escribes el monto y tocas la categoría. Tocar la categoría guarda.
 */
export function AddTransaction({ today, categories, onClose }: Props) {
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<string>(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const options =
    kind === 'expense'
      ? QUICK_EXPENSE_CATEGORIES.map((id) => categories.get(id)).filter((c): c is Category => c !== undefined)
      : [...categories.values()].filter((c) => c.kind === 'income');

  async function save(categoryId: string) {
    const value = parseMoneyInput(amount);
    if (value === undefined) {
      setError('Escribe un monto válido.');
      return;
    }
    await addTransaction(db, {
      kind,
      amount: value,
      categoryId,
      date: localDate(date || today),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    navigator.vibrate?.(10);
    onClose();
  }

  return (
    <Sheet title={kind === 'expense' ? 'Nuevo gasto' : 'Nuevo ingreso'} onClose={onClose}>
      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={kind === 'expense'} onClick={() => setKind('expense')}>
          Gasto
        </button>
        <button type="button" role="tab" aria-selected={kind === 'income'} onClick={() => setKind('income')}>
          Ingreso
        </button>
      </div>

      <MoneyField label="Monto" value={amount} onChange={(v) => { setAmount(v); setError(''); }} autoFocus large />
      {error && <p className="error" role="alert">{error}</p>}

      <p className="hint">Toca la categoría para guardar.</p>
      <div className="category-grid">
        {options.map((c) => (
          <button key={c.id} type="button" className="category" onClick={() => save(c.id)}>
            <span className="category-icon" aria-hidden="true">{c.icon}</span>
            <span>{c.name}</span>
          </button>
        ))}
      </div>

      <details className="more">
        <summary>Fecha y nota</summary>
        <div className="stack">
          <div className="field">
            <label htmlFor="tx-date">Fecha</label>
            <input id="tx-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tx-note">Nota</label>
            <input id="tx-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
      </details>
    </Sheet>
  );
}
