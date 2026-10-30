import { useEffect, useId, useRef, useState } from 'react';
import { DRIVE_SPEEDS, SPOT_STEALING, TRAFFIC_LEVELS, type DemoSettings } from '../config/demoSettings';
import Icon from './Icons';
import { speechSupported } from './speech';
import './DemoSettingsMenu.css';

interface DemoSettingsMenuProps {
  settings: DemoSettings;
  onChange: (patch: Partial<DemoSettings>) => void;
  onRestoreDefaults: () => void;
  onResetLot: () => void;
}

function Segmented<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint: string;
  value: T;
  options: Record<T, { label: string }>;
  onChange: (value: T) => void;
}) {
  const id = useId();
  const keys = Object.keys(options) as T[];
  // Arrow keys move the choice, the way a radio group does.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = keys[(keys.indexOf(value) + step + keys.length) % keys.length];
    onChange(next);
    (e.currentTarget.querySelector(`[data-value="${next}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div className="dset__field">
      <span className="dset__label" id={`${id}-label`}>
        {label}
      </span>
      <div className="seg" role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} onKeyDown={onKeyDown}>
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={value === k}
            tabIndex={value === k ? 0 : -1}
            data-value={k}
            className="seg__option"
            onClick={() => onChange(k)}
          >
            {options[k].label}
          </button>
        ))}
      </div>
      <span className="dset__hint" id={`${id}-hint`}>
        {hint}
      </span>
    </div>
  );
}

/** The demo's settings: a button in the page head that opens a small panel. Choices are remembered. */
export default function DemoSettingsMenu({ settings, onChange, onRestoreDefaults, onResetLot }: DemoSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const canSpeak = speechSupported();

  // Close on a click outside or on Escape, and hand focus back to the button.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>('.dset__toggle')?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="dset" ref={rootRef}>
      <button className="btn dset__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="demo-settings">
        <Icon name="sliders" />
        Settings
      </button>
      {open && (
        <div className="dset__panel" id="demo-settings" role="group" aria-label="Demo settings">
          <div className="dset__head">
            <h2>Demo settings</h2>
            <button className="topbar__icon" onClick={() => setOpen(false)} aria-label="Close settings">
              <Icon name="close" />
            </button>
          </div>
          <Segmented
            label="Traffic"
            hint="How often other cars come and go while Live traffic is on."
            value={settings.traffic}
            options={TRAFFIC_LEVELS}
            onChange={(traffic) => onChange({ traffic })}
          />
          <Segmented
            label="Driving speed"
            hint="Slow is easier to follow when you present the demo."
            value={settings.speed}
            options={DRIVE_SPEEDS}
            onChange={(speed) => onChange({ speed })}
          />
          <Segmented
            label="Drivers without the app take your spot"
            hint="The app holds your spot for app drivers, but drivers without the app cannot know. How often one races you to it."
            value={settings.stealing}
            options={SPOT_STEALING}
            onChange={(stealing) => onChange({ stealing })}
          />
          <label className="dset__switch">
            <span>
              <span className="dset__label">
                <Icon name="speaker" size={14} /> Spoken directions
              </span>
              <span className="dset__hint">{canSpeak ? 'The phone reads each turn aloud.' : 'This browser cannot speak.'}</span>
            </span>
            <input type="checkbox" checked={settings.voice && canSpeak} disabled={!canSpeak} onChange={(e) => onChange({ voice: e.target.checked })} />
          </label>
          <div className="dset__actions">
            <button
              className="btn btn--small"
              onClick={() => {
                onResetLot();
                setOpen(false);
              }}
            >
              <Icon name="reset" size={14} />
              Empty the lot
            </button>
            <button className="btn btn--small dset__quiet" onClick={onRestoreDefaults}>
              Restore defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
