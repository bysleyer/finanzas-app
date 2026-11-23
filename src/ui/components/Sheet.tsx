import { type ReactNode, useEffect } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Panel que sube desde abajo, como en las apps de iPhone. */
export function Sheet({ title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header">
          <h2>{title}</h2>
          <button type="button" className="link" onClick={onClose}>
            Cerrar
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
