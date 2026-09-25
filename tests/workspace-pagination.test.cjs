const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const c=vm.createContext({console,Date,Intl,setTimeout,clearTimeout,setInterval,clearInterval});
vm.runInContext(['app.js','pages.js'].map(n=>fs.readFileSync(path.join(__dirname,'../source/production/public',n),'utf8')).join('\n'),c);
test('paging reaches every record exactly once, including the last partial page',()=>{
 for(const total of [0,35,163,355,945,4539]) for(const size of [1,2,3,10]){
  const seen=[];c.total=total;c.size=size;
  const pages=vm.runInContext('workspacePageWindow(total,0,size).pages',c);
  for(let page=0;page<pages;page++){
   c.page=page;const range=vm.runInContext('workspacePageWindow(total,page,size)',c);
   for(let i=range.start;i<range.end;i++) seen.push(i);
  }
  assert.deepEqual(seen,Array.from({length:total},(_,i)=>i));
 }
});
test('manual page entry clamps to the first or last page',()=>{
 assert.equal(vm.runInContext('workspacePageWindow(163,-10,3).page',c),0);
 assert.equal(vm.runInContext('workspacePageWindow(163,99999,3).page',c),54);
 assert.equal(vm.runInContext('workspacePageWindow(0,10,3).page',c),0);
});
