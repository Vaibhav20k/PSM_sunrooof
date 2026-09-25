const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
function context(){const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval});vm.runInContext(fs.readFileSync(path.join(__dirname,'../source/production/public/app.js'),'utf8'),c);return c;}
test('workspace isolates its owner while analytics retains advanced and multiple-owner filters',()=>{
 const c=context();
 vm.runInContext("routeFilters('workspace',ownerOnlyFilters('owner-a'));routeFilters('overview',ownerOnlyFilters('owner-a'));",c);
 c.analytics={preset:'today',from:null,to:null,psm:['owner-b','owner-c'],region:['North'],city:[],source:['Website'],status:['Open'],team:[],disp:[],outcome:[],fu:[],transfer:[],dateScope:'created'};
 const workspace=JSON.parse(vm.runInContext("JSON.stringify(routeFilters('workspace',analytics))",c));
 assert.deepEqual(workspace.psm,['owner-a']);assert.equal(workspace.preset,'all');assert.deepEqual(workspace.source,[]);assert.deepEqual(workspace.status,[]);
 const restored=JSON.parse(vm.runInContext("JSON.stringify(routeFilters('overview',ownerOnlyFilters('owner-a')))",c));assert.deepEqual(restored,c.analytics);
});
test('Everyone has no hidden owner, date, source or status restriction',()=>{
 const c=context();const all=JSON.parse(vm.runInContext("JSON.stringify(routeFilters('workspace',{...ownerOnlyFilters(),psm:['a','b'],preset:'today',source:['Website']}))",c));
 assert.deepEqual(all.psm,[]);assert.deepEqual(all.source,[]);assert.equal(all.preset,'all');
});
