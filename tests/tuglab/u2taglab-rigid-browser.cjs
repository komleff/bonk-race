// Браузерная проверка новой сцепки через настоящие элементы управления и Share.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/bonk-tuglab-ui/node_modules/playwright');
const out=process.env.U2TAGLAB_QA_DIR||'/tmp/bonk-rigid-logs/browser';fs.mkdirSync(out,{recursive:true});
const report={checks:[],errors:[],physicalAndroid:false};
const url=process.env.U2TAGLAB_URL||'http://127.0.0.1:5187/u2taglab.html';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
const track=page=>{page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});};
try{for(const width of [360,390,1280]){const page=await browser.newPage({viewport:{width,height:844},hasTouch:true});track(page);await page.goto(url);await page.waitForFunction(()=>window.__bonkLab);await page.getByRole('button',{name:'Настройки',exact:true}).click();
await page.getByLabel('Сцепка',{exact:true}).selectOption('rigid');
for(const label of ['Длина между креплениями','Жёсткость пружины k','Модуль пружины','Демпфирование пружины c'])assert.equal(await page.getByLabel(label,{exact:true}).count(),0,label);
for(const arrangement of ['front','rear']){
 await page.getByLabel('Стартовое положение тягача',{exact:true}).selectOption(arrangement);
 await page.getByRole('group',{name:'Размер тягача',exact:true}).getByRole('button',{name:'XL',exact:true}).click();
 await page.getByRole('group',{name:'Размер прицепа',exact:true}).getByRole('button',{name:'XXL (резерв)',exact:true}).click();
 await page.getByRole('button',{name:'Restart',exact:true}).click();await page.evaluate(()=>window.__bonkLab.pause());
 const expected=await page.evaluate(()=>({snapshot:window.__bonkLab.exportSpaceShareSnapshot(),world:window.__bonkLab.getState().spaceWorld,state:window.__bonkLab.getState()}));
 assert.equal(expected.snapshot.schema,4);assert.equal(expected.snapshot.params['tow.rigidArrangement'],arrangement);assert.ok(expected.state.towing.distance<1e-7);assert.equal(expected.state.towing.needsRestart,false);
 await page.getByRole('button',{name:'Поделиться',exact:true}).click();const link=await page.getByLabel('Ссылка на заезд',{exact:true}).inputValue();await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 const recipient=await browser.newPage({viewport:{width,height:844}});track(recipient);await recipient.goto(link);await recipient.waitForFunction(()=>window.__bonkLab);
 const actual=await recipient.evaluate(()=>({snapshot:window.__bonkLab.exportSpaceShareSnapshot(),world:window.__bonkLab.getState().spaceWorld,A:window.__bonkLab.getSpaceSize('A'),B:window.__bonkLab.getSpaceSize('B'),bad:window.__bonkLab.getState().towing.needsRestart}));
 assert.deepEqual(actual.snapshot,expected.snapshot);assert.deepEqual(actual.world,expected.world);assert.equal(actual.A,'XL');assert.equal(actual.B,'XXL');assert.equal(actual.bad,false);
 await recipient.close();report.checks.push({width,arrangement,share:'exact XL/XXL'});
}
await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.waitForTimeout(100);await page.screenshot({path:`${out}/rigid-${width}.png`});await page.close();
}assert.deepEqual(report.errors,[]);fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{await browser.close();}})().catch(e=>{fs.writeFileSync(`${out}/error.txt`,String(e.stack||e));console.error(e);process.exitCode=1;});
