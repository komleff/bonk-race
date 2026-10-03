// Самостоятельный HTTP smoke и замер настоящего RAF без ускорения времени.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/tmp/bonk-tuglab-ui/node_modules/playwright');
const output = process.env.TUGLAB_QA_DIR || '.cache/tuglab-qa';
const seconds = Number(process.env.TUGLAB_PERF_SECONDS ?? 120);
const report = { codeSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), timestamp:new Date().toISOString(),
  headless:process.env.TUGLAB_HEADLESS !== '0', http:[], errors:[], failedRequests:[], externalRequests:[], performance:null };
const roots = { '/bonk-race/tuglab/':'client/dist-tuglab', '/nested/tuglab/':'client/dist-tuglab', '/bonk-race/':'client/dist-lab', '/':'client/dist-tuglab' };
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const prefix = Object.keys(roots).find(p=>pathname.startsWith(p));
  const root = path.resolve(roots[prefix]), relative = pathname.slice(prefix.length) || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end();return;}
  const type = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200,{'Content-Type':type});fs.createReadStream(file).pipe(res);
});
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:report.headless,
    executablePath:process.env.CHROME_PATH || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
  report.browser=browser.version();
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
    page.on('pageerror',error=>report.errors.push(error.message));
    page.on('requestfailed',request=>report.failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
    page.on('request',request=>{if(!request.url().startsWith(origin))report.externalRequests.push(request.url());});
    page.on('response',response=>{if(response.status()>=400)report.errors.push(`HTTP ${response.status()} ${response.url()}`);});
    for(const prefix of ['/','/bonk-race/tuglab/']) {
      await page.goto(origin+prefix);
      await page.waitForFunction(()=>window.__bonkLab?.getState().startCountdown<=0);
      const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({url:r.name,bytes:r.transferSize})));
      assert.ok(resources.length>0); assert.ok(resources.every(r=>r.url.startsWith(origin+prefix)));
      assert.ok(await page.evaluate(()=>!!window.__bonkLab.getState().towing));
      report.http.push({url:origin+prefix,resources,status:'PASS'});
    }
    for(const viewport of [{width:1280,height:720},{width:1024,height:600}]) {
      await page.setViewportSize(viewport);
      await page.getByRole('button',{name:'Пауза',exact:true}).click();
      const geometry=await page.evaluate(()=>({canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),
        toolbar:document.querySelector('.tug-status').getBoundingClientRect().toJSON(),
        buttons:[...document.querySelectorAll('.tug-actions button')].map(b=>b.getBoundingClientRect().toJSON())}));
      assert.ok(geometry.canvas.top>=geometry.toolbar.bottom);
      assert.ok(geometry.buttons.every(b=>b.width>=44&&b.height>=44&&b.x>=0&&b.right<=viewport.width));
      await page.screenshot({path:path.join(output,`desktop-${viewport.width}x${viewport.height}.png`)});
      report.http.push({viewport,geometry,status:'PASS'});
      await page.getByRole('button',{name:'Продолжить',exact:true}).click();
    }
    await page.goto(origin+'/bonk-race/lab.html');
    await page.waitForFunction(()=>window.__bonkLab);
    assert.equal(await page.evaluate(()=>window.__bonkLab.getState().towing),undefined);
    assert.equal(await page.getByRole('button',{name:'Экспорт',exact:true}).count(),1);
    await page.getByLabel('Seed',{exact:true}).fill('-42');
    assert.equal(await page.evaluate(()=>window.__bonkLab.lastSeed),-42,'stock Seed keeps the existing signed input behavior');
    await page.locator('#lab-canvas').click({position:{x:200,y:200}});await page.keyboard.down('w');
    assert.equal(await page.evaluate(()=>window.__labInput.getState().magnitude),0);await page.keyboard.up('w');
    report.http.push({url:origin+'/bonk-race/lab.html',stockOptOut:true,status:'PASS'});
    if(seconds>0) {
      await page.setViewportSize({width:1280,height:720});await page.goto(origin+'/');
      await page.waitForFunction(()=>window.__bonkLab?.getState().startCountdown<=0);
      await page.waitForTimeout(3000);
      await page.evaluate(()=>{
        const lab=window.__bonkLab, ticks=[], frames=[], intervals=[], failures=[];
        const originalTick=lab.tick.bind(lab), originalUpdate=lab.update.bind(lab);
        lab.tick=dt=>{const begin=performance.now();try{return originalTick(dt);}finally{ticks.push(performance.now()-begin);}};
        lab.update=dt=>{const begin=performance.now();try{return originalUpdate(dt);}finally{frames.push(performance.now()-begin);intervals.push(dt*1000);
          const s=lab.getState();if(s.towing.needsRestart||s.towing.paused||document.hidden)failures.push({reason:s.towing.reason,hidden:document.hidden,time:performance.now()});}};
        window.__qaPerf={ticks,frames,intervals,failures,start:performance.now(),params:lab.params,
          arena:{seed:42,obstacles:lab.getState().arena.obstacles.length,zones:lab.getState().arena.zones.length,orbs:lab.getState().orbs.length},
          devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},userAgent:navigator.userAgent};
      });
      // Реальные клавиатурные события; каждые 3 с смена направления без модификации сцены.
      const keys=['w','d',null,'a',null,'w',null];let previous=null;
      const begin=Date.now();let section=-1;
      while(Date.now()-begin<seconds*1000) {
        const next=Math.floor((Date.now()-begin)/3000);
        if(next!==section) {if(previous)await page.keyboard.up(previous);previous=keys[next%keys.length];if(previous)await page.keyboard.down(previous);section=next;}
        await page.waitForTimeout(500);
      }
      if(previous)await page.keyboard.up(previous);
      report.performance=await page.evaluate(()=>{
        const p=window.__qaPerf;
        const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {count:sorted.length,median:sorted[Math.floor(sorted.length*0.5)],p95:sorted[Math.floor(sorted.length*0.95)],max:sorted.at(-1)};};
        const elapsed=performance.now()-p.start;
        return {...p,elapsedMs:elapsed,tickMs:stats(p.ticks),updateMs:stats(p.frames),frameIntervalMs:stats(p.intervals),
          fps:p.intervals.length/(elapsed/1000),intervalsAbove25Ms:p.intervals.filter(v=>v>25).length,
          estimatedMissed60HzFrames:p.intervals.reduce((sum,v)=>sum+Math.max(0,Math.round(v/(1000/60))-1),0),
          final:{reason:window.__bonkLab.getState().towing.reason,needsRestart:window.__bonkLab.getState().towing.needsRestart}};
      });
      assert.ok(report.performance.elapsedMs>=seconds*1000);
      assert.deepEqual(report.performance.failures,[]);
    }
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);assert.deepEqual(report.externalRequests,[]);
    report.pass=true;
  } finally {await browser.close();server.close();fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify(report,null,2)+'\n');}
  console.log(`PASS static root/nested/stock/layout; performance=${seconds}s; evidence ${output}`);
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
