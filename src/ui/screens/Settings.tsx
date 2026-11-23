import { type FormEvent, useEffect, useState } from 'react';
import { MAIN_ACCOUNT_ID, saveSettings, setAccountBalance } from '../../data';
import { parseMoneyInput, toInputString } from '../../domain';
import { ImportMiDinero } from '../components/ImportMiDinero';
import { MoneyField } from '../components/MoneyField';
import { db } from '../db';
import { money } from '../format';
import type { AppData } from '../hooks';

export function Settings({ data }: { data: AppData }) {
  const { settings, accounts } = data.input;
  const main = accounts.find((a) => a.id === MAIN_ACCOUNT_ID);

  const [balance, setBalance] = useState(main ? toInputString(main.balance) : '');
  const [cushion, setCushion] = useState(toInputString(settings.safetyCushion));
  const [horizon, setHorizon] = useState(String(settings.horizonMonths));
  const [variable, setVariable] = useState(
    settings.manualDailyVariableSpending !== undefined ? toInputString(settings.manualDailyVariableSpending) : '',
  );
  const [message, setMessage] = useState('');
  const [persisted, setPersisted] = useState<boolean | undefined>();

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const b = parseMoneyInput(balance, { allowZero: true });
    const c = parseMoneyInput(cushion, { allowZero: true });
    const v = variable.trim() === '' ? undefined : parseMoneyInput(variable, { allowZero: true });
    if (b === undefined) return setMessage('El saldo no es un monto válido.');
    if (c === undefined) return setMessage('El colchón no es un monto válido.');
    if (variable.trim() !== '' && v === undefined) return setMessage('El gasto diario no es un monto válido.');

    const { manualDailyVariableSpending: _omit, ...rest } = settings;
    await saveSettings(db, {
      ...rest,
      safetyCushion: c,
      horizonMonths: Number(horizon),
      ...(v !== undefined ? { manualDailyVariableSpending: v } : {}),
    });
    if (main && b !== main.balance) await setAccountBalance(db, MAIN_ACCOUNT_ID, b);
    setMessage('Guardado ✓');
  }

  return (
    <main className="screen">
      <h1>Ajustes</h1>
      <form onSubmit={submit} className="stack">
        <section className="card stack">
          <MoneyField
            label="Saldo de tu cuenta"
            value={balance}
            onChange={setBalance}
            hint="Si no cuadra con el banco, corrígelo aquí. No crea ningún movimiento."
          />
          <MoneyField label="Colchón de seguridad" value={cushion} onChange={setCushion} hint="Tu saldo nunca debería bajar de aquí." />
        </section>

        <section className="card stack">
          <div className="field">
            <label htmlFor="horizon">Meses que se proyectan</label>
            <select id="horizon" value={horizon} onChange={(e) => setHorizon(e.target.value)}>
              {[3, 6, 9, 12].map((m) => (
                <option key={m} value={m}>{m} meses</option>
              ))}
            </select>
          </div>
          <MoneyField
            label="Gasto diario habitual (opcional)"
            value={variable}
            onChange={setVariable}
            hint={`Para proyectar los meses futuros. Vacío = se calcula con tu historial (hoy: ${money(data.forecast.dailyVariableSpending)} por día).`}
          />
        </section>

        {message && <p className={message.endsWith('✓') ? 'success' : 'error'} role="status">{message}</p>}
        <button type="submit" className="primary">Guardar</button>
      </form>

      <section className="card">
        <h2>Tus datos</h2>
        <p className="hint">
          Se guardan solo en este dispositivo.{' '}
          {persisted === true && 'El navegador los protege contra el borrado automático ✓'}
          {persisted === false && 'Instala la app en tu pantalla de inicio para que el navegador no los borre.'}
        </p>
        <p className="hint">Pronto: respaldo cifrado en tu repo privado de GitHub y exportar a CSV/JSON.</p>
      </section>

      <section className="card">
        <h2>Vienes de Mi dinero</h2>
        <p className="hint">
          En Mi dinero toca Respaldo → Descargar respaldo. Luego elige ese archivo aquí: verás qué se importa antes de confirmar.
        </p>
        <ImportMiDinero today={data.input.today} onDone={() => (location.hash = '#home')} />
      </section>
    </main>
  );
}
