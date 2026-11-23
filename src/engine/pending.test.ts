import { occurrenceKey } from '../domain';
import { pendingOccurrences } from './pending';
import { TODAY, d, expense, income, monthly, weekly } from './test-fixtures';

describe('pendingOccurrences', () => {
  it('lista las ocurrencias de hoy y anteriores que no se han resuelto, en orden', () => {
    const sueldo = income('sueldo', 900, weekly('2026-11-13'));
    const renta = expense('renta', 1500, monthly('2026-11-01'));
    const resolved = new Set([occurrenceKey('sueldo', d('2026-11-13')), occurrenceKey('renta', d('2026-11-01'))]);
    const pending = pendingOccurrences([sueldo, renta], resolved, TODAY);
    expect(pending.map((p) => `${p.recurring.id}@${p.date}`)).toEqual(['sueldo@2026-11-20']);
  });

  it('no incluye fechas futuras ni anteriores al ancla', () => {
    const sueldo = income('sueldo', 900, weekly('2026-11-27'));
    expect(pendingOccurrences([sueldo], new Set(), TODAY)).toEqual([]);
  });

  it('incluye la de hoy', () => {
    const sueldo = income('sueldo', 900, weekly('2026-11-23'));
    expect(pendingOccurrences([sueldo], new Set(), TODAY).map((p) => p.date)).toEqual(['2026-11-23']);
  });
});
