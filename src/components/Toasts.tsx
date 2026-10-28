import Icon from './Icons';
import type { Toast } from './useToasts';

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone} ${t.leaving ? 'toast--leaving' : ''}`}>
          <span className="toast__dot" />
          <span className="toast__text">{t.text}</span>
          <button className="toast__close" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
