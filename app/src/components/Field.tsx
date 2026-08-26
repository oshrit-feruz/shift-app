import { useId, type ChangeEventHandler } from 'react';

export function Field({
  label,
  value,
  defaultValue,
  onChange,
  placeholder,
  type = 'text',
  height = 40,
}: {
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  type?: string;
  height?: number;
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
        style={{ height, minHeight: height }}
      />
    </div>
  );
}
