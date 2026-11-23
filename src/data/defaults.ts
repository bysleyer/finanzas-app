import { type Category, type Settings, fromDollars } from '../domain';

export const DEBT_PAYMENT_CATEGORY: Category = { id: 'debt-payment', name: 'Pago de deuda', kind: 'expense', icon: '💳' };

export const DEFAULT_CATEGORIES: readonly Category[] = [
  { id: 'food', name: 'Comida', kind: 'expense', icon: '🍔' },
  { id: 'groceries', name: 'Supermercado', kind: 'expense', icon: '🛒' },
  { id: 'transport', name: 'Transporte', kind: 'expense', icon: '🚇' },
  { id: 'fun', name: 'Salidas', kind: 'expense', icon: '🎉' },
  { id: 'shopping', name: 'Compras', kind: 'expense', icon: '🛍️' },
  { id: 'health', name: 'Salud', kind: 'expense', icon: '💊' },
  { id: 'home', name: 'Hogar', kind: 'expense', icon: '🏠' },
  { id: 'rent', name: 'Renta', kind: 'expense', icon: '🔑' },
  { id: 'utilities', name: 'Servicios', kind: 'expense', icon: '💡' },
  { id: 'subscriptions', name: 'Suscripciones', kind: 'expense', icon: '📺' },
  { id: 'phone', name: 'Teléfono e internet', kind: 'expense', icon: '📱' },
  { id: 'insurance', name: 'Seguros', kind: 'expense', icon: '🛡️' },
  { id: 'other-expense', name: 'Otros', kind: 'expense', icon: '📦' },
  DEBT_PAYMENT_CATEGORY,
  { id: 'salary', name: 'Sueldo', kind: 'income', icon: '💼' },
  { id: 'other-income', name: 'Otros ingresos', kind: 'income', icon: '💵' },
];

/** Categorías que se ofrecen en el registro rápido, en este orden. */
export const QUICK_EXPENSE_CATEGORIES = ['food', 'groceries', 'transport', 'fun', 'shopping', 'health', 'home', 'other-expense'];

export const DEFAULT_SETTINGS: Settings = {
  safetyCushion: fromDollars(100),
  horizonMonths: 6,
};

export const MAIN_ACCOUNT_ID = 'main';
