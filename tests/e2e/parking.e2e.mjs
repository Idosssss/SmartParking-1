// Browser test: parked cars at the real-sensor spot, and dragging / moving the real sensor (regression tests).
// Needs the dev server: npm run dev, then npm run test:e2e
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env.E2E_URL ?? 'http://localhost:5173/#/demo';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9335;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--window-size=1500,1300', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const call = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails)); return r.result.value; };
const shot = async (name) => { const r = await call('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(tmpdir(), name), Buffer.from(r.data, 'base64')); };
let targets; for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(300); } }
ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); if (d.error) p.rej(new Error(JSON.stringify(d.error))); else p.res(d.result); } };

const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const CELL = 56, PAD = 28;
const tagCenter = (r, c) => [PAD + c * CELL + CELL - 28 - 3 + 14, PAD + r * CELL + 2 + 7.5];
const spotCenter = (r, c) => [PAD + c * CELL + CELL / 2, PAD + r * CELL + CELL / 2];

const canvasOrigin = () => evaluate('(() => { const r = document.querySelector(".lot-card canvas").getBoundingClientRect(); return [r.left, r.top]; })()');
async function drag([fx, fy], [tx, ty]) {
  const [ox, oy] = await canvasOrigin();
  const at = (x, y) => ({ x: ox + x, y: oy + y });
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at(fx, fy) });
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...at(fx, fy) });
  for (let i = 1; i <= 8; i++) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, ...at(fx + ((tx - fx) * i) / 8, fy + ((ty - fy) * i) / 8) });
    await sleep(16);
  }
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...at(tx, ty) });
  await sleep(300);
}
const realSpot = () => evaluate('document.querySelector(".hw__spot-picker select").value');
const freeSpots = () => evaluate('Number(document.querySelector(".kpi .kpi__value").firstChild.textContent)');
const phone = () => evaluate('document.querySelector(".phone").innerText');

async function load(withBoard) {
  await call('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await call('Page.navigate', { url: URL_ });
  await sleep(2200);
  if (withBoard) {
    await evaluate(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("Connect Arduino")).click()`);
    await sleep(1200);
  }
}

async function parkRealCar() {
  await evaluate('Object.assign(window.__dev, { entrance: 9, car: true })');
  await sleep(700);
  await evaluate('Object.assign(window.__dev, { entrance: 80, car: false })');
  for (let i = 0; i < 40 && !/Pull into Spot/.test(await phone()); i++) await sleep(250);
  await evaluate('Object.assign(window.__dev, { spot: 8, taken: true })');
}

try {
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1300, deviceScaleFactor: 1, mobile: false });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(join(HERE, 'fake-board.js'), 'utf8') });

  // 1. Dragging while idle, no board
  await load(false);
  check('starts on S25', (await realSpot()) === 'S25');
  await drag(tagCenter(6, 1), spotCenter(6, 4));
  check('dragging the HW tag moves the real sensor (idle)', (await realSpot()) === 'S28', await realSpot());
  await drag(spotCenter(6, 4), spotCenter(6, 6));
  check('grabbing the whole HW spot and dragging also works', (await realSpot()) === 'S30', await realSpot());
  await evaluate(`(() => { const s = document.querySelector(".hw__spot-picker select"); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "S25"); s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await sleep(300);
  check('the picker moves the real sensor too', (await realSpot()) === 'S25', await realSpot());
  check('a short click on a normal spot still toggles it', await (async () => {
    const before = await freeSpots();
    const [ox, oy] = await canvasOrigin();
    const [x, y] = spotCenter(0, 1);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x: ox + x, y: oy + y });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: ox + x, y: oy + y });
    await sleep(300);
    return (await freeSpots()) === before - 1;
  })());

  // 2. The parked car survives a sensor flicker right after parking (the reported bug)
  await load(true);
  await parkRealCar();
  await sleep(250);
  await evaluate('Object.assign(window.__dev, { spot: 80, taken: false })'); // hand / toy car moved away immediately
  await sleep(2500);
  check('car parked at S25 stays parked after an immediate "open" reading', (await freeSpots()) === 31, `free=${await freeSpots()}`);
  check('the real sensor moved on to S26', (await realSpot()) === 'S26', await realSpot());
  await shot('regress-1-flicker.png');

  // 3. After the car has arrived (phone shows "You've arrived"), dragging still works and S25 stays
  check('phone shows the arrival', /arrived/i.test(await phone()));
  await drag(tagCenter(6, 2), spotCenter(6, 5));
  check('dragging works after a car has arrived', (await realSpot()) === 'S29', await realSpot());
  check('moving the sensor never frees the parked car at S25', (await freeSpots()) === 31, `free=${await freeSpots()}`);

  // 4. A second real car parks at the new spot; both stay
  await evaluate('Object.assign(window.__dev, { spot: 80, taken: false })');
  await sleep(600);
  await parkRealCar();
  await sleep(2500);
  await evaluate('Object.assign(window.__dev, { spot: 80, taken: false })');
  await sleep(1500);
  check('second car parked at S29, both cars stay (30 free)', (await freeSpots()) === 30, `free=${await freeSpots()}`);
  await shot('regress-2-two-cars.png');

  // The session panel counts both guided cars and both sensor confirmations.
  const session = await evaluate('document.querySelector(".session__stats")?.innerText.replace(/\\s+/g, " ") ?? ""');
  check('the session panel counts the guided cars', /Cars guided 2\b/.test(session) && /Sensor confirmed 2\b/.test(session), session);

  // 5. The board drops off the USB: parked cars stay parked
  await evaluate('window.__dev.mute = true');
  await sleep(3500);
  check('a silent board does not free real parked cars', (await freeSpots()) === 30, `free=${await freeSpots()}`);
} catch (e) {
  console.log('ERROR', e.message); results.push(false);
} finally {
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length} checks, ${failed} failed`);
  chrome.kill(); process.exit(failed ? 1 : 0);
}
