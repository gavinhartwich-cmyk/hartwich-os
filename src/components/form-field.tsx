export default function FormField({
  label,
  name,
  type = "text",
  required,
  autoFocus,
  placeholder,
  defaultValue,
  min,
  max,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  defaultValue?: string | null;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-white/80">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        min={min}
        max={max}
        className="input-field"
      />
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}
