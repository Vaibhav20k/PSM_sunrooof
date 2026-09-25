import {waitUntil} from '@vercel/functions';
import {acquire,state} from '../lib/store.js';
import {run} from '../lib/crm.js';
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');try{
 if(req.method==='GET'){if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(401).json({error:'Unauthorized'});}
 else if(req.method==='POST'){if(req.headers.origin&&req.headers.origin!=='https://'+req.headers.host)return res.status(403).json({error:'Origin not allowed'});}
 else return res.status(405).json({error:'Method not allowed'});
 if(await acquire({scheduled:req.method==='GET',trigger:req.method==='GET'?'scheduled':'manual'}))waitUntil(run());return res.status(202).json((await state()).status);
 }catch{return res.status(503).json({error:'CRM sync service unavailable'});}}
