import { type FormEvent, useState } from 'react';
import { MAIN_ACCOUNT_ID, deleteRecurring, saveRecurring } from '../../data';
import {
  type Category,
  type LocalDate,
  type Recurring,
  type RecurrenceRule,
  localDate,
  nextOccurrence,
  parseMoneyInput,
  toInputString,
} from '../../domain';
import { MoneyField } from '../components/MoneyField';
import { Sheet } from '../components/Sheet';
import { db } from '../db';
import { describeRule, money, relativeDate } from '../format';
import type { AppData } from '../hooks';

/** Frecuencias que se ofrecen en pantalla. El motor acepta cualquier otra combinación. */
const FREQUENCIES = [
  { value: 'week-1', label: 'Cada semana', unit: 'week', interval: 1 },
  { value: 'week-2', label: 'Cada 2 semanas', unit: 'week', interval: 2 },
  { value: 'month-1', label: 'Cada mes', unit: 'month', interval: 1 },
  { value: 'year-1', label: 'Cada año', unit: 'year', interval: 1 },
] as const;

const FIXED_EXPENSE_CATEGORIES = ['rent', 'utilities', 'subscriptions', 'phone', 'insurance', 'transport', 'health', 'other-expense'];

export function Fixed({ data, today }: { data: AppData; today: LocalDate }) {
  const [editing, setEditing] = useState<Recurring | 'new-income' | 'new-expense' | null>(null);
  const incomes = data.input.recurring.filter((r) => r.kind === 'income');
  const expenses = data.input.recurring.filter((r) => r.kind === 'expense');

  const list = (items: Recurring[]) => (
    <ul className="list">
      {items.map((r) => {
        const next = nextOccurrence(r.rule, today);
        return (
          <li key={r.id}>
            <button type="button" className="row row-button" onClick={() => setEditing(r)}>
              <span className="row-icon" aria-hidden="true">{data.categories.get(r.categoryId)?.icon ?? '•'}</span>
              <div className="row-main">
                <span className="row-title">{r.name}</span>
                <span className="row-sub">
                  {describeRule(r.rule)}
                  {next && ` · próximo: ${relativeDate(next, today).toLowerCase()}`}
                </span>
              </div>
              <span className={r.kind === 'income' ? 'amount income' : 'amount'}>{money(r.amount)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <main className="screen">
      <h1>Fijos</h1>
      <p className="lead">Lo que se repite. Entra solo en el cálculo, sin registrarlo a mano.</p>

      <section className="card">
        <h2>Ingresos</h2>
        {list(incomes)}
        <button type="button" className="link add" onClick={() => setEditing('new-income')}>+ Agregar ingreso</button>
      </section>

      <section className="card">
        <h2>Gastos fijos</h2>
        {expenses.length === 0 && <p className="hint">Renta, luz, teléfono, suscripciones… Agrégalos para que el cálculo sea real.</p>}
        {list(expenses)}
        <button type="button" className="link add" onClick={() => setEditing('new-expense')}>+ Agregar gasto fijo</button>
      </section>

      {editing && (
        <RecurringForm
          today={today}
          categories={data.categories}
          initial={typeof editing === 'string' ? undefined : editing}
          kind={typeof editing === 'string' ? (editing === 'new-income' ? 'income' : 'expense') : editing.kind}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}

interface FormProps {
  today: LocalDate;
  categories: Map<string, Category>;
  initial: Recurring | undefined;
  kind: 'income' | 'expense';
  onClose: () => void;
}

function RecurringForm({ today, categories, initial, kind, onClose }: FormProps) {
  const initialFreq = initial
    ? (FREQUENCIES.find((f) => f.unit === initial.rule.unit && f.interval === initial.rule.interval)?.value ?? 'week-1')
    : kind === 'income' ? 'week-1' : 'month-1';
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial ? toInputString(initial.amount) : '');
  const [freq, setFreq] = useState<string>(initialFreq);
  const [next, setNext] = useState<string>((initial && nextOccurrence(initial.rule, today)) ?? today);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? (kind === 'income' ? 'salary' : 'rent'));
  const [error, setError] = useState('');

  const categoryOptions =
    kind === 'income'
      ? [...categories.values()].filter((c) => c.kind === 'income')
      : FIXED_EXPENSE_CATEGORIES.map((id) => categories.get(id)).filter((c): c is Category => c !== undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseMoneyInput(amount);
    const frequency = FREQUENCIES.find((f) => f.value === freq);
    if (!name.trim()) return setError('Ponle un nombre.');
    if (value === undefined) return setError('Escribe un monto válido.');
    if (!frequency) return setError('Elige una frecuencia.');
    if (!next) return setError('Elige la fecha del próximo pago.');
    // El ancla es la próxima fecha: así no aparecen como pendientes fechas anteriores a hoy.
    const rule: RecurrenceRule = { unit: frequency.unit, interval: frequency.interval, anchor: localDate(next) };
    await saveRecurring(db, {
      ...(initial ? { id: initial.id } : {}),
      name: name.trim(),
      kind,
      amount: value,
      rule,
      accountId: initial?.accountId ?? MAIN_ACCOUNT_ID,
      categoryId,
    });
    onClose();
  }

  async function remove() {
    if (initial && confirm(`¿Borrar "${initial.name}"? Los movimientos ya registrados se conservan.`)) {
      await deleteRecurring(db, initial.id);
      onClose();
    }
  }

  const title = initial ? `Editar ${initial.name}` : kind === 'income' ? 'Nuevo ingreso fijo' : 'Nuevo gasto fijo';

  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="field">
          <label htmlFor="rec-name">Nombre</label>
          <input id="rec-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'income' ? 'Sueldo' : 'Renta'} />
        </div>
        <MoneyField label="Monto" value={amount} onChange={setAmount} />
        <div className="field">
          <label htmlFor="rec-freq">Frecuencia</label>
          <select id="rec-freq" value={freq} onChange={(e) => setFreq(e.target.value)}>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rec-next">Próxima fecha</label>
          <input id="rec-next" type="date" value={next} min={today} onChange={(e) => setNext(e.target.value)} />
          <p className="hint">Define también el día: si es un viernes, se repite los viernes.</p>
        </div>
        <div className="field">
          <label htmlFor="rec-cat">Categoría</label>
          <select id="rec-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="primary">Guardar</button>
        {initial && (
          <button type="button" className="danger" onClick={remove}>Borrar</button>
        )}
      </form>
    </Sheet>
  );
}
