import { useState } from 'react';
import { SENSOR_FAR_CM, THRESHOLD_MAX_CM, THRESHOLD_MIN_CM } from '../config/constants';
import type { Hardware } from '../hardware/useHardware';
import './HardwarePanel.css';

const MAX_CM = SENSOR_FAR_CM;

interface HardwarePanelProps {
  hw: Hardware;
  spotId: string;
  waitingToRearm: boolean;
  preferRealSpot: boolean;
  onPreferRealSpot: (value: boolean) => void;
  /** Spots the real sensor may move to (the free ones), for moving it without dragging. */
  movableSpotIds: string[];
  canMoveSpot: boolean;
  onMoveSpot: (spotId: string) => void;
}

function SensorRow({
  label,
  pin,
  cm,
  thresholdCm,
  detected,
  detectedText,
  clearText,
  fault,
}: {
  label: string;
  pin: string;
  cm: number | null;
  thresholdCm: number;
  detected: boolean;
  detectedText: string;
  clearText: string;
  fault?: string;
}) {
  const pct = cm === null ? 0 : Math.min(cm / MAX_CM, 1) * 100;
  return (
    <div className="hw__sensor">
      <div className="hw__sensor-top">
        <span className="hw__sensor-label">
          {label} <span className="hw__pin">{pin}</span>
        </span>
        {fault && fault !== 'none' ? (
          <span className="hw__chip hw__chip--fault">FAULT</span>
        ) : (
          <span className={`hw__chip ${detected ? 'hw__chip--on' : ''}`}>{cm === null ? '—' : detected ? detectedText : clearText}</span>
        )}
      </div>
      <div className="hw__bar">
        <div className="hw__bar-fill" style={{ width: `${pct}%` }} />
        <div className="hw__bar-threshold" style={{ left: `${(thresholdCm / MAX_CM) * 100}%` }} />
      </div>
      <div className="hw__sensor-bottom">
        <span>{cm === null ? 'no data' : `${cm.toFixed(1)} cm`}</span>
        <span>trigger &lt; {thresholdCm} cm</span>
      </div>
    </div>
  );
}

function TechnicianPanel({ hw }: { hw: Hardware }) {
  const { device } = hw;
  const [brightness, setBrightness] = useState(device.config?.brightness ?? 40);
  const [showRaw, setShowRaw] = useState(false);
  return (
    <details className="hw__emulator">
      <summary>Board settings and technician view</summary>
      <p className="hw__note">
        Board state: <strong>{device.state ?? '…'}</strong>
        {device.wifi && device.wifi !== 'off' ? ` · WiFi ${device.wifi}` : ''}
      </p>
      <label className="hw__switch-row">
        <span>Mock mode (generated sensor data)</span>
        <input type="checkbox" checked={device.mock} onChange={(e) => void device.setMock(e.target.checked)} aria-label="Mock mode" />
      </label>
      <div className="hw__actions">
        <button className="hw__button hw__button--ghost" onClick={() => void device.calibrate('spot')}>
          Calibrate spot sensor
        </button>
        <button className="hw__button hw__button--ghost" onClick={() => void device.calibrate('entrance')}>
          Calibrate entrance sensor
        </button>
      </div>
      <p className="hw__note">To calibrate, put the car (or a toy car) where it normally stops, then press the button. The trigger distance is set automatically and saved on the board.</p>
      <div className="hw__tuning">
        <label>
          LED brightness: {brightness}
          <input
            type="range"
            min={0}
            max={120}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            onMouseUp={() => void device.setBrightness(brightness)}
            onTouchEnd={() => void device.setBrightness(brightness)}
            onKeyUp={() => void device.setBrightness(brightness)}
            aria-label="LED brightness"
          />
        </label>
      </div>
      <div className="hw__actions">
        <button className="hw__button hw__button--ghost" onClick={() => void device.factoryReset()}>
          Restore board defaults
        </button>
      </div>
      {device.lastReply && <p className="hw__note">{device.lastReply}</p>}
      <label className="hw__switch-row">
        <span>Show raw data from the board</span>
        <input
          type="checkbox"
          checked={showRaw}
          onChange={(e) => {
            setShowRaw(e.target.checked);
            void device.setDebug(e.target.checked);
          }}
          aria-label="Show raw data"
        />
      </label>
      {showRaw && <pre className="hw__raw">{device.log.length ? device.log.join('\n') : 'waiting for data…'}</pre>}
    </details>
  );
}

export default function HardwarePanel({ hw, spotId, waitingToRearm, preferRealSpot, onPreferRealSpot, movableSpotIds, canMoveSpot, onMoveSpot }: HardwarePanelProps) {
  const { serial, emulator } = hw;
  const connected = serial.status === 'connected';
  const busy = serial.status === 'connecting';

  const statusText = connected ? 'Board connected' : hw.source === 'emulator' ? 'Emulating sensors' : 'Not connected';
  const statusClass = connected ? 'hw__status--live' : hw.source === 'emulator' ? 'hw__status--emu' : '';

  return (
    <div className="hw">
      <div className="hw__header">
        <h2 className="hw__title">Hardware</h2>
        <span className={`hw__status ${statusClass}`}>
          <span className="hw__status-dot" />
          {statusText}
        </span>
      </div>

      <div className="hw__body">
        {serial.supported ? (
          <button
            className={`hw__button ${connected ? 'hw__button--ghost' : ''}`}
            onClick={connected ? serial.disconnect : serial.connect}
            disabled={busy}
          >
            {connected ? 'Disconnect Arduino' : busy ? 'Connecting…' : 'Connect Arduino'}
          </button>
        ) : (
          <p className="hw__note">USB connection needs Chrome or Edge on a computer. You can still try the emulator below.</p>
        )}
        {serial.error && <p className="hw__error">{serial.error}</p>}
        {connected && hw.device.stale && (
          <p className="hw__error" role="alert">
            Board not responding: no data for a few seconds. Detection is paused until it is back. Check the cable, or press the board's reset button.
          </p>
        )}

        <label className="hw__spot-picker">
          <span>Real sensor spot</span>
          <select
            value={spotId}
            disabled={!canMoveSpot}
            onChange={(e) => onMoveSpot(e.target.value)}
            aria-describedby="hw-spot-help"
          >
            {[spotId, ...movableSpotIds.filter((id) => id !== spotId)]
              .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
              .map((id) => (
                <option key={id} value={id}>
                  Spot {id}
                </option>
              ))}
          </select>
        </label>
        <p className="hw__note hw__note--tight" id="hw-spot-help">
          {canMoveSpot ? 'Or drag the HW tag on the map.' : 'Locked while a car is on its way to a spot.'}
        </p>

        {hw.active && (
          <>
            {waitingToRearm && (
              <p className="hw__rearm">
                Move the real sensor to <strong>Spot {spotId}</strong> and clear it. Waiting for the sensor to read open.
              </p>
            )}
            <SensorRow
              label="Entrance"
              pin="D34"
              cm={hw.reading?.entranceCm ?? null}
              thresholdCm={hw.entranceThresholdCm}
              detected={hw.entranceDetected}
              detectedText="CAR"
              clearText="clear"
              fault={hw.device.faultEntrance}
            />
            <SensorRow
              label={`Spot ${spotId}`}
              pin="D35"
              cm={hw.reading?.spotCm ?? null}
              thresholdCm={hw.spotThresholdCm}
              detected={hw.spotOccupied}
              detectedText="TAKEN"
              clearText="open"
              fault={hw.device.faultSpot}
            />
            {(hw.device.faultEntrance !== 'none' || hw.device.faultSpot !== 'none') && (
              <p className="hw__error" role="alert">
                A sensor looks broken ({hw.device.faultEntrance !== 'none' ? `entrance: ${hw.device.faultEntrance.replace('_', ' ')}` : `spot: ${hw.device.faultSpot.replace('_', ' ')}`}). Check its wires. Its readings are ignored.
              </p>
            )}
            {hw.device.mock && <p className="hw__note">Mock mode: the board is generating this data, no sensors are being read.</p>}
            <label className="hw__switch-row">
              <span>Send cars to Spot {spotId}</span>
              <input
                type="checkbox"
                checked={preferRealSpot}
                onChange={(e) => onPreferRealSpot(e.target.checked)}
                aria-label={`Send cars to the real spot ${spotId}`}
              />
            </label>
            <p className="hw__note hw__note--tight">
              Test mode: new cars head for the real spot while it's free. Drag the HW tag on the lot to move it.
            </p>
            <div className="hw__tuning">
              <label>
                Entrance trigger: {hw.entranceThresholdCm} cm
                <input
                  type="range"
                  min={THRESHOLD_MIN_CM}
                  max={THRESHOLD_MAX_CM}
                  value={hw.entranceThresholdCm}
                  onChange={(e) => hw.setEntranceThresholdCm(Number(e.target.value))}
                />
              </label>
              <label>
                Spot trigger: {hw.spotThresholdCm} cm
                <input
                  type="range"
                  min={THRESHOLD_MIN_CM}
                  max={THRESHOLD_MAX_CM}
                  value={hw.spotThresholdCm}
                  onChange={(e) => hw.setSpotThresholdCm(Number(e.target.value))}
                />
              </label>
            </div>
            {hw.device.smart && <TechnicianPanel hw={hw} />}
          </>
        )}

        {!connected && (
          <details className="hw__emulator" open={emulator.on}>
            <summary>No board? Emulate the sensors</summary>
            <label className="hw__switch-row">
              <span>Emulator on</span>
              <input
                type="checkbox"
                checked={emulator.on}
                onChange={(e) => emulator.setOn(e.target.checked)}
                aria-label="Emulator on"
              />
            </label>
            {emulator.on && (
              <div className="hw__tuning">
                <label>
                  Entrance distance: {emulator.entranceCm} cm
                  <input
                    type="range"
                    min={3}
                    max={80}
                    value={emulator.entranceCm}
                    onChange={(e) => emulator.setEntranceCm(Number(e.target.value))}
                    aria-label="Emulated entrance distance"
                  />
                </label>
                <label>
                  Spot distance: {emulator.spotCm} cm
                  <input
                    type="range"
                    min={3}
                    max={80}
                    value={emulator.spotCm}
                    onChange={(e) => emulator.setSpotCm(Number(e.target.value))}
                    aria-label="Emulated spot distance"
                  />
                </label>
                <p className="hw__note">Slide below the trigger distance to put a "car" in front of a sensor.</p>
              </div>
            )}
          </details>
        )}
      </div>
    </div>
  );
}
