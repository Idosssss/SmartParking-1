// Browser test: the web app against a simulated board (connection, silent board, sensor fault, technician panel).
// Needs the dev server: npm run dev, then npm run test:e2e
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env.E2E_URL ?? 'http://localhost:5173/#/demo';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9333;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--window-size=1500,1500', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0;
const pending = new Map();
const call = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails));
  return r.result.value;
};
const shot = async (name) => {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(tmpdir(), name), Buffer.from(r.data, 'base64'));
};

let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(300); }
}
const page = targets.find((t) => t.type === 'page');
ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); if (d.error) p.rej(new Error(JSON.stringify(d.error))); else p.res(d.result); } };

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

try {
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1400, deviceScaleFactor: 1, mobile: false });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(join(HERE, 'fake-board.js'), 'utf8') });
  await call('Page.navigate', { url: URL_ });
  await sleep(2500);

  const text = () => evaluate('document.querySelector(".hw")?.innerText ?? ""');
  const click = (label) => evaluate(`[...document.querySelectorAll("button")].find(b => b.textContent.includes(${JSON.stringify(label)}))?.click() ?? false`);

  check('Connect button is shown when Web Serial exists', (await text()).includes('Connect Arduino'));
  await click('Connect Arduino');
  await sleep(1500);
  let t = await text();
  check('connects and shows the board as connected', t.includes('Board connected'));
  check('shows entrance and spot sensor rows', t.includes('Entrance') && t.includes('Spot S25'));
  check('asks the board for its settings (GET sent)', (await evaluate('window.__dev.written.includes("GET")')) === true);

  // the board decides a car arrived -> the phone flow starts
  await evaluate('Object.assign(window.__dev, { entrance: 9, car: true })');
  await sleep(1500);
  const phone = await evaluate('document.body.innerText');
  check('a car reported by the board starts the detection flow', /CAR DETECTED|Finding|Spot S25|HEADING/i.test(phone));
  await evaluate('Object.assign(window.__dev, { entrance: 80, car: false })');
  await shot('1-connected.png');

  // the live trace plots what the board sends
  const trace = await evaluate(`(() => {
    const lines = document.querySelectorAll('.trace__line');
    return { lines: lines.length, points: lines[0]?.getAttribute('points')?.split(' ').length ?? 0, text: document.querySelector('.trace')?.innerText ?? '' };
  })()`);
  check('the live sensor trace draws both sensors', trace.lines === 2 && trace.points > 5, `${trace.points} points`);
  check('the trace shows the current distances', /Entrance D34\s*[\d.]+ cm/.test(trace.text) && /Spot D35\s*[\d.]+ cm/.test(trace.text));

  // the board goes silent
  await evaluate('window.__dev.mute = true');
  await sleep(3500);
  t = await text();
  check('a silent board shows a "not responding" warning', /Board not responding/.test(t));
  check('the activity feed says so', (await evaluate('document.body.innerText')).includes('stopped sending data'));
  await shot('2-silent.png');
  await evaluate('window.__dev.mute = false');
  await sleep(1200);
  t = await text();
  check('the warning clears when data returns', !/Board not responding/.test(t));

  // a sensor fault
  await evaluate('Object.assign(window.__dev, { state: "SENSOR_FAULT", faultE: "no_signal", car: true })');
  await sleep(1000);
  t = await text();
  check('a faulty sensor is flagged', /FAULT/.test(t) && /A sensor looks broken/.test(t));
  check('a faulty sensor never counts as a detected car', !/\nCAR\n/.test(t));
  await shot('3-fault.png');
  await evaluate('Object.assign(window.__dev, { state: "RUNNING", faultE: "none", car: false })');
  await sleep(800);

  // technician panel
  await evaluate('[...document.querySelectorAll("details")].find(d => d.textContent.includes("technician")).open = true');
  await sleep(300);
  t = await text();
  check('technician panel shows the board state', /Board state:\s*RUNNING/.test(t));
  await click('Calibrate spot sensor');
  await sleep(1500);
  t = await text();
  check('calibration reply is shown', /calibrated/.test(t));
  check('the trigger slider follows the calibrated value', /Spot trigger: 16 cm/.test(t));
  await evaluate('[...document.querySelectorAll("input[aria-label=\\"Mock mode\\"]")][0].click()');
  await sleep(800);
  check('mock mode is switched on over serial', (await evaluate('window.__dev.mock')) === true);
  t = await text();
  check('mock mode is shown to the user', /Mock mode: the board is generating/.test(t));
  await evaluate('window.__dev.mock = false');
  await shot('4-technician.png');

  // slider sends a command to the board
  await evaluate('window.__dev.written.length = 0');
  const sent = await evaluate(`(async () => {
    const el = document.querySelector('input[type=range][min="5"][max="60"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '22'); el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    return window.__dev.written.join('|');
  })()`);
  check('moving a trigger slider sends SET to the board', /SET (ENTRANCE|SPOT)_CM 22/.test(sent), sent);

  // the frame: theme switch and the overview page
  await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }))');
  const theme1 = await evaluate('document.documentElement.dataset.theme');
  await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }))');
  const theme2 = await evaluate('document.documentElement.dataset.theme');
  check('D switches between the dark and light theme', theme1 !== theme2 && ['dark', 'light'].includes(theme1), `${theme1} -> ${theme2}`);
  await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }))');
  await sleep(600);
  const overview = await evaluate('document.querySelector(".ov")?.innerText ?? ""');
  check('key 1 opens the overview page', /How the pieces talk/.test(overview));
  check('the board stays connected while another page is open', /Board connected/.test(await text()));
  await evaluate('window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }))');
  await sleep(400);

  // disconnect
  await click('Disconnect Arduino');
  await sleep(800);
  t = await text();
  check('disconnect returns to the not-connected state', /Not connected/.test(t));
} catch (e) {
  console.log('ERROR', e.message);
  results.push({ name: 'script', ok: false });
} finally {
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length} checks, ${failed} failed`);
  chrome.kill();
  process.exit(failed ? 1 : 0);
}
