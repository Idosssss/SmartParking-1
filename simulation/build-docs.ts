/**
 * Prints the manuals to PDF (docs/pdf/), so they can be handed in or printed:
 *
 *   npm run docs:pdf
 *
 * Markdown is rendered with `marked`, Mermaid diagrams are drawn in the page before printing, Hebrew
 * documents are laid out right to left, and links between documents become GitHub links that work
 * from a PDF. Needs Google Chrome (set CHROME=... if it is not in the default macOS location) and a
 * network connection for the Mermaid script.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = resolve(root, 'docs');
const outDir = resolve(docs, 'pdf');
const REPO = 'https://github.com/Idosssss/SmartParking-1/blob/main';
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const DOCS: { file: string; title: string }[] = [
  { file: 'USER_GUIDE.he.md', title: 'מדריך למשתמש' },
  { file: 'USER_GUIDE.md', title: 'User guide' },
  { file: 'PROGRAMMER_MANUAL.he.md', title: 'מדריך למתכנת' },
  { file: 'PROGRAMMER_MANUAL.md', title: "Programmer's manual" },
  { file: 'QUICK_START.he.md', title: 'הפעלה מהירה' },
  { file: 'HOW_IT_WORKS.he.md', title: 'איך המערכת עובדת' },
  { file: 'ROBUSTNESS.he.md', title: 'רובסטיות הפרויקט' },
  { file: 'REVIEW_RESPONSE.he.md', title: 'תשובה להערות הבודקים' },
];

/** A relative link to another file of the repository becomes a GitHub link; images stay local. */
function absoluteLinks(html: string): string {
  return html.replace(/href="(?!https?:|#|mailto:)([^"]+)"/g, (_, href: string) => {
    const [path, anchor] = href.split('#');
    const url = new URL(path, `${REPO}/docs/`).toString();
    return `href="${url}${anchor ? `#${anchor}` : ''}"`;
  });
}

function page(markdown: string, title: string, rtl: boolean): string {
  const body = absoluteLinks(
    marked
      .parse(markdown, { async: false })
      .replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, (_, src: string) => `<pre class="mermaid">${src}</pre>`),
  );
  return `<!doctype html><html lang="${rtl ? 'he' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${title}</title>
<base href="${pathToFileURL(docs).toString()}/">
<style>
@page{size:A4;margin:15mm 15mm 17mm;@bottom-center{content:counter(page) " / " counter(pages);font:8pt -apple-system,Helvetica,Arial,sans-serif;color:#8e8e93}}
body{font:10pt/1.55 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;color:#1d1d1f;margin:0}
h1{font-size:21pt;margin:0 0 4mm;padding-bottom:3mm;border-bottom:2px solid #1b6c80;letter-spacing:-.01em}
h2{font-size:14pt;margin:7mm 0 2.5mm;break-after:avoid;color:#124a59}
h3{font-size:11pt;margin:5mm 0 1.5mm;break-after:avoid}
p,li{margin:0 0 1.8mm}
ul,ol{padding-inline-start:6mm;margin:0 0 3mm}
a{color:#1b6c80;text-decoration:none}
table{border-collapse:collapse;width:100%;margin:2mm 0 4mm;font-size:9pt;break-inside:avoid}
th,td{border-bottom:1px solid #e5e5ea;padding:1.4mm 2mm;text-align:start;vertical-align:top}
th{background:#f5f5f7;font-weight:600}
code{font:8.6pt ui-monospace,"SF Mono",Menlo,monospace;background:#f2f4f5;border-radius:1mm;padding:.2mm 1mm;direction:ltr;unicode-bidi:embed}
pre{direction:ltr;text-align:left;background:#1d1d1f;color:#f5f5f7;border-radius:2mm;padding:3mm 3.5mm;font:8.4pt/1.5 ui-monospace,"SF Mono",Menlo,monospace;white-space:pre-wrap;break-inside:avoid}
pre code{background:none;color:inherit;padding:0}
pre.mermaid{background:#fff;color:#1d1d1f;text-align:center;border:1px solid #e5e5ea}
img{max-width:100%;border:1px solid #e5e5ea;border-radius:2mm;margin:2mm 0}
blockquote{margin:2mm 0;padding:2mm 4mm;background:#f5f5f7;border-inline-start:3px solid #1b6c80}
</style></head><body>${body}
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
await mermaid.run({ querySelector: 'pre.mermaid' });
document.body.dataset.ready = '1';
</script></body></html>`;
}

/** Prints one HTML file to PDF and waits until Chrome has finished writing it. */
function print(htmlPath: string, pdfPath: string): Promise<void> {
  if (existsSync(pdfPath)) rmSync(pdfPath);
  const proc = spawn(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=15000', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).toString()],
    { stdio: 'ignore' },
  );
  return new Promise((done, fail) => {
    let last = -1;
    let stable = 0;
    const started = Date.now();
    const timer = setInterval(() => {
      const size = existsSync(pdfPath) ? statSync(pdfPath).size : 0;
      stable = size > 0 && size === last ? stable + 1 : 0;
      last = size;
      if (stable >= 2) {
        clearInterval(timer);
        proc.kill();
        done();
      } else if (Date.now() - started > 90000) {
        clearInterval(timer);
        proc.kill();
        fail(new Error(`Timed out printing ${pdfPath}`));
      }
    }, 700);
  });
}

if (!existsSync(chrome)) {
  console.error(`Chrome not found at ${chrome}. Set CHROME=/path/to/chrome and re-run.`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const work = resolve(root, 'simulation/out/docs');
mkdirSync(work, { recursive: true });
for (const { file, title } of DOCS) {
  const markdown = readFileSync(resolve(docs, file), 'utf8');
  const htmlPath = resolve(work, file.replace(/\.md$/, '.html'));
  writeFileSync(htmlPath, page(markdown, title, file.endsWith('.he.md')));
  const pdf = resolve(outDir, file.replace(/\.md$/, '.pdf'));
  await print(htmlPath, pdf);
  console.log(`wrote docs/pdf/${file.replace(/\.md$/, '.pdf')}`);
}
