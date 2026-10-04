// После изменения настроек старый fragment не должен блокировать повторный импорт той же ссылки.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/bonk-tuglab-ui/node_modules/playwright');
const out=process.env.U2TAGLAB_QA_DIR||'/tmp/bonk-rigid-logs/stale-share';fs.mkdirSync(out,{recursive:true});
const url=process.env.U2TAGLAB_URL||'http://127.0.0.1:5187/u2taglab.html',report={checks:[],errors:[]};
const fixture=require('./fixtures/u2-space-user-v3.json');
const openSettings=async page=>{const button=page.getByRole('button',{name:'Настройки',exact:true});if(await button.getAttribute('aria-expanded')!=='true')await button.click();};
const inspect=()=>window.__bonkLab.exportSpaceShareSnapshot();
const linkFor=(base,snapshot,prefix='u2tag')=>{const u=new URL(base);u.hash=`${prefix}=`+Buffer.from(JSON.stringify(snapshot)).toString('base64url');return u.href;};
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
const track=page=>page.on('pageerror',e=>report.errors.push(e.message));
try{const page=await browser.newPage({viewport:{width:390,height:844}});track(page);
const shared=linkFor(url,fixture);await page.goto(shared);await page.waitForFunction(()=>window.__bonkLab);assert.deepEqual(await page.evaluate(inspect),fixture);
await openSettings(page);
await page.getByRole('button',{name:'Сброс',exact:true}).click();
assert.equal(await page.evaluate(()=>location.hash.length),0,'Сброс должен убрать устаревший fragment');
await page.goto(shared);await page.waitForFunction(()=>window.__bonkLab.params['tow.length']===180&&window.__bonkLab.getSpaceSize('A')==='S');assert.deepEqual(await page.evaluate(inspect),fixture);
report.checks.push('exact user schema3 S/L180: Reset then reopen identical URL restores initial settings');
const reopen=async(change,label)=>{
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await change();assert.equal(await page.evaluate(()=>location.hash.length),0,`${label}: устаревший fragment удалён`);
 await page.goto(shared);await page.waitForFunction(()=>window.__bonkLab.params['tow.length']===180&&window.__bonkLab.getSpaceSize('A')==='S');assert.deepEqual(await page.evaluate(inspect),fixture);report.checks.push(label);
};
await reopen(()=>page.getByRole('group',{name:'Размер прицепа',exact:true}).getByRole('button',{name:'XS',exact:true}).click(),'size edit then reopen same URL');
await reopen(async()=>{const field=page.getByLabel('Длина между креплениями',{exact:true});await field.fill('123');await field.press('Enter');},'spring length edit then reopen same URL');
await reopen(()=>page.getByLabel('Сцепка',{exact:true}).selectOption('rope'),'type edit then reopen same URL');
await reopen(async()=>{const field=page.getByLabel('Seed',{exact:true});await field.fill('43');await field.press('Enter');},'seed edit then reopen same URL');
await reopen(async()=>{const field=page.getByLabel('Насыщенность арены',{exact:true});await field.focus();await field.press('ArrowRight');},'density edit then reopen same URL');
await reopen(async()=>{await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByRole('button',{name:'Flight Assist',exact:true}).click();},'FA edit then reopen same URL');
const originalHash=await page.evaluate(()=>location.hash);await page.getByRole('button',{name:'Restart',exact:true}).click();await page.evaluate(()=>window.__bonkLab.pause());assert.equal(await page.evaluate(()=>location.hash),originalHash);await page.reload();await page.waitForFunction(()=>window.__bonkLab);assert.deepEqual(await page.evaluate(inspect),fixture);report.checks.push('unchanged Restart/pause/reload preserve original URL and settings');
for(const arrangement of ['front','rear']){
 await openSettings(page);await page.getByLabel('Сцепка',{exact:true}).selectOption('rigid');await page.getByLabel('Стартовое положение тягача',{exact:true}).selectOption(arrangement);await page.getByRole('button',{name:'Restart',exact:true}).click();await page.evaluate(()=>window.__bonkLab.pause());
 const snapshot=await page.evaluate(inspect),rigid=linkFor(url,snapshot);await page.goto(rigid);await page.waitForFunction(()=>window.__bonkLab.params['tow.type']==='rigid');assert.deepEqual(await page.evaluate(inspect),snapshot);
 const hash=await page.evaluate(()=>location.hash);await page.getByRole('button',{name:'Restart',exact:true}).click();await page.evaluate(()=>window.__bonkLab.pause());assert.equal(await page.evaluate(()=>location.hash),hash);
 await openSettings(page);await page.getByRole('button',{name:'Сброс',exact:true}).click();assert.equal(await page.evaluate(()=>location.hash),'');await page.goto(rigid);await page.waitForFunction(()=>window.__bonkLab.params['tow.type']==='rigid');assert.deepEqual(await page.evaluate(inspect),snapshot);await page.reload();await page.waitForFunction(()=>window.__bonkLab);assert.deepEqual(await page.evaluate(inspect),snapshot);report.checks.push(`schema4 ${arrangement}: same URL after Reset and reload exact`);
}
await page.close();
if(process.env.TUGLAB_URL){const old=await browser.newPage();track(old);await old.goto(process.env.TUGLAB_URL);await old.waitForFunction(()=>window.__bonkLab);const snapshot=await old.evaluate(()=>window.__bonkLab.exportShareSnapshot()),sharedOld=linkFor(process.env.TUGLAB_URL,snapshot,'tug');await old.goto(sharedOld);await old.waitForFunction(()=>window.__bonkLab);await openSettings(old);const length=old.getByLabel('Длина между креплениями',{exact:true});await length.fill('25');await length.press('Enter');assert.equal(await old.evaluate(()=>location.hash),'');await old.goto(sharedOld);await old.waitForFunction(value=>window.__bonkLab.params['tow.length']===value,snapshot.params['tow.length']);assert.deepEqual(await old.evaluate(()=>window.__bonkLab.exportShareSnapshot()),snapshot);await old.close();report.checks.push('old TugLab: changed length then same URL restores exact snapshot');}
assert.deepEqual(report.errors,[]);fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{await browser.close();}})().catch(e=>{console.error(e);fs.writeFileSync(`${out}/error.txt`,String(e.stack||e));process.exitCode=1;});
