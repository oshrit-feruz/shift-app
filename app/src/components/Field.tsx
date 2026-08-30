import { useId, type ChangeEventHandler } from 'react';

export function Field({
  label,
  value,
  defaultValue,
  onChange,
  placeholder,
  type = 'text',
  height = 40,
  max,
  inputMode,
}: {
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  type?: string;
  height?: number;
  /** Upper bound for date/number inputs — the browser enforces it too, so a
   *  future trade cannot be picked in the first place. */
  max?: string;
  inputMode?: 'decimal' | 'numeric' | 'text';
}) {
  const inputId = useId();
  return (
    <div className="field" style={{ flex: 1 }}>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className="input"
        type={type}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        placeholder={placeholder}
        max={max}
        inputMode={inputMode}
        style={{ height, minHeight: height }}
      />
    </div>
  );
}
