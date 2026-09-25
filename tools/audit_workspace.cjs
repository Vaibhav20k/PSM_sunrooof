const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const code=['app.js','pages.js'].map(f=>fs.readFileSync(path.join(root,'source/production/public',f),'utf8')).join('\n');
(async()=>{for(const dir of process.argv.slice(2)){
 const raw={};for(const name of ['meta','leads','calls','rawquote','dealstage'])raw[name]=JSON.parse(fs.readFileSync(path.resolve(root,dir,name+'.json'),'utf8'));
 assert.equal(raw.leads.length,raw.meta.leadCount);assert.equal(raw.calls.length,raw.meta.callCount);
 assert.equal(new Set(raw.leads.map(l=>l[0])).size,raw.leads.length);assert.equal(new Set(raw.calls.map(c=>c[0])).size,raw.calls.length);
 assert.ok(raw.leads.every(l=>l.length===41));assert.ok(raw.calls.every(c=>c.length===12));
 const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval,fetch:async url=>({ok:true,json:async()=>structuredClone(raw[url.match(/data\/(\w+)\.json/)[1]])})});
 vm.runInContext(code,c);await vm.runInContext('loadData(true)',c);vm.runInContext('recompute()',c);
 const result=JSON.parse(vm.runInContext(`JSON.stringify((()=>{
 const eligible=M.leads.filter(l=>!l.converted&&boardOwnerOk(l)&&boardStatusOk(l));
 const bands=PRI_BANDS.slice(0,3).map(b=>{const all=eligible.filter(l=>l.fuPriority===b.key);return {label:b.key,crmUnconverted:DATA.leads.filter(l=>!l.converted&&l.fuPriority===b.key).length,displayed:all.length,done:all.filter(l=>l.fuState==='Completed').length,pending:all.filter(l=>l.fuState!=='Completed').length,missingDate:all.filter(l=>!l.fuEff).length};});
 const days=workspaceMandateRows(eligible,DATA.calls).map(r=>({day:r.day,pending:r.pending.length,completed:r.complete.length}));
 return {generatedAt:DATA.meta.generatedAt,leadCount:DATA.leads.length,linkedCalls:DATA.calls.length,bands,mandateEligible:eligible.filter(l=>l.source==='A and B'&&l.status==='Open').length,days};
 })())`,c));
 console.log(JSON.stringify({directory:dir,...result}));
}})().catch(e=>{console.error(e);process.exitCode=1});
