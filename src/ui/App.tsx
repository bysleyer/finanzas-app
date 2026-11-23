import { useEffect, useState } from 'react';
import { useAppData, useToday } from './hooks';
import { AddTransaction } from './screens/AddTransaction';
import { Fixed } from './screens/Fixed';
import { Home } from './screens/Home';
import { Movements } from './screens/Movements';
import { Settings } from './screens/Settings';
import { Setup } from './screens/Setup';

const TABS = [
  { id: 'home', label: 'Inicio', icon: '◉' },
  { id: 'movements', label: 'Movimientos', icon: '≡' },
  { id: 'fixed', label: 'Fijos', icon: '↻' },
  { id: 'settings', label: 'Ajustes', icon: '⚙' },
] as const;

type Tab = (typeof TABS)[number]['id'];

function tabFromHash(): Tab {
  const id = location.hash.slice(1);
  return TABS.some((t) => t.id === id) ? (id as Tab) : 'home';
}

export function App() {
  const today = useToday();
  const state = useAppData(today);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (state.status === 'loading') return <div className="loading" aria-busy="true" />;
  if (state.status === 'setup') return <Setup today={today} />;

  return (
    <>
      {tab === 'home' && <Home data={state} today={today} />}
      {tab === 'movements' && <Movements data={state} today={today} />}
      {tab === 'fixed' && <Fixed data={state} today={today} />}
      {tab === 'settings' && <Settings data={state} />}

      <button type="button" className="fab" aria-label="Registrar gasto" onClick={() => setAdding(true)}>
        +
      </button>

      <nav className="tabbar" aria-label="Secciones">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </a>
        ))}
      </nav>

      {adding && <AddTransaction today={today} categories={state.categories} onClose={() => setAdding(false)} />}
    </>
  );
}
