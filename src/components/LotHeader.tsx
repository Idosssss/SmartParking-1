import './LotHeader.css';

interface LotHeaderProps {
  free: number;
  total: number;
  liveTraffic: boolean;
  onToggleLiveTraffic: (v: boolean) => void;
  boardLabel: string;
  boardTone: 'positive' | 'neutral';
  realSpotId: string;
  hardwareActive: boolean;
  realSpotState: 'offline' | 'open' | 'taken';
}

const SPOT_STATE_TEXT = { offline: 'Sensor not connected', open: 'Sensor reads open', taken: 'Sensor reads taken' } as const;

/** The title row and the four numbers that say how the lot is doing right now. */
export default function LotHeader({ free, total, liveTraffic, onToggleLiveTraffic, boardLabel, boardTone, realSpotId, hardwareActive, realSpotState }: LotHeaderProps) {
  const occupied = total - free;
  const pct = total === 0 ? 0 : Math.round((occupied / total) * 100);

  return (
    <>
      <header className="page-head">
        <div className="page-head__main">
          <div className="page-head__title">
            <h1>Live demo</h1>
            <span className={`pill ${boardTone === 'positive' ? 'pill--positive' : ''}`}>
              <span className="pill__dot" />
              {boardLabel}
            </span>
          </div>
          <p className="page-head__sub">
            {hardwareActive
              ? `Spot ${realSpotId} follows the real sensor. A car parked there stays parked and the sensor moves on to the next spot.`
              : `Everything here is simulated. Connect the board to drive spot ${realSpotId} with the real sensors.`}
          </p>
        </div>
        <button className="switch-row" role="switch" aria-checked={liveTraffic} onClick={() => onToggleLiveTraffic(!liveTraffic)}>
          <span>Live traffic</span>
          <span className={`switch ${liveTraffic ? 'switch--on' : ''}`} aria-hidden="true">
            <span className="switch__knob" />
          </span>
        </button>
      </header>

      <section className="kpis" aria-label="Lot status">
        <div className="kpi">
          <span className="kpi__label">Free spots</span>
          <span className="kpi__value">
            <span className="kpi__num" key={free}>
              {free}
            </span>
            <span className="kpi__unit"> of {total}</span>
          </span>
        </div>
        <div className="kpi">
          <span className="kpi__label">Occupied</span>
          <span className="kpi__value">
            <span className="kpi__num" key={occupied}>
              {occupied}
            </span>
          </span>
        </div>
        <div className="kpi">
          <span className="kpi__label">Occupancy</span>
          <span className="kpi__value">
            <span className="kpi__num" key={pct}>
              {pct}
            </span>
            <span className="kpi__unit">%</span>
          </span>
        </div>
        <div className="kpi">
          <span className="kpi__label">Real sensor spot</span>
          <span className="kpi__value">
            <span className="kpi__num" key={realSpotId}>
              {realSpotId}
            </span>
            <span className={`kpi__unit kpi__unit--small kpi__state--${realSpotState}`}> {SPOT_STATE_TEXT[realSpotState]}</span>
          </span>
        </div>
      </section>
    </>
  );
}
