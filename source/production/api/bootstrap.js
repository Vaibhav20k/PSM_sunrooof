import fs from 'node:fs/promises';
import {init,initBucket,upload,finish,state} from '../lib/store.js';
import {CRM} from '../lib/crm.js';
export default async function handler(req,res){
 if(req.method!=='POST'||!process.env.PSM_DEPLOY_TOKEN||req.headers.authorization!=='Bearer '+process.env.PSM_DEPLOY_TOKEN)return res.status(401).json({error:'Unauthorized'});
 try{const c=new CRM();const o=await c.request('org');if(!o.org?.some(x=>String(x.zgid)==='60038775297'))throw Error('CRM org mismatch');await init();await initBucket();const s=await state();if(s.manifest)return res.json({ready:true,generatedAt:s.manifest.generatedAt});
 const meta=JSON.parse(await fs.readFile(process.cwd()+'/lib/seed/meta.json','utf8'));for(const n of ['leads','calls','rawquote','dealstage'])await upload(meta.snapshotId,n,JSON.parse(await fs.readFile(process.cwd()+'/lib/seed/'+n+'.json','utf8')));await finish(meta);res.json({ready:true,generatedAt:meta.generatedAt});
 }catch(e){console.error(e.code||e.message);res.status(500).json({error:'Storage initialization failed',code:e.code||e.message});}}
