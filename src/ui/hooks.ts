import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { isSetupDone, loadForecastInput, recentTransactions } from '../data';
import { type Category, type LocalDate, type Transaction, today as getToday } from '../domain';
import { type Forecast, type ForecastInput, type PendingOccurrence, forecast, pendingOccurrences } from '../engine';
import { db } from './db';

/** Fecha de hoy que se actualiza sola al pasar la medianoche o al volver a la app. */
export function useToday(): LocalDate {
  const [today, setToday] = useState(getToday);
  useEffect(() => {
    const refresh = () => setToday(getToday());
    const timer = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}

export interface AppData {
  input: ForecastInput;
  forecast: Forecast;
  pending: PendingOccurrence[];
  recent: Transaction[];
  categories: Map<string, Category>;
}

export type AppState = { status: 'loading' } | { status: 'setup' } | ({ status: 'ready' } & AppData);

/**
 * Lee todo lo que necesitan las pantallas y se vuelve a ejecutar solo cuando cambia algo
 * en la base de datos. El cálculo lo hace siempre el motor; la interfaz solo lo muestra.
 */
export function useAppData(today: LocalDate): AppState {
  const raw = useLiveQuery(async () => {
    if (!(await isSetupDone(db))) return { setup: false as const };
    const [input, recent, categories] = await Promise.all([
      loadForecastInput(db, today),
      recentTransactions(db, 200),
      db.categories.toArray(),
    ]);
    return { setup: true as const, input, recent, categories };
  }, [today]);

  return useMemo((): AppState => {
    if (!raw) return { status: 'loading' };
    if (!raw.setup) return { status: 'setup' };
    return {
      status: 'ready',
      input: raw.input,
      forecast: forecast(raw.input),
      pending: pendingOccurrences(raw.input.recurring, raw.input.confirmed, today, raw.input.debts),
      recent: raw.recent,
      categories: new Map(raw.categories.map((c) => [c.id, c])),
    };
  }, [raw, today]);
}
