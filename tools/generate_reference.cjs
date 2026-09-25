// Optional regeneration tool: npm install --prefix <temp-folder> acorn@8.18.0
// node tools/generate_reference.cjs <temp-folder>/node_modules/acorn
const fs=require('node:fs'),path=require('node:path');
const acorn=require(process.argv[2]||'acorn');
const root=path.resolve(__dirname,'..');
const production=path.join(root,'source/production');
const files=['public/app.js','public/pages.js','lib/crm.js','lib/store.js','lib/schedule.js','api/bootstrap.js','api/data.js','api/status.js','api/sync.js'];
const records=[];let md='# Function and component reference\n\nGenerated from the preserved production source using an ECMAScript parser. Every function declaration, method, function expression and callback is indexed, including anonymous functions. Return/branch/dependency text is extracted from source; it is not a promise of runtime types. The business-logic document explains semantic contracts. Line references refer to the packaged source. Outer declarations include exact bodies; nested callbacks refer to their exact source ranges.\n\n';
function children(n){return Object.entries(n).filter(([k])=>!['loc','start','end'].includes(k)).flatMap(([k,v])=>Array.isArray(v)?v.filter(x=>x&&typeof x.type==='string').map(x=>[k,x]):v&&typeof v.type==='string'?[[k,v]]:[])}
const fn=n=>['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type);
for(const file of files){
 const src=fs.readFileSync(path.join(production,file),'utf8');
 const ast=acorn.parse(src,{ecmaVersion:'latest',sourceType:'module',locations:true});
 md+='## '+file+'\n\n';
 function walk(n,parent=null,owner='',depth=0){
  let next=owner,d=depth;
  if(fn(n)){
   let name=n.id?.name;
   if(!name&&parent?.type==='VariableDeclarator')name=src.slice(parent.id.start,parent.id.end);
   if(!name&&parent?.type==='AssignmentExpression')name=src.slice(parent.left.start,parent.left.end);
   if(!name&&['Property','MethodDefinition'].includes(parent?.type))name=src.slice(parent.key.start,parent.key.end);
   if(!name)name='callback@'+n.loc.start.line+':'+n.loc.start.column;
   const qualified=owner?owner+' / '+name:name;next=qualified;d++;
   const info={file:'source/production/'+file,name:qualified,kind:n.type,line:n.loc.start.line,endLine:n.loc.end.line,async:!!n.async,parameters:n.params.map(p=>src.slice(p.start,p.end)),returns:[],calls:[],conditions:[],assignments:[],sourceStart:n.start,sourceEnd:n.end};
   function body(x){
    if(x!==n&&fn(x))return;
    if(x.type==='ReturnStatement')info.returns.push(x.argument?src.slice(x.argument.start,x.argument.end):'undefined');
    if(x.type==='CallExpression'||x.type==='NewExpression')info.calls.push(src.slice(x.callee.start,x.callee.end));
    if(x.type==='IfStatement')info.conditions.push(src.slice(x.test.start,x.test.end));
    if(x.type==='AssignmentExpression')info.assignments.push(src.slice(x.left.start,x.left.end));
    for(const [,child] of children(x))body(child);
   }
   body(n);if(n.type==='ArrowFunctionExpression'&&n.body.type!=='BlockStatement')info.returns.push(src.slice(n.body.start,n.body.end));
   for(const k of ['returns','calls','conditions','assignments'])info[k]=[...new Set(info[k])];
   records.push(info);
   const cell=a=>a.length?a.map(x=>'`'+x.replace(/`/g,"'").replace(/\n/g,' ').slice(0,500)+'`').join('; '):'None explicit';
   md+='### '+qualified+'\n\n';
   md+='Source: `'+info.file+':'+info.line+'–'+info.endLine+'`. '+info.kind+(info.async?' (async)':'')+'.\n\n';
   md+='- Inputs: '+cell(info.parameters)+'\n- Returns: '+cell(info.returns)+'\n- Calls/dependencies: '+cell(info.calls)+'\n- Branch/validation conditions: '+cell(info.conditions)+'\n- Assignment targets/side effects: '+cell(info.assignments)+'\n\n';
   if(depth===0||n.type==='FunctionDeclaration'||parent?.type==='MethodDefinition')md+='```javascript\n'+src.slice(n.start,n.end)+'\n```\n\n';
  }
  for(const [,child]of children(n))walk(child,n,next,d);
 }
 walk(ast);
}
fs.mkdirSync(path.join(root,'reference'),{recursive:true});
fs.writeFileSync(path.join(root,'reference/FUNCTION-CATALOG.md'),md);
fs.writeFileSync(path.join(root,'reference/functions.json'),JSON.stringify(records,null,2));
console.log(JSON.stringify({functions:records.length,modules:files.length,catalogBytes:Buffer.byteLength(md)}));
