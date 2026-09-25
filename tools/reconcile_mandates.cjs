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
 const exported=JSON.parse(fs.readFileSync(path.join(root,'data/mandate-audit-input.json'),'utf8'));
 const pending=JSON.parse(vm.runInContext('JSON.stringify(workspaceMandateRows(M.leads.filter(l=>!l.converted&&boardOwnerOk(l)&&boardStatusOk(l)),DATA.calls).flatMap(r=>r.pending.map(l=>({id:l.id,day:r.day}))))',c));
 const ids=new Set(pending.map(l=>l.id));
 const active=Object.keys(exported).filter(id=>exported[id]['RNR Sequence Status']==='In Progress');
 const activeSet=new Set(active);
 const matches=pending.filter(l=>activeSet.has(l.id));
 const extra=pending.filter(l=>!activeSet.has(l.id)).map(l=>({...l,crm:exported[l.id]||null}));
 const missing=active.filter(id=>!ids.has(id)).map(id=>({id,crm:exported[id]}));
 const labels=Object.keys(exported).filter(id=>exported[id]['Follow up Priority']==='Mandate Call');
 const report={snapshot:result.generatedAt,exportedAt:'2026-09-24T15:57:00+05:30',dashboardDays:result.days,dashboardTotal:pending.length,rnrActive:active.length,overlap:matches.length,extra:extra.length,missing:missing.length,mandateLabel:labels.length,rows:{matches,extra,missing}};
 fs.writeFileSync(path.join(root,'data/mandate-reconciliation.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,rows:undefined}));
}})().catch(e=>{console.error(e);process.exitCode=1});
