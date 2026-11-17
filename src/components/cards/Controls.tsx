import type { CSSProperties, ReactNode } from 'react';
import { Check } from 'lucide-react';

/* Small Memory Cards controls (s12): switch, toggle group, swatch, key cap, empty slot. */

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export const Switch = ({ checked, onChange, label, disabled }: SwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className="mc-switch"
    disabled={disabled}
    onClick={() => onChange(!checked)}
  />
);

interface ToggleGroupProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}

/** One-of-n as a sunken well with a raised “on” segment (radio group semantics). */
export const ToggleGroup = <T extends string>({ value, options, onChange, label }: ToggleGroupProps<T>) => (
  <div
    className="mc-tg"
    role="radiogroup"
    aria-label={label}
    onKeyDown={(event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const index = options.findIndex((option) => option.value === value);
      const next = options[(index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
      onChange(next.value);
      requestAnimationFrame(() =>
        (event.currentTarget.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus(),
      );
    }}
  >
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={option.value === value}
        tabIndex={option.value === value ? 0 : -1}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

interface SwatchProps {
  color: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
  small?: boolean;
  /** For a roving radio group: 0 on the checked swatch, -1 on the rest. */
  tabIndex?: number;
}

export const Swatch = ({ color, label, checked, onSelect, small, tabIndex }: SwatchProps) => (
  <button
    type="button"
    role="radio"
    aria-checked={checked}
    tabIndex={tabIndex}
    aria-label={label}
    title={label}
    className={`mc-sw${small ? ' is-small' : ''}`}
    style={{ '--c': color } as CSSProperties}
    onClick={onSelect}
  >
    <Check aria-hidden="true" />
  </button>
);

export const KeyCap = ({ children, big = false }: { children: ReactNode; big?: boolean }) => (
  <kbd className={big ? 'mc-key' : 'mc-kb'}>{children}</kbd>
);

interface EmptySlotProps {
  title: string;
  body?: ReactNode;
  /** The glyph in the slot (a +, a magnifier, a !). */
  glyph: ReactNode;
  /** Slot colour: blue empty, red error, grey no results, green inbox done. */
  color?: string;
  action?: ReactNode;
  headingLevel?: 'h1' | 'h2';
}

/** Empty states (s08): a full-size empty card slot saying “your first card goes here”. */
export const EmptySlot = ({ title, body, glyph, color, action, headingLevel = 'h2' }: EmptySlotProps) => {
  const Heading = headingLevel;
  return (
    <div className="mc-empty" role="status">
      <div className="mc-slot" style={color ? ({ '--c': color } as CSSProperties) : undefined} aria-hidden="true">
        <span>{glyph}</span>
      </div>
      <Heading className="mc-h2">{title}</Heading>
      {body && <p className="mc-body">{body}</p>}
      {action}
    </div>
  );
};
