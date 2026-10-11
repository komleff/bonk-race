// Базовый играбельный поезд проверяется через видимые органы управления.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.TUGLAB2_URL || 'http://127.0.0.1:5176/tuglab2.html');
    await page.getByRole('heading', { name: 'TugLab-2', exact: true }).waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Старт', exact: true }).click();
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(900);
    await page.keyboard.up('KeyD');
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    const hud = await page.locator('[data-testid="train-hud"]').textContent();
    assert.match(hud, /A/); assert.match(hud, /B/); assert.match(hud, /C/);
    assert.ok(Number(/A: ([0-9.]+) м/.exec(hud)?.[1]) > 1, 'клавиатура должна разгонять A');
    assert.match(hud, /AB/); assert.match(hud, /BC/);
    assert.ok(Number(await page.locator('[data-testid="train-hud"]').getAttribute('data-time')) > .2);
    await page.getByRole('button', { name: 'AB: расцепить', exact: true }).click();
    await page.getByRole('button', { name: 'BC: расцепить', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await page.getByRole('button', { name: 'Старт', exact: true }).waitFor();
    assert.equal(await page.locator('[data-testid="train-hud"]').getAttribute('data-time'), '0');
    fs.mkdirSync('.cache/tuglab2-qa', { recursive: true });
    await page.screenshot({ path: '.cache/tuglab2-qa/coast-desktop.png' });
    assert.deepEqual(errors, []); console.log('PASS: поезд, ввод A, независимая расцепка, Restart; errors[]');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
