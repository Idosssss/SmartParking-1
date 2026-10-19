/**
 * Runs the self-checks, then the full study, and writes the results that both the website
 * (public/simulation-results.json) and the PDF report (docs/) are built from.
 *
 *   npm run simulate                # 5000 simulated days for the headline, 1000 per sweep point
 *   npm run simulate -- --quick     # a fast smoke test (not for publishing)
 *   npm run simulate -- --seed 7    # a different random seed
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks } from '../src/sim/checks';
import { runStudy } from '../src/sim/experiments';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const seedArg = args.indexOf('--seed');
const seed = seedArg >= 0 ? Number(args[seedArg + 1]) : 2026;

console.log('Self-checks');
const checks = runChecks();
for (const c of checks) console.log(`  ${c.passed ? 'PASS' : 'FAIL'}  ${c.name} - ${c.detail}`);
if (checks.some((c) => !c.passed)) {
  console.error('A self-check failed. Not running the study.');
  process.exit(1);
}

const headlineDays = quick ? 300 : 5000;
const sweepDays = quick ? 100 : 1000;
console.log(`\nStudy: seed ${seed}, ${headlineDays} headline days, ${sweepDays} days per sweep point`);
const started = Date.now();
const study = runStudy({ seed, headlineDays, sweepDays, onStage: (s) => console.log(`  ${s}`) });
console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)} s`);

const c = study.headline.comparison;
console.log(`\nHeadline (${c.days} days)`);
console.log(`  no app : ${c.baseline.searchMetersPerCar.toFixed(2)} m per car`);
console.log(`  app    : ${c.app.searchMetersPerCar.toFixed(2)} m per car`);
console.log(`  saved  : ${(c.reduction.pct * 100).toFixed(2)} %  (95% CI ${(c.reduction.lo * 100).toFixed(2)} to ${(c.reduction.hi * 100).toFixed(2)})`);

const out = { checks, study };
const publicDir = resolve(root, 'public');
mkdirSync(publicDir, { recursive: true });
if (!quick) {
  writeFileSync(resolve(publicDir, 'simulation-results.json'), JSON.stringify(out));
  console.log('wrote public/simulation-results.json');
} else {
  mkdirSync(resolve(root, 'simulation/out'), { recursive: true });
  writeFileSync(resolve(root, 'simulation/out/quick-results.json'), JSON.stringify(out));
  console.log('quick run: wrote simulation/out/quick-results.json (not the published file)');
}
