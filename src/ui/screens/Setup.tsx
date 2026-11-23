import { type FormEvent, useState } from 'react';
import { completeSetup } from '../../data';
import { type LocalDate, addDays, localDate, parseMoneyInput, parts } from '../../domain';
import { MoneyField } from '../components/MoneyField';
import { db } from '../db';

/** Próximo viernes (o hoy si es viernes): el día de pago más común. */
function nextFriday(today: LocalDate): LocalDate {
  const { year, month, day } = parts(today);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(today, (5 - weekday + 7) % 7);
}

export function Setup({ today }: { today: LocalDate }) {
  const [balance, setBalance] = useState('');
  const [paycheck, setPaycheck] = useState('');
  const [payday, setPayday] = useState<string>(nextFriday(today));
  const [cushion, setCushion] = useState('100');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const b = parseMoneyInput(balance, { allowZero: true });
    const p = parseMoneyInput(paycheck);
    const c = parseMoneyInput(cushion, { allowZero: true });
    if (b === undefined) return setError('Escribe el saldo actual de tu cuenta.');
    if (p === undefined) return setError('Escribe cuánto recibes cada semana.');
    if (c === undefined) return setError('Escribe tu colchón de seguridad (puede ser 0).');
    if (payday < today) return setError('El próximo día de pago debe ser hoy o una fecha futura.');
    await completeSetup(db, {
      balance: b,
      paycheck: p,
      nextPayday: localDate(payday),
      safetyCushion: c,
    });
  }

  return (
    <main className="screen setup">
      <h1>Hola 👋</h1>
      <p className="lead">Tres datos y te digo cuánto puedes gastar hoy sin comprometer mañana.</p>
      <form onSubmit={submit} className="stack">
        <MoneyField label="¿Cuánto tienes hoy en tu cuenta?" value={balance} onChange={setBalance} hint="El saldo de tu cuenta de débito, tal como lo ves en el banco." autoFocus />
        <MoneyField label="¿Cuánto recibes cada semana?" value={paycheck} onChange={setPaycheck} hint="Tu sueldo neto, lo que de verdad llega a la cuenta." />
        <div className="field">
          <label htmlFor="payday">¿Cuándo es tu próximo pago?</label>
          <input id="payday" type="date" value={payday} min={today} onChange={(e) => setPayday(e.target.value)} />
        </div>
        <MoneyField label="Colchón de seguridad" value={cushion} onChange={setCushion} hint="Tu saldo nunca debería bajar de aquí. Puedes cambiarlo después." />
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="primary">Empezar</button>
      </form>
      <p className="hint center">Tus datos se guardan solo en este dispositivo.</p>
    </main>
  );
}
