// Отдаём настоящие артефакты без Vite: самостоятельный корень и вложенный путь Pages.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const output=process.env.U2TAGLAB_BUILT_QA_DIR||'.cache/u2taglab-qa';fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname,prefix=pathname.startsWith('/bonk-race/u2taglab/')?'/bonk-race/u2taglab/':'/';
 const root=path.resolve('client/dist-u2taglab'),file=path.resolve(root,decodeURIComponent(pathname.slice(prefix.length))||'index.html');
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  for(const [name,prefix]of [['root','/'],['nested','/bonk-race/u2taglab/']]){
   const url=`http://127.0.0.1:${server.address().port}${prefix}`,dir=path.resolve(output,name);fs.mkdirSync(dir,{recursive:true});
   const log=fs.openSync(path.join(dir,'browser.log'),'w');
   const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['tests/tuglab/u2taglab-ui.cjs'],{env:{...process.env,U2TAGLAB_URL:url,U2TAGLAB_QA_DIR:dir,U2TAGLAB_BUILT:'1'},stdio:['ignore',log,log]});child.once('error',reject);child.once('exit',resolve);});fs.closeSync(log);
   assert.equal(code,0,fs.readFileSync(path.join(dir,'browser.log'),'utf8'));
   console.log(JSON.stringify({name,url,...JSON.parse(fs.readFileSync(path.join(dir,'report.json'),'utf8'))}));
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
