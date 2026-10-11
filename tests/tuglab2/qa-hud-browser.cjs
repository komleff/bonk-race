// Регрессии текущего кадра HUD и сохранённого терминального исхода, без подмены физики.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {TrainSession}=require('../../.cache/tuglab2-tests/client/src/tuglab2/session');
const {createDefaultTrainConfig}=require('../../.cache/tuglab2-tests/client/src/tuglab2/config');
const {replayRecording,exportRecording}=require('../../.cache/tuglab2-tests/client/src/tuglab2/recording');
const {RECORDING_REASON}=require('../../.cache/tuglab2-tests/client/src/tuglab2/recordingLimits');
const evidence=path.resolve('.cache/tuglab2-qa/ui-hud');
async function save(page){const wait=page.waitForEvent('download');await page.getByRole('button',{name:'Сохранить JSON',exact:true}).click();return JSON.parse(fs.readFileSync(await(await wait).path(),'utf8'));}
async function links(page){
 const hud=page.getByTestId('train-hud');assert.equal(await hud.getAttribute('data-time'),'0');
 for(const id of ['AB','BC']){
  await page.getByRole('button',{name:`${id}: расцепить`,exact:true}).click();
  assert.match(await hud.innerText(),new RegExp(`${id}: OFF[^\\n]*T 0 Н`),'расцепка на паузе видна до Step');
  assert.equal(await hud.getAttribute('data-time'),'0');
  await page.getByRole('button',{name:`${id}: сцепить`,exact:true}).click();
  assert.match(await hud.innerText(),new RegExp(`${id}: ON[^\\n]*l₀ 360`));assert.equal(await hud.getAttribute('data-time'),'0');
 }
 await page.getByRole('button',{name:'Старт',exact:true}).click();await page.keyboard.down('KeyA');await page.waitForTimeout(500);await page.keyboard.up('KeyA');await page.getByRole('button',{name:'Пауза',exact:true}).click();
 const before=await save(page),time=await hud.getAttribute('data-time');
 for(const id of ['AB','BC']){
  await page.getByRole('button',{name:`${id}: расцепить`,exact:true}).click();assert.match(await hud.innerText(),new RegExp(`${id}: OFF[^\\n]*T 0 Н`));
  await page.getByRole('button',{name:`${id}: сцепить`,exact:true}).click();
  const record=await save(page),actual=replayRecording(record,{identity:record}).state.connections.find(c=>c.id===id);
  assert.notEqual(actual.restLength,360,'захват меняет l₀ на фактическую длину');
  const row=(await hud.innerText()).split('\n').find(s=>s.startsWith(`${id}:`));
  assert.ok(row.includes(`l₀ ${actual.restLength.toLocaleString('ru-RU',{maximumFractionDigits:2})}`),row);
  assert.equal(await hud.getAttribute('data-time'),time);assert.deepEqual(record.ticks,before.ticks,'история принятых тиков не меняется при захвате');
 }
}
async function terminals(page,label){
 const identity=await save(page),hud=page.getByTestId('train-hud'),idle={x:0,y:0,magnitude:0,brake:false};
 const c=createDefaultTrainConfig();c.ships.A.forwardForce=1e10;c.numerics.maxAdaptiveSubsteps=4;
 const numerical=new TrainSession(c,{sourceSHA:identity.sourceSHA,appVersion:identity.appVersion,fa:false});numerical.resume();
 for(let i=0;i<200;i++){if(!numerical.step({...idle,x:1,magnitude:i<2?0:1}).accepted)break;}
 assert.ok(numerical.stoppedReason?.includes('численный бюджет'));assert.ok(numerical.recording.ticks.length);
 const short=new TrainSession(createDefaultTrainConfig(),identity);short.resume();short.step(idle);short.pause();
 // Валидный сохранённый префикс с ресурсной и сторонней причиной проверяет отдельные классы метаданных.
 const cases=[['numerical',numerical.recording,'Численная остановка'],['resource',{...short.recording,stopReason:RECORDING_REASON},'Ресурсная остановка'],['source',{...short.recording,stopReason:'Внешняя причина сохранённого заезда'},'Заезд завершён'],['short',short.recording,'Окно записи не завершено']];
 for(const [name,record,outcome] of cases){
  await page.locator('input[type=file]').setInputFiles({name:`${name}.json`,mimeType:'application/json',buffer:Buffer.from(exportRecording(record))});await page.getByTestId('io-status').filter({hasText:/Импортировано/}).waitFor();
  assert.equal(await hud.getAttribute('data-time'),'0');
  if(record.stopReason){assert.match(await hud.innerText(),/Исход сохранённого заезда/);assert.ok((await hud.innerText()).includes(record.stopReason));}
  await page.getByRole('button',{name:'Воспроизвести',exact:true}).click();await page.getByTestId('io-status').filter({hasText:/Воспроизведено/}).waitFor({timeout:30000});
  await hud.locator('details').evaluate(el=>el.open=true);
  assert.ok((await hud.innerText()).includes(outcome),`${name}: ${await hud.innerText()}`);
  if(record.stopReason){assert.ok((await hud.innerText()).includes(record.stopReason));assert.doesNotMatch(await hud.innerText(),/Окно записи не завершено/);}
  else assert.doesNotMatch(await hud.innerText(),/Численная остановка|Ресурсная остановка|Заезд завершён/);
  const output=await save(page);assert.equal(output.stopReason,record.stopReason);assert.deepEqual(output.ticks,JSON.parse(exportRecording(record)).ticks);
  fs.writeFileSync(path.join(evidence,`${label}-${name}.json`),JSON.stringify({acceptedTicks:record.ticks.length,stopReason:record.stopReason,hud:await hud.innerText()},null,2));
 }
}
(async()=>{
 fs.mkdirSync(evidence,{recursive:true});
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local'),nested=url.pathname.startsWith('/bonk-race/'),root=path.resolve(nested?'client/dist-pages':'client/dist-tuglab2');let file=path.join(root,nested?url.pathname.slice(11):url.pathname);if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{for(const [label,url] of process.env.TUGLAB2_URL?[['dev',process.env.TUGLAB2_URL]]:[['root',base+'/'],['nested',base+'/bonk-race/tuglab2/']]){
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.getByTestId('train-hud').waitFor();
  if(process.env.TUGLAB2_HUD_CASE!=='terminal')await links(page);
  await page.getByRole('button',{name:'Restart',exact:true}).click();if(process.env.TUGLAB2_HUD_CASE!=='links')await terminals(page,label);
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(evidence,`${label}.png`),fullPage:true});await page.close();console.log(`PASS HUD ${label}`);
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
