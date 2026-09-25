export const REFRESH_MS=15*60*1000;
export const RETRY_MS=2*60*1000;
export function due(s,now=Date.now()){
 if(s.lease_until && new Date(s.lease_until).getTime()>now)return false;
 const last=Date.parse(s.manifest?.generatedAt||'');
 if(Number.isFinite(last)&&now-last<REFRESH_MS)return false;
 if(s.status?.state==='error'&&now-Date.parse(s.status.failedAt||'')<RETRY_MS)return false;
 return true;
}
