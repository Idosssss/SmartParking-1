/**
 * Builds the PDF report from public/simulation-results.json (written by `npm run simulate`).
 * The numbers in the PDF, the website and the JSON are therefore always the same ones.
 *
 *   npm run simulate:report
 *
 * Needs Google Chrome (or Edge/Chromium) to print the HTML to PDF. Set CHROME=/path/to/chrome if it is
 * not in the default macOS location.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CheckResult } from '../src/sim/checks';
import type { StudyResult } from '../src/sim/experiments';
import { generateLot } from '../src/lot/generateLot';
import { buildLotGraph } from '../src/sim/graph';
import { shareFarther, studyCharts } from '../src/sim/studyCharts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const resultsPath = resolve(root, 'public/simulation-results.json');
if (!existsSync(resultsPath)) {
  console.error('public/simulation-results.json not found. Run `npm run simulate` first.');
  process.exit(1);
}
const { study, checks } = JSON.parse(readFileSync(resultsPath, 'utf8')) as { study: StudyResult; checks: CheckResult[] };
const charts = studyCharts(study);
const logo = readFileSync(resolve(root, 'public/logo.png')).toString('base64');

const c = study.headline.comparison;
const p = c.params;
const L = p.cellMeters;
const d = study.headline.detail;
const f = (v: number, n = 1) => v.toFixed(n);
const pc = (v: number, n = 1) => `${(v * 100).toFixed(n)}%`;
const lotLo = study.lotSize[0];
const lotHi = study.lotSize[study.lotSize.length - 1];
const lot128 = study.lotSize.find((l) => l.spots === 128)!;
const peakShadow = d.shadow[d.shadow.length - 1];
const peakOcc = Math.max(...d.occupancy.map((o) => o.mean)) / study.meta.spots;
const wander = study.baselineKind[1];
const half = study.adoption.find((a) => a.x === 50)!;
const speedMs = p.speedKmh / 3.6;
const graph = buildLotGraph(generateLot());
const nearestSpotM = Math.min(...graph.fromEntrance) * L;
const farthestSpotM = Math.max(...graph.fromEntrance) * L;

/** Per 1,000 car visits, for a given saving in metres per car. */
const per1000 = (metersPerCar: number) => ({ km: metersPerCar, hours: (metersPerCar * 1000) / speedMs / 3600, co2: metersPerCar * p.co2KgPerKm });

/* ---------------------------------- static diagrams ---------------------------------- */

const architecture = `<svg viewBox="0 0 760 250" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Helvetica,Arial,sans-serif" style="width:100%">
<defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#1b6c80"/></marker></defs>
<g font-size="12" text-anchor="middle">
<rect x="6" y="14" width="150" height="62" rx="10" fill="#f5f5f7" stroke="#d1d1d6"/><text x="81" y="40" font-weight="700">Entrance IR sensor</text><text x="81" y="58" font-size="10.5" fill="#6e6e73">pin D34 · "car arrived"</text>
<rect x="6" y="94" width="150" height="62" rx="10" fill="#f5f5f7" stroke="#d1d1d6"/><text x="81" y="120" font-weight="700">Spot IR sensor</text><text x="81" y="138" font-size="10.5" fill="#6e6e73">pin D35 · "spot taken?"</text>
<rect x="6" y="174" width="150" height="62" rx="10" fill="#f5f5f7" stroke="#d1d1d6"/><text x="81" y="200" font-weight="700">LED strip</text><text x="81" y="218" font-size="10.5" fill="#6e6e73">pin D26 · green / red</text>
<rect x="204" y="62" width="130" height="126" rx="12" fill="#1d1d1f"/><text x="269" y="118" fill="#fff" font-weight="700" font-size="14">ESP32</text><text x="269" y="138" fill="#aeaeb2" font-size="10.5">reads sensors,</text><text x="269" y="152" fill="#aeaeb2" font-size="10.5">drives the LEDs</text>
<rect x="382" y="62" width="150" height="126" rx="12" fill="#e4f0f3" stroke="#1b6c80"/><text x="457" y="100" font-weight="700">Web app</text><text x="457" y="120" font-size="10.5" fill="#1d1d1f">parse → debounce</text><text x="457" y="136" font-size="10.5" fill="#1d1d1f">"car detected"</text><text x="457" y="152" font-size="10.5" fill="#1d1d1f">Dijkstra → nearest</text><text x="457" y="168" font-size="10.5" fill="#1d1d1f">free spot + route</text>
<rect x="582" y="14" width="170" height="62" rx="10" fill="#f5f5f7" stroke="#d1d1d6"/><text x="667" y="40" font-weight="700">Phone mockup</text><text x="667" y="58" font-size="10.5" fill="#6e6e73">turn-by-turn directions</text>
<rect x="582" y="94" width="170" height="62" rx="10" fill="#f5f5f7" stroke="#d1d1d6"/><text x="667" y="120" font-weight="700">Virtual lot</text><text x="667" y="138" font-size="10.5" fill="#6e6e73">live map, car + route</text>
<rect x="582" y="174" width="170" height="62" rx="10" fill="#f5f5f7" stroke="#d1d1d6"/><text x="667" y="200" font-weight="700">Simulation study</text><text x="667" y="218" font-size="10.5" fill="#6e6e73">same lot, same router</text>
</g>
<g stroke="#1b6c80" stroke-width="1.8" fill="none" marker-end="url(#ar)">
<path d="M158 45 C185 45 180 95 202 100"/><path d="M158 125 H202"/><path d="M202 150 C182 160 182 200 160 205"/>
<path d="M336 125 H380"/><path d="M534 100 C560 90 560 50 580 48"/><path d="M534 125 H580"/><path d="M534 150 C560 160 560 200 580 205"/></g>
<text x="358" y="112" font-size="10" fill="#6e6e73" text-anchor="middle">USB</text>
</svg>`;

function table(rows: (string | number)[][], head: string[], align: ('l' | 'r')[] = []): string {
  const cell = (v: string | number, i: number, tag: 'td' | 'th') => `<${tag}${align[i] === 'r' ? ' class="r"' : ''}>${v}</${tag}>`;
  return `<table><tr>${head.map((h, i) => cell(h, i, 'th')).join('')}</tr>${rows.map((r) => `<tr>${r.map((v, i) => cell(v, i, 'td')).join('')}</tr>`).join('')}</table>`;
}

const figNumbers = new Map<string, number>();
const fig = (key: string, svg: string, caption: string) => {
  const n = figNumbers.size + 1;
  figNumbers.set(key, n);
  return `<figure><div class="fig">${svg}</div><figcaption><b>Figure ${n}.</b> ${caption}</figcaption></figure>`;
};

const t1000Saved = per1000(c.savedMetersPerCar);
const t1000_128 = per1000(lot128.savedMetersPerCar);
const t1000Hi = per1000(lotHi.savedMetersPerCar);

/* -------------------------------------- the document -------------------------------------- */

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Smart Parking Lot - Simulation Study</title>
<style>
@page{size:A4;margin:16mm 16mm 18mm;@bottom-left{content:"Smart Parking Lot - Simulation Study";font:8pt -apple-system,Helvetica,Arial,sans-serif;color:#8e8e93}@bottom-right{content:counter(page) " / " counter(pages);font:8pt -apple-system,Helvetica,Arial,sans-serif;color:#8e8e93}}
:root{--blue:#1b6c80;--ink:#1d1d1f;--mute:#6e6e73;--line:#e5e5ea;--bg:#f5f5f7}
*{box-sizing:border-box}
body{margin:0;font:9.8pt/1.5 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;color:var(--ink)}
h1{font-size:25pt;line-height:1.1;margin:0 0 1.5mm;letter-spacing:-.02em}
h2{font-size:14.5pt;margin:0 0 2.5mm;padding-top:1mm;letter-spacing:-.01em;break-after:avoid}
h3{font-size:10.8pt;margin:4mm 0 1mm;break-after:avoid}
p{margin:0 0 2.4mm}
ul,ol{margin:0 0 2.6mm;padding-left:5mm}
li{margin:.8mm 0}
.page{margin-bottom:2mm}
.title{display:flex;gap:6mm;align-items:center;padding-bottom:4mm;border-bottom:2px solid var(--blue);margin-bottom:5mm}
.title img{width:24mm;height:24mm}
.title p{margin:1mm 0 0;color:var(--mute)}
.num{background:linear-gradient(135deg,#e4f0f3,#f2f8fa);border:1px solid #c3dde4;border-radius:4mm;padding:5mm 6mm;margin:3mm 0 4mm}
.num .big{font-size:34pt;font-weight:700;color:var(--blue);letter-spacing:-.02em;line-height:1.05}
.num .small{color:var(--mute);font-size:9pt;margin-top:1.5mm}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin:0 0 4mm}
.card{background:var(--bg);border-radius:3mm;padding:3mm 3.4mm}
.card b{display:block;font-size:15pt;letter-spacing:-.01em}
.card span{font-size:8.6pt;color:var(--mute)}
table{border-collapse:collapse;width:100%;font-size:8.8pt;margin:1.5mm 0 3.5mm;break-inside:avoid}
th,td{text-align:left;padding:1.2mm 2mm;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:7.8pt;text-transform:uppercase;letter-spacing:.05em;color:var(--mute)}
td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}
figure{margin:2mm 0 4mm;break-inside:avoid}
.fig svg{max-height:74mm}
.fig{background:#fff;border:1px solid var(--line);border-radius:3mm;padding:2.5mm}
figcaption{font-size:8.6pt;color:var(--mute);margin-top:1.6mm;line-height:1.45}
.two{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.note{background:#fff3e0;border-radius:2.4mm;padding:2.4mm 3.2mm;font-size:9pt;margin:2mm 0 3.4mm;break-inside:avoid}
.ok{color:#248a3d;font-weight:700}
code{font:8.6pt ui-monospace,"SF Mono",Menlo,monospace;background:var(--bg);border-radius:1mm;padding:.2mm 1.1mm}
pre{margin:1.5mm 0 3mm;background:#1d1d1f;color:#f5f5f7;border-radius:2mm;padding:2.6mm 3.4mm;font:8.2pt/1.5 ui-monospace,"SF Mono",Menlo,monospace;break-inside:avoid}
.small{color:var(--mute);font-size:8.6pt}
</style></head><body>

<!-- ======================= 1: summary ======================= -->
<section class="page">
<div class="title"><img src="data:image/png;base64,${logo}" alt="logo"><div><h1>Smart Parking Lot<br>Simulation Study</h1><p>How many kilometres of driving does the app save, compared with finding a spot on your own?</p><p class="small">Ido Tal · Aviv Elimelech · Harry Cohen &nbsp;·&nbsp; October 2026</p></div></div>

<h2>Summary</h2>
<div class="num"><div class="big">${pc(c.reduction.pct)} less driving</div>
<div class="small">to find a parking spot, for every car entering our 32-spot lot, compared with a methodical driver who has no app.<br>95% confidence interval ${pc(c.reduction.lo)} to ${pc(c.reduction.hi)} · ${c.days.toLocaleString()} simulated days · ${(c.days * c.carsParkedPerDay).toLocaleString(undefined, { maximumFractionDigits: 0 })} simulated cars · seed ${study.meta.seed}</div></div>

<div class="cards">
<div class="card"><b>${f(c.baseline.searchMetersPerCar, 2)} m → ${f(c.app.searchMetersPerCar, 2)} m</b><span>average drive from the entrance to the spot, without the app → with the app</span></div>
<div class="card"><b>${f(c.savedKmPerDay.mean, 2)} km per day</b><span>driving removed in our lot (about ${f(c.carsParkedPerDay, 0)} cars a day), 95% CI ${f(c.savedKmPerDay.lo, 2)} to ${f(c.savedKmPerDay.hi, 2)}</span></div>
<div class="card"><b>${pc(wander.reduction, 0)}</b><span>less driving when the other drivers just follow the lanes and take the first free spot they see</span></div>
<div class="card"><b>${pc(lot128.reduction, 0)} · ${pc(lotHi.reduction, 0)}</b><span>less driving in a ${lot128.spots}-spot and a ${lotHi.spots}-spot lot built from the same pattern</span></div>
<div class="card"><b>${f(lotHi.savedKmPerDay, 0)} km per day</b><span>driving removed in the ${lotHi.spots}-spot lot (${f(lotHi.carsPerDay, 0)} cars a day)</span></div>
<div class="card"><b>${pc(peakShadow.baselineMeters > 0 ? 1 - peakShadow.appMeters / peakShadow.baselineMeters : 0, 0)}</b><span>less driving when the lot is almost full (${f(peakShadow.occupiedPct, 0)}%+ taken)</span></div>
</div>

<h3>What we did</h3>
<p>We built a simulation of a parking lot with the same layout and the same routing code as our app, and ran ${c.days.toLocaleString()} busy weekdays through it twice. On the first pass every driver finds a spot the way people do without help: looking down the aisle and heading for the nearest part of the lot they have not looked at yet. On the second pass the app tells every driver which spot is free (from the sensors) and sends them along the shortest path to the nearest one, using Dijkstra's algorithm. Both passes see exactly the same cars, arriving at the same times and staying the same lengths of time, so the only thing that differs is how the spot is found.</p>
<h3>What we found</h3>
<ul>
<li>The app never makes a trip longer, because its route is the shortest possible. What matters is how much shorter, and that depends on how full the lot is and how big it is.</li>
<li>In our small prototype lot the saving is ${pc(c.reduction.pct)}, or about ${f(c.savedMetersPerCar, 1)} m per car. The lot is small enough that a driver can see most of it from the entrance, which limits what help is possible.</li>
<li>The saving grows with the size of the lot, from ${pc(lotLo.reduction, 0)} at ${lotLo.spots} spots to ${pc(lotHi.reduction, 0)} at ${lotHi.spots} spots, because the larger the lot, the less a driver can see and the longer an unaided search takes.</li>
<li>It grows with how full the lot is, with how long cars stay, and with the share of drivers who use the app.</li>
</ul>
${fig('headline', charts.headline, `Distance from the entrance to the parking spot, for the average car, the median car and the unluckiest 10% and 1% of cars. ${c.days.toLocaleString()} simulated days.`)}
</section>

<!-- ======================= 2: problem + project ======================= -->
<section class="page">
<h2>1. Why this matters</h2>
<p>Finding a parking spot is wasted driving. Every metre between the entrance and the spot you finally take is a metre that gets you nowhere: it costs time and fuel, produces emissions, and in a busy lot it adds cars to the aisles, which slows everyone else down and makes the next search longer. Researchers who study this call it <i>cruising for parking</i> (Shoup, 2006). Drivers cannot avoid it because from inside a car you can see only the spots in front of you, and you cannot know whether the next aisle has room.</p>
<p>The fix is information. If the lot knows which spots are free, it can tell each driver where to go. That needs two things: sensors that report the state of the lot, and a program that turns that state into a route. That is our project.</p>
<h2>2. The project in one page</h2>
<p>Our parking lot has an ESP32 board with two infrared distance sensors and an LED strip. The entrance sensor (pin D34) notices that a car has arrived. The spot sensor (pin D35) reports whether the monitored spot is taken, and the LED strip on pin D26 shows it to everybody walking by: green when open, red when taken. The board streams its readings over USB to a web app, which cleans them up (a reading must hold for three samples before it counts), decides that a car has arrived, finds the nearest free spot, and draws the route on a live map and on a phone mockup with turn-by-turn directions. The other spots of the demo lot are simulated, so one real spot sits in a full virtual lot.</p>
${((figNumbers.set("architecture", figNumbers.size + 1)), "")}<figure><div class="fig">${architecture}</div><figcaption><b>Figure {{fig:architecture}}.</b> How the pieces connect. The simulation study in this report uses the same lot model and the same routing as the live app.</figcaption></figure>
<h3>Why a simulation</h3>
<p>The hardware demo proves that the system works for one car and one spot. It cannot tell us how much driving it saves in a real lot, with hundreds of cars a day and spots filling and emptying. A real lot cannot be tested with and without the app on the same day with the same cars, but a simulation can: we replay identical days under two policies and compare. That is the only way to isolate the effect of the app.</p>
<h3>What we measure</h3>
<p>The main number is <b>search driving</b>: the distance a car drives between the entrance and the spot it parks in. We also report the drive back out, the time and the CO₂ that distance represents, and the wasted trips of drivers who arrive when the lot is full.</p>
</section>

<!-- ======================= 3: algorithm ======================= -->
<section class="page">
<h2>3. How the app chooses a route</h2>
<p>The lot is a grid. Drivable cells (the lanes and the entrance) are the nodes of a graph, and neighbouring lane cells are joined by edges. A spot is reached from a lane cell next to it. When a car is detected, the app needs the free spot with the smallest driving distance from the entrance. That is a shortest-path problem, and Dijkstra's algorithm (1959) solves it exactly:</p>
<pre>dist[entrance] = 0, every other cell = infinity
repeat: take the unfinished cell with the smallest dist (that distance is now final)
        for each neighbour: if dist[cell] + cost &lt; dist[neighbour], update it
spot distance = (distance of its lane cell) + 1 (the turn into the spot)
route = free spot with the smallest distance, walked back along the cells that set it</pre>
<p>The figure below shows the result for one lot state: each lane cell is labelled with its shortest distance from the entrance, and the app's chosen spot is outlined. Read it like a map of "how far is each cell from the door". The app takes the free spot whose neighbouring lane cell has the lowest number.</p>
<div class="two">
${fig('lotDistances', charts.lotDistances, `Dijkstra's distances (in cells of ${L} m) for one example lot with ${study.example.occupied.length} of ${study.meta.spots} spots taken (grey cars). The outlined spot is the nearest free one.`)}
${fig('spotDistances', charts.spotDistances, `Drive from the entrance to every spot of the empty lot, in metres. The nearest spot is ${f(nearestSpotM, 1)} m away, the farthest corner ${f(farthestSpotM, 0)} m.`)}
</div>
${fig('lotRoutes', charts.lotRoutes, `One arrival, two routes. This example (${study.example.occupied.length} of ${study.meta.spots} spots taken) was picked because the routes differ; it is an illustration, not the average case, which is ${pc(c.reduction.pct)} shorter. The driver without the app (grey, dashed) looks down the aisle, does not see a free spot close by, and ends up farther in; the app (teal) knows which spot is free and goes straight to the nearest one.`)}
<h3>Dijkstra and the code that ships in the app</h3>
<p>In our lot every step from one lane cell to the next costs the same, one cell. When all costs are equal, Dijkstra's algorithm visits cells in the same order as a breadth-first search, and gives the same distances. The router that runs in the live app (<code>src/lot/pathfinding.ts</code>) is that breadth-first search. For the study we wrote a full Dijkstra with a priority queue (<code>src/sim/dijkstra.ts</code>), so it keeps working if edges ever get different costs (a one-way aisle, a speed bump), and we check against the shipped router: in ${checks[0].detail.split(' ')[0]} random lot states, from empty to nearly full, both pick the same spot at the same distance every time.</p>
<h3>Driver without the app</h3>
<p>This is the part the result depends on most, so it is modelled carefully and kept strong. The driver enters at the entrance and looks down each straight lane for up to ${f(p.sightCells * L, 1)} m (${p.sightCells} cells); this is roughly what you can make out when you turn into an aisle. If any spot in view is free, they take the closest one. If not, they drive to the nearest lane cell with spots they have not yet looked at, look again, and repeat. They never re-check a place they already saw. A person with no app, no memory problems and good judgement would drive about like this, which makes it a demanding comparison for the app. A second, weaker driver is tested too: one who only follows the lanes with random turns and takes the first free spot they see.</p>
<div class="note">Because the comparison driver is already sensible, the percentages in this report are conservative. Real drivers also hesitate, circle back and give up on aisles that look full.</div>
</section>

<!-- ======================= 4: model ======================= -->
<section class="page">
<h2>4. The simulation model</h2>
<h3>The lot and the scale</h3>
<p>The lot has the layout of the live demo: 32 spots in four rows of eight, two aisles, a lane up the left side, and the entrance at the bottom left. One grid cell stands for ${L} m of driving. That makes the lot 32.4 m by 28.8 m, or 29 m² per space, which is inside the usual 25 to 35 m² per space of a surface lot. The percentages in this report do not depend on this scale (every distance is multiplied by the same factor); the absolute metres and kilometres do, in proportion.</p>
<h3>Demand</h3>
<p>We simulate a busy weekday from 07:00 to 19:00. In each hour a random number of cars arrives (Poisson, which is the standard model for independent arrivals), at an average rate that peaks at ${Math.max(...p.hourlyArrivals)} cars per hour in the morning and midday. Arrival times within the hour are uniform. Each car stays for a random time with a mean of ${p.meanDwellMin} minutes (lognormal, so most stays are close to the mean and a few are much longer, as in real lots). A car that arrives when every spot is taken goes away; this happens about ${f(c.carsBlockedPerDay, 1)} times a day.</p>
<div class="two">
${fig('arrivals', charts.arrivals, 'Average cars arriving per hour.')}
${fig('occupancy', charts.occupancy, `Share of spots taken over the day: peak ${f(peakOcc * 100, 0)}% on average. The band is one standard deviation across days.`)}
</div>
<h3>The assumptions in one table</h3>
${table(
  [
    ['Lot', '32 spots, 9 × 8 cells', 'Same as the live demo'],
    ['Cell size', `${L} m`, '29 m² per space, typical surface lot'],
    ['Driver view down an aisle', `${f(p.sightCells * L, 1)} m (${p.sightCells} cells)`, 'Six or seven spots; generous to drivers with no app'],
    ['Arrivals', `${p.hourlyArrivals.join(', ')} cars/h (07-19)`, `Busy weekday; peak occupancy near ${f(peakOcc * 100, 0)}%`],
    ['Time parked', `mean ${p.meanDwellMin} min, lognormal σ = ${p.dwellSigma}`, 'Work or campus style lot'],
    ['Full lot', 'car leaves', 'No queue modelled'],
    ['Speed in the lot', `${p.speedKmh} km/h`, 'Typical 5 to 10 mph limits (used only for time)'],
    ['Emissions', `${p.co2KgPerKm} kg CO₂ per km`, 'Typical passenger car; stop-and-go is worse'],
    ['Simulated days', `${c.days.toLocaleString()} (headline), ${study.meta.sweepDays.toLocaleString()} per sensitivity point`, 'Enough for a very narrow interval'],
  ],
  ['Assumption', 'Value', 'Why'],
)}
<p class="small">The parameters were fixed from the reasoning above, before the results were looked at. The only thing checked beforehand was that the demand profile gave a plausible occupancy (a peak around 83% on average, a few cars turned away); none of the settings was adjusted to change the size of the saving.</p>
<h3>Paired days</h3>
<p>For every simulated day, the list of cars (arrival time, time parked, driver) is generated once and then replayed under each policy. The number of occupied spots at any moment depends only on arrival times and stays, so both policies have exactly the same number of cars parked and turned away; only <i>which</i> spot each car takes, and how far it drives to it, differs. This removes almost all of the random noise from the comparison and is why the confidence interval is so narrow.</p>
<p>One simplification: a search is treated as instant relative to other cars' arrivals and departures. A search takes under a minute, while cars arrive every few minutes, so the effect is small. It is a limit of the model, not of the app.</p>
</section>

<!-- ======================= 5: method ======================= -->
<section class="page">
<h2>5. Method and verification</h2>
<p>This is a Monte Carlo simulation: we draw random days from the demand model, run each through both policies, and average. Four things make the number trustworthy.</p>
<ol>
<li><b>Paired comparison.</b> The same cars in both runs, as described above.</li>
<li><b>Enough days.</b> The headline uses ${c.days.toLocaleString()} independent days. Figure {{fig:convergence}} shows the running estimate: it settles after a few hundred days and does not move afterwards.</li>
<li><b>An honest interval.</b> The 95% confidence interval comes from a bootstrap that resamples whole days (days are independent, cars within a day are not): ${pc(c.reduction.lo, 2)} to ${pc(c.reduction.hi, 2)} around ${pc(c.reduction.pct, 2)}.</li>
<li><b>Self-checks.</b> The program refuses to run unless these checks pass:</li>
</ol>
${table(
  checks.map((ch) => [ch.passed ? '<span class="ok">PASS</span>' : 'FAIL', ch.name, ch.detail]),
  ['', 'Check', 'Result'],
)}
${fig('convergence', charts.convergence, 'Running estimate of the saving as simulated days are added (log scale).')}
<h3>What the percentage means</h3>
<p>The saving is computed from totals: (distance driven without the app − distance with the app) ÷ distance driven without the app, over all cars of all days. It is not an average of per-day percentages (which would over-weight quiet days). One simulated day can differ from the average: across days the daily saving has a standard deviation of ${f(c.dailyReductionSdPct, 1)} percentage points.</p>
</section>

<!-- ======================= 6: results ======================= -->
<section class="page">
<h2>6. Results: our 32-spot lot</h2>
${table(
  [
    ['Average drive to the spot', `${f(c.baseline.searchMetersPerCar, 2)} m`, `${f(c.app.searchMetersPerCar, 2)} m`, `−${f(c.savedMetersPerCar, 2)} m (−${pc(c.reduction.pct)})`],
    ['Median car', `${f(c.baseline.p50Meters, 1)} m`, `${f(c.app.p50Meters, 1)} m`, `${f(c.baseline.p50Meters - c.app.p50Meters, 1)} m`],
    ['Unluckiest 10% of cars', `${f(c.baseline.p90Meters, 1)} m`, `${f(c.app.p90Meters, 1)} m`, `−${f(c.baseline.p90Meters - c.app.p90Meters, 1)} m`],
    ['Unluckiest 1% of cars', `${f(c.baseline.p99Meters, 1)} m`, `${f(c.app.p99Meters, 1)} m`, `−${f(c.baseline.p99Meters - c.app.p99Meters, 1)} m`],
    ['Longest single search', `${f(c.baseline.maxMeters, 0)} m`, `${f(c.app.maxMeters, 0)} m`, `−${f(c.baseline.maxMeters - c.app.maxMeters, 0)} m`],
    ['Spread (std. deviation)', `${f(c.baseline.sdMeters, 1)} m`, `${f(c.app.sdMeters, 1)} m`, ''],
    ['Search driving per day', `${f(c.baseline.kmPerDay, 2)} km`, `${f(c.app.kmPerDay, 2)} km`, `−${f(c.savedKmPerDay.mean, 2)} km (CI ${f(c.savedKmPerDay.lo, 2)} to ${f(c.savedKmPerDay.hi, 2)})`],
    ['Search time per car at ' + p.speedKmh + ' km/h', `${f(c.baseline.searchSecondsPerCar, 1)} s`, `${f(c.app.searchSecondsPerCar, 1)} s`, `−${f(c.savedSecondsPerCar, 1)} s`],
    ['Drive back out, per car', `${f(c.baseline.exitMetersPerCar, 1)} m`, `${f(c.app.exitMetersPerCar, 1)} m`, `−${f(c.baseline.exitMetersPerCar - c.app.exitMetersPerCar, 1)} m`],
    ['Search + drive out, per car', `${f(c.baseline.tripMetersPerCar, 1)} m`, `${f(c.app.tripMetersPerCar, 1)} m`, `−${pc(c.tripReduction.pct)} (CI ${pc(c.tripReduction.lo)} to ${pc(c.tripReduction.hi)})`],
    ['Wasted tours of the full lot, per day', `${f(c.baseline.futileKmPerDay, 2)} km`, '0 km', `with these counted: −${pc(c.withFutileReduction.pct)}`],
  ],
  ['Measure', 'Without the app', 'With the app', 'Difference'],
  ['l', 'r', 'r', 'r'],
)}
<p>The headline is the first row: ${pc(c.reduction.pct)} less driving to find a spot. Parking nearer the entrance also shortens the drive out afterwards, so counting both directions the saving is ${pc(c.tripReduction.pct)}. The last row is an extra not included in the headline: when the lot is full, a driver without the app tours the whole lot, finds nothing and drives out; with the app they see "lot full" before turning in. Counting those wasted tours the saving is ${pc(c.withFutileReduction.pct)}.</p>
<div class="two">
${fig('tail', charts.tail, `Share of cars that drove farther than a given distance. Without the app ${pc(shareFarther(d, 50, 'baseline'), 1)} of cars drive more than 50 m; with the app ${pc(shareFarther(d, 50, 'app'), 1)}.`)}
${fig('byOccupancy', charts.byOccupancy, 'Average drive for cars arriving at the same lot state, by how full the lot already is. At the same state, the app is never longer. The gap opens as the lot fills.')}
</div>
<p>Figure {{fig:tail}} shows where the saving comes from: it is not that every car drives less (the median car drives the same distance either way), it is that the unlucky cars stop driving a long way. When the near spots are free, both policies take them. When they are taken, a driver without the app has to search, and the longer the search the bigger the gap (Figure {{fig:byOccupancy}}): about ${f(peakShadow.baselineMeters, 0)} m against ${f(peakShadow.appMeters, 0)} m when the lot is nearly full.</p>
${fig('byHour', charts.byHour, 'Average drive per car by hour of arrival. The saving follows the rush hours.')}
</section>

<!-- ======================= 7: scaling ======================= -->
<section class="page">
<h2>7. What would happen in a real lot</h2>
<p>Our prototype has 32 spots because it is a demonstration. To estimate what the app does in a real lot, we built larger lots from the same pattern (more columns, more blocks of aisles; the generator reproduces the demo lot exactly at 32 spots, as one of the self-checks shows) and scaled the demand in proportion to the number of spots, so every lot is equally busy.</p>
<div class="two">
${fig('lotSizeReduction', charts.lotSizeReduction, 'Share of search driving removed, by lot size.')}
${fig('lotSizeMeters', charts.lotSizeMeters, 'Average drive from the entrance to the spot, by lot size.')}
</div>
${table(
  study.lotSize.map((l) => [l.spots, f(l.carsPerDay, 0), `${f(l.baselineMeters, 1)} m`, `${f(l.appMeters, 1)} m`, `${pc(l.reduction)} (${pc(l.lo)} to ${pc(l.hi)})`, `${f(l.savedKmPerDay, 1)} km`]),
  ['Spots', 'Cars per day', 'Without the app', 'With the app', 'Driving removed (95% CI)', 'Saved per day'],
  ['r', 'r', 'r', 'r', 'r', 'r'],
)}
<p>Two things happen as the lot grows. A driver can see only about ${f(p.sightCells * L, 0)} m ahead, which in the smallest lot is a large part of the lot and in the largest is a small part of it, so unaided search gets longer. The drive with the app grows too (more cars fill the nearest spots, so the nearest free one is farther away), but more slowly: from ${f(lotLo.appMeters, 0)} m to ${f(lotHi.appMeters, 0)} m with the app, against ${f(lotLo.baselineMeters, 0)} m to ${f(lotHi.baselineMeters, 0)} m without it. The share removed rises from ${pc(lotLo.reduction, 0)} to ${pc(lotHi.reduction, 0)}, and because there are more cars as well, the kilometres saved per day rise faster still (Figure {{fig:lotSizeSaved}}).</p>
${fig('lotSizeSaved', charts.lotSizeSaved, 'Kilometres of driving removed per day, by lot size.')}
<h3>What that is worth, per 1,000 cars</h3>
${table(
  [
    [`Our lot (${lotLo.spots} spots)`, `${f(t1000Saved.km, 1)} km`, `${f(t1000Saved.hours, 2)} h`, `${f(t1000Saved.co2, 1)} kg`],
    [`${lot128.spots}-spot lot`, `${f(t1000_128.km, 1)} km`, `${f(t1000_128.hours, 2)} h`, `${f(t1000_128.co2, 1)} kg`],
    [`${lotHi.spots}-spot lot`, `${f(t1000Hi.km, 1)} km`, `${f(t1000Hi.hours, 2)} h`, `${f(t1000Hi.co2, 1)} kg`],
  ],
  ['Per 1,000 car visits', 'Driving', 'Time at ' + p.speedKmh + ' km/h', `CO₂ at ${p.co2KgPerKm} kg/km`],
  ['l', 'r', 'r', 'r'],
)}
<div class="note">These are modest numbers per car, because a search inside a lot is short. The percentage is the robust result; the absolute savings are small for a small lot and add up for a busy one (the ${lotHi.spots}-spot lot saves ${f(lotHi.savedKmPerDay, 0)} km every day, or about ${(Math.round(lotHi.savedKmPerDay * 365 / 100) * 100).toLocaleString('en-US')} km a year). They also leave out everything outside the lot: not queuing at a full entrance, not driving on to another car park, and choosing a spot close to where you are going.</div>
</section>

<!-- ======================= 8: robustness ======================= -->
<section class="page">
<h2 style="break-before:page">8. How sensitive is the result?</h2>
<p>A number from a model is only worth as much as its assumptions. Each chart below changes one assumption and leaves the rest alone (${study.meta.sweepDays.toLocaleString()} days per point, the shaded band is the 95% interval).</p>
<div class="two">
${fig('sight', charts.sight, `Driver's view. If drivers could see the whole lot, the app would not be needed: at ${f(study.sight[study.sight.length - 1].x, 0)} m of view the saving is ${pc(study.sight[study.sight.length - 1].reduction)}. The shorter the view, the more it saves. The line is not smooth because it follows the geometry of this particular lot: at some viewing distances a whole row of spots comes into view from the entrance.`)}
${fig('demand', charts.demand, 'Demand. Each point is a different arrival rate (0.4× to 1.6×), plotted by the average occupancy it produces. Busier lots mean fewer free spots to find.')}
</div>
<div class="two">
${fig('dwell', charts.dwell, 'Parking duration. Cars that stay longer keep the lot fuller.')}
${fig('adoption', charts.adoption, `Adoption. The share of drivers who use the app: with one driver in ten on it the lot already gets ${pc(study.adoption.find((a) => a.x === 10)!.reduction, 1)} less driving, with half of them ${pc(half.reduction, 1)}, with all of them ${pc(c.reduction.pct, 1)}. The curve bends: the first adopters gain the most. That is more than the ${pc(c.reduction.pct / 10, 1)} you would get if only the app's own users benefited, so the app seems to help drivers who do not use it too, probably because it fills spots from the entrance outwards and leaves fewer gaps for others to search through (we have not isolated the cause).`)}
</div>
${fig('baselineKind', charts.baselineKind, `Who the app is compared with. A methodical driver (sees down the aisle and never re-checks a spot): ${pc(study.baselineKind[0].reduction, 1)}. A wandering driver (random turns, first free spot seen): ${pc(wander.reduction, 1)}, with the unaided drive averaging ${f(wander.baselineMeters, 1)} m instead of ${f(study.baselineKind[0].baselineMeters, 1)} m.`)}
<h3>Cell size</h3>
<p>The cell size changes the absolute distances but not the percentage, because every distance is multiplied by the same factor:</p>
${table(
  study.cell.map((x) => [`${x.cellMeters} m`, `${f(x.baselineMeters, 1)} m`, `${f(x.appMeters, 1)} m`, `${f(x.savedKmPerDay, 2)} km`, `${f(x.reductionPct, 2)}%`]),
  ['Metres per cell', 'Without the app', 'With the app', 'Saved per day', 'Driving removed'],
  ['r', 'r', 'r', 'r', 'r'],
)}
</section>

<!-- ======================= 9: limits ======================= -->
<section class="page">
<h2>9. Limits of this study</h2>
<p>We would rather say plainly where this model is simple than let the number look better than it is.</p>
<ul>
<li><b>It is a model, not field data.</b> Real arrival patterns, real parking durations and the real way people drive in a lot differ from our assumptions. The sensitivity charts show how the answer moves when they do; they do not replace measuring a real lot. The sensors in the project can supply those measurements.</li>
<li><b>The comparison driver is a choice.</b> Without an app, people do not follow a fixed algorithm. We used a sensible one and a pessimistic one and report both, and the headline is the sensible one. A different assumption about how drivers search changes the answer within the range of Figure {{fig:baselineKind}}.</li>
<li><b>The app is assumed to be perfect.</b> It knows the true state of every spot and drivers follow it. In practice sensors fail, drivers ignore the app, and a spot can be taken between the route being given and the car arriving. The live app handles the last case by re-routing; the study does not charge it for delays.</li>
<li><b>The app picks the spot nearest the entrance.</b> Drivers who want the spot nearest to a particular building are not modelled; the savings measured here are for getting parked, not for the walk afterwards.</li>
<li><b>Searches do not overlap.</b> A car's search is instant relative to other cars. The model ignores congestion in the aisles, which would make unaided search worse, so leaving it out is conservative.</li>
<li><b>One layout.</b> The scaled lots follow the same pattern as our demo lot. A lot with a very different layout (a multi-storey garage, for example) needs its own run.</li>
<li><b>The emission figure is an average.</b> Slow, stop-and-go driving emits more per km than the average used here, so the CO₂ numbers are conservative.</li>
</ul>
<h3>What we would do next</h3>
<ul>
<li>Log real arrivals, durations and search distances from the sensors in a real lot and replace the assumed demand with measured demand.</li>
<li>Add the cost of sensor errors and drivers who ignore the route, and measure how much of the saving survives.</li>
<li>Model the entrance queue, which a full-lot warning from the app would also shorten.</li>
</ul>
<h2 style="margin-top:6mm">10. Reproducing every number</h2>
<pre>git clone https://github.com/Idosssss/SmartParking-1.git
cd SmartParking &amp;&amp; npm install
npm run simulate           # self-checks, then the full study (seed ${study.meta.seed}); about a minute or two
npm run simulate:report    # rebuilds this PDF from the results file</pre>
<p>The same seed gives the same numbers on any machine. The assumptions are in <code>src/sim/params.ts</code>; the model is in <code>src/sim/</code> (<code>engine.ts</code> for the day simulation, <code>drivers.ts</code> for the two policies, <code>dijkstra.ts</code> for the router). The simulation page of the website runs the same code in the browser, so anyone can change an assumption and see the answer move.</p>
<h3>References</h3>
<ul class="small">
<li>E. W. Dijkstra, "A note on two problems in connexion with graphs", <i>Numerische Mathematik</i> 1, 269-271 (1959).</li>
<li>D. C. Shoup, "Cruising for parking", <i>Transport Policy</i> 13(6), 479-486 (2006).</li>
</ul>
<h3>Glossary</h3>
${table(
  [
    ['Search driving', 'Distance from the entrance to the spot the car finally parks in.'],
    ['Paired / common random numbers', 'Running the identical cars through both policies so only the policy differs.'],
    ['95% confidence interval', 'The range that would contain the true value in 95 of 100 repeats of the whole study.'],
    ['Bootstrap', 'Estimating that range by re-drawing the simulated days at random many times.'],
    ['Occupancy', 'Share of the spots that are taken.'],
    ['Cell', `One square of the lot grid, ${L} m of driving.`],
  ],
  ['Term', 'Meaning'],
)}
</section>
</body></html>`;

const finalHtml = html.replace(/\{\{fig:(\w+)\}\}/g, (_, k: string) => String(figNumbers.get(k) ?? '?'));
const outDir = resolve(root, 'simulation/out');
mkdirSync(outDir, { recursive: true });
const htmlPath = resolve(outDir, 'report.html');
writeFileSync(htmlPath, finalHtml);
console.log('wrote simulation/out/report.html');

const pdfPath = resolve(outDir, 'report.pdf');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(chrome)) {
  console.error(`Chrome not found at ${chrome}. Set CHROME=/path/to/chrome and re-run, or open ${htmlPath} in a browser and print to PDF.`);
  process.exit(1);
}
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { stdio: 'ignore' });

// Headless Chrome sometimes keeps running after it has written the file, so wait for the file to stop growing, then stop it.
let lastSize = -1;
let stable = 0;
const timer = setInterval(() => {
  const size = existsSync(pdfPath) ? statSync(pdfPath).size : 0;
  stable = size > 0 && size === lastSize ? stable + 1 : 0;
  lastSize = size;
  if (stable >= 3) {
    clearInterval(timer);
    proc.kill();
    const docs = resolve(root, 'docs');
    mkdirSync(docs, { recursive: true });
    copyFileSync(pdfPath, resolve(docs, 'Smart-Parking-Simulation-Report.pdf'));
    copyFileSync(pdfPath, resolve(root, 'public/Smart-Parking-Simulation-Report.pdf'));
    console.log('wrote docs/Smart-Parking-Simulation-Report.pdf and public/Smart-Parking-Simulation-Report.pdf');
    process.exit(0);
  }
}, 1000);
setTimeout(() => {
  console.error('Timed out waiting for Chrome to write the PDF.');
  proc.kill();
  process.exit(1);
}, 180000);
