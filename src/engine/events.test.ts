import { occurrenceKey } from '../domain';
import { debtPayments, goalContributions } from './events';
import { $, TODAY, d, monthly } from './test-fixtures';

const none = new Set<never>();

describe('debtPayments', () => {
  it('sin interés: paga hasta liquidar y el último pago es el resto', () => {
    const debt = { id: 'p', name: 'Préstamo', balance: $(1000), aprBasisPoints: 0, payment: $(300), rule: monthly('2026-12-01') };
    expect(debtPayments(debt, none, TODAY, d('2027-12-31')).map((e) => e.amount)).toEqual([$(-300), $(-300), $(-300), $(-100)]);
  });

  it('con interés: suma intereses diarios antes de cada pago', () => {
    // $1,000 al 36.5% anual = $1 diario aprox. Del 23-nov al 23-dic hay 30 días → $30 de interés.
    const debt = { id: 'v', name: 'Visa', balance: $(1000), aprBasisPoints: 3650, payment: $(2000), rule: monthly('2026-12-23') };
    const [only] = debtPayments(debt, none, TODAY, d('2027-12-31'));
    expect(only?.amount).toBe($(-1030));
  });

  it('un pago confirmado no se proyecta ni se descuenta otra vez del saldo', () => {
    const debt = { id: 'p', name: 'Préstamo', balance: $(600), aprBasisPoints: 0, payment: $(300), rule: monthly('2026-11-23') };
    const events = debtPayments(debt, new Set([occurrenceKey('p', TODAY)]), TODAY, d('2027-12-31'));
    expect(events.map((e) => e.date)).toEqual(['2026-12-23', '2027-01-23']);
  });
});

describe('goalContributions', () => {
  it('aporta hasta completar la meta', () => {
    const goal = { id: 'g', name: 'Fondo', target: $(1000), saved: $(800), targetDate: d('2027-12-31'), contribution: { amount: $(150), rule: monthly('2026-12-01') } };
    expect(goalContributions(goal, none, TODAY, d('2027-12-31')).map((e) => e.amount)).toEqual([$(-150), $(-50)]);
  });

  it('no aporta después de la fecha objetivo', () => {
    const goal = { id: 'g', name: 'Fondo', target: $(10_000), saved: $(0), targetDate: d('2027-01-15'), contribution: { amount: $(100), rule: monthly('2026-12-01') } };
    expect(goalContributions(goal, none, TODAY, d('2027-12-31'))).toHaveLength(2);
  });
});
