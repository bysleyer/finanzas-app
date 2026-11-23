import { add, cents, divFloor, formatMoney, fromDollars, mulRound, parseMoneyInput, sub } from './money';

describe('money', () => {
  it('evita el error clásico de decimales: 0.10 + 0.20 = 0.30 exacto', () => {
    expect(add(fromDollars(0.1), fromDollars(0.2))).toBe(fromDollars(0.3));
  });

  it('convierte dólares a centavos redondeando', () => {
    expect(fromDollars(12.34)).toBe(1234);
    expect(fromDollars(19.999)).toBe(2000);
    expect(fromDollars(-5.5)).toBe(-550);
  });

  it('rechaza montos que no son enteros de centavos', () => {
    expect(() => cents(1.5)).toThrow(RangeError);
    expect(() => cents(Number.NaN)).toThrow(RangeError);
    expect(() => fromDollars(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('divide hacia abajo para nunca prometer de más', () => {
    expect(divFloor(cents(1000), 3)).toBe(333);
    expect(divFloor(cents(-1000), 3)).toBe(-334);
    expect(() => divFloor(cents(100), 0)).toThrow(RangeError);
  });

  it('multiplica por una tasa y redondea', () => {
    expect(mulRound(cents(10_000), 0.2499)).toBe(2499);
    expect(sub(cents(500), cents(750))).toBe(-250);
  });

  it('formatea en dólares con formato de EE. UU. en español', () => {
    const text = formatMoney(cents(123_456));
    expect(text).toContain('1,234.56');
    expect(text).toContain('$');
  });
});

describe('parseMoneyInput', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,50', 1250],
    ['$1,234.56', 123_456],
    [' 7.05 ', 705],
    ['0.01', 1],
  ])('"%s" → %i centavos', (text, expected) => {
    expect(parseMoneyInput(text)).toBe(expected);
  });

  it.each(['', 'abc', '0', '-5', '1.234', '12.3.4', '1e5'])('rechaza "%s"', (text) => {
    expect(parseMoneyInput(text)).toBeUndefined();
  });

  it('acepta cero solo si se pide', () => {
    expect(parseMoneyInput('0')).toBeUndefined();
    expect(parseMoneyInput('0', { allowZero: true })).toBe(0);
    expect(parseMoneyInput('', { allowZero: true })).toBeUndefined();
  });
});
