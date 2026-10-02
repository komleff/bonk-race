// Настоящий UI lifecycle: удержанный ввод, контакт B с QA-шипом, общий респаун.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/tmp/bonk-tuglab-ui/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.TUGLAB_URL || 'http://localhost:5174/tuglab.html');
  await page.waitForFunction(() => window.__bonkLab?.getState().startCountdown <= 0);
  await page.locator('#lab-canvas').click({ position: { x: 300, y: 200 } });
  await page.keyboard.down('w');
  assert.equal(await page.evaluate(() => window.__labInput.getState().magnitude), 1);
  await page.evaluate(() => {
   const lab = window.__bonkLab;
   lab.updateParams('spike.killOnHit', true);
   const state = lab.getState(), b = state.towing.B;
   const spike = { x: b.position.x + b.radius + 1, y: b.position.y, radius: 2, type: 'spike', alive: true };
   state.arena.obstacles.push(spike);
   window.__qaSpike = spike;
  });
  await page.waitForFunction(() => window.__bonkLab.getState().deathTimer > 0);
  const atDeath = await page.evaluate(() => ({ input: window.__labInput.getState().magnitude, paused: window.__bonkLab.getState().towing.paused }));
  await page.evaluate(() => {
   const obstacles = window.__bonkLab.getState().arena.obstacles;
   obstacles.splice(obstacles.indexOf(window.__qaSpike), 1);
   delete window.__qaSpike;
  });
  await page.waitForFunction(() => window.__bonkLab.getState().respawnCountdown > 0);
  const atRespawn = await page.evaluate(() => window.__labInput.getState().magnitude);
  // Повтор без отпускания клавиши должен оставаться старым удержанием.
  await page.keyboard.down('w');
  await page.waitForFunction(() => {
   const s = window.__bonkLab.getState();
   return s.deathTimer === 0 && s.respawnCountdown === 0;
  });
  const elapsedAtGo = await page.evaluate(() => window.__bonkLab.getState().elapsedTime);
  await page.waitForFunction(time => window.__bonkLab.getState().elapsedTime > time + 0.1, elapsedAtGo);
  const afterGo = await page.evaluate(() => ({ input: window.__labInput.getState().magnitude, vy: window.__bonkLab.getState().vy, paused: window.__bonkLab.getState().towing.paused }));
  console.log(JSON.stringify({ atDeath, atRespawn, afterGo }));
  assert.equal(atDeath.paused, false);
  assert.equal(atDeath.input, 0, 'death must clear actual UI source');
  assert.equal(atRespawn, 0, 'respawn must not reuse held UI source');
  assert.equal(afterGo.input, 0, 'old autorepeat must not restore thrust after Go');
  assert.equal(afterGo.paused, false);
  assert.ok(Math.abs(afterGo.vy) < 1e-8, 'after Go requires a fresh physical press');
  await page.keyboard.up('w');
  await page.keyboard.down('w');
  assert.equal(await page.evaluate(() => window.__labInput.getState().magnitude), 1);
  await page.keyboard.up('w');
  assert.deepEqual(errors, []);
  console.log('PASS real UI death/respawn/Go clears source and autorepeat; fresh press restores control');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
