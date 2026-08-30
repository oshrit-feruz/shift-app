/** Segmented control (Beginner/Advanced switch, alert conditions, tx sides). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  fontSize = 15.5,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  fontSize?: number;
}) {
  return (
    <div className="seg" style={{ width: '100%' }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="seg-opt"
          data-active={o.value === value}
          style={{ fontSize }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
