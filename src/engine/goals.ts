import { type Cents, type LocalDate, cents, parts } from '../domain';

/**
 * Aporte mensual sugerido para llegar a una meta: lo que falta ÷ meses restantes,
 * redondeado hacia arriba al centavo para no quedarse corto.
 */
export function suggestedMonthlyContribution(
  target: Cents,
  saved: Cents,
  targetDate: LocalDate,
  today: LocalDate,
): Cents {
  const remaining = target - saved;
  if (remaining <= 0) return cents(0);
  const a = parts(today);
  const b = parts(targetDate);
  const months = Math.max(1, (b.year - a.year) * 12 + (b.month - a.month));
  return cents(Math.ceil(remaining / months));
}
