// Browser test: the demo settings, roadwork lane closures, the line at the gate, and every edge-case button.
// Needs the dev server: npm run dev, then npm run test:e2e
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env.E2E_URL ?? 'http://localhost:5173/#/demo';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9345;
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
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : extra}`); };
const CELL = 56, PAD = 28;

const phone = () => evaluate('document.querySelector(".phone").innerText.replace(/\\s+/g, " ")');
const feed = () => evaluate('document.querySelector(".activity").innerText.replace(/\\s+/g, " ")');
const freeKpi = () => evaluate('document.querySelector(".kpi").innerText.replace(/\\s+/g, " ")');
const guided = () => evaluate('Number(document.querySelector(".session__stats dd").textContent)');
const run = (title) => evaluate(`[...document.querySelectorAll(".edge__card")].find((c) => c.querySelector("h3").textContent === ${JSON.stringify(title)}).querySelector("button").click()`);
const openSettings = () => evaluate('document.querySelector(".dset__panel") || document.querySelector(".dset__toggle").click()');
const choose = (group, option) =>
  evaluate(`[...document.querySelectorAll(".dset__field")].find((f) => f.querySelector(".dset__label").textContent === ${JSON.stringify(group)}).querySelector('[role=radio][data-value=${JSON.stringify(option)}]').click()`);
const chosen = (group) =>
  evaluate(`[...document.querySelectorAll(".dset__field")].find((f) => f.querySelector(".dset__label").textContent === ${JSON.stringify(group)}).querySelector('[aria-checked=true]').dataset.value`);
async function until(test, ms = 15000) {
  for (let t = 0; t < ms; t += 250) { if (await test()) return true; await sleep(250); }
  return false;
}
async function clickCell(row, col) {
  const [ox, oy] = await evaluate('(() => { const r = document.querySelector(".lot-card canvas").getBoundingClientRect(); return [r.left, r.top]; })()');
  const x = ox + PAD + col * CELL + CELL / 2, y = oy + PAD + row * CELL + CELL / 2;
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x, y });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x, y });
  await sleep(300);
}
async function load() {
  await call('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await call('Page.navigate', { url: URL_ });
  await sleep(2000);
}

try {
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1300, deviceScaleFactor: 1, mobile: false });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(join(HERE, 'fake-board.js'), 'utf8') });

  // 1. Settings: change them, and they are still there after a reload.
  await load();
  await evaluate('localStorage.removeItem("smartparking.demo.v1")');
  await load();
  await openSettings();
  check('the settings panel opens with the defaults', (await chosen('Traffic')) === 'normal' && (await chosen('Driving speed')) === 'normal');
  await choose('Driving speed', 'fast');
  await choose('Drivers without the app take your spot', 'off');
  await load();
  await openSettings();
  check('settings are remembered after a reload', (await chosen('Driving speed')) === 'fast' && (await chosen('Drivers without the app take your spot')) === 'off');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(200);
  check('Escape closes the settings panel', !(await evaluate('!!document.querySelector(".dset__panel")')));

  // 2. Clicking a lane closes it for roadwork, clicking again opens it.
  await clickCell(5, 4);
  check('clicking a lane closes it', /Roadwork: the bottom aisle at column 5 is closed/.test(await feed()));
  check('spots cut off by the closure are counted', /5 behind roadwork/.test(await freeKpi()), await freeKpi());
  await clickCell(5, 4);
  check('clicking it again opens it', /The bottom aisle at column 5 is open again/.test(await feed()) && !/behind roadwork/.test(await freeKpi()));

  // 3. Roadwork: the car goes around to the one spot it can reach.
  await run('Roadwork in an aisle');
  check('roadwork: the car is sent around to S14', await until(async () => /Heading to Spot S14/.test(await phone())), await phone());
  check('roadwork: the spot behind the barrier is reported', /1 behind roadwork/.test(await freeKpi()));
  check('roadwork: the spot behind the barrier is never offered', await evaluate('!document.querySelector(".phone").innerText.includes("S22")'));

  // 4. Free spots but no way in: the car waits, reopening the lane lets it in.
  await run('Free spots, no way in');
  await sleep(400);
  check('no way in: the phone says so and one car waits', /1 car waiting at the gate: no way in/.test(await phone()) && /No Way In/.test(await phone()), await phone());
  await sleep(1500);
  check('no way in: the waiting car is not sent anywhere', !/Heading to/.test(await phone()));
  await clickCell(3, 0);
  check('no way in: reopening the lane lets the waiting car drive in', await until(async () => /Heading to Spot S9/.test(await phone())), await phone());
  await shot('scenario-no-way-in.png');

  // 5. Lot full: the car waits at the gate and is guided when a driver leaves.
  await run('Lot full');
  await sleep(400);
  check('lot full: the car waits at the gate', /1 car waiting at the gate for a free spot/.test(await phone()) && /Lot Full/.test(await phone()), await phone());
  check('lot full: it is guided to the spot that frees up', await until(async () => /Heading to Spot S28|Parked at Spot S28/.test(await phone() + (await feed()))), await phone());

  // 6. Someone takes your spot: the phone reroutes.
  await run('Someone takes your spot');
  check('stolen spot: the car is rerouted', await until(async () => /was just taken — rerouting to/.test(await feed())), await feed());

  // 7. Three cars: each is guided in turn.
  const before = await guided();
  await run('Three cars at once');
  await sleep(500);
  check('three cars: nobody waits at the gate', !/waiting at the gate/.test(await phone()), await phone());
  const heldFor = async () => [...(await feed()).matchAll(/app driver is guided to Spot (S\d+)/g)].map((m) => m[1]);
  check('three cars: the other two are guided at the same time, to held spots', (await until(async () => (await heldFor()).length >= 2, 4000)), JSON.stringify(await heldFor()));
  check('three cars: all three are guided and parked', await until(async () => (await guided()) === before + 3, 30000), `guided=${await guided()}`);
  const yours = (await feed()).match(/Routing you to Spot (S\d+)/)?.[1];
  const spots = [...(await heldFor()).slice(0, 2), yours];
  check('three cars: three different spots (a held spot is never offered twice)', new Set(spots).size === 3 && !spots.includes(undefined), JSON.stringify(spots));

  // 8. A noisy reading is not a car.
  await run('Noisy sensor reading');
  check('glitch: one close reading is ignored', await until(async () => /One reading is not a car/.test(await feed()), 6000), await feed());
  check('glitch: no car was sent', !/Heading to|Car detected/.test(await phone()));

  // 9. Changing speed during a drive keeps the car where it is.
  await run('One spot left');
  await until(async () => /Heading to Spot S8/.test(await phone()));
  await sleep(1200);
  const metres = async () => Number((await evaluate('document.querySelector(".phone__target-eta").textContent')).split(' ')[0]);
  const m1 = await metres();
  await openSettings();
  await choose('Driving speed', 'slow');
  const m2 = await metres();
  check('a new speed does not move the car', Math.abs(m1 - m2) <= 4, `${m1} m -> ${m2} m`);
  await choose('Driving speed', 'fast');

  // 10. E empties the lot.
  await evaluate('document.querySelector(".dset__toggle").click()');
  await run('Roadwork in an aisle');
  await sleep(300);
  await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }))');
  await sleep(500);
  check('E empties the lot and opens every lane', /32 of 32/.test(await freeKpi()) && !/behind roadwork/.test(await freeKpi()), await freeKpi());

  // 11. The line at the gate never grows past five cars.
  await run('Lot full');
  for (let i = 0; i < 6; i++) await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }))');
  await sleep(300);
  check('the line at the gate stops at five cars', /5 cars waiting/.test(await phone()) && /line at the gate is full/.test(await feed()), await phone());

  // 12. Spoken directions: every step of the drive is read once, in order (the speech engine is replaced by a recorder).
  await evaluate('window.__said = []; speechSynthesis.speak = (u) => window.__said.push(u.text); speechSynthesis.cancel = () => {}');
  await openSettings();
  await evaluate('document.querySelector(".dset__switch input").click()');
  await evaluate('document.querySelector(".dset__toggle").click()');
  await run('Roadwork in an aisle');
  await until(async () => /You've arrived/.test(await phone()), 20000);
  const said = await evaluate('window.__said');
  const steps = ['Go straight for 6 spaces', 'Turn right', 'Go straight for 6 spaces', 'Turn right', 'Go straight for 1 space', 'Arrived — park at Spot S14'];
  check('spoken directions read every step once, in order', JSON.stringify(said) === JSON.stringify(steps), JSON.stringify(said));
  await openSettings();
  await evaluate('document.querySelector(".dset__quiet").click()');
} catch (e) {
  console.log('ERROR', e.message); results.push(false);
} finally {
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length} checks, ${failed} failed`);
  chrome.kill(); process.exit(failed ? 1 : 0);
}
