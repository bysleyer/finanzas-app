import { occurrenceKey } from '../domain';
import { nextUnresolved, pendingOccurrences } from './pending';
import { $, TODAY, d, debt, expense, income, monthly, weekly } from './test-fixtures';

describe('pendingOccurrences', () => {
  it('lista las ocurrencias de hoy y anteriores que no se han resuelto, en orden', () => {
    const sueldo = income('sueldo', 900, weekly('2026-11-13'));
    const renta = expense('renta', 1500, monthly('2026-11-01'));
    const resolved = new Set([occurrenceKey('sueldo', d('2026-11-13')), occurrenceKey('renta', d('2026-11-01'))]);
    const pending = pendingOccurrences([sueldo, renta], resolved, TODAY);
    expect(pending.map((p) => `${p.sourceId}@${p.date}`)).toEqual(['sueldo@2026-11-20']);
  });

  it('no incluye fechas futuras ni anteriores al ancla', () => {
    const sueldo = income('sueldo', 900, weekly('2026-11-27'));
    expect(pendingOccurrences([sueldo], new Set(), TODAY)).toEqual([]);
  });

  it('incluye la de hoy', () => {
    const sueldo = income('sueldo', 900, weekly('2026-11-23'));
    expect(pendingOccurrences([sueldo], new Set(), TODAY).map((p) => p.date)).toEqual(['2026-11-23']);
  });

  it('incluye pagos de deuda que vencieron, sin pasar del saldo', () => {
    const visa = debt('visa', 250, 200, monthly('2026-10-20'));
    const pending = pendingOccurrences([], new Set(), TODAY, [visa]);
    expect(pending.map((p) => [p.source, p.date, p.amount])).toEqual([
      ['debt', '2026-10-20', $(200)],
      ['debt', '2026-11-20', $(50)],
    ]);
    expect(pending[0]?.name).toBe('Pago visa');
  });

  it('no pide pagos de una deuda ya liquidada', () => {
    expect(pendingOccurrences([], new Set(), TODAY, [debt('visa', 0, 200, monthly('2026-11-20'))])).toEqual([]);
  });
});

describe('nextUnresolved', () => {
  it('salta las ocurrencias ya confirmadas o descartadas', () => {
    const rule = monthly('2026-11-23');
    expect(nextUnresolved(rule, 'visa', new Set(), TODAY)).toBe('2026-11-23');
    expect(nextUnresolved(rule, 'visa', new Set([occurrenceKey('visa', TODAY)]), TODAY)).toBe('2026-12-23');
  });
});
