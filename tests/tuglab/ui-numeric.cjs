// Регрессия посимвольного ввода: промежуточный текст не меняет модель и не теряется.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/tmp/bonk-tuglab-ui/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [], failures = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.TUGLAB_URL || 'http://localhost:5174/tuglab.html');
  await page.waitForFunction(() => window.__bonkLab);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  const model = key => page.evaluate(k => window.__bonkLab.params[k], key);
  const check = async (name, body) => {
   try { await body(); console.log(`PASS ${name}`); }
   catch (e) { failures.push(`${name}: ${e.stack}`); }
  };
  const typeDraft = async (field, text, key, previous) => {
   await field.focus();
   await field.press('ControlOrMeta+A');
   if (!text) await field.press('Backspace');
   for (const char of text) {
    await field.press(char, { delay: 150 });
    assert.equal(await model(key), previous, `draft after ${char} must preserve model`);
   }
   assert.equal(await field.inputValue(), text, 'typed draft must stay visible');
   assert.equal(await page.evaluate(() => window.__labInput.getState().magnitude), 0, 'focused input must not thrust');
  };
  for (const [label, key, text, accepted, commit] of [
   ['Длина между креплениями', 'tow.length', '12', 12, 'Enter'],
   ['Масса B / A', 'tow.massRatio', '0.25', 0.25, 'Tab'],
   ['Жёсткость k', 'tow.stiffness', '2400', 2400, 'Enter'],
   ['Радиус B', 'tow.radiusB', '13', 13, 'Tab'],
   ['Демпфирование ζ', 'tow.dampingRatio', '0.35', 0.35, 'Enter'],
  ]) await check(`keystrokes ${key} → ${text} (${commit})`, async () => {
   const field = page.getByLabel(label, { exact: true });
   await typeDraft(field, text, key, await model(key));
   await field.press(commit);
   assert.equal(await model(key), accepted);
   assert.equal(await field.inputValue(), String(accepted), 'display must show exact accepted number');
   assert.equal(await field.getAttribute('aria-invalid'), 'false');
  });
  await check('invalid draft/commit and slider clears error', async () => {
   const field = page.getByLabel('Жёсткость k', { exact: true });
   const previous = await model('tow.stiffness');
   for (const text of ['', '10001', 'e']) {
    await field.focus(); await field.press('ControlOrMeta+A'); await field.press('Backspace');
    for (const char of text) await field.press(char, { delay: 150 });
    assert.equal(await model('tow.stiffness'), previous, 'invalid draft must preserve model');
    assert.equal(await field.inputValue(), text === 'e' ? '' : text, 'invalid draft must remain editable');
    await field.press('Enter');
    assert.equal(await model('tow.stiffness'), previous, 'invalid commit must preserve model');
    assert.equal(await field.inputValue(), text === 'e' ? '' : text, 'invalid commit must preserve draft');
    assert.equal(await field.getAttribute('aria-invalid'), 'true');
    assert.ok(await field.locator('xpath=ancestor::div[contains(@class,"lab-param")]').getByRole('alert').count());
   }
   const row = field.locator('xpath=ancestor::div[contains(@class,"lab-param")]');
   await row.locator('input[type=range]').focus();
   await page.keyboard.press('ArrowRight');
   assert.equal(await model('tow.stiffness'), previous + 1);
   assert.equal(Number(await field.inputValue()), previous + 1);
   assert.equal(await field.getAttribute('aria-invalid'), 'false');
   assert.equal(await row.getByRole('alert').count(), 0);
  });
  await check('quick mass clears invalid draft even when accepted value is unchanged', async () => {
   const field = page.getByLabel('Масса B / A', { exact: true });
   await page.getByRole('button', { name: 'Масса B / A = 0.25', exact: true }).click();
   await typeDraft(field, '20', 'tow.massRatio', 0.25); await field.press('Enter');
   assert.equal(await field.getAttribute('aria-invalid'), 'true');
   await page.getByRole('button', { name: 'Масса B / A = 0.25', exact: true }).click();
   assert.equal(await model('tow.massRatio'), 0.25);
   assert.equal(Number(await field.inputValue()), 0.25);
   assert.equal(await field.getAttribute('aria-invalid'), 'false');
   assert.equal(await page.getByRole('alert').count(), 0);
  });
  await check('preset and reset discard stale draft/error, including unchanged tow value', async () => {
   const field = page.getByLabel('Длина между креплениями', { exact: true });
   const previous = await model('tow.length');
   await typeDraft(field, '101', 'tow.length', previous); await field.press('Enter');
   await page.getByLabel('Пресет движения').selectOption('1');
   assert.equal(await model('tow.length'), previous);
   assert.equal(Number(await field.inputValue()), previous);
   assert.equal(await field.getAttribute('aria-invalid'), 'false');
   await typeDraft(field, '101', 'tow.length', previous); await field.press('Enter');
   await page.getByRole('button', { name: 'Сброс', exact: true }).click();
   assert.equal(await model('tow.length'), 8);
   await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="Длина между креплениями"]');
    return Number(input.value) === 8 && input.getAttribute('aria-invalid') === 'false';
   });
   assert.equal(Number(await field.inputValue()), 8);
   assert.equal(await field.getAttribute('aria-invalid'), 'false');
   assert.equal(await page.getByRole('alert').count(), 0);
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log('PASS tow numeric draft/commit/validation/alternative updates');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
