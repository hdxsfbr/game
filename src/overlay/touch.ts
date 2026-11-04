/**
 * Whether this is a touch screen (a phone, an iPad): the on-screen buttons show, key names drop out
 * of the labels, and Play asks for fullscreen. `?touch=1` forces it, for the headless checks.
 */
export const TOUCH: boolean = typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('touch') === '1' || (window.matchMedia?.('(pointer: coarse)').matches ?? false));

if (TOUCH && typeof document !== 'undefined') document.documentElement.classList.add('touch');

/** A button label: "Space: listen" on a keyboard, "Listen" on a touch screen. */
export function keyed(key: string, text: string): string {
  return TOUCH ? text.charAt(0).toUpperCase() + text.slice(1) : `${key}: ${text}`;
}

/** Fullscreen, where the browser allows it; a refusal (an iPhone) is silent. */
export function goFullscreen(): void {
  if (!TOUCH || document.fullscreenElement) return;
  try {
    void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined);
  } catch {
    // Not offered on this device.
  }
}
