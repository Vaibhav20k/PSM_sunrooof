const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'source/production/public/app.js'),'utf8');
const pages=fs.readFileSync(path.join(root,'source/production/public/pages.js'),'utf8');
const helper=fs.readFileSync(path.join(root,'source/local-preview/open-attempts.js'),'utf8');
const context=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval,module:{exports:{}}});
vm.runInContext(helper,context);
const {abDailyAttempts:daily,abOpenCycle:cycle,abCallDay:day}=context.module.exports;
const lead={id:'synthetic-lead',ownerId:'synthetic-psm',source:'A and B',status:'Open',converted:false};
const base=Date.parse('2026-09-01T09:00:00+05:30');
function call(id,minute,extra={}){return {id,leadId:lead.id,ownerId:lead.ownerId,type:'Outbound',outStatus:'Completed',start:new Date(base+minute*60000).toISOString(),dur:0,durationKnown:true,...extra};}
const dayCalls=(d=0)=>[call(`a${d}`,d*1440),call(`b${d}`,d*1440+3),call(`c${d}`,d*1440+33),call(`d${d}`,d*1440+36)];
const six=Array.from({length:6},(_,i)=>dayCalls(i)).flat();
const now=base+5*86400000+40*60000;
test('IST midnight boundary is explicit for zoned timestamps',()=>{assert.equal(day('2026-09-01T18:29:59Z'),'2026-09-01');assert.equal(day('2026-09-01T18:30:00Z'),'2026-09-02');assert.equal(day('invalid'),null)});
test('three-minute inclusive pair boundary; over boundary does not pair',()=>{assert.equal(daily([call('a',0),call('b',3)])[0].completed,1);assert.equal(daily([call('a',0),call('b',3.001)])[0].completed,0)});
test('30-minute gap is measured from first pair end',()=>{assert.equal(daily(dayCalls())[0].completed,2);assert.equal(daily([call('a',0),call('b',3),call('c',32.99),call('d',35.99)])[0].completed,1)});
test('duplicate IDs cannot create an extra attempt',()=>{assert.equal(daily([call('same',0),call('same',1)])[0].completed,0)});
test('caller groups cannot share pairs',()=>{assert.equal(daily([call('a',0),call('b',1,{ownerId:'another'})]).reduce((n,x)=>n+x.completed,0),0)});
test('planned and inbound calls do not make outbound attempts',()=>{assert.equal(daily([call('a',0,{outStatus:'Scheduled'}),call('b',1,{type:'Inbound'})]).length,0)});
test('six days at exact 24-hour starts qualify for 12 attempts',()=>{const r=cycle(lead,six,now);assert.equal(r.callRuleMet,true);assert.equal(r.completedDays,6);assert.equal(r.pendingAttempts,0);assert.equal(r.statusHistoryVerified,false)});
test('five days are insufficient',()=>{assert.equal(cycle(lead,six.slice(0,20),now).callRuleMet,false)});
test('missed days do not reset eligible non-consecutive days',()=>{const calls=Array.from({length:6},(_,i)=>dayCalls(i*2)).flat();assert.equal(cycle(lead,calls,base+11*86400000).callRuleMet,true)});
test('less than 24-hour start separation does not qualify both days',()=>{const calls=[...dayCalls(),...[call('e',1439),call('f',1442),call('g',1472),call('h',1475)]];assert.equal(cycle(lead,calls,base+1500*60000).completedDays,1)});
test('connected call by another owner resets unsuccessful cycle',()=>{const calls=[...six,call('connection',5*1440+37,{ownerId:'another',dur:20})];assert.equal(cycle(lead,calls,now).completedDays,0)});
test('unknown duration and other owners do not qualify',()=>{assert.equal(cycle(lead,six.map(c=>({...c,durationKnown:false})),now).completedDays,0);assert.equal(cycle(lead,six.map(c=>({...c,ownerId:'another'})),now).completedDays,0)});
test('future calls do not qualify',()=>{assert.equal(cycle(lead,six,base-1).completedDays,0)});
test('source/status/conversion guards exclude inapplicable leads',()=>{for(const patch of [{source:'Website'},{status:'Raw'},{converted:true}]){const r=cycle({...lead,...patch},six,now);assert.equal(r.applicable,false);assert.equal(r.pendingAttempts,0)}});
test('current-day partial earns one attempt; historical partial earns none',()=>{const calls=[call('a',0),call('b',1)];assert.equal(cycle(lead,calls,base+60*60000).pendingAttempts,11);assert.equal(cycle(lead,calls,base+86400000).pendingAttempts,12)});
test('standalone helper and deployed helper implementations match',()=>{const c=vm.createContext({console,Date,Intl,module:{exports:{}}});vm.runInContext(app+'\n'+pages,c);for(const name of ['abCallDay','abDailyAttempts','abOpenCycle'])assert.equal(vm.runInContext(name+'.toString()',c),vm.runInContext(name+'.toString()',context))});
test('snapshot contracts, all 13 renderers and independent status/caller totals',async()=>{
  const raw={};for(const n of ['meta','leads','calls','rawquote','dealstage'])raw[n]=JSON.parse(fs.readFileSync(path.join(root,'data/snapshot',n+'.json'),'utf8'));
  const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval,fetch:async url=>({ok:true,json:async()=>structuredClone(raw[url.match(/data\/(\w+)\.json/)[1]])})});
  vm.runInContext(app+'\n'+pages,c);
  await vm.runInContext('loadData(true)',c);
  vm.runInContext('recompute()',c);
  assert.equal(vm.runInContext('M.psm.reduce((s,p)=>s+p.calls,0)',c),vm.runInContext('M.tot.calls',c));
  const expected=raw.leads.filter(r=>r[8]==='A and B'&&!r[27]&&r[9]).length;
  assert.equal(vm.runInContext('boardLeadStatusModel().leads.length',c),expected);
  assert.equal(vm.runInContext('boardLeadStatusModel().rows.reduce((s,r)=>s+r.leads.length,0)',c),expected);
  const keys=vm.runInContext('PAGES.map(p=>p[0])',c);assert.equal(keys.length,13);
  for(const key of keys){const html=vm.runInContext(`CLICK.length=0; RENDER[${JSON.stringify(key)}]()`,c);assert.equal(typeof html,'string',key);assert.ok(html.length>100,key);assert.ok(!html.includes('[object Object]'),key);}
  vm.runInContext("STATE.filters.source=['__no_matching_source__'];recompute()",c);
  assert.equal(vm.runInContext('boardLeadStatusModel().leads.length',c),0);
  assert.ok(vm.runInContext('boardLeadStatusMatrix()',c).includes('No leads match'));
});


test('workspace mandate rows unlock in order and separate waiting leads',()=>{
  const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval});
  vm.runInContext(app+'\n'+pages,c);
  c.sampleLead=lead;c.sampleCalls=dayCalls();c.sampleNow=base+40*60000;
  const rows=vm.runInContext('workspaceMandateRows([sampleLead],sampleCalls,sampleNow)',c);
  assert.equal(rows.length,5);
  assert.equal(rows[0].complete.length,1);
  assert.equal(rows[1].pending.length,1);
  assert.equal(rows[1].ready.length,0);
  assert.equal(rows[2].reached.length,0);
  c.sampleNow=base+86400000;
  assert.equal(vm.runInContext('workspaceMandateRows([sampleLead],sampleCalls,sampleNow)[1].ready.length',c),1);
  assert.equal(vm.runInContext('workspaceMandateRows([],[],sampleNow).every(r=>r.reached.length===0)',c),true);
});


test('inline calling links validate numbers and distinguish follow-up windows',()=>{
  const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval});
  vm.runInContext(app+'\n'+pages,c);
  assert.match(vm.runInContext(`workspacePhoneLink({name:'Example',mobile:'+91 (90000) 00000'})`,c),/href="tel:\+919000000000"/);
  assert.ok(!vm.runInContext(`workspacePhoneLink({mobile:'javascript:alert(1)'})`,c).includes('href='));
  assert.equal(vm.runInContext(`workspaceFollowupWindow({fuEff:null})`,c),'No call window set');
  assert.equal(vm.runInContext(`workspaceFollowupWindow({fuEff:'2026-09-25T10:00:00+05:30'},Date.parse('2026-09-24T10:00:00+05:30'))`,c),'Upcoming call window');
  assert.equal(vm.runInContext(`workspaceFollowupWindow({fuEff:'2026-09-23T10:00:00+05:30'},Date.parse('2026-09-24T10:00:00+05:30'))`,c),'Follow-up due');
  assert.equal(vm.runInContext(`workspaceFollowupWindow({fuState:'Completed'})`,c),'Follow-up actioned');
});


test('calling lists sort chronologically with missing dates last, regardless of completion',()=>{
  const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval});
  vm.runInContext(app+'\n'+pages,c);
  assert.ok(vm.runInContext("workspaceDateOrder('2026-09-01T10:00:00+05:30','2026-09-01T05:00:00Z')",c)<0);
  assert.ok(vm.runInContext("workspaceDateOrder(null,'2026-09-01')",c)>0);
  assert.equal(vm.runInContext("workspaceDateOrder(null,'invalid')",c),0);
  assert.ok(vm.runInContext('workspaceDateOrder(100,200)',c)<0);
  c.rows=[{name:'Later pending',fuEff:'2026-09-24',fuState:'Pending'},{name:'Undated',fuEff:null},{name:'Earlier completed',fuEff:'2026-09-20',fuState:'Completed'}];
  const html=vm.runInContext("workspaceLeadList(rows,'Test',true)",c);
  assert.ok(html.indexOf('Earlier completed')<html.indexOf('Later pending'));
  assert.ok(html.indexOf('Later pending')<html.indexOf('Undated'));
});


test('imported Raw view matches all exported IDs and respects owner/date filters',async()=>{
  const raw={};for(const name of ['meta','leads','calls','rawquote','dealstage','rawleads'])raw[name]=JSON.parse(fs.readFileSync(path.join(root,'data/snapshot',name+'.json'),'utf8'));
  raw.meta.rawLeadExport=true;
  const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval,fetch:async url=>({ok:true,json:async()=>structuredClone(raw[url.match(/data\/(\w+)\.json/)[1]])})});
  vm.runInContext(app+'\n'+pages,c);
  await vm.runInContext('loadData(true)',c);vm.runInContext('recompute()',c);
  const ids=JSON.parse(vm.runInContext('JSON.stringify(workspaceRawLeads().map(l=>l.id).sort())',c));
  assert.deepEqual(ids,raw.rawleads.leads.map(l=>l.id).sort());
  assert.equal(ids.length,4539);
  const owner=raw.rawleads.leads[0].ownerId;
  c.owner=owner;vm.runInContext('STATE.filters.psm=[owner];recompute()',c);
  assert.equal(vm.runInContext('workspaceRawLeads().length',c),raw.rawleads.leads.filter(l=>l.ownerId===owner).length);
  vm.runInContext("STATE.filters.psm=[];STATE.filters.preset='custom';STATE.filters.from='2026-09-24';STATE.filters.to='2026-09-24';recompute()",c);
  assert.equal(vm.runInContext('workspaceRawLeads().length',c),raw.rawleads.leads.filter(l=>l.created?.startsWith('2026-09-24')).length);
});

 test('newest-first creation dates retain missing dates at the end',()=>{
  const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval});
  vm.runInContext(app+'\n'+pages,c);
  assert.ok(vm.runInContext("workspaceDateOrder('2026-09-24','2026-09-23',true)",c)<0);
  assert.ok(vm.runInContext("workspaceDateOrder(null,'2026-09-24',true)",c)>0);
  assert.ok(vm.runInContext("workspaceDateOrder('2026-09-24','invalid',true)",c)<0);
});

test('mandated queue requires unsuccessful evidence after the latest connection',()=>{
  const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval});
  vm.runInContext(app+'\n'+pages,c);
  c.sampleLead=lead;c.sampleNow=base+60*60000;
  for(const calls of [[],[call('scheduled',0,{outStatus:'Scheduled'})],[call('unknown',0,{durationKnown:false})],[call('other',0,{ownerId:'another'})],[call('future',120)],[call('failed',0),call('connected',5,{dur:20,ownerId:'another'})]]){
    c.sampleCalls=calls;
    assert.equal(vm.runInContext('workspaceMandateRows([sampleLead],sampleCalls,sampleNow)[0].pending.length',c),0);
  }
  c.sampleCalls=[call('failed',0)];
  assert.equal(vm.runInContext('workspaceMandateRows([sampleLead],sampleCalls,sampleNow)[0].pending.length',c),1);
  c.sampleCalls=[call('connected',0,{dur:20}),call('new-failed',5)];
  assert.equal(vm.runInContext('workspaceMandateRows([sampleLead],sampleCalls,sampleNow)[0].pending.length',c),1);
});

test('imported priority lists match Zoho categories and preserve owner filters',async()=>{
  const raw={};for(const name of ['meta','leads','calls','rawquote','dealstage','priorityleads'])raw[name]=JSON.parse(fs.readFileSync(path.join(root,'data/snapshot',name+'.json'),'utf8'));
  raw.meta.priorityLeadExport=true;
  const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval,fetch:async url=>({ok:true,json:async()=>structuredClone(raw[url.match(/data\/(\w+)\.json/)[1]])})});
  vm.runInContext(app+'\n'+pages,c);await vm.runInContext('loadData(true)',c);vm.runInContext('recompute()',c);
  const actual=JSON.parse(vm.runInContext('JSON.stringify(workspacePriorityLeads().map(l=>[l.id,l.fuPriority,l.fuEff]))',c));
  assert.deepEqual(actual,raw.priorityleads.leads.map(l=>[l.id,l.fuPriority,l.fuEff]));
  assert.equal(actual.length,749);
  for(const [band,count] of Object.entries(raw.priorityleads.counts))assert.equal(actual.filter(l=>l[1]===band).length,count);
  c.owner=raw.priorityleads.leads[0].ownerId;vm.runInContext('STATE.filters.psm=[owner];recompute()',c);
  assert.equal(vm.runInContext('workspacePriorityLeads().length',c),raw.priorityleads.leads.filter(l=>l.ownerId===c.owner).length);
});

test('scheduled RNR columns use task call number, exclude closed tasks and preserve duplicate-lead appointments',()=>{
 const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval});vm.runInContext(app+'\n'+pages,c);
 c.rows=[{id:'same',taskId:'later',taskStatus:'Not Started',rnrDay:2,rnrAttempt:1,rnrDue:'2026-09-25T10:00:00+05:30'}, {id:'same',taskId:'early',taskStatus:'Not Started',rnrDay:2,rnrAttempt:1,rnrDue:'2026-09-24T10:00:00+05:30'}, {id:'third',taskId:'third',taskStatus:'Not Started',rnrDay:3,rnrDue:'2026-09-25T12:00:00+05:30'}, {taskId:'closed',taskStatus:'Completed',rnrDay:2}];
 c.now=Date.parse('2026-09-24T11:00:00+05:30');const rows=vm.runInContext('workspaceZohoMandateRows(rows,now)',c);
 assert.equal(rows[0].pending.length,0);assert.deepEqual(Array.from(rows[1].pending,l=>l.taskId),['early','later']);
 assert.deepEqual(Array.from(rows[1].ready,l=>l.taskId),['early']);assert.equal(rows[2].pending[0].taskId,'third');
 assert.equal(rows[1].dates.get('early'),Date.parse('2026-09-24T10:00:00+05:30'));
});
test('scheduled RNR export reconciles task IDs and filters by callback date instead of lead creation',async()=>{
 const raw={};for(const name of ['meta','leads','calls','rawquote','dealstage','mandateleads'])raw[name]=JSON.parse(fs.readFileSync(path.join(root,'data/snapshot',name+'.json'),'utf8'));
 raw.meta.mandateLeadExport=true;
 const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval,fetch:async url=>({ok:true,json:async()=>structuredClone(raw[url.match(/data\/(\w+)\.json/)[1]])})});
 vm.runInContext(app+'\n'+pages,c);await vm.runInContext('loadData(true)',c);vm.runInContext('recompute()',c);
 const rows=vm.runInContext('workspaceZohoMandateRows(workspaceZohoMandateLeads())',c);
 assert.deepEqual(Array.from(rows,r=>r.pending.length),[0,945,35,0,0]);
 const ids=Array.from(rows).flatMap(r=>Array.from(r.pending,l=>l.taskId)).sort();
 assert.deepEqual(ids,raw.mandateleads.leads.map(l=>l.taskId).sort());
 const html=vm.runInContext('RENDER.workspace()',c);assert.ok(html.includes('Callback due'));assert.ok(html.includes('/tab/Tasks/'));assert.ok(!html.includes('Day number follows RNR attempt count'));
 c.owner=raw.mandateleads.leads[0].ownerId;vm.runInContext('STATE.filters.psm=[owner];recompute()',c);
 assert.equal(vm.runInContext('workspaceZohoMandateLeads().length',c),raw.mandateleads.leads.filter(l=>l.ownerId===c.owner).length);
 vm.runInContext("STATE.filters.psm=[];STATE.filters.preset='custom';STATE.filters.from='2026-09-24';STATE.filters.to='2026-09-24';recompute()",c);
 assert.equal(vm.runInContext('workspaceZohoMandateLeads().length',c),raw.mandateleads.leads.filter(l=>l.dueDate==='2026-09-24').length);
});
