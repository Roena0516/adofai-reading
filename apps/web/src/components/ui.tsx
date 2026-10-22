import { keyLabel } from '@adofai-reading/core';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useState } from 'react';

export function cx(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(' ');
}

type Variant = 'default' | 'primary' | 'ghost' | 'danger';
// carol-web cta.ts: primary = accent fill with an accent ring, secondary = surface-2 with a border-2 ring.
const VARIANTS: Record<Variant, string> = {
  default: 'bg-surface-2 text-ink-2 shadow-[0_0_0_1px_var(--color-border-2)] hover:bg-surface-3',
  primary: 'bg-accent text-accent-ink shadow-[0_0_0_1px_var(--color-accent)] hover:bg-accent-hover',
  ghost: 'bg-transparent text-ink-soft hover:bg-surface-2 hover:text-ink',
  danger:
    'bg-wrong/10 text-wrong shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-wrong)_35%,transparent)] hover:bg-wrong/20',
};

export function Button({
  variant = 'default',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-7 rounded-lg px-2 text-xs' : 'h-8 rounded-xl px-3 text-sm',
        VARIANTS[variant],
        className,
      )}
    />
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex rounded-xl bg-surface p-0.5 shadow-[0_0_0_1px_var(--color-border-soft)]">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'cursor-pointer rounded-[10px] px-2.5 font-medium transition-colors',
            size === 'sm' ? 'h-6 text-xs' : 'h-7 text-sm',
            o.value === value ? 'bg-surface-2 text-ink' : 'text-dim hover:text-ink-soft',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
  className,
  allowEmpty = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => setText(value == null ? '' : String(value)), [value]);
  const commit = () => {
    if (text.trim() === '') {
      if (allowEmpty) onChange(null);
      else setText(value == null ? '' : String(value));
      return;
    }
    let v = Number(text);
    if (!Number.isFinite(v)) return setText(value == null ? '' : String(value));
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
    setText(String(v));
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      value={text}
      step={step}
      min={min}
      max={max}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={cx('field tabular', className)}
    />
  );
}

export function TextField({
  value,
  onCommit,
  className,
  invalid,
  placeholder,
  live = false,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  invalid?: boolean;
  placeholder?: string;
  live?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        if (live) onCommit(e.target.value);
      }}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={cx('field', invalid && 'field-invalid', className)}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-ink-soft">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-border-2',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-4 w-4 rounded-full transition-all',
            checked ? 'left-[18px] bg-accent-ink' : 'left-0.5 bg-ink-soft',
          )}
        />
      </button>
    </label>
  );
}

export function Section({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-xs font-medium tracking-[0.5px] text-accent-soft">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-soft">{label}</span>
        {children}
      </div>
      {hint && <p className="text-xs leading-[1.6] text-dim">{hint}</p>}
    </div>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28"
      />
      <span className="w-14 text-right text-xs text-muted tabular">{format ? format(value) : value}</span>
    </div>
  );
}

/** Click, then press a key to bind it. Escape cancels. */
export function KeyCapture({
  code,
  onChange,
  conflict,
}: {
  code: string;
  onChange: (code: string) => void;
  conflict?: boolean;
}) {
  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (!listening) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code !== 'Escape') onChange(e.code);
      setListening(false);
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [listening, onChange]);
  return (
    <button
      type="button"
      onClick={() => setListening((x) => !x)}
      className={cx(
        'h-8 min-w-14 cursor-pointer rounded-lg px-2 text-sm font-medium tabular transition-colors',
        listening
          ? 'animate-pulse bg-accent/20 text-accent-soft shadow-[0_0_0_1px_var(--color-accent)]'
          : conflict
            ? 'bg-surface-2 text-wrong shadow-[0_0_0_1px_var(--color-wrong)]'
            : 'bg-surface-2 text-ink-2 shadow-[0_0_0_1px_var(--color-border-2)] hover:bg-surface-3',
      )}
    >
      {listening ? '키 입력' : keyLabel(code)}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-soft shadow-[0_0_0_1px_var(--color-border-2)]">
      {children}
    </kbd>
  );
}

/** A button that asks once more (it turns red for 3 s) before doing something destructive. */
export function ConfirmButton({
  onConfirm,
  children,
  label,
  armedLabel = '정말 삭제',
}: {
  onConfirm: () => void;
  children: ReactNode;
  label: string;
  armedLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      size="sm"
      variant={armed ? 'danger' : 'ghost'}
      aria-label={label}
      title={label}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? armedLabel : children}
    </Button>
  );
}
