import { type PointerEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type LocalDate, abs, parts } from '../../domain';
import { type Forecast, monthlySummary } from '../../engine';
import { money, moneyRounded, shortDate } from '../format';

const HEIGHT = 190;
const PAD = { top: 16, right: 12, bottom: 26, left: 12 };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Saldo proyectado día a día (una sola serie: el título la nombra, no lleva leyenda).
 * Línea de referencia del colchón, marca en el día más bajo y guía al tocar.
 */
export function ProjectionChart({ forecast: f, today }: { forecast: Forecast; today: LocalDate }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const days = f.days;
  const cushion = f.breakdown.safetyCushion;

  const geo = useMemo(() => {
    const balances = days.map((d) => d.balance);
    const lo = Math.min(0, cushion, ...balances);
    const hi = Math.max(cushion, ...balances);
    const span = hi - lo || 1;
    const top = hi + span * 0.08;
    const bottom = lo - (lo < 0 ? span * 0.08 : 0);
    const innerW = Math.max(width - PAD.left - PAD.right, 10);
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (i / Math.max(days.length - 1, 1)) * innerW;
    const y = (v: number) => PAD.top + ((top - v) / (top - bottom)) * innerH;
    const line = days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join('');
    const area = `${line}L${x(days.length - 1).toFixed(1)},${y(Math.max(bottom, 0)).toFixed(1)}L${x(0).toFixed(1)},${y(Math.max(bottom, 0)).toFixed(1)}Z`;
    const lowestIndex = balances.reduce((best, v, i) => (v < (balances[best] ?? v) ? i : best), 0);
    const ticks = days.flatMap((d, i) => (parts(d.date).day === 1 ? [{ i, label: MONTHS[parts(d.date).month - 1] ?? '' }] : []));
    return { x, y, line, area, lowestIndex, ticks, innerW };
  }, [days, cushion, width]);

  if (days.length === 0) return null;
  const last = days.at(-1);
  const lowest = days[geo.lowestIndex];
  const activeDay = active !== null ? days[active] : undefined;

  function onPointer(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left - PAD.left) / geo.innerW;
    setActive(Math.min(days.length - 1, Math.max(0, Math.round(ratio * (days.length - 1)))));
  }

  const lowX = geo.x(geo.lowestIndex);
  const tipLeft = activeDay && active !== null ? Math.min(Math.max(geo.x(active), 70), width - 70) : 0;

  return (
    <section className="card chart-card">
      <h2>Tu saldo, próximos {Math.round(days.length / 30.4)} meses</h2>
      {lowest && last && (
        <p className="chart-summary">
          Más bajo: <strong>{money(lowest.balance)}</strong> el {shortDate(lowest.date)} · Al final: {moneyRounded(last.balance)}
        </p>
      )}
      <div ref={ref} className="chart-wrap">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Saldo proyectado. El más bajo es ${lowest ? money(lowest.balance) : ''} el ${lowest ? shortDate(lowest.date) : ''}.`}
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          onPointerLeave={() => setActive(null)}
        >
          {/* Cero (si está en rango) y colchón: referencias discretas. */}
          <line className="chart-zero" x1={PAD.left} x2={width - PAD.right} y1={geo.y(0)} y2={geo.y(0)} />
          {cushion > 0 && (
            <>
              <line className="chart-ref" x1={PAD.left} x2={width - PAD.right} y1={geo.y(cushion)} y2={geo.y(cushion)} />
              <text className="chart-label" x={width - PAD.right} y={geo.y(cushion) - 5} textAnchor="end">
                Colchón {moneyRounded(cushion)}
              </text>
            </>
          )}

          <path className="chart-area" d={geo.area} />
          <path className="chart-line" d={geo.line} />

          {geo.ticks.map((t) => (
            <text key={t.i} className="chart-label" x={geo.x(t.i)} y={HEIGHT - 8} textAnchor="middle">
              {t.label}
            </text>
          ))}

          {lowest && <circle className="chart-dot" cx={lowX} cy={geo.y(lowest.balance)} r={4.5} />}

          {activeDay && active !== null && (
            <>
              <line className="chart-crosshair" x1={geo.x(active)} x2={geo.x(active)} y1={PAD.top} y2={HEIGHT - PAD.bottom} />
              <circle className="chart-dot" cx={geo.x(active)} cy={geo.y(activeDay.balance)} r={5} />
            </>
          )}
        </svg>
        {activeDay && (
          <div className="chart-tip" style={{ left: tipLeft }} aria-live="polite">
            <span>{activeDay.date === today ? 'Hoy' : shortDate(activeDay.date)}</span>
            <strong>{money(activeDay.balance)}</strong>
            {activeDay.events.slice(0, 2).map((e) => (
              <span key={e.sourceId} className="chart-tip-event">
                {e.label} {e.amount > 0 ? '+' : '−'}
                {moneyRounded(abs(e.amount))}
              </span>
            ))}
          </div>
        )}
      </div>
      {f.variableSpendingSource === 'insufficient' && (
        <p className="hint warn">
          ⚠ Todavía no conozco tu gasto habitual, así que los próximos meses se ven más holgados de lo real. Mejora sola cuando
          registres 2 semanas de gastos, o fíjalo ya en Ajustes.
        </p>
      )}
      <p className="hint">
        Supone que gastas tu ración diaria hasta cobrar y luego {money(f.dailyVariableSpending)} al día. Toca la gráfica para ver
        cada día.
      </p>
      <MonthTable forecast={f} />
    </section>
  );
}

function MonthTable({ forecast: f }: { forecast: Forecast }) {
  const months = monthlySummary(f.days);
  return (
    <details className="more">
      <summary>Ver por mes</summary>
      <table className="month-table">
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Más bajo</th>
            <th scope="col">Al cierre</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => {
            const [year, month] = m.month.split('-').map(Number);
            return (
              <tr key={m.month}>
                <th scope="row">
                  {MONTHS[(month ?? 1) - 1]} {year}
                </th>
                <td className={m.lowestBalance < f.breakdown.safetyCushion ? 'low' : undefined}>{moneyRounded(m.lowestBalance)}</td>
                <td>{moneyRounded(m.endBalance)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
