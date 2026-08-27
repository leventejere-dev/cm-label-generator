/**
 * END-TO-END VERIFICATION SCRIPT (optional, not part of `npm test`)
 * ---------------------------------------------------------------------------
 * Drives the whole workflow in a real browser at iPhone size and captures a
 * screenshot of every step plus the printed A4 sheet, so a change to the layout
 * can be eyeballed rather than guessed at.
 *
 * The container cannot open a camera, so it enters through the documented
 * fallback: the scanner's capture input. Everything after that — optimisation,
 * extraction, sanitisation, review, label, print — is the real code path.
 *
 *   npm run build && npm run preview          # in one terminal
 *   npm i -D playwright && npx playwright install chromium
 *   node scripts/verify-flow.mjs ./my-label-photo.jpg
 *
 * Output lands in ./verification (override with CM_SHOTS_DIR).
 */

import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.CM_BASE_URL ?? 'http://127.0.0.1:4173';
const SHOTS = process.env.CM_SHOTS_DIR ?? 'verification';
const SAMPLE = process.argv[2] ?? process.env.CM_SAMPLE_IMAGE;

if (!SAMPLE) {
  console.error('Usage: node scripts/verify-flow.mjs <path-to-a-label-photo>');
  process.exit(1);
}
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  ...(process.env.CM_CHROME_PATH ? { executablePath: process.env.CM_CHROME_PATH } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

// ---- phone viewport ---------------------------------------------------------
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});
const page = await phone.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/01-home-phone.png` });
console.log('HOME ok; mock pill:', await page.locator('.mode-pill').count());

// Start the scan. The camera cannot open in this container, so we go in through
// the documented fallback: the hidden capture input the scanner exposes.
await page.getByRole('button', { name: /Scan Label/i }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/02-camera.png` });

const input = page.locator('input[type=file]');
await input.setInputFiles(SAMPLE);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}/03-photo-preview.png`, fullPage: true });
console.log('PREVIEW url:', page.url());

const analyze = page.getByRole('button', { name: /Analyze label/i });
await analyze.waitFor({ timeout: 15000 });
await analyze.click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${SHOTS}/04-processing.png` });

await page.waitForURL(/#\/review\//, { timeout: 30000 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${SHOTS}/05-review-phone.png`, fullPage: true });
console.log('REVIEW url:', page.url());

// Open the removed-supplier-information panel and capture it.
const removedToggle = page.getByRole('button', { name: /Removed supplier information/i });
if (await removedToggle.count()) {
  await removedToggle.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/06-removed-panel.png`, fullPage: true });
}

// Fill our own delivery details, the way an employee would.
const clientInput = page.locator('#delivery\\.clientName');
if (await clientInput.count()) {
  await clientInput.fill('C.N. ROMARM S.A. — Uzina Mecanica Mija');
  await page.locator('#delivery\\.clientAddress').fill('Comuna I.L. Caragiale, DN-72 km 33+145, jud. Dambovita');
}

await page.getByRole('button', { name: /Generate CM Label/i }).click();
await page.waitForURL(/#\/label\//, { timeout: 20000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/07-label-phone.png`, fullPage: true });
console.log('LABEL url:', page.url());
const firstCmId = (await page.locator('.a4__cmid').first().innerText()).trim();
console.log('first label CM ID:', firstCmId);

// Print rendering: the A4 sheet at true size.
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(400);
const pdf = await page.pdf({ path: `${SHOTS}/label-print.pdf`, format: 'A4', printBackground: true });
console.log('printed pdf bytes:', pdf.length);
await page.emulateMedia({ media: 'screen' });

// Back to home to confirm the label appears in history.
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.screenshot({ path: `${SHOTS}/08-home-with-history.png`, fullPage: true });

// ---- regression: opening a saved label must never show another label's data
// Scan a second label so the session holds different data.
await page.goto(`${BASE}/#/scan`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.locator('input[type=file]').setInputFiles(SAMPLE);
await page.getByRole('button', { name: /Analyze label/i }).click();
await page.waitForURL(/#\/review\//, { timeout: 30000 });
await page.getByRole('button', { name: /Generate CM Label/i }).click();
await page.waitForURL(/#\/label\//, { timeout: 20000 });
await page.waitForTimeout(900);
const secondCmId = await page.locator('.a4__cmid').first().innerText();
console.log('second label CM ID:', secondCmId);

// Now reopen the FIRST label from history while the session still holds the second.
await page.goto(`${BASE}/#/labels`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const rows = page.locator('.list__item');
const rowCount = await rows.count();
let opened = null;
for (let i = 0; i < rowCount; i += 1) {
  const text = await rows.nth(i).innerText();
  if (text.includes(firstCmId)) { await rows.nth(i).click(); opened = firstCmId; break; }
}
await page.waitForTimeout(1400);
const shownCmId = await page.locator('.a4__cmid').first().innerText();
console.log('reopened', opened, '-> sheet shows', shownCmId);
if (opened && shownCmId !== opened) {
  throw new Error(`STALE SESSION BUG: opened ${opened} but the sheet rendered ${shownCmId}`);
}
await page.screenshot({ path: `${SHOTS}/12-reopened-label.png`, fullPage: true });

// ---- desktop: same context so localStorage history is present -------------
await page.setViewportSize({ width: 1440, height: 950 });
await page.goto(`${BASE}/#/labels`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.screenshot({ path: `${SHOTS}/09-history-desktop.png` });

await page.locator('.list__item').first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/10-label-desktop.png`, fullPage: true });
console.log('desktop label url:', page.url());

await page.goto(page.url().replace('#/label/', '#/review/'), { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
await page.screenshot({ path: `${SHOTS}/11-review-desktop.png`, fullPage: true });

await browser.close();
fs.writeFileSync(`${SHOTS}/console-errors.txt`, errors.join('\n') || '(none)');
console.log('CONSOLE ERRORS:', errors.length ? errors.join(' | ') : 'none');
