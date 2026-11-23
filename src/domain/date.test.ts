import { addDays, addMonths, daysInMonth, diffDays, fromEpochDay, localDate, toEpochDay, today } from './date';

const d = localDate;

describe('date', () => {
  it('valida el formato y que la fecha exista', () => {
    expect(() => d('2026-13-01')).toThrow(RangeError);
    expect(() => d('2026-02-29')).toThrow(RangeError);
    expect(() => d('2026-2-1')).toThrow(RangeError);
    expect(d('2028-02-29')).toBe('2028-02-29');
  });

  it('suma días cruzando meses y años', () => {
    expect(addDays(d('2026-12-30'), 3)).toBe('2027-01-02');
    expect(addDays(d('2026-03-01'), -1)).toBe('2026-02-28');
  });

  it('no se descuadra con el cambio de horario de verano en Nueva York', () => {
    expect(diffDays(d('2026-03-07'), d('2026-03-09'))).toBe(2);
    expect(diffDays(d('2026-10-31'), d('2026-11-02'))).toBe(2);
  });

  it('ida y vuelta por número de día', () => {
    for (const date of ['1970-01-01', '2000-02-29', '2026-11-23', '2099-12-31']) {
      expect(fromEpochDay(toEpochDay(d(date)))).toBe(date);
    }
  });

  it('suma meses recortando al último día cuando hace falta', () => {
    expect(addMonths(d('2026-01-31'), 1)).toBe('2026-02-28');
    expect(addMonths(d('2028-01-31'), 1)).toBe('2028-02-29');
    expect(addMonths(d('2026-01-31'), 2)).toBe('2026-03-31');
    expect(addMonths(d('2026-11-15'), 3)).toBe('2027-02-15');
    expect(addMonths(d('2026-03-15'), -4)).toBe('2025-11-15');
  });

  it('conoce los años bisiestos', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it('toma la fecha local del dispositivo, no la de UTC', () => {
    // 23 de noviembre a las 11 p. m. en hora local sigue siendo el 23.
    expect(today(new Date(2026, 10, 23, 23, 0))).toBe('2026-11-23');
  });
});
