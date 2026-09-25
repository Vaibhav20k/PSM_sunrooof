const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function context(){const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval});vm.runInContext(['app.js','pages.js'].map(n=>fs.readFileSync(path.join(root,'source/production/public',n),'utf8')).join('\n'),c);return c;}
const json=(c,code)=>JSON.parse(vm.runInContext('JSON.stringify('+code+')',c));
test('IST periods cover complete weeks, leap months, years and exact midnight boundaries',()=>{
 const c=context();c.now=Date.parse('2026-09-25T20:00:00Z');
 assert.equal(vm.runInContext('STATE.workspace.period',c),'today');
 for(const [period,from,to] of [['today','2026-09-26','2026-09-27'],['thisweek','2026-09-21','2026-09-28'],['lastweek','2026-09-14','2026-09-21'],['thismonth','2026-09-01','2026-10-01'],['lastmonth','2026-08-01','2026-09-01'],['thisyear','2026-01-01','2027-01-01']]){
  c.period=period;const r=json(c,'workspaceDateRange({period},now)');assert.equal(r.start,Date.parse(from+'T00:00:00+05:30'));assert.equal(r.end,Date.parse(to+'T00:00:00+05:30'));
 }
 c.now=Date.parse('2024-03-01T01:00:00+05:30');let r=json(c,"workspaceDateRange({period:'lastmonth'},now)");assert.equal(r.end-r.start,29*86400000);
 c.now=Date.parse('2026-01-01T01:00:00+05:30');r=json(c,"workspaceDateRange({period:'lastmonth'},now)");assert.equal(r.start,Date.parse('2025-12-01T00:00:00+05:30'));
});
test('follow-up timestamps determine inclusion, missing dates and custom intervals are explicit',()=>{
 const c=context();c.now=Date.parse('2026-09-26T12:00:00+05:30');vm.runInContext("range=workspaceDateRange({period:'today'},now)",c);
 for(const [fuEff,expected] of [['2026-09-25T18:29:59Z',false],['2026-09-25T18:30:00Z',true],['2026-09-26T18:29:59Z',true],['2026-09-26T18:30:00Z',false],['2026-09-26T08:00',true],[null,false],['invalid',false]]){
  c.record={lead:{created:'2000-01-01',fuEff},task:false};assert.equal(vm.runInContext('workspaceDateMatches(record,range)',c),expected);
 }
 c.record={lead:{fuEff:'2000-01-01',dueDate:'2026-09-26'},task:true};assert.equal(vm.runInContext('workspaceDateMatches(record,range)',c),true);
 assert.equal(vm.runInContext("workspaceDateMatches({lead:{}},workspaceDateRange({period:'all'}))",c),true);
 assert.equal(vm.runInContext("workspaceDateRange({period:'custom',from:'2026-09-26T12:00',to:'2026-09-26T11:00'}).valid",c),false);
 assert.equal(vm.runInContext("workspaceDateMatches({lead:{fuEff:'2026-09-26T12:30:59+05:30'}},workspaceDateRange({period:'custom',from:'2026-09-26T12:00',to:'2026-09-26T12:30'}))",c),true);
});
test('ten-row previews expand independently and all exported task IDs remain available',async()=>{
 const raw={};for(const name of ['meta','leads','calls','rawquote','dealstage','rawleads','priorityleads','mandateleads'])raw[name]=JSON.parse(fs.readFileSync(path.join(root,'data/snapshot',name+'.json'),'utf8'));
 Object.assign(raw.meta,{rawLeadExport:true,priorityLeadExport:true,mandateLeadExport:true});
 const c=context();c.fetch=async url=>({ok:true,json:async()=>structuredClone(raw[url.match(/data\/(\w+)\.json/)[1]])});
 await vm.runInContext('loadData(true)',c);vm.runInContext("recompute();workspaceChangePeriod('all')",c);
 const rows=vm.runInContext('workspacePlainRows()',c);assert.equal(rows.length,6268);
 assert.deepEqual(Array.from(rows).filter(r=>r.task).map(r=>r.lead.taskId).sort(),raw.mandateleads.leads.map(l=>l.taskId).sort());
 const groups=vm.runInContext('workspaceGroups(workspacePlainRows())',c);assert.equal(groups.length,10);
 for(const group of groups){c.group=group;let html=vm.runInContext('workspaceSection(group)',c);assert.equal((html.match(/data-record-id=/g)||[]).length,Math.min(10,group.rows.length));assert.equal(html.includes('data-ws-expand='),group.rows.length>10);}
 vm.runInContext("STATE.workspace.expanded.add('day-2')",c);let html=vm.runInContext("workspaceSection(workspaceGroups(workspacePlainRows()).find(g=>g.id==='day-2'))",c);assert.equal((html.match(/data-record-id=/g)||[]).length,945);
 html=vm.runInContext("workspaceSection(workspaceGroups(workspacePlainRows())[0])",c);assert.equal((html.match(/data-record-id=/g)||[]).length,10);
 vm.runInContext("workspaceChangePeriod('today')",c);assert.equal(vm.runInContext('STATE.workspace.expanded.size',c),0);
 const today=vm.runInContext('workspacePlainRows()',c);assert.ok(Array.from(today).every(r=>{c.row=r;return vm.runInContext('workspaceDateMatches(row)',c);}));
 console.log('Today matching records:',today.length);
 c.owner=raw.priorityleads.leads[0].ownerId;vm.runInContext("STATE.filters.psm=[owner];recompute();workspaceChangePeriod('all')",c);assert.ok(Array.from(vm.runInContext('workspacePlainRows()',c)).every(r=>r.lead.ownerId===c.owner));
});
test('shared analytics tables preview ten records and retain complete totals',()=>{
 const c=context();c.rows=Array.from({length:24},(_,i)=>({n:i}));const html=vm.runInContext("table([{h:'Record',f:r=>r.n}],rows,{foot:(col,all)=>all.length})",c);
 assert.equal((html.match(/<tr>/g)||[]).length,12);assert.match(html,/Showing 10 of 24/);assert.match(html,/View more/);assert.match(html,/>24<\/td>/);
 const full=vm.runInContext("table([{h:'Record',f:r=>r.n}],rows,{expanded:true})",c);assert.match(full,/Showing 24 of 24/);assert.match(full,/Show top 10/);
});
