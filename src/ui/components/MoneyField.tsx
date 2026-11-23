import { useId } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string | undefined;
  autoFocus?: boolean;
  large?: boolean;
}

/** Campo de monto en dólares. Abre el teclado numérico con punto decimal en el iPhone. */
export function MoneyField({ label, value, onChange, hint, autoFocus = false, large = false }: Props) {
  const id = useId();
  return (
    <div className={large ? 'field field-large' : 'field'}>
      <label htmlFor={id}>{label}</label>
      <div className="money-input">
        <span aria-hidden="true">$</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
