import { useEffect, useRef } from 'react';

const tooltipId = 'atlas-tooltip';
const pageGap = 10;
const anchorGap = 9;

function control(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-tooltip]:not(:disabled)') : null;
}

export function TooltipLayer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tip = ref.current;
    if (!tip) return;
    const supportsPopover = typeof tip.showPopover === 'function';
    let anchor: HTMLElement | null = null;
    let timer: number | undefined;
    let description: string | null = null;
    let visible = false;
    let keyboard = false;

    const hide = () => {
      clearTimeout(timer);
      if (visible) {
        if (description === null) anchor?.removeAttribute('aria-describedby');
        else anchor?.setAttribute('aria-describedby', description);
        if (supportsPopover) tip.hidePopover();
        tip.hidden = true;
        visible = false;
      }
      anchor = null;
    };

    const schedule = (next: HTMLElement, fromKeyboard: boolean) => {
      if (anchor === next && keyboard === fromKeyboard) return;
      hide();
      anchor = next;
      keyboard = fromKeyboard;
      timer = window.setTimeout(() => {
        const text = next.dataset.tooltip;
        if (!text || !next.isConnected || !(fromKeyboard ? next.matches(':focus-visible') : next.matches(':hover'))) return;
        tip.textContent = text;
        tip.style.left = '0px';
        tip.style.top = '0px';
        tip.hidden = false;
        if (supportsPopover) tip.showPopover();
        const box = next.getBoundingClientRect();
        const { width, height } = tip.getBoundingClientRect();
        const above = box.top >= pageGap + anchorGap + height;
        const x = Math.min(innerWidth - width - pageGap, Math.max(pageGap, box.left + (box.width - width) / 2));
        const y = above ? box.top - height - anchorGap : Math.min(innerHeight - height - pageGap, box.bottom + anchorGap);
        tip.style.left = `${x}px`;
        tip.style.top = `${y}px`;
        description = next.getAttribute('aria-describedby');
        next.setAttribute('aria-describedby', description ? `${description} ${tooltipId}` : tooltipId);
        visible = true;
      }, fromKeyboard ? 0 : 360);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const next = control(event.target);
      if (next) schedule(next, false);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (!keyboard && control(event.target) === anchor && control(event.relatedTarget) !== anchor) hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      const next = control(event.target);
      if (next?.matches(':focus-visible')) schedule(next, true);
      else if (keyboard) hide();
    };
    const onFocusOut = (event: FocusEvent) => {
      if (keyboard && control(event.target) === anchor) hide();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };

    window.addEventListener('pointerover', onPointerOver, true);
    window.addEventListener('pointerout', onPointerOut, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', onFocusOut);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      hide();
      window.removeEventListener('pointerover', onPointerOver, true);
      window.removeEventListener('pointerout', onPointerOut, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);

  return <div ref={ref} id={tooltipId} className="atlas-tooltip" role="tooltip" popover="manual" hidden />;
}
