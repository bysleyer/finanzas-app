import { compareStrategies, monthlyEquivalent, monthlyInterest, payoffEstimate, simulateStrategy } from './debts';
import { $, d, debt, monthly, weekly } from './test-fixtures';

const rule = monthly('2026-12-15');

describe('payoffEstimate', () => {
  it('sin interés: saldo ÷ pago, redondeado hacia arriba', () => {
    const r = payoffEstimate(debt('p', 1000, 300, rule));
    expect(r).toEqual({ payable: true, months: 4, totalInterest: 0 });
  });

  it('con interés tarda más y suma intereses', () => {
    // $1,200 al 24% (2% mensual) pagando $100.
    const r = payoffEstimate(debt('v', 1200, 100, rule, { apr: 24 }));
    expect(r.payable).toBe(true);
    if (!r.payable) return;
    // Amortización: n = −ln(1 − 0.02 × 1200 / 100) / ln(1.02) ≈ 13.9 → 14 meses.
    expect(r.months).toBe(14);
    expect(r.totalInterest).toBeGreaterThan($(150));
    expect(r.totalInterest).toBeLessThan($(200));
  });

  it('avisa cuando el pago no cubre ni los intereses', () => {
    // $5,000 al 30%: $125 de interés al mes; pagar $100 nunca la liquida.
    const r = payoffEstimate(debt('v', 5000, 100, rule, { apr: 30 }));
    expect(r).toEqual({ payable: false, monthlyInterest: $(125) });
  });

  it('interés mensual = saldo × APR ÷ 12', () => {
    expect(monthlyInterest($(1000), 2400)).toBe($(20));
  });
});

describe('estrategias', () => {
  // Tarjeta cara y grande, préstamo barato y pequeño.
  const visa = debt('visa', 3000, 90, rule, { apr: 29.99, minimum: 90, kind: 'credit-card' });
  const prestamo = debt('prestamo', 800, 40, rule, { apr: 8, minimum: 40 });

  it('avalancha ataca primero la tasa más alta; bola de nieve, el saldo más pequeño', () => {
    expect(simulateStrategy([visa, prestamo], $(400), 'avalanche').order).toEqual(['visa', 'prestamo']);
    expect(simulateStrategy([visa, prestamo], $(400), 'snowball').order).toEqual(['prestamo', 'visa']);
  });

  it('avalancha paga menos intereses; bola de nieve liquida la primera deuda antes', () => {
    const c = compareStrategies([visa, prestamo], $(400));
    expect(c.avalanche.feasible && c.snowball.feasible).toBe(true);
    expect(c.avalanche.totalInterest).toBeLessThan(c.snowball.totalInterest);
    expect(c.interestSaved).toBeGreaterThan(0);
    const firstSnowball = Math.min(...c.snowball.paidOffMonth.values());
    const firstAvalanche = Math.min(...c.avalanche.paidOffMonth.values());
    expect(firstSnowball).toBeLessThan(firstAvalanche);
  });

  it('con una sola deuda ambas estrategias son iguales', () => {
    const c = compareStrategies([visa], $(300));
    expect(c.avalanche.months).toBe(c.snowball.months);
    expect(c.interestSaved).toBe(0);
    expect(c.recommended).toBe('snowball');
  });

  it('no es viable si el presupuesto no cubre los mínimos', () => {
    expect(simulateStrategy([visa, prestamo], $(100), 'avalanche').feasible).toBe(false);
  });

  it('sin presupuesto explícito usa la suma de los pagos planeados', () => {
    const c = compareStrategies([visa, prestamo]);
    expect(c.avalanche.feasible).toBe(true);
  });

  it('ignora deudas ya liquidadas', () => {
    const c = compareStrategies([visa, debt('pagada', 0, 0, rule)], $(300));
    expect(c.avalanche.order).toEqual(['visa']);
  });
});

describe('pagos semanales y deudas sin plan', () => {
  it('convierte pagos semanales a su equivalente mensual', () => {
    expect(monthlyEquivalent($(120), { unit: 'week', interval: 1, anchor: d('2026-11-27') })).toBe($(520));
    expect(monthlyEquivalent($(120), { unit: 'week', interval: 2, anchor: d('2026-11-27') })).toBe($(260));
  });

  it('un préstamo semanal de $130 con $390 se liquida en 1 mes, no en 3', () => {
    const r = payoffEstimate(debt('prestamo', 390, 130, weekly('2026-11-27')));
    expect(r).toEqual({ payable: true, months: 1, totalInterest: 0 });
  });

  it('una deuda sin pagos programados no genera pagos ni pendientes', () => {
    const amigo = debt('amigo', 1000, 0, monthly('2026-11-23'), { minimum: 0 });
    expect(payoffEstimate(amigo).payable).toBe(false);
  });
});
