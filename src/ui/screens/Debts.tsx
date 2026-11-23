import { type FormEvent, useState } from 'react';
import { deleteDebt, saveDebt } from '../../data';
import {
  type Debt,
  type DebtKind,
  type LocalDate,
  type OccurrenceKey,
  type RecurrenceRule,
  addMonths,
  cents,
  formatRate,
  localDate,
  nextOccurrence,
  parseMoneyInput,
  parseRateInput,
  parts,
  sum,
  toInputString,
} from '../../domain';
import { type StrategyResult, compareStrategies, monthlyEquivalent, monthlyInterest, nextUnresolved, payoffEstimate } from '../../engine';
import { MoneyField } from '../components/MoneyField';
import { Sheet } from '../components/Sheet';
import { db } from '../db';
import { money, moneyRounded, relativeDate } from '../format';
import type { AppData } from '../hooks';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function monthYear(today: LocalDate, monthsAhead: number): string {
  const { year, month } = parts(addMonths(today, monthsAhead));
  return `${MONTHS[month - 1]} ${year}`;
}

/** "por semana", "cada 2 semanas", "al mes" */
function per(rule: RecurrenceRule): string {
  if (rule.unit === 'week') return rule.interval === 1 ? 'por semana' : `cada ${rule.interval} semanas`;
  if (rule.unit === 'month') return rule.interval === 1 ? 'al mes' : `cada ${rule.interval} meses`;
  return rule.unit === 'year' ? 'al año' : 'al día';
}

const DEBT_FREQUENCIES = [
  { value: 'week-1', label: 'Cada semana', unit: 'week', interval: 1 },
  { value: 'week-2', label: 'Cada 2 semanas', unit: 'week', interval: 2 },
  { value: 'month-1', label: 'Cada mes', unit: 'month', interval: 1 },
] as const;

function duration(months: number): string {
  if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} ${years === 1 ? 'año' : 'años'}${rest ? ` y ${rest} ${rest === 1 ? 'mes' : 'meses'}` : ''}`;
}

export function Debts({ data, today }: { data: AppData; today: LocalDate }) {
  const [editing, setEditing] = useState<Debt | 'new' | null>(null);
  const debts = data.input.debts;
  const active = debts.filter((d) => d.balance > 0);
  const total = sum(active.map((d) => d.balance));

  return (
    <main className="screen">
      <h1>Deudas</h1>
      <p className="lead">Tarjetas y préstamos. Sus pagos entran solos en tu disponible y en la gráfica.</p>

      {active.length > 0 && (
        <section className="card">
          <h2>Debes en total</h2>
          <p className="big-number">{money(total)}</p>
          <p className="hint">
            Pagas {money(sum(active.map((d) => monthlyEquivalent(d.payment, d.rule))))} al mes entre {active.length}{' '}
            {active.length === 1 ? 'deuda' : 'deudas'}.
          </p>
        </section>
      )}

      <section className="card">
        {debts.length === 0 && (
          <p className="hint">¿Tienes tarjetas de crédito o préstamos? Agrégalos para que sus pagos entren en el cálculo.</p>
        )}
        <ul className="list">
          {debts.map((d) => (
            <li key={d.id}>
              <button type="button" className="row row-button debt-row" onClick={() => setEditing(d)}>
                <span className="row-icon" aria-hidden="true">{d.kind === 'credit-card' ? '💳' : '🏦'}</span>
                <div className="row-main">
                  <span className="row-title">{d.name}</span>
                  <DebtDetail debt={d} today={today} resolved={data.input.confirmed} />
                </div>
                <span className="amount">{d.balance > 0 ? money(d.balance) : 'Pagada ✓'}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="link add" onClick={() => setEditing('new')}>+ Agregar deuda</button>
      </section>

      {active.length >= 2 && <StrategyCard debts={active} today={today} />}

      {editing && <DebtForm today={today} initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </main>
  );
}

function DebtDetail({ debt, today, resolved }: { debt: Debt; today: LocalDate; resolved: ReadonlySet<OccurrenceKey> }) {
  const next = nextUnresolved(debt.rule, debt.id, resolved, today);
  const estimate = payoffEstimate(debt);
  return (
    <>
      <span className="row-sub">
        {formatRate(debt.aprBasisPoints)}% anual · {debt.payment > 0 ? `${money(debt.payment)} ${per(debt.rule)}` : 'sin pagos programados'}
        {next && debt.payment > 0 ? ` · próximo pago ${relativeDate(next, today).toLowerCase()}` : ''}
        {debt.statementDay ? ` · corte día ${debt.statementDay}` : ''}
      </span>
      {debt.balance > 0 && debt.payment > 0 &&
        (estimate.payable ? (
          <span className="row-sub">
            Libre en {monthYear(today, estimate.months)} ({duration(estimate.months)})
            {estimate.totalInterest > 0 && ` · ${moneyRounded(estimate.totalInterest)} de intereses`}
          </span>
        ) : (
          <span className="row-sub warn">
            ⚠ Así nunca terminas: los intereses son {money(estimate.monthlyInterest)} al mes.
          </span>
        ))}
    </>
  );
}

function StrategyCard({ debts, today }: { debts: Debt[]; today: LocalDate }) {
  const c = compareStrategies(debts);
  const names = new Map(debts.map((d) => [d.id, d.name]));

  if (!c.avalanche.feasible) {
    return (
      <section className="card">
        <h2>Plan para salir de deudas</h2>
        <p className="hint">Tus pagos planeados no cubren los mínimos, o no alcanzan para terminar. Sube el pago de alguna deuda.</p>
      </section>
    );
  }

  const row = (r: StrategyResult, title: string, why: string) => (
    <div className={c.recommended === r.strategy ? 'strategy recommended' : 'strategy'}>
      <div className="strategy-head">
        <strong>{title}</strong>
        {c.recommended === r.strategy && <span className="badge">Recomendada</span>}
      </div>
      <p className="hint">{why}</p>
      <p className="strategy-numbers">
        Libre en {monthYear(today, r.months)} · {moneyRounded(r.totalInterest)} de intereses
      </p>
      <p className="hint">Orden: {r.order.map((id) => names.get(id)).join(' → ')}</p>
    </div>
  );

  return (
    <section className="card stack">
      <h2>Plan para salir de deudas</h2>
      <p className="hint">
        Con los mismos {money(sum(debts.map((d) => monthlyEquivalent(d.payment, d.rule))))} al mes: pagas el mínimo en todas y el resto va a una sola. Cuando
        terminas una, su pago pasa a la siguiente.
      </p>
      {row(c.avalanche, 'Avalancha', 'Primero la de mayor tasa. Pagas menos intereses.')}
      {row(c.snowball, 'Bola de nieve', 'Primero la más pequeña. Liquidas deudas antes y te motiva.')}
      <p className="hint">
        {c.interestSaved > 0
          ? c.recommended === 'avalanche'
            ? `La avalancha te ahorra ${moneyRounded(c.interestSaved)} en intereses.`
            : `La diferencia es de solo ${moneyRounded(c.interestSaved)}: la bola de nieve te da victorias rápidas casi sin costo.`
          : 'Las dos estrategias cuestan lo mismo en tu caso.'}
      </p>
    </section>
  );
}

function DebtForm({ today, initial, onClose }: { today: LocalDate; initial: Debt | undefined; onClose: () => void }) {
  const [kind, setKind] = useState<DebtKind>(initial?.kind ?? 'credit-card');
  const [name, setName] = useState(initial?.name ?? '');
  const [balance, setBalance] = useState(initial ? toInputString(initial.balance) : '');
  const [rate, setRate] = useState(initial ? formatRate(initial.aprBasisPoints) : '');
  const [minimum, setMinimum] = useState(initial ? toInputString(initial.minimumPayment) : '');
  const [payment, setPayment] = useState(initial ? toInputString(initial.payment) : '');
  const [freq, setFreq] = useState<string>(
    (initial && DEBT_FREQUENCIES.find((f) => f.unit === initial.rule.unit && f.interval === initial.rule.interval)?.value) ?? 'month-1',
  );
  const frequency = DEBT_FREQUENCIES.find((f) => f.value === freq) ?? DEBT_FREQUENCIES[2];
  const formRule = (anchor: LocalDate): RecurrenceRule => ({ unit: frequency.unit, interval: frequency.interval, anchor });
  const [next, setNext] = useState<string>((initial && nextOccurrence(initial.rule, today)) ?? today);
  const [statementDay, setStatementDay] = useState(initial?.statementDay ? String(initial.statementDay) : '');
  const [error, setError] = useState('');

  const b = parseMoneyInput(balance, { allowZero: true });
  const apr = parseRateInput(rate);
  const min = parseMoneyInput(minimum, { allowZero: true });
  const pay = payment.trim() === '' ? min : parseMoneyInput(payment, { allowZero: true });
  const interest = b !== undefined && apr !== undefined ? monthlyInterest(b, apr) : undefined;
  const preview =
    b !== undefined && apr !== undefined && min !== undefined && pay !== undefined && b > 0 && pay > 0
      ? payoffEstimate({ id: 'preview', name, kind, balance: b, aprBasisPoints: apr, minimumPayment: min, payment: pay, rule: formRule(today) })
      : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const day = statementDay.trim() === '' ? undefined : Number(statementDay);
    if (!name.trim()) return setError('Ponle un nombre, por ejemplo "Visa Chase".');
    if (b === undefined) return setError('Escribe cuánto debes hoy.');
    if (apr === undefined) return setError('Escribe la tasa anual (APR), por ejemplo 24.99.');
    if (min === undefined) return setError('Escribe el pago mínimo (0 si no hay).');
    if (pay === undefined) return setError('El pago mensual no es un monto válido.');
    if (pay < min) return setError('El pago mensual no puede ser menor que el mínimo.');
    if (!next) return setError('Elige la fecha del próximo pago.');
    if (day !== undefined && (!Number.isInteger(day) || day < 1 || day > 31)) return setError('El día de corte va de 1 a 31.');
    await saveDebt(db, {
      ...(initial ? { id: initial.id } : {}),
      name: name.trim(),
      kind,
      balance: b,
      aprBasisPoints: apr,
      minimumPayment: min,
      payment: pay,
      rule: formRule(localDate(next)),
      ...(kind === 'credit-card' && day !== undefined ? { statementDay: day } : {}),
    });
    onClose();
  }

  async function remove() {
    if (initial && confirm(`¿Borrar "${initial.name}"? Los pagos ya registrados se conservan.`)) {
      await deleteDebt(db, initial.id);
      onClose();
    }
  }

  return (
    <Sheet title={initial ? `Editar ${initial.name}` : 'Nueva deuda'} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={kind === 'credit-card'} onClick={() => setKind('credit-card')}>
            Tarjeta
          </button>
          <button type="button" role="tab" aria-selected={kind === 'loan'} onClick={() => setKind('loan')}>
            Préstamo
          </button>
        </div>
        <div className="field">
          <label htmlFor="debt-name">Nombre</label>
          <input id="debt-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'credit-card' ? 'Visa Chase' : 'Préstamo auto'} />
        </div>
        <MoneyField label="¿Cuánto debes hoy?" value={balance} onChange={setBalance} hint={kind === 'credit-card' ? 'El saldo actual de la tarjeta (Current balance).' : undefined} />
        <div className="field">
          <label htmlFor="debt-rate">Tasa anual (APR)</label>
          <div className="money-input">
            <input id="debt-rate" type="text" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="24.99" />
            <span aria-hidden="true" className="suffix">%</span>
          </div>
          {interest !== undefined && interest > 0 && <p className="hint">Unos {money(cents(interest))} de intereses este mes.</p>}
        </div>
        <MoneyField label="Pago mínimo" value={minimum} onChange={setMinimum} />
        <MoneyField
          label="¿Cuánto vas a pagar cada vez?"
          value={payment}
          onChange={setPayment}
          hint="Esto es lo que entra en tu proyección. Vacío = el mínimo. 0 = sin pagos programados (no entra en la proyección)."
        />
        <div className="field">
          <label htmlFor="debt-freq">¿Cada cuánto pagas?</label>
          <select id="debt-freq" value={freq} onChange={(e) => setFreq(e.target.value)}>
            {DEBT_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        {preview && (
          <p className={preview.payable ? 'hint' : 'hint warn'}>
            {preview.payable
              ? `Así quedas libre en ${monthYear(today, preview.months)} (${duration(preview.months)}), con ${moneyRounded(preview.totalInterest)} de intereses.`
              : `⚠ Con ese pago nunca terminas: los intereses son ${money(preview.monthlyInterest)} al mes.`}
          </p>
        )}
        <div className="field">
          <label htmlFor="debt-next">Próxima fecha de pago</label>
          <input id="debt-next" type="date" value={next} min={today} onChange={(e) => setNext(e.target.value)} />
          <p className="hint">Se repite {frequency.unit === 'week' ? 'ese mismo día de la semana' : 'cada mes ese mismo día'}. Te avisamos 3 días antes.</p>
        </div>
        {kind === 'credit-card' && (
          <div className="field">
            <label htmlFor="debt-statement">Día de corte (opcional)</label>
            <input id="debt-statement" type="text" inputMode="numeric" value={statementDay} onChange={(e) => setStatementDay(e.target.value)} placeholder="Ej. 3" />
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="primary">Guardar</button>
        {initial && (
          <button type="button" className="danger" onClick={remove}>Borrar</button>
        )}
        {initial && <p className="hint center">Cuando llegue tu estado de cuenta, actualiza aquí el saldo para que cuadre.</p>}
      </form>
    </Sheet>
  );
}
