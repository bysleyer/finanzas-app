import { confirmOccurrence, isInstalledApp, skipOccurrence } from '../../data';
import { type LocalDate, abs, diffDays } from '../../domain';
import { db } from '../db';
import { longDate, money, moneyRounded, relativeDate, shortDate } from '../format';
import type { AppData } from '../hooks';
import { TransactionRow } from './Movements';

export function Home({ data, today }: { data: AppData; today: LocalDate }) {
  const { forecast: f, pending, recent, categories } = data;
  const b = f.breakdown;
  const nextIncome = b.nextIncomeDate;
  const todays = recent.filter((t) => t.date === today);
  const zero = f.availableToday === 0;

  return (
    <main className="screen">
      {!isInstalledApp() && <InstallHint />}

      <section className={zero ? 'hero hero-zero' : 'hero'} aria-live="polite">
        <p className="hero-label">Puedes gastar hoy</p>
        <p className="hero-amount">{moneyRounded(f.availableToday)}</p>
        <p className="hero-sub">
          {f.overspentToday > 0
            ? `Hoy te pasaste ${money(f.overspentToday)}. Mañana se ajusta solo.`
            : f.spentToday > 0
              ? `Ya gastaste ${money(f.spentToday)} de ${money(f.dailyAllowance)} de hoy.`
              : nextIncome
                ? `${money(f.dailyAllowance)} por día hasta tu pago del ${shortDate(nextIncome)}.`
                : `${money(f.dailyAllowance)} por día.`}
        </p>
      </section>

      {f.firstNegativeDate ? (
        <Alert tone="danger">
          Si sigues así, tu saldo quedaría en negativo el <strong>{longDate(f.firstNegativeDate)}</strong>.
        </Alert>
      ) : f.firstBelowCushionDate && b.safetyCushion > 0 ? (
        <Alert tone="warning">
          El <strong>{longDate(f.firstBelowCushionDate)}</strong> tu saldo bajaría de tu colchón de {money(b.safetyCushion)}.
        </Alert>
      ) : null}

      {pending.length > 0 && (
        <section className="card">
          <h2>¿Ya pasó esto?</h2>
          <ul className="list">
            {pending.map((p) => (
              <li key={p.key} className="row">
                <div className="row-main">
                  <span className="row-title">{p.recurring.name}</span>
                  <span className="row-sub">{relativeDate(p.date, today)}</span>
                </div>
                <span className={p.recurring.kind === 'income' ? 'amount income' : 'amount'}>
                  {p.recurring.kind === 'income' ? '+' : '−'}
                  {money(p.recurring.amount)}
                </span>
                <div className="row-actions">
                  <button type="button" className="small primary" onClick={() => confirmOccurrence(db, p.recurring.id, p.date)}>
                    Sí
                  </button>
                  <button type="button" className="small" onClick={() => skipOccurrence(db, p.recurring.id, p.date)}>
                    No
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {f.upcomingPayments.length > 0 && (
        <section className="card">
          <h2>Próximos pagos</h2>
          <ul className="list">
            {f.upcomingPayments.map((e) => (
              <li key={`${e.sourceId}@${e.date}`} className="row">
                <div className="row-main">
                  <span className="row-title">{e.label}</span>
                  <span className="row-sub">{relativeDate(e.date, today)}</span>
                </div>
                <span className="amount">{money(abs(e.amount))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Cómo se calcula</h2>
        <dl className="breakdown">
          <dt>En tu cuenta</dt>
          <dd>{money(b.spendableBalance)}</dd>
          {b.commitments > 0 && (
            <>
              <dt>Pagos antes de cobrar</dt>
              <dd>−{money(b.commitments)}</dd>
            </>
          )}
          <dt>Colchón</dt>
          <dd>−{money(b.safetyCushion)}</dd>
          {b.goalReserve > 0 && (
            <>
              <dt>Aportes a metas</dt>
              <dd>−{money(b.goalReserve)}</dd>
            </>
          )}
          {b.futureReserve > 0 && (
            <>
              <dt>Reserva para el {shortDate(b.lowestBalanceDate)}</dt>
              <dd>−{money(b.futureReserve)}</dd>
            </>
          )}
          <dt className="total">Para gastar hasta cobrar</dt>
          <dd className="total">{money(b.periodBudget)}</dd>
          <dt>Días {nextIncome ? `hasta el ${shortDate(nextIncome)}` : 'del horizonte'}</dt>
          <dd>÷ {b.daysUntilIncome}</dd>
        </dl>
        {nextIncome && diffDays(today, nextIncome) > 0 && (
          <p className="hint">Hoy cuenta como día 1. Lo que no gastes hoy se reparte en los días que quedan.</p>
        )}
      </section>

      {todays.length > 0 && (
        <section className="card">
          <h2>Hoy</h2>
          <ul className="list">
            {todays.map((t) => (
              <TransactionRow key={t.id} tx={t} category={categories.get(t.categoryId)} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Alert({ tone, children }: { tone: 'danger' | 'warning'; children: React.ReactNode }) {
  return (
    <div className={`alert alert-${tone}`} role="status">
      <span aria-hidden="true">{tone === 'danger' ? '⚠️' : '💡'}</span>
      <p>{children}</p>
    </div>
  );
}

function InstallHint() {
  return (
    <div className="alert alert-info">
      <span aria-hidden="true">📲</span>
      <p>
        <strong>Instálala para no perder tus datos:</strong> en Safari toca Compartir (el cuadrado con la flecha hacia
        arriba) y luego “Añadir a pantalla de inicio”.
      </p>
    </div>
  );
}
