import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

export function AtlasSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  tooltip,
  className,
  triggerRef,
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  tooltip?: string;
  className?: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const selectedLabel = options.find(opt => opt.value === value)?.label ?? value;

  const setButtonRef = (node: HTMLButtonElement | null) => {
    buttonRef.current = node;
    if (triggerRef) triggerRef.current = node;
  };

  useEffect(() => {
    if (!open) return;
    const selected = root.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]')
      ?? root.current?.querySelector<HTMLButtonElement>('[role="option"]');
    selected?.focus({ preventScroll: true });

    const outside = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && root.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  const selectOption = (next: T) => {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus({ preventScroll: true });
      return;
    }

    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }

    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (index + 1) % items.length
            : (index - 1 + items.length) % items.length;
      event.preventDefault();
      items[next].focus();
    }
  };

  return (
    <div
      ref={root}
      className={`atlas-select${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={setButtonRef}
        type="button"
        className="atlas-select-trigger"
        data-value={value}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        data-tooltip={open ? undefined : tooltip}
        onClick={() => setOpen(current => !current)}
      >
        <span className="atlas-select-label">{selectedLabel}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m7 9 5 5 5-5" />
        </svg>
      </button>
      {open && (
        <div id={menuId} role="listbox" className="atlas-select-menu" aria-label={ariaLabel}>
          {options.map(option => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                className="atlas-select-option"
                data-value={option.value}
                aria-selected={selected}
                onClick={() => selectOption(option.value)}
              >
                <span>{option.label}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
