import { addMonths, occurrenceKey } from '../domain';
import { forecast, whatIf } from './forecast';
import { $, TODAY, checking, d, expense, income, monthly, scenario, spend, weekly, yearly } from './test-fixtures';

// Hoy es lunes 23-nov-2026. El sueldo semanal cae los viernes: próximo ingreso 27-nov.
// Días hasta el ingreso (d) = lun, mar, mié, jue = 4.
const paycheck = (amount: number) => income('sueldo', amount, weekly('2026-11-27'));

describe('forecast: disponible hoy', () => {
  it('reparte el dinero libre entre los días que faltan para cobrar', () => {
    const f = forecast(scenario({ recurring: [paycheck(500)], settings: { safetyCushion: $(100), horizonMonths: 6, manualDailyVariableSpending: $(0) } }));
    expect(f.breakdown.nextIncomeDate).toBe('2026-11-27');
    expect(f.breakdown.daysUntilIncome).toBe(4);
    expect(f.breakdown.periodBudget).toBe($(900)); // 1000 − 100 de colchón
    expect(f.availableToday).toBe($(225)); // 900 ÷ 4
  });

  it('descuenta los compromisos antes del próximo ingreso (coincide con la fórmula del PRD)', () => {
    const f = forecast(
      scenario({
        recurring: [paycheck(500), expense('renta', 600, monthly('2026-11-25'))],
        settings: { safetyCushion: $(100), horizonMonths: 6, manualDailyVariableSpending: $(0) },
      }),
    );
    expect(f.breakdown.commitments).toBe($(600));
    // PRD: (S − C − M − R) / d = (1000 − 600 − 0 − 100) / 4 = 75
    expect(f.availableToday).toBe($(75));
  });

  it('reserva hoy para un pago grande dentro de varios meses', () => {
    // Seguro anual de $2,700 el jueves 14-ene. Entre hoy y esa fecha hay 7 viernes de $300 (+$2,100):
    // si hoy no gastas nada, el 14-ene quedarías en 1000 + 2100 − 2700 = $400.
    const input = scenario({ recurring: [paycheck(300), expense('seguro', 2700, yearly('2027-01-14'))] });
    const f = forecast(input);
    expect(f.breakdown.lowestBalance).toBe($(400));
    expect(f.breakdown.lowestBalanceDate).toBe('2027-01-14');
    expect(f.availableToday).toBe($(100)); // 400 ÷ 4 días

    // La fórmula del PRD daría min(1000/4, 400) = $250 diarios: 4 días así son $1,000 y el 14-ene quedarías en −$600.
    // Aquí, siguiendo el plan, ningún día baja de cero.
    expect(f.firstNegativeDate).toBeUndefined();
    expect(Math.min(...f.days.map((x) => x.balance))).toBeGreaterThanOrEqual(0);
  });

  it('avisa del primer día en negativo cuando no alcanza', () => {
    const f = forecast(scenario({ recurring: [paycheck(200), expense('seguro', 3000, yearly('2027-01-14'))] }));
    // 1000 + 7 × 200 − 3000 = −600
    expect(f.availableToday).toBe(0);
    expect(f.firstNegativeDate).toBe('2027-01-14');
  });

  it('lo gastado hoy sale de la ración de hoy', () => {
    const f = forecast(
      scenario({
        accounts: [checking(950)], // ya refleja el gasto de $50
        recurring: [paycheck(500)],
        transactions: [spend(50, TODAY)],
        settings: { safetyCushion: $(100), horizonMonths: 6, manualDailyVariableSpending: $(0) },
      }),
    );
    expect(f.dailyAllowance).toBe($(225));
    expect(f.spentToday).toBe($(50));
    expect(f.availableToday).toBe($(175));
  });

  it('si te pasas hoy, el disponible es 0 y se informa el exceso', () => {
    const f = forecast(
      scenario({ accounts: [checking(700)], recurring: [paycheck(500)], transactions: [spend(300, TODAY)] }),
    );
    expect(f.dailyAllowance).toBe($(250)); // (700 + 300) / 4
    expect(f.availableToday).toBe(0);
    expect(f.overspentToday).toBe($(50));
  });

  it('nunca es negativo aunque el saldo ya esté por debajo del colchón', () => {
    const f = forecast(scenario({ accounts: [checking(50)], recurring: [paycheck(500)], settings: { safetyCushion: $(100), horizonMonths: 6 } }));
    expect(f.availableToday).toBe(0);
  });

  it('los gastos variables futuros reducen lo que puedes gastar hoy', () => {
    const base = { recurring: [paycheck(900), expense('renta', 1500, monthly('2026-12-01'))] };
    const frugal = forecast(scenario({ ...base, settings: { safetyCushion: $(0), horizonMonths: 6, manualDailyVariableSpending: $(0) } }));
    const usual = forecast(scenario({ ...base, settings: { safetyCushion: $(0), horizonMonths: 6, manualDailyVariableSpending: $(40) } }));
    expect(usual.availableToday).toBeLessThan(frugal.availableToday);
  });

  it('sin ingresos en el horizonte, reparte hasta el final del horizonte', () => {
    const f = forecast(scenario({ settings: { safetyCushion: $(0), horizonMonths: 1, manualDailyVariableSpending: $(0) } }));
    expect(f.breakdown.nextIncomeDate).toBeUndefined();
    // 23-nov a 23-dic inclusive = 31 días
    expect(f.breakdown.daysUntilIncome).toBe(31);
    expect(f.availableToday).toBe(Math.floor($(1000) / 31));
  });

  it('el dinero de cuentas de ahorro no cuenta como gastable', () => {
    const f = forecast(
      scenario({
        accounts: [checking(1000), { id: 'ahorro', name: 'Ahorro', type: 'savings', balance: $(5000), spendable: false }],
        recurring: [paycheck(500)],
      }),
    );
    expect(f.breakdown.spendableBalance).toBe($(1000));
  });
});

describe('forecast: recurrentes confirmados', () => {
  it('un recurrente ya registrado hoy no se descuenta dos veces', () => {
    const renta = expense('renta', 600, monthly('2026-11-23'));
    const pending = forecast(scenario({ recurring: [paycheck(500), renta] }));
    const confirmed = forecast(
      scenario({
        accounts: [checking(400)], // el saldo ya bajó
        recurring: [paycheck(500), renta],
        confirmed: new Set([occurrenceKey('renta', TODAY)]),
      }),
    );
    expect(confirmed.availableToday).toBe(pending.availableToday);
  });

  it('un ingreso que cae hoy y aún no se confirma cuenta para hoy, y el siguiente marca el periodo', () => {
    const f = forecast(scenario({ recurring: [income('sueldo', 500, weekly('2026-11-23'))] }));
    expect(f.breakdown.nextIncomeDate).toBe('2026-11-30');
    expect(f.breakdown.daysUntilIncome).toBe(7);
    expect(f.breakdown.periodBudget).toBe($(1500));
  });
});

describe('forecast: deudas y metas', () => {
  it('los pagos de deuda entran como compromisos', () => {
    const f = forecast(
      scenario({
        recurring: [paycheck(500)],
        debts: [{ id: 'visa', name: 'Visa', balance: $(1000), aprBasisPoints: 0, payment: $(200), rule: monthly('2026-11-26') }],
      }),
    );
    expect(f.breakdown.commitments).toBe($(200));
    expect(f.availableToday).toBe($(200)); // (1000 − 200) / 4
  });

  it('los aportes a metas se reservan aparte', () => {
    const f = forecast(
      scenario({
        recurring: [paycheck(500)],
        goals: [
          { id: 'viaje', name: 'Viaje', target: $(1000), saved: $(0), targetDate: d('2027-06-01'), contribution: { amount: $(100), rule: monthly('2026-11-24') } },
        ],
      }),
    );
    expect(f.breakdown.goalReserve).toBe($(100));
    expect(f.availableToday).toBe($(225)); // (1000 − 100) / 4
  });

  it('avisa de los pagos de los próximos 3 días', () => {
    const f = forecast(
      scenario({
        recurring: [paycheck(500), expense('luz', 80, monthly('2026-11-25')), expense('internet', 60, monthly('2026-11-30'))],
      }),
    );
    expect(f.upcomingPayments.map((e) => e.label)).toEqual(['luz']);
  });
});

describe('forecast: horizonte y simulador', () => {
  it('proyecta 6 meses por defecto y como máximo 12', () => {
    expect(forecast(scenario()).days.at(-1)?.date).toBe(addMonths(TODAY, 6));
    const f = forecast(scenario({ settings: { safetyCushion: $(0), horizonMonths: 99 } }));
    expect(f.days.at(-1)?.date).toBe(addMonths(TODAY, 12));
  });

  it('"¿y si compro esto?" muestra el impacto sin modificar los datos', () => {
    const input = scenario({ recurring: [paycheck(500)] });
    const before = forecast(input);
    const after = whatIf(input, $(400), 'Audífonos');
    expect(after.availableToday).toBe($(150)); // (1000 − 400) / 4
    expect(after.availableToday).toBeLessThan(before.availableToday);
    expect(forecast(input)).toEqual(before);
  });

  it('recalcula en menos de 200 ms con 5 años de historial y 12 meses de horizonte', () => {
    const transactions = Array.from({ length: 10_000 }, (_, i) => ({
      id: String(i),
      accountId: 'checking',
      amount: $(-(5 + (i % 40))),
      date: addMonths(TODAY, -Math.floor(i / 170) - 1),
      categoryId: `cat${i % 12}`,
    }));
    const input = scenario({
      transactions,
      recurring: [
        paycheck(900),
        expense('renta', 2200, monthly('2026-12-01')),
        ...Array.from({ length: 20 }, (_, i) => expense(`sub${i}`, 10, monthly(`2026-12-${String(i + 1).padStart(2, '0')}`))),
      ],
      settings: { safetyCushion: $(300), horizonMonths: 12 },
    });
    forecast(input); // calentamiento
    const start = performance.now();
    forecast(input);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
