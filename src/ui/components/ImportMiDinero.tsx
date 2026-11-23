import { type ChangeEvent, useRef, useState } from 'react';
import { type ImportResult, applyImport, translateMiDinero } from '../../data';
import type { LocalDate } from '../../domain';
import { db } from '../db';
import { money, shortDate } from '../format';
import { Sheet } from './Sheet';

/**
 * Trae los datos de "Mi dinero": eliges el archivo de respaldo, ves qué se va a importar y
 * qué no tiene equivalente, y solo entonces confirmas. Reemplaza todo lo de esta app.
 */
export function ImportMiDinero({ today, onDone }: { today: LocalDate; onDone?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      setResult(translateMiDinero(JSON.parse(await file.text()), today));
    } catch (err) {
      setError(err instanceof SyntaxError ? 'Ese archivo no es un JSON válido.' : err instanceof Error ? err.message : String(err));
    }
  }

  async function confirmImport() {
    if (!result) return;
    setSaving(true);
    try {
      await applyImport(db, result);
      setResult(null);
      onDone?.();
    } catch (err) {
      setError(`No se pudo importar: ${err instanceof Error ? err.message : String(err)}. Tus datos no cambiaron.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="link" onClick={() => input.current?.click()}>
        Traer datos de Mi dinero…
      </button>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={onFile} />
      {error && <p className="error" role="alert">{error}</p>}

      {result && (
        <Sheet title="Datos de Mi dinero" onClose={() => setResult(null)}>
          <div className="stack">
            <dl className="breakdown">
              <dt>Saldo de tu cuenta</dt>
              <dd>{money(result.account.balance)}</dd>
              <dt>Movimientos</dt>
              <dd>
                {result.summary.transactions}
                {result.summary.firstDate && result.summary.lastDate
                  ? ` (${shortDate(result.summary.firstDate)} – ${shortDate(result.summary.lastDate)})`
                  : ''}
              </dd>
              <dt>Colchón</dt>
              <dd>{money(result.settings.safetyCushion)}</dd>
            </dl>

            <section>
              <h2>Fijos</h2>
              <ul className="list compact">
                {result.recurring.map((r) => (
                  <li key={r.id} className="row">
                    <span className="row-main row-title">{r.name}</span>
                    <span className={r.kind === 'income' ? 'amount income' : 'amount'}>{money(r.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>

            {result.debts.length > 0 && (
              <section>
                <h2>Deudas</h2>
                <ul className="list compact">
                  {result.debts.map((d) => (
                    <li key={d.id} className="row">
                      <div className="row-main">
                        <span className="row-title">{d.name}</span>
                        <span className="row-sub">
                          {d.payment > 0 ? `Paga ${money(d.payment)} ${d.rule.unit === 'week' ? 'por semana' : 'al mes'}` : 'Sin pagos programados'}
                        </span>
                      </div>
                      <span className="amount">{money(d.balance)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2>Revisa esto</h2>
              <ul className="warnings">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>

            <p className="hint">Esto reemplaza todo lo que tienes ahora en esta app. Mi dinero no cambia.</p>
            <button type="button" className="primary" disabled={saving} onClick={confirmImport}>
              {saving ? 'Importando…' : 'Reemplazar mis datos con estos'}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
