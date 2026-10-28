/** Keyboard shortcuts, listed once so the help dialog and the handlers agree. */
export const SHORTCUTS = [
  { keys: ['1'], what: 'Overview' },
  { keys: ['2'], what: 'Live demo' },
  { keys: ['3'], what: 'Simulation study' },
  { keys: ['F'], what: 'Send a car to the gate (live demo)' },
  { keys: ['T'], what: 'Live traffic on or off (live demo)' },
  { keys: ['E'], what: 'Empty the lot and open every lane (live demo)' },
  { keys: ['D'], what: 'Dark or light theme' },
  { keys: ['?'], what: 'Show this list' },
] as const;

/** True when the key press belongs to a text field, a select or a held modifier, not to us. */
export function ignoreShortcut(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return true;
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}
