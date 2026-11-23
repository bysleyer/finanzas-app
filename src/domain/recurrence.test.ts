import { addDays, addMonths, localDate, parts, type LocalDate } from './date';
import { nextOccurrence, occurrencesBetween, type RecurrenceRule } from './recurrence';

const d = localDate;

describe('recurrence', () => {
  it('semanal: todos los viernes desde el ancla', () => {
    const rule: RecurrenceRule = { unit: 'week', interval: 1, anchor: d('2026-11-27') };
    expect(occurrencesBetween(rule, d('2026-11-23'), d('2026-12-20'))).toEqual([
      '2026-11-27',
      '2026-12-04',
      '2026-12-11',
      '2026-12-18',
    ]);
  });

  it('cada 14 días (biweekly)', () => {
    const rule: RecurrenceRule = { unit: 'week', interval: 2, anchor: d('2026-11-27') };
    expect(occurrencesBetween(rule, d('2026-11-28'), d('2027-01-10'))).toEqual([
      '2026-12-11',
      '2026-12-25',
      '2027-01-08',
    ]);
  });

  it('mensual el día 31: se recorta en meses cortos y vuelve al 31 después', () => {
    const rule: RecurrenceRule = { unit: 'month', interval: 1, anchor: d('2026-01-31') };
    expect(occurrencesBetween(rule, d('2026-01-01'), d('2026-05-31'))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
  });

  it('anual el 29 de febrero', () => {
    const rule: RecurrenceRule = { unit: 'year', interval: 1, anchor: d('2028-02-29') };
    expect(occurrencesBetween(rule, d('2028-01-01'), d('2032-12-31'))).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  it('respeta la fecha final', () => {
    const rule: RecurrenceRule = { unit: 'month', interval: 1, anchor: d('2026-12-01'), until: d('2027-02-01') };
    expect(occurrencesBetween(rule, d('2026-11-01'), d('2027-12-31'))).toEqual([
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
    ]);
    expect(nextOccurrence(rule, d('2027-02-02'))).toBeUndefined();
  });

  it('nada antes del ancla', () => {
    const rule: RecurrenceRule = { unit: 'day', interval: 1, anchor: d('2026-12-01') };
    expect(occurrencesBetween(rule, d('2026-11-01'), d('2026-11-30'))).toEqual([]);
    expect(nextOccurrence(rule, d('2026-11-01'))).toBe('2026-12-01');
  });

  it('rechaza intervalos inválidos', () => {
    expect(() => occurrencesBetween({ unit: 'week', interval: 0, anchor: d('2026-01-01') }, d('2026-01-01'), d('2026-02-01'))).toThrow();
    expect(() => occurrencesBetween({ unit: 'week', interval: 1.5, anchor: d('2026-01-01') }, d('2026-01-01'), d('2026-02-01'))).toThrow();
  });

  it('coincide con un cálculo de fuerza bruta en muchas reglas y ventanas', () => {
    const anchors = ['2020-01-31', '2024-02-29', '2025-06-15', '2026-11-27'].map(d);
    const units = ['day', 'week', 'month', 'year'] as const;
    for (const anchor of anchors) {
      for (const unit of units) {
        for (const interval of [1, 2, 3, 7]) {
          const rule: RecurrenceRule = { unit, interval, anchor };
          const all = bruteForce(rule, d('2060-12-31'));
          for (const offset of [0, 1, 45, 400, 2000, 5000]) {
            const from = addDays(anchor, offset);
            const to = addDays(from, 400);
            expect(occurrencesBetween(rule, from, to)).toEqual(all.filter((x) => x >= from && x <= to));
          }
        }
      }
    }
  });
});

function bruteForce(rule: RecurrenceRule, end: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  const day = parts(rule.anchor).day;
  for (let n = 0; ; n++) {
    const date =
      rule.unit === 'day'
        ? addDays(rule.anchor, n * rule.interval)
        : rule.unit === 'week'
          ? addDays(rule.anchor, n * rule.interval * 7)
          : addMonths(rule.anchor, n * rule.interval * (rule.unit === 'year' ? 12 : 1), day);
    if (date > end) return out;
    out.push(date);
  }
}
