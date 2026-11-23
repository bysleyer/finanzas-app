import { addDays } from '../domain';
import { suggestedMonthlyContribution } from './goals';
import { $, TODAY, d, spend } from './test-fixtures';
import { estimateVariableSpending } from './variable-spending';

describe('estimateVariableSpending', () => {
  it('promedia los últimos 90 días sin contar hoy', () => {
    const txs = Array.from({ length: 120 }, (_, i) => spend(10, addDays(TODAY, -(i + 1))));
    txs.push(spend(500, TODAY)); // hoy no cuenta
    const e = estimateVariableSpending(txs, TODAY);
    expect(e.daysUsed).toBe(90);
    expect(e.dailyTotal).toBe($(10));
  });

  it('ignora ingresos, recurrentes y transferencias', () => {
    const txs = [
      spend(90, addDays(TODAY, -1)),
      { ...spend(1000, addDays(TODAY, -2)), recurringId: 'renta' },
      { ...spend(500, addDays(TODAY, -3)), isTransfer: true },
      { id: 'in', accountId: 'checking', amount: $(900), date: addDays(TODAY, -4), categoryId: 'salary' },
      spend(0.000001, addDays(TODAY, -90)),
    ];
    expect(estimateVariableSpending(txs, TODAY).dailyTotal).toBe($(1));
  });

  it('con poco historial promedia sobre al menos 14 días', () => {
    const e = estimateVariableSpending([spend(140, addDays(TODAY, -2))], TODAY);
    expect(e.daysUsed).toBe(14);
    expect(e.dailyTotal).toBe($(10));
  });

  it('sin historial estima cero', () => {
    expect(estimateVariableSpending([], TODAY).dailyTotal).toBe(0);
  });

  it('agrupa por categoría', () => {
    const e = estimateVariableSpending([spend(30, d('2026-11-20'), 'food'), spend(20, d('2026-11-21'), 'transport'), spend(5, d('2026-11-22'), 'food')], TODAY);
    expect(e.byCategory.get('food')).toBe($(35));
    expect(e.byCategory.get('transport')).toBe($(20));
  });
});

describe('suggestedMonthlyContribution', () => {
  it('reparte lo que falta entre los meses restantes, redondeando hacia arriba', () => {
    expect(suggestedMonthlyContribution($(1000), $(0), d('2027-02-15'), TODAY)).toBe($(333.34));
    expect(suggestedMonthlyContribution($(1000), $(1000), d('2027-02-15'), TODAY)).toBe(0);
    expect(suggestedMonthlyContribution($(500), $(0), d('2026-11-30'), TODAY)).toBe($(500));
  });
});
