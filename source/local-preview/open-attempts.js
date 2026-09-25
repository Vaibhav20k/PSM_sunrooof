/* Source A and B SOP: distinct call pairs, same PSM and IST day.
   No CRM writes. Cycle start is supplied by the caller. */
function abCallDay(timestamp){
  const time = Date.parse(timestamp);
  return Number.isFinite(time) ? new Date(time + 330 * 60000).toISOString().slice(0,10) : null;
}
function abDailyAttempts(calls){
  const unique = new Map();
  for(const call of calls){
    if(call.type !== 'Outbound' || !(call.outStatus == null || call.outStatus === '' || call.outStatus === 'Completed')) continue;
    const time = Date.parse(call.start);
    if(!Number.isFinite(time) || !call.id || !call.ownerId) continue;
    unique.set(call.id, {...call, time});
  }
  const groups = new Map();
  for(const call of unique.values()){
    const key = JSON.stringify([call.leadId,call.ownerId,abCallDay(call.start)]);
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(call);
  }
  const results = [];
  for(const [key, group] of groups){
    group.sort((a,b)=>a.time-b.time || String(a.id).localeCompare(String(b.id)));
    const pairs = [];
    // Adjacent calls enumerate all possible valid starts; eligibility of a second
    // pair is checked after the first pair ends, so no call is counted twice.
    for(let i=0;i+1<group.length;i++){
      if(group[i+1].time-group[i].time <= 3*60000)
        pairs.push({start:group[i].time,end:group[i+1].time,calls:[group[i],group[i+1]]});
    }
    let credited = pairs.length ? [pairs[0]] : [];
    for(const first of pairs){
      const second = pairs.find(p=>p.start-first.end >= 30*60000);
      if(second){ credited=[first,second]; break; }
    }
    const [leadId,ownerId,day]=JSON.parse(key);
    results.push({leadId,ownerId,day,completed:credited.length,pending:2-credited.length,attempts:credited});
  }
  return results;
}
if(typeof module !== 'undefined') module.exports={abCallDay,abDailyAttempts};

function abOpenCycle(lead, calls, now=Date.now()){
  const empty={completedDays:0,completedAttempts:0,pendingAttempts:12,callRuleMet:false,start:null,days:[],nextAllowedAt:null};
  if(lead.source!=='A and B'||lead.status!=='Open'||lead.converted) return {...empty,pendingAttempts:0,applicable:false};
  const logged=c=>c.outStatus==null||c.outStatus===''||c.outStatus==='Completed';
  const relevant=calls.filter(c=>c.leadId===lead.id&&logged(c)&&Number.isFinite(Date.parse(c.start))&&Date.parse(c.start)<=now);
  // A connection ends the unsuccessful-call cycle, irrespective of who made it.
  const connectedAfter=Math.max(-Infinity,...relevant.filter(c=>Number(c.dur)>0).map(c=>Date.parse(c.start)));
  const unique=new Map();
  for(const c of relevant){
    if(c.ownerId===lead.ownerId&&c.type==='Outbound'&&c.durationKnown!==false&&Number(c.dur)===0&&Date.parse(c.start)>connectedAfter&&c.id)
      unique.set(c.id,{...c,time:Date.parse(c.start)});
  }
  const failed=[...unique.values()].sort((a,b)=>a.time-b.time);
  if(!failed.length) return {...empty,applicable:true};
  const start=failed[0].time;
  const byDay=new Map();
  for(const c of failed){const day=abCallDay(c.start);if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(c);}
  const days=[];let threshold=start;let partial=0;
  for(const [day,dayCalls] of byDay){
    if(days.length===6) break;
    const result=abDailyAttempts(dayCalls.filter(c=>c.time>=threshold))[0];
    if(!result) continue;
    if(result.completed===2){
      const first=result.attempts[0].start;
      days.push({day,start:first,end:result.attempts[1].end,calls:result.attempts.flatMap(a=>a.calls.map(c=>c.id))});
      threshold=first+24*60*60000;partial=0;
    }else if(day===abCallDay(new Date(now).toISOString())) partial=result.completed;
  }
  const completedAttempts=days.length*2+(days.length<6?partial:0);
  return {applicable:true,start,days,completedDays:days.length,completedAttempts,pendingAttempts:12-completedAttempts,
    callRuleMet:days.length===6,nextAllowedAt:days.length===6?null:threshold,
    statusHistoryVerified:false};
}
if(typeof module!=='undefined') module.exports.abOpenCycle=abOpenCycle;
