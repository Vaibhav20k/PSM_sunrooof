const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('plain table includes every exported raw, priority and mandated record without pagination',async()=>{
 const raw={};for(const name of ['meta','leads','calls','rawquote','dealstage','rawleads','priorityleads','mandateleads']) raw[name]=JSON.parse(fs.readFileSync(path.join(root,'data/snapshot',name+'.json'),'utf8'));
 Object.assign(raw.meta,{rawLeadExport:true,priorityLeadExport:true,mandateLeadExport:true});
 const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval,fetch:async url=>({ok:true,json:async()=>structuredClone(raw[url.match(/data\/(\w+)\.json/)[1]])})});
 vm.runInContext(['app.js','pages.js'].map(n=>fs.readFileSync(path.join(root,'source/production/public',n),'utf8')).join('\n'),c);
 await vm.runInContext('loadData(true)',c);vm.runInContext('recompute()',c);
 const rows=vm.runInContext('workspacePlainRows()',c);
 assert.equal(rows.length,4539+749+980);
 const tasks=Array.from(rows).filter(r=>r.task).map(r=>r.lead.taskId).sort();
 assert.deepEqual(tasks,raw.mandateleads.leads.map(l=>l.taskId).sort());
 for(const [priority,count] of Object.entries(raw.priorityleads.counts)) assert.equal(Array.from(rows).filter(r=>r.category.toLowerCase()===priority.toLowerCase()).length,count);
 const html=vm.runInContext('RENDER.workspace()',c);
 assert.equal((html.match(/<table /g)||[]).length,1);assert.equal((html.match(/data-record-id=/g)||[]).length,6268);assert.ok(!html.includes('data-ws-step'));assert.ok(!html.includes('ws-card-scroll'));
 console.log('Full plain table verified: 6,268 records, including all 980 task IDs.');
});
