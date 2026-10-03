import type { Directive } from "vue";

/**
 * `v-hint="text"`: a short explanation in place of a `title`. It shows on
 * mouse hover and on keyboard focus, stays while the pointer moves onto it,
 * closes with Escape, and screen readers read it as the control's
 * description. One bubble serves the whole page.
 */
const texts = new WeakMap<HTMLElement, string>();
const HOVER_DELAY = 450;
const FOCUS_DELAY = 150;
let bubble: HTMLElement | null = null;
let owner: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let listening = false;

function ensureBubble(): HTMLElement {
  if (bubble?.isConnected) return bubble;
  bubble = document.createElement("div");
  bubble.className = "kitty-hint";
  bubble.setAttribute("role", "tooltip");
  bubble.hidden = true;
  bubble.addEventListener("pointerenter", () => clearTimeout(hideTimer));
  bubble.addEventListener("pointerleave", scheduleHide);
  document.body.append(bubble);
  if (!listening) {
    listening = true;
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
  }
  return bubble;
}

function show(target: HTMLElement, delay: number): void {
  clearTimeout(hideTimer);
  clearTimeout(showTimer);
  showTimer = setTimeout(() => {
    const text = texts.get(target);
    if (!text || !target.isConnected || target.getClientRects().length === 0) return;
    const tip = ensureBubble();
    owner = target;
    tip.textContent = text;
    tip.hidden = false;
    place(target, tip);
  }, delay);
}

function hide(): void {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  owner = null;
  if (bubble) bubble.hidden = true;
}

function scheduleHide(): void {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, 150);
}

function place(target: HTMLElement, tip: HTMLElement): void {
  const margin = 8;
  const rect = target.getBoundingClientRect();
  tip.style.left = "0px";
  tip.style.top = "0px";
  const box = tip.getBoundingClientRect();
  const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - box.width / 2), window.innerWidth - margin - box.width);
  const below = rect.bottom + 6;
  const top = below + box.height <= window.innerHeight - margin ? below : Math.max(margin, rect.top - 6 - box.height);
  tip.style.left = `${Math.max(margin, left)}px`;
  tip.style.top = `${top}px`;
}

/** The element screen readers land on: the host itself or its first control (KvSelect wraps its select). */
function control(host: HTMLElement): HTMLElement {
  if (host.matches("button, input, select, a, [tabindex]")) return host;
  return host.querySelector<HTMLElement>("button, input, select, a, [tabindex]") ?? host;
}

function onPointerEnter(event: PointerEvent): void { if (event.pointerType === "mouse") show(event.currentTarget as HTMLElement, HOVER_DELAY); }
function onPointerDown(): void { hide(); }
function onFocusIn(event: FocusEvent): void {
  const target = event.target as HTMLElement;
  if (target.matches(":focus-visible")) show(event.currentTarget as HTMLElement, FOCUS_DELAY);
}
function onFocusOut(event: FocusEvent): void { if (owner === event.currentTarget) hide(); }

function describe(host: HTMLElement, text: string): void {
  texts.set(host, text);
  control(host).setAttribute("aria-description", text);
  if (owner === host && bubble) bubble.textContent = text;
}

export const vHint: Directive<HTMLElement, string> = {
  mounted(host, binding) {
    describe(host, binding.value);
    host.addEventListener("pointerenter", onPointerEnter);
    host.addEventListener("pointerleave", scheduleHide);
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("focusin", onFocusIn);
    host.addEventListener("focusout", onFocusOut);
  },
  updated(host, binding) {
    if (binding.value !== binding.oldValue) describe(host, binding.value);
  },
  beforeUnmount(host) {
    if (owner === host) hide();
    host.removeEventListener("pointerenter", onPointerEnter);
    host.removeEventListener("pointerleave", scheduleHide);
    host.removeEventListener("pointerdown", onPointerDown);
    host.removeEventListener("focusin", onFocusIn);
    host.removeEventListener("focusout", onFocusOut);
  },
};
