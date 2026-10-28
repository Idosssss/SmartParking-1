import { useCallback, useRef, useState } from 'react';

export type ToastTone = 'info' | 'success' | 'warning';

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
  leaving: boolean;
}

const SHOW_MS = 4200;
const LEAVE_MS = 220;
const MAX_TOASTS = 3;

/** Small notifications for the moments that matter (board connected, a car parked, a sensor fault). */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), LEAVE_MS);
  }, []);

  const notify = useCallback(
    (text: string, tone: ToastTone = 'info') => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-(MAX_TOASTS - 1)), { id, text, tone, leaving: false }]);
      setTimeout(() => dismiss(id), SHOW_MS);
    },
    [dismiss],
  );

  return { toasts, notify, dismiss };
}

