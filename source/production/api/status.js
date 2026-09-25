import {waitUntil} from '@vercel/functions';
import {state,acquire} from '../lib/store.js';
import {run} from '../lib/crm.js';
import {due,REFRESH_MS} from '../lib/schedule.js';
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');try{
 let s=await state();
 if(due(s)&&await acquire({scheduled:true,trigger:'dashboard-recovery'})){waitUntil(run());s=await state();}
 const status={...s.status,lastSuccess:s.manifest?.generatedAt||null,automaticSync:true,refreshIntervalMinutes:15,retryIntervalMinutes:2,watchdogIntervalMinutes:1,nextRefreshAt:s.manifest?.generatedAt?new Date(Date.parse(s.manifest.generatedAt)+REFRESH_MS).toISOString():null};
 if(status.state==='running'&&new Date(s.lease_until)<new Date())return res.json({...status,state:'error',error:'CRM sync timed out; automatic retry is pending.',message:'CRM sync timed out'});
 res.json(status);
 }catch{res.status(503).json({state:'error',error:'CRM sync status unavailable; automatic retries remain scheduled'});}}
