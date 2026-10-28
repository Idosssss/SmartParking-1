import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'smartparking.theme';

function readInitial(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // storage blocked (private window): fall back to the system setting
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let current: Theme = readInitial();
const listeners = new Set<() => void>();

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0e1214' : '#f2f6f7');
}

apply(current);

export function setTheme(theme: Theme) {
  if (theme === current) return;
  current = theme;
  const root = document.documentElement;
  root.classList.add('theme-fade');
  apply(theme);
  window.setTimeout(() => root.classList.remove('theme-fade'), 350);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // not saved, still applied for this visit
  }
  listeners.forEach((l) => l());
}

export function toggleTheme() {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

/** The current colour theme. The canvas map uses it to pick its palette. */
export function useTheme(): Theme {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
  );
}
