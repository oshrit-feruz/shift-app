import type { ChangeEventHandler } from 'react';

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
  return (
    <div className="field" style={{ flex: 1 }}>
      <label>{label}</label>
      <input
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
