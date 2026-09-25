const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
async function load(file,{store={},env={},fetch,cronDue=false}={}){
 const events=[];
 const defaults={state:async()=>({manifest:{snapshotId:'test-snapshot',generatedAt:'2026-09-01T00:00:00Z'},status:{state:'complete'},lease_until:null}),signed:async(id,file)=>`https://example.invalid/${id}/${file}`,acquire:async()=>false,init:async()=>events.push('init'),initBucket:async()=>events.push('bucket'),upload:async()=>events.push('upload'),finish:async()=>events.push('finish'),progress:async()=>{},fail:async()=>events.push('fail'),removeSnapshot:async()=>events.push('remove')};
 const context=vm.createContext({console,Date,JSON,URL,URLSearchParams,AbortSignal,BigInt,Map,Set,process:{env,cwd:()=>'/synthetic'},fetch,setTimeout:fn=>fn()});
 const c=new vm.SourceTextModule(fs.readFileSync(path.join(root,'source/production',file),'utf8'),{context});
 const mappings={
 '../lib/store.js':{...defaults,...store},'./store.js':{...defaults,...store},
 '@vercel/functions':{waitUntil:p=>{events.push('waitUntil');}},
 '../lib/crm.js':{run:async()=>events.push('run'),CRM:class {async request(){return {org:[{zgid:'60038775297'}]}}}},
 '../lib/schedule.js':{due:()=>cronDue,REFRESH_MS:900000},
 'node:fs/promises':{default:{readFile:async file=>file.endsWith('meta.json')?JSON.stringify({snapshotId:'test-seed',generatedAt:'2026-09-01T00:00:00Z'}):'[]'}},
 'node:crypto':{randomUUID:()=> 'test-snapshot-id'}
 };
 await c.link(async spec=>{if(!mappings[spec])throw Error('Unexpected import '+spec);const values=mappings[spec];return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v)},{context});});
 await c.evaluate();
 return {module:c.namespace,events};
}
function response(){return {code:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(b){this.body=b;return this;},redirect(c,u){this.code=c;this.location=u;return this;}};}
const req=(method='GET',extra={})=>({method,headers:{host:'example.invalid'},query:{},...extra});
test('data allowlist and missing manifest errors',async()=>{let x=await load('api/data.js');let r=response();await x.module.default(req('GET',{query:{file:'private.env'}}),r);assert.equal(r.code,404);x=await load('api/data.js',{store:{state:async()=>({})}});r=response();await x.module.default(req('GET',{query:{file:'meta.json'}}),r);assert.equal(r.code,503);});
test('metadata no-store and data snapshot validation/signed redirect',async()=>{const x=await load('api/data.js');let r=response();await x.module.default(req('GET',{query:{file:'meta.json'}}),r);assert.equal(r.body.snapshotId,'test-snapshot');assert.equal(r.headers['Cache-Control'],'no-store');r=response();await x.module.default(req('GET',{query:{file:'calls.json',snapshot:'../bad'}}),r);assert.equal(r.code,400);r=response();await x.module.default(req('GET',{query:{file:'calls.json'}}),r);assert.equal(r.code,307);assert.equal(r.location,'https://example.invalid/test-snapshot/calls.json');});
test('data storage failure returns service error',async()=>{const x=await load('api/data.js',{store:{state:async()=>{throw Error('test')}}});const r=response();await x.module.default(req('GET',{query:{file:'meta.json'}}),r);assert.equal(r.code,503);});
test('cron requires exact bearer and rejects other methods',async()=>{const x=await load('api/sync.js',{env:{CRON_SECRET:'test-only-secret'}});for(const method of ['GET','DELETE']){const r=response();await x.module.default(req(method),r);assert.equal(r.code,method==='GET'?401:405);}const r=response();await x.module.default(req('GET',{headers:{authorization:'Bearer test-only-secret'}}),r);assert.equal(r.code,202);});
test('manual Origin guard and documented absent-Origin behavior',async()=>{const x=await load('api/sync.js');let r=response();await x.module.default(req('POST',{headers:{host:'example.invalid',origin:'https://other.invalid'}}),r);assert.equal(r.code,403);r=response();await x.module.default(req('POST'),r);assert.equal(r.code,202);});
test('acquired manual job calls background runner once',async()=>{let options;const x=await load('api/sync.js',{store:{acquire:async o=>{options=o;return true}}});const r=response();await x.module.default(req('POST'),r);assert.equal(r.code,202);assert.equal(options.scheduled,false);assert.equal(options.trigger,'manual');assert.deepEqual(x.events,['run','waitUntil']);});
test('status includes next refresh and may start recovery',async()=>{const x=await load('api/status.js',{cronDue:true,store:{acquire:async()=>true}});const r=response();await x.module.default(req(),r);assert.equal(r.body.automaticSync,true);assert.equal(r.body.refreshIntervalMinutes,15);assert.equal(r.body.nextRefreshAt,'2026-09-01T00:15:00.000Z');assert.deepEqual(x.events,['run','waitUntil']);});
test('status errors return 503 without revealing underlying message',async()=>{const x=await load('api/status.js',{store:{state:async()=>{throw Error('private internal error')}}});const r=response();await x.module.default(req(),r);assert.equal(r.code,503);assert.ok(!r.body.error.includes('private internal'));});
test('bootstrap protects method/token and preserves existing manifest',async()=>{const x=await load('api/bootstrap.js',{env:{PSM_DEPLOY_TOKEN:'test-bootstrap'}});let r=response();await x.module.default(req('POST'),r);assert.equal(r.code,401);r=response();await x.module.default(req('POST',{headers:{authorization:'Bearer test-bootstrap'}}),r);assert.equal(r.code,200);assert.equal(r.body.ready,true);assert.deepEqual(x.events,['init','bucket']);});
test('bootstrap with empty manifest publishes four datasets then metadata',async()=>{const x=await load('api/bootstrap.js',{env:{PSM_DEPLOY_TOKEN:'test-bootstrap'},store:{state:async()=>({manifest:null})}});const r=response();await x.module.default(req('POST',{headers:{authorization:'Bearer test-bootstrap'}}),r);assert.equal(r.code,200);assert.deepEqual(x.events,['init','bucket','upload','upload','upload','upload','finish']);});
function crmFetch(url,options){
 let body;
 if(url.includes('/oauth/'))body={access_token:'TEST_ACCESS_TOKEN_NOT_REAL'};
 else if(url.endsWith('/org'))body={org:[{zgid:'60038775297'}]};
 else if(url.includes('/Leads?'))body={data:[],info:{more_records:false}};
 else if(url.endsWith('/coql')){
  const sql=JSON.parse(options.body).select_query;let data=[];
  if(sql.includes('from Leads '))data=[{id:'1001',Owner:{id:'2001',name:'Synthetic PSM'},Full_Name:'Synthetic lead',Created_Time:'2026-09-01T09:00:00+05:30',Lead_Status:'Open',Lead_Source:'A and B'}];
  if(sql.includes('from Calls '))data=[{id:'3001',Owner:{id:'2001',name:'Synthetic PSM'},Who_Id:{id:'1001'},Call_Type:'Outbound',Call_Start_Time:'2026-09-01T10:00:00+05:30',Call_Duration_in_seconds:0,Outgoing_Call_Status:'Completed'}];
  body={data,info:{more_records:false}};
 }else throw Error('Unexpected URL '+url);
 return Promise.resolve({ok:true,status:200,json:async()=>body});
}
test('CRM publish uploads all data before pointer switch',async()=>{const order=[];let meta;const x=await load('lib/crm.js',{fetch:crmFetch,store:{upload:async(id,n,rows)=>{order.push(n);if(n==='leads')assert.equal(rows[0].length,41);if(n==='calls'){assert.equal(rows[0].length,12);assert.equal(rows[0][2],'1001');}},finish:async m=>{order.push('finish');meta=m;}}});await x.module.run();assert.deepEqual(order,['leads','calls','rawquote','dealstage','finish']);assert.equal(meta.leadCount,1);assert.equal(meta.callCount,1);assert.equal(meta.previousSnapshotId,'test-snapshot');});
test('CRM failed upload never replaces active manifest',async()=>{const order=[];const x=await load('lib/crm.js',{fetch:crmFetch,store:{upload:async(id,n)=>{order.push(n);if(n==='rawquote')throw Error('synthetic upload failure');},finish:async()=>order.push('finish'),fail:async msg=>{assert.equal(msg,'synthetic upload failure');order.push('fail');}}});await x.module.run();assert.deepEqual(order,['leads','calls','rawquote','fail']);});
