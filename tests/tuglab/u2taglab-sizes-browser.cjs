// Проверяем выбор через реальные кнопки, численные значения и независимые получатели ссылки.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/bonk-tuglab-ui/node_modules/playwright');
const out=process.env.U2TAGLAB_QA_DIR||'/tmp/bonk-tuglab-tools/task568/browser';fs.mkdirSync(out,{recursive:true});
const url=process.env.U2TAGLAB_URL||'http://127.0.0.1:5175/u2taglab.html';
const report={checks:[],errors:[],physicalAndroid:false};
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
 const track=p=>{p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)report.errors.push(`HTTP${r.status()} ${r.url()}`);});};
 try{const page=await browser.newPage();track(page);await page.goto(url);await page.waitForFunction(()=>window.__bonkLab);await page.evaluate(()=>window.__bonkLab.pause());await page.getByRole('button',{name:'Настройки',exact:true}).click();
 for(const [width,height]of [[1280,900],[360,800],[390,844]]){
  await page.setViewportSize({width,height});
  for(const [role,sizes]of [['A',['S','M','L','XL']],['B',['XS','S','M','L','XL','XXL']]]){
   const row=page.getByRole('group',{name:role==='A'?'Размер тягача':'Размер прицепа',exact:true});assert.equal(await row.count(),1);
   for(const size of sizes){const button=row.getByRole('button',{name:size==='XXL'?'XXL (резерв)':size,exact:true});await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();assert.ok(box.width>=44&&box.height>=44);assert.ok(box.x>=0&&box.x+box.width<=width);}
  }
  for(const type of ['spring','rope','rod']){
   await page.getByLabel('Сцепка',{exact:true}).selectOption(type);
   await page.getByRole('group',{name:'Размер тягача',exact:true}).getByRole('button',{name:'XL',exact:true}).click();await page.getByRole('group',{name:'Размер прицепа',exact:true}).getByRole('button',{name:'XXL (резерв)',exact:true}).click();
   assert.equal(await page.getByLabel('Масса A',{exact:true}).inputValue(),'6419200');assert.equal(await page.getByLabel('Длина между креплениями',{exact:true}).inputValue(),'1440');
   const selected=await page.evaluate(()=>({a:window.__bonkLab.getSpaceSize('A'),b:window.__bonkLab.getSpaceSize('B'),s:window.__bonkLab.getState(),snapshot:window.__bonkLab.exportSpaceShareSnapshot()}));assert.equal(selected.a,'XL');assert.equal(selected.b,'XXL');assert.equal(selected.s.towing.needsRestart,false);assert.equal(selected.snapshot.params['tow.type'],type);
   assert.equal(await page.getByRole('group',{name:'Размер прицепа',exact:true}).getByRole('button',{name:'XXL (резерв)',exact:true}).getAttribute('aria-pressed'),'true');
   await page.getByRole('group',{name:'Размер тягача',exact:true}).getByRole('button',{name:'S',exact:true}).click();await page.getByRole('group',{name:'Размер прицепа',exact:true}).getByRole('button',{name:'XS',exact:true}).click();assert.equal(await page.getByLabel('Длина между креплениями',{exact:true}).inputValue(),'90');
  }
  await page.screenshot({path:`${out}/sizes-${width}.png`});report.checks.push(`actualbuttons spring/rope/rod extremes viewport${width}`);
 }
 const api=await page.evaluate(()=>{const lab=window.__bonkLab,results=[];for(const a of ['S','M','L','XL'])for(const b of ['XS','S','M','L','XL','XXL']){lab.selectSpaceSize('A',a);lab.selectSpaceSize('B',b);const s=lab.getState();results.push({a:lab.getSpaceSize('A'),b:lab.getSpaceSize('B'),bad:s.towing.needsRestart,massA:s.mass,massB:s.towing.B.mass,length:lab.params['tow.length']});}return results;});assert.equal(api.length,24);assert.ok(api.every(v=>v.a&&v.b&&!v.bad));report.combinations=api;
 await page.getByRole('group',{name:'Размер тягача',exact:true}).getByRole('button',{name:'XL',exact:true}).click();
 await page.getByRole('group',{name:'Размер прицепа',exact:true}).getByRole('button',{name:'XXL (резерв)',exact:true}).click();
 const source=await page.evaluate(()=>({s:window.__bonkLab.getState(),snapshot:window.__bonkLab.exportSpaceShareSnapshot()}));
 const link=url.replace(/#.*$/,'')+'#u2tag='+Buffer.from(JSON.stringify(source.snapshot)).toString('base64url');
 for(let i=0;i<2;i++){const target=await browser.newPage({viewport:{width:390,height:844}});track(target);await target.goto(link);await target.waitForFunction(()=>window.__bonkLab);assert.deepEqual(await target.evaluate(()=>({s:window.__bonkLab.getState(),snapshot:window.__bonkLab.exportSpaceShareSnapshot()})),source);await target.getByRole('button',{name:'Настройки',exact:true}).click();assert.equal(await target.getByRole('group',{name:'Размер тягача',exact:true}).getByRole('button',{name:'XL',exact:true}).getAttribute('aria-pressed'),'true');await target.close();}
 report.checks.push('all24 API + fullprofile share2fresh receivers + selected buttons restored');
 await page.getByLabel('Масса A',{exact:true}).fill('100000');await page.getByLabel('Масса A',{exact:true}).press('Enter');assert.equal(await page.getByRole('group',{name:'Размер тягача',exact:true}).getByRole('button',{name:'XL',exact:true}).getAttribute('aria-pressed'),'false');
 await page.getByRole('group',{name:'Размер тягача',exact:true}).getByRole('button',{name:'i',exact:true}).click();assert.match(await page.locator('.tug-size-help').innerText(),/экспериментальный резерв/);assert.deepEqual(report.errors,[]);report.status='PASS';console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}})().catch(e=>{console.error(e);process.exitCode=1;});
