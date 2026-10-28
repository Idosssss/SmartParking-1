import type { DirectionStep } from '../lot/directions';
import Icon from './Icons';
import './PhoneApp.css';

export type NavStatus = 'idle' | 'detecting' | 'searching' | 'navigating' | 'arrived';

interface PhoneAppProps {
  status: NavStatus;
  targetSpotId: string | null;
  steps: DirectionStep[];
  currentStepIndex: number;
  freeCount: number;
  /** Free spots a car can actually reach (a closed lane can cut some off). */
  reachableFree: number;
  totalCount: number;
  /** Cars waiting at the gate behind this one. */
  queue: number;
  remainingMeters: number;
  remainingSeconds: number;
  rerouteNotice: string | null;
  hardwareActive: boolean;
  waitingForSensor: boolean;
  onFindSpot: () => void;
  onReset: () => void;
}

export default function PhoneApp({
  status,
  targetSpotId,
  steps,
  currentStepIndex,
  freeCount,
  reachableFree,
  totalCount,
  queue,
  remainingMeters,
  remainingSeconds,
  rerouteNotice,
  hardwareActive,
  waitingForSensor,
  onFindSpot,
  onReset,
}: PhoneAppProps) {
  return (
    <div className="phone">
      <div className="phone__notch" />
      <div className="phone__statusbar">
        <span>9:41</span>
        <span className="phone__statusbar-icons" aria-hidden="true">
          <i className="phone__bars" />
          <i className="phone__battery" />
        </span>
      </div>

      <div className="phone__screen">
        <div className="phone__app-header">
          <div className="phone__app-title">Smart Parking</div>
          <div className="phone__app-subtitle">
            {freeCount} of {totalCount} spots free
          </div>
        </div>

        {queue > 0 && (
          <div className="phone__queue" role="status">
            <Icon name="queue" size={14} />
            {queue === 1 ? '1 car' : `${queue} cars`} waiting at the gate
            {reachableFree === 0 ? (freeCount === 0 ? ' for a free spot' : ': no way in to the free spots') : ''}
          </div>
        )}

        {status === 'idle' && (
          <div className="phone__panel phone__panel--center">
            <div className="phone__pin"><Icon name="pin" size={28} /></div>
            {hardwareActive && (
              <p className="phone__hint">Listening to the entrance sensor. Drive up to the lot entrance.</p>
            )}
            <button className="phone__button" onClick={onFindSpot} disabled={reachableFree === 0}>
              {freeCount === 0 ? 'Lot Full' : reachableFree === 0 ? 'No Way In' : 'Simulate Car Arrival'}
            </button>
            {freeCount > 0 && reachableFree === 0 && <p className="phone__hint">Every way to the free spots is closed. Reopen a lane on the map.</p>}
          </div>
        )}

        {status === 'detecting' && (
          <div className="phone__panel phone__panel--center">
            <div className="phone__pin phone__pin--pulse"><Icon name="car" size={30} /></div>
            <p className="phone__hint phone__hint--strong phone__hint--pulse">Car detected</p>
          </div>
        )}

        {status === 'searching' && (
          <div className="phone__panel phone__panel--center">
            <div className="phone__spinner" />
            <p className="phone__hint">Finding nearest spot…</p>
          </div>
        )}

        {status === 'navigating' && targetSpotId && (
          <div className="phone__panel">
            {rerouteNotice && <div className="phone__reroute">
                <Icon name="warning" size={14} />
                {rerouteNotice}
              </div>}
            {waitingForSensor && (
              <div className="phone__waiting">
                <Icon name="signal" size={14} />
                Pull into Spot {targetSpotId}. Waiting for the spot sensor to confirm.
              </div>
            )}
            <div className="phone__target">
              <span className="phone__target-label">Heading to</span>
              <span className="phone__target-spot">Spot {targetSpotId}</span>
              <span className="phone__target-eta num">
                {waitingForSensor ? 'At the spot' : `${remainingMeters} m · about ${remainingSeconds} s`}
              </span>
            </div>
            <ol className="phone__steps">
              {steps.map((step, i) => (
                <li
                  key={i}
                  className={
                    i === currentStepIndex
                      ? 'phone__step phone__step--active'
                      : i < currentStepIndex
                        ? 'phone__step phone__step--done'
                        : 'phone__step'
                  }
                >
                  {step.text}
                </li>
              ))}
            </ol>
            <button className="phone__button phone__button--ghost" onClick={onReset}>
              Cancel
            </button>
          </div>
        )}

        {status === 'arrived' && targetSpotId && (
          <div className="phone__panel phone__panel--center">
            <div className="phone__check">
              <Icon name="check" size={26} />
            </div>
            <p className="phone__hint phone__hint--strong">You've arrived!</p>
            <p className="phone__hint">Parked at Spot {targetSpotId}</p>
            <button className="phone__button" onClick={onReset}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
