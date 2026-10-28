import Icon from './Icons';
import { SCENARIOS, type ScenarioId } from './scenarios';
import './EdgeCasePanel.css';

interface EdgeCasePanelProps {
  onRun: (id: ScenarioId) => void;
  /** Why a scenario cannot run right now, or null when it can. */
  blockedReason: (id: ScenarioId) => string | null;
  lastRun: ScenarioId | null;
  boardConnected: boolean;
}

/** One-click set-ups for the situations a parking system has to survive. */
export default function EdgeCasePanel({ onRun, blockedReason, lastRun, boardConnected }: EdgeCasePanelProps) {
  return (
    <section className="edge" aria-labelledby="edge-title">
      <div className="edge__head">
        <div>
          <h2 id="edge-title">Edge cases to try</h2>
          <p>
            Each button sets the lot up for one hard situation and plays it. The activity feed and the phone show how the system copes.
            {boardConnected && ' The real sensor keeps driving its own spot.'}
          </p>
        </div>
      </div>
      <ul className="edge__grid">
        {SCENARIOS.map((s) => {
          const blocked = blockedReason(s.id);
          return (
            <li key={s.id} className={`edge__card ${lastRun === s.id ? 'edge__card--ran' : ''}`}>
              <div className="edge__title">
                <span className="edge__icon">
                  <Icon name={s.icon} />
                </span>
                <h3>{s.title}</h3>
              </div>
              <p className="edge__setup">{s.setup}</p>
              <p className="edge__expect">
                <strong>Watch for:</strong> {s.expect}
              </p>
              <div className="edge__foot">
                <button className="btn btn--small edge__run" onClick={() => onRun(s.id)} disabled={!!blocked} aria-describedby={blocked ? `edge-${s.id}-why` : undefined}>
                  <Icon name={lastRun === s.id ? 'reset' : 'play'} size={14} />
                  {lastRun === s.id ? 'Run again' : 'Run'}
                </button>
                {blocked && (
                  <span className="edge__why" id={`edge-${s.id}-why`}>
                    {blocked}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
