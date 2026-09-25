/* SUNROOOF PSM Calling Head Dashboard — core engine
   Data contract: data/leads.json + data/calls.json are arrays-of-arrays written by extract.ps1.
   Column order below MUST match extract.ps1. */

const LC = { id:0, leadNo:1, name:2, mobile:3, email:4, region:5, city:6, state:7, source:8, created:9,
  ownerId:10, ownerName:11, prevOwnerName:12, psmId:13, assigned:14, status:15, projStage:16, disposition:17,
  priority:18, priorityType:19, fuPriority:20, fuDate:21, fuDateTime:22, fuType:23, finalDT:24, visitCallDT:25,
  lastActivity:26, converted:27, convertedDate:28, rTotalCalls:29, rCallDur:30, incoming:31, outgoing:32,
  missed:33, clientStatus:34, teams:35, leadType:36, assignType:37, modified:38, company:39, lastNote:40 };

const CC = { id:0, ownerId:1, leadId:2, type:3, result:4, start:5, dur:6, outStatus:7, createdBy:8,
  purpose:9, subject:10, created:11 };

const DATA = { leads:[], calls:[], users:{}, meta:{}, leadById:new Map() };
const STATE = {
  page:'workspace',                 // Follow-up Board is the first tab and the landing page
  filters:{ preset:'all', from:null, to:null, psm:[], region:[], city:[], source:[], status:[], team:[],
            disp:[], outcome:[], fu:[], transfer:[], dateScope:'created' }
};
let M = null;                   // derived model for the current filter set

/* ---------------- date helpers (string-first, fast) ---------------- */
const DAY_MS = 86400000;
const _dayCache = new Map();
function dayNum(d){                       // 'YYYY-MM-DD...' -> integer day index
  if(!d) return null;
  const k = d.slice(0,10);
  let v = _dayCache.get(k);
  if(v === undefined){ v = Math.floor(Date.parse(k+'T00:00:00Z')/DAY_MS); _dayCache.set(k,v); }
  return v;
}
// Indian date format: 'YYYY-MM-DD…' -> 'DD/MM/YYYY' (display only; ISO strings stay ISO for logic).
function inDate(d){ if(!d) return d; const p = String(d).slice(0,10).split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : String(d).slice(0,10); }
function fmtDate(d){ return d ? inDate(d) : '—'; }
function fmtDT(d){ return d ? inDate(d)+' '+d.slice(11,16) : '—'; }
const NOW = new Date();
const TODAY = NOW.getFullYear()+'-'+String(NOW.getMonth()+1).padStart(2,'0')+'-'+String(NOW.getDate()).padStart(2,'0');
const TODAY_N = dayNum(TODAY);
function addDays(iso,n){ return new Date(Date.parse(iso+'T00:00:00Z')+n*DAY_MS).toISOString().slice(0,10); }
function startOfWeek(iso){ const d=new Date(iso+'T00:00:00Z'); const w=(d.getUTCDay()+6)%7; return addDays(iso,-w); } // Mon
function monthStart(iso){ return iso.slice(0,8)+'01'; }

function presetRange(p){
  const t = TODAY;
  switch(p){
    case 'today':      return [t,t];
    case 'yesterday':  return [addDays(t,-1), addDays(t,-1)];
    case 'thisweek':   return [startOfWeek(t), t];
    case 'lastweek':   { const s=addDays(startOfWeek(t),-7); return [s, addDays(s,6)]; }
    case 'thismonth':  return [monthStart(t), t];
    case 'lastmonth':  { const s=addDays(monthStart(t),-1); return [monthStart(s), s]; }
    case 'thisquarter':{ const m=+t.slice(5,7), q=Math.floor((m-1)/3)*3+1;
                         return [t.slice(0,5)+String(q).padStart(2,'0')+'-01', t]; }
    case 'fy':         { const y=+t.slice(0,4), m=+t.slice(5,7); const sy = m>=4 ? y : y-1;
                         return [sy+'-04-01', t]; }
    case 'last7':      return [addDays(t,-6), t];
    case 'last30':     return [addDays(t,-29), t];
    case 'last90':     return [addDays(t,-89), t];
    default:           return [null,null];
  }
}

/* ---------------- formatting ---------------- */
const nf = new Intl.NumberFormat('en-IN');
function n(v){ return nf.format(Math.round(v||0)); }
function pct(a,b){ return b ? (100*a/b) : 0; }
function pctS(a,b){ return b ? (100*a/b).toFixed(1)+'%' : '—'; }
function dec(v,d){ return (v==null||isNaN(v)) ? '—' : (+v).toFixed(d==null?1:d); }
function hms(sec){
  sec = Math.round(sec||0);
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  return h ? `${h}h ${m}m` : (m ? `${m}m ${s}s` : `${s}s`);
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function uname(id){ return (id && DATA.users[id]) || (id ? 'User '+String(id).slice(-6) : 'Unassigned'); }
function crmLink(mod,id){ return `${DATA.meta.crmBase}/${mod}/${id}`; }

/* ---------------- call classification (documented in Definitions) ---------------- */
// A call is LOGGED (actually made/received) when Outgoing_Call_Status is null (inbound/missed)
// or 'Completed'. Scheduled / Overdue / Cancelled rows are planned activities, never "calls made".
function isLogged(c){ return c.outStatus == null || c.outStatus === 'Completed'; }
function isPlanned(c){ return c.outStatus === 'Scheduled' || c.outStatus === 'Overdue'; }
// Call_Result is populated on only ~3.7% of records, so CONNECTED is derived from talk time.
function isConnected(c){ return c.dur > 0; }
function isMissed(c){ return c.type === 'Missed'; }

/* ---------------- load ---------------- */
// Bump DATA_VER whenever data/*.json is re-extracted, so browsers don't serve a stale cached snapshot.
const DATA_VER = '20260823';
async function loadData(bust){
  const q = bust ? ('?t='+Date.now()) : ('?v='+DATA_VER);   // bust=true forces a fresh fetch on live refresh
  const metaResponse = await fetch('data/meta.json'+q);
  if(!metaResponse.ok) throw new Error('Cannot load CRM metadata');
  const meta = await metaResponse.json();
  const snapshotQuery = q + (meta.snapshotId ? '&snapshot='+encodeURIComponent(meta.snapshotId) : '');
  const [leadsRaw, callsRaw, rawQuote, dealStage] = await Promise.all([
    fetch('data/leads.json'+snapshotQuery).then(r=>r.json()),
    fetch('data/calls.json'+snapshotQuery).then(r=>r.json()),
    fetch('data/rawquote.json'+snapshotQuery).then(r=>r.ok?r.json():[]).catch(()=>[]),
    fetch('data/dealstage.json'+snapshotQuery).then(r=>r.ok?r.json():{}).catch(()=>({}))
  ]);
  DATA.meta = meta; DATA.users = meta.users || {};
  DATA.rawLeadExport = null;
  if(meta.rawLeadExport){
    const response=await fetch('data/rawleads.json'+q);
    if(!response.ok) throw new Error('Raw lead export could not be loaded');
    const exported=await response.json();
    if(!Array.isArray(exported.leads)||exported.leads.length!==exported.recordCount||new Set(exported.leads.map(l=>l.id)).size!==exported.recordCount||exported.leads.some(l=>l.status!=='Raw')) throw new Error('Raw lead export failed validation');
    DATA.rawLeadExport=exported;
  }
  DATA.priorityLeadExport = null;
  if(meta.priorityLeadExport){
    const response=await fetch('data/priorityleads.json'+q);
    if(!response.ok) throw new Error('Priority lead export could not be loaded');
    const exported=await response.json();
    const labels=['High Priority','Medium Priority','Low Priority'];
    if(!Array.isArray(exported.leads)||exported.leads.length!==exported.recordCount||new Set(exported.leads.map(l=>l.id)).size!==exported.recordCount||exported.leads.some(l=>!labels.includes(l.fuPriority))) throw new Error('Priority lead export failed validation');
    DATA.priorityLeadExport=exported;
  }
  DATA.mandateLeadExport = null;
  if(meta.mandateLeadExport){
    const response=await fetch('data/mandateleads.json'+q);
    if(!response.ok) throw new Error('Zoho RNR export could not be loaded');
    const exported=await response.json();
    if(!Array.isArray(exported.leads)||exported.leads.length!==exported.recordCount||exported.sourceKind!=='zoho-rnr-tasks'||new Set(exported.leads.map(l=>l.taskId)).size!==exported.recordCount||exported.leads.some(l=>!l.taskId||!Number.isInteger(l.rnrDay)||l.rnrDay<1||l.rnrDay>5||['Completed','Closed','Cancelled'].includes(l.taskStatus))) throw new Error('Zoho RNR export failed validation');
    DATA.mandateLeadExport=exported;
  }
  // Mobiles of deals whose Opportunity Stage History ever hit "Raw Quote" — the board
  // excludes leads matching these (deal→lead link is by mobile; Deals carry no lead lookup).
  DATA.rawQuoteMob = new Set(rawQuote || []);
  // Current Opportunity stage per mobile — a lead whose mobile has a deal is "an Opportunity now".
  DATA.dealStage = dealStage || {};

  // Older extracts wrote empty strings where the CRM had null. Normalise so '' never
  // masquerades as a real value (this decides whether a call counts as "logged").
  const blank = a => { for(let i=0;i<a.length;i++) if(a[i]==='') a[i]=null; return a; };
  leadsRaw.forEach(blank); callsRaw.forEach(blank);

  DATA.leads = leadsRaw.map(r=>({
    id:r[LC.id], leadNo:r[LC.leadNo], name:r[LC.name], mobile:r[LC.mobile], email:r[LC.email],
    region:r[LC.region]||'(No region)', city:r[LC.city]||'(No city)', state:r[LC.state],
    source:r[LC.source]||'(No source)', created:r[LC.created], ownerId:r[LC.ownerId],
    ownerName:r[LC.ownerName], prevOwnerName:r[LC.prevOwnerName], psmId:r[LC.psmId], assigned:r[LC.assigned],
    status:r[LC.status]||'(No status)', projStage:r[LC.projStage], disposition:r[LC.disposition]||'(None)',
    priority:r[LC.priority], priorityType:r[LC.priorityType], fuPriority:r[LC.fuPriority],
    fuDate:r[LC.fuDate], fuDateTime:r[LC.fuDateTime], fuType:r[LC.fuType], finalDT:r[LC.finalDT],
    visitCallDT:r[LC.visitCallDT], lastActivity:r[LC.lastActivity], converted:r[LC.converted],
    convertedDate:r[LC.convertedDate], incoming:r[LC.incoming], outgoing:r[LC.outgoing],
    clientStatus:r[LC.clientStatus], teams:r[LC.teams]||'(No team)', leadType:r[LC.leadType],
    assignType:r[LC.assignType], modified:r[LC.modified], company:r[LC.company], lastNote:r[LC.lastNote]
  }));
  DATA.leadById.clear();
  DATA.leads.forEach(l=>{
    DATA.leadById.set(l.id, l);
    // Prefer the lead's Current_Owner_Name (full name, e.g. "Aanchal Ahuja") over the
    // short Owner.name that Zoho's lookup now returns in meta.users (e.g. "Ahuja").
    if(l.ownerName) DATA.users[l.ownerId] = l.ownerName;
    l.owner = uname(l.ownerId);
    // Transfer: Previous_Owner_Name present and different from Current_Owner_Name.
    // Transfer timestamp proxy = Lead_Assigned_Date (CRM has no owner-change audit field).
    l.transferred = !!(l.prevOwnerName && l.ownerName && l.prevOwnerName !== l.ownerName);
    l.age = l.created ? (TODAY_N - dayNum(l.created)) : null;
    // Follow-up date = Follow_Up_Date_Time ONLY. Follow_Up_Date (date-only) is deliberately
    // not used anywhere: every follow-up, overdue and priority metric runs off the dated+timed field.
    l.fuEff = l.fuDateTime || null;
    // PRIORITY FOLLOW-UP (primary): a lead is a priority follow-up when Follow_up_Priority
    // carries a label (High / Medium / Low). The due date is the lead's own follow-up date,
    // since Follow_up_Priority is a priority flag rather than a date field.
    l.isPriority = !!l.fuPriority;
    l.priFu = l.isPriority ? l.fuEff : null;
    // VISIT / CALL REQUESTED (secondary): Priority_Type + Visit_Call_Date_Time. Kept separate
    // because it is the only dated priority signal and does hold real records.
    l.visitFu = l.priorityType ? (l.visitCallDT || null) : null;
  });

  DATA.calls = callsRaw.map(r=>({
    id:r[CC.id], ownerId:r[CC.ownerId], leadId:r[CC.leadId], type:r[CC.type], result:r[CC.result],
    start:r[CC.start], durationKnown:r[CC.dur]!=null, dur:r[CC.dur]||0, outStatus:r[CC.outStatus], createdBy:r[CC.createdBy],
    purpose:r[CC.purpose], subject:r[CC.subject]
  }));
  // Keep only calls that resolve to a Lead in this extract (drops Deal/Contact-linked calls).
  DATA.calls = DATA.calls.filter(c=> c.leadId && DATA.leadById.has(c.leadId));
  DATA.calls.forEach(c=>{ c.caller = uname(c.ownerId); c.day = c.start ? c.start.slice(0,10) : null; });
}

/* ---------------- filtering ---------------- */
function activeRange(){
  const f = STATE.filters;
  if(f.preset === 'custom') return [f.from||null, f.to||null];
  return presetRange(f.preset);
}
function leadPasses(l, R){
  const f = STATE.filters;
  if(f.psm.length      && !f.psm.includes(l.ownerId))   return false;
  if(f.region.length   && !f.region.includes(l.region)) return false;
  if(f.city.length     && !f.city.includes(l.city))     return false;
  if(f.source.length   && !f.source.includes(l.source)) return false;
  if(f.status.length   && !f.status.includes(l.status)) return false;
  if(f.team.length     && !f.team.includes(l.teams))    return false;
  if(f.disp.length     && !f.disp.includes(l.disposition)) return false;
  if(f.transfer.length){
    const t = l.transferred ? 'Transferred' : 'Not transferred';
    if(!f.transfer.includes(t)) return false;
  }
  if(f.fu.length && !f.fu.includes(l.fuState)) return false;
  // The date range narrows the lead population too, so every KPI moves with it.
  //   created  -> leads created inside the range (default)
  //   activity -> leads with at least one logged call inside the range
  //   calls    -> leads stay lifetime; only call metrics are date-bound
  if(R[0] && f.dateScope !== 'calls'){
    if(f.dateScope === 'activity'){
      if(!l.hasRangeCalls) return false;
    } else {
      const d = l.created && l.created.slice(0,10);
      if(!d || d < R[0] || (R[1] && d > R[1])) return false;
    }
  }
  return true;
}
function callInRange(c, R){
  if(!R[0]) return true;
  if(!c.day) return false;
  return c.day >= R[0] && (!R[1] || c.day <= R[1]);
}

/* ---------------- follow-up state (needs call evidence) ---------------- */
// The CRM has no "follow-up completed" field. Completion is evidenced by a logged call on the
// lead on/after the scheduled follow-up date. This is stated on every follow-up KPI.
function computeFollowUp(l, agg){
  l.fuState = 'No follow-up set';
  l.fuDoneOn = null; l.fuDelay = null; l.fuOverdueDays = null;
  l.priState = null; l.priDelay = null;
  l.visitState = null; l.visitDelay = null; l.visitGap = null;

  if(l.fuEff){
    const due = dayNum(l.fuEff);
    const hit = agg ? agg.firstCallOnOrAfter(due) : null;
    if(hit){ l.fuState='Completed'; l.fuDoneOn=hit; l.fuDelay = dayNum(hit) - due; }
    else if(due > TODAY_N)      l.fuState = 'Pending';
    else if(due === TODAY_N)    l.fuState = 'Due today';
    else { l.fuState = 'Overdue'; l.fuOverdueDays = TODAY_N - due; }
  }
  // Priority follow-up: Follow_up_Priority IS NOT NULL, tracked against the lead's follow-up date.
  if(l.isPriority && l.priFu){
    l.priState = l.fuState;                                   // same date, same completion evidence
    if(l.fuState === 'Overdue') l.priDelay = l.fuOverdueDays;
  } else if(l.isPriority){
    l.priState = 'No follow-up set';                          // flagged priority but no date yet
  }
  // Visit/call requested (secondary, dated)
  if(l.visitFu){
    const pdue = dayNum(l.visitFu);
    if(l.fuEff) l.visitGap = pdue - dayNum(l.fuEff);
    const hit = agg ? agg.firstCallOnOrAfter(pdue) : null;
    if(hit) l.visitState = 'Completed';
    else if(pdue > TODAY_N)   l.visitState = 'Pending';
    else if(pdue === TODAY_N) l.visitState = 'Due today';
    else { l.visitState = 'Overdue'; l.visitDelay = TODAY_N - pdue; }
  }
}

/* ---------------- recompute derived model ---------------- */
function recompute(){
  const f = STATE.filters, R = activeRange();

  // 1. per-lead call aggregation, attributed to the ACTUAL CALLER (Calls.Owner)
  const agg = new Map();      // leadId -> aggregate
  function A(id){
    let a = agg.get(id);
    if(!a){
      a = { tot:0, conn:0, nc:0, miss:0, inb:0, outb:0, talk:0, byOwner:new Map(),
            days:[], first:null, last:null, lastRes:null, lastDur:null,
            firstCallOnOrAfter(d){ for(const x of this.days){ if(dayNum(x)>=d) return x; } return null; } };
      agg.set(id,a);
    }
    return a;
  }
  const outcomeF = f.outcome;
  const calls = [];
  for(const c of DATA.calls){
    if(!isLogged(c)) continue;
    if(!callInRange(c,R)) continue;
    if(f.psm.length && !f.psm.includes(c.ownerId)) continue;   // caller-based PSM filter
    if(outcomeF.length){
      const o = isMissed(c) ? 'Missed' : (isConnected(c) ? 'Connected' : 'Not connected');
      if(!outcomeF.includes(o)) continue;
    }
    calls.push(c);
    const a = A(c.leadId);
    a.tot++;
    if(isMissed(c)) a.miss++; else if(isConnected(c)) a.conn++; else a.nc++;
    if(c.type==='Inbound') a.inb++; else if(c.type==='Outbound') a.outb++;
    a.talk += c.dur;
    let o = a.byOwner.get(c.ownerId);
    if(!o){ o={tot:0,conn:0,nc:0,miss:0,talk:0}; a.byOwner.set(c.ownerId,o); }
    o.tot++; o.talk += c.dur;
    if(isMissed(c)) o.miss++; else if(isConnected(c)) o.conn++; else o.nc++;
    if(c.day){
      a.days.push(c.day);
      if(!a.first || c.day < a.first) a.first = c.day;
      if(!a.last  || c.day > a.last){ a.last = c.day; a.lastRes = c.result; a.lastDur = c.dur; }
    }
  }
  for(const a of agg.values()) a.days.sort();

  // 2. follow-up state per lead (needs agg), then lead filter (fu + date-scope depend on it)
  for(const l of DATA.leads){
    l.hasRangeCalls = agg.has(l.id);      // had at least one logged call inside the date range
    computeFollowUp(l, agg.get(l.id));
  }

  const leads = [];
  for(const l of DATA.leads){
    if(!leadPasses(l,R)) continue;
    const a = agg.get(l.id);
    l.a = a;
    l.calls        = a ? a.tot  : 0;
    l.connected    = a ? a.conn : 0;
    l.notConnected = a ? a.nc   : 0;
    l.missedCalls  = a ? a.miss : 0;
    l.talk         = a ? a.talk : 0;
    l.lastCall     = a ? a.last : null;
    l.firstCall    = a ? a.first: null;
    l.callsByCurrentPsm = (a && a.byOwner.get(l.ownerId)) ? a.byOwner.get(l.ownerId).tot : 0;
    // before/after transfer, split at Lead_Assigned_Date (proxy for the transfer timestamp)
    l.callsBefore = 0; l.callsAfter = 0;
    if(a && l.assigned){
      const t = l.assigned.slice(0,19);
      for(const d of a.days){ if(d < t.slice(0,10)) l.callsBefore++; else l.callsAfter++; }
    }
    const lastAct = [l.lastCall, l.lastActivity && l.lastActivity.slice(0,10)].filter(Boolean).sort().pop();
    l.lastAnyActivity = lastAct || null;
    l.idleDays = lastAct ? (TODAY_N - dayNum(lastAct)) : (l.created ? TODAY_N - dayNum(l.created) : null);
    leads.push(l);
  }
  const leadIds = new Set(leads.map(l=>l.id));
  const fcalls = calls.filter(c=>leadIds.has(c.leadId));

  // 3. PSM roll-up — leads by CURRENT OWNER, calls by ACTUAL CALLER (never mixed)
  const psm = new Map();
  function P(id){
    let p = psm.get(id);
    if(!p){ p = { id, name:uname(id), leads:0, active:0, converted:0, calls:0, conn:0, nc:0, miss:0,
                  talk:0, leadsCalled:new Set(), leadsConnected:new Set(), inb:0, outb:0,
                  fuDue:0, fuDone:0, fuPend:0, fuOver:0, fuDelaySum:0, fuDelayN:0, fuMaxDelay:0,
                  priTot:0, priOver:0, priDelaySum:0, priDelayN:0, visitTot:0, visitOver:0,
                  tIn:0, tOut:0, noCall:0, idle30:0 };
          psm.set(id,p); }
    return p;
  }
  const DEAD = new Set(['Not Interested','Junk Lead','Not Qualified','Converted','Non-Serviceable','Non-Servisable','Magppie']);
  for(const l of leads){
    const p = P(l.ownerId);
    p.leads++;
    if(!DEAD.has(l.status)) p.active++;
    if(l.converted || l.status==='Converted') p.converted++;
    if(l.transferred) p.tIn++;
    if(l.calls===0) p.noCall++;
    if(l.idleDays!=null && l.idleDays>30) p.idle30++;
    if(l.fuEff){
      p.fuDue++;
      if(l.fuState==='Completed'){ p.fuDone++; if(l.fuDelay!=null){ p.fuDelaySum+=Math.max(0,l.fuDelay); p.fuDelayN++; p.fuMaxDelay=Math.max(p.fuMaxDelay,l.fuDelay); } }
      else if(l.fuState==='Overdue'){ p.fuOver++; p.fuDelaySum+=l.fuOverdueDays; p.fuDelayN++; p.fuMaxDelay=Math.max(p.fuMaxDelay,l.fuOverdueDays); }
      else p.fuPend++;
    }
    if(l.isPriority){ p.priTot++; if(l.priState==='Overdue'){ p.priOver++; p.priDelaySum+=l.priDelay; p.priDelayN++; } }
    if(l.visitFu){ p.visitTot++; if(l.visitState==='Overdue') p.visitOver++; }
  }
  for(const c of fcalls){
    const p = P(c.ownerId);          // ACTUAL CALLER — the core attribution rule
    p.calls++; p.talk += c.dur;
    if(isMissed(c)) p.miss++; else if(isConnected(c)) p.conn++; else p.nc++;
    if(c.type==='Inbound') p.inb++; else if(c.type==='Outbound') p.outb++;
    p.leadsCalled.add(c.leadId);
    if(isConnected(c)) p.leadsConnected.add(c.leadId);
  }
  const psmList = [...psm.values()].map(p=>{
    p.uniqCalled = p.leadsCalled.size;
    p.uniqConnected = p.leadsConnected.size;
    p.coverage   = pct(p.uniqCalled, p.leads);
    p.contact    = pct(p.uniqConnected, p.uniqCalled);
    p.connPct    = pct(p.conn, p.calls);
    p.cpl        = p.leads ? p.calls/p.leads : 0;
    p.avgTalk    = p.conn ? p.talk/p.conn : 0;
    p.convPct    = pct(p.converted, p.leads);
    p.avgDelay   = p.fuDelayN ? p.fuDelaySum/p.fuDelayN : 0;
    p.compliance = p.fuDue ? pct(p.fuDone, p.fuDue) : 0;
    return p;
  }).filter(p=>p.leads>0 || p.calls>0).sort((a,b)=>b.calls-a.calls);

  // transferred-out: lead's previous owner name -> map back to a user id where resolvable
  const nameToId = new Map();
  for(const [id,nm] of Object.entries(DATA.users)) if(!nameToId.has(nm)) nameToId.set(nm,id);
  for(const l of leads){
    if(l.transferred && l.prevOwnerName){
      const pid = nameToId.get(l.prevOwnerName);
      if(pid && psm.has(pid)) psm.get(pid).tOut++;
    }
  }

  // 4. group-bys
  const group = (arr, key) => {
    const m = new Map();
    for(const x of arr){ const k = key(x)||'(None)'; m.set(k,(m.get(k)||0)+1); }
    return [...m.entries()].sort((a,b)=>b[1]-a[1]);
  };

  const tot = {
    leads: leads.length,
    active: leads.filter(l=>!DEAD.has(l.status)).length,
    newLeads: leads.filter(l=>l.age!=null && l.age<=7).length,
    calls: fcalls.length,
    conn: fcalls.filter(isConnected).length,
    miss: fcalls.filter(isMissed).length,
    talk: fcalls.reduce((s,c)=>s+c.dur,0),
    uniqCalled: new Set(fcalls.map(c=>c.leadId)).size,
    uniqConnected: new Set(fcalls.filter(isConnected).map(c=>c.leadId)).size,
    inb: fcalls.filter(c=>c.type==='Inbound').length,
    outb: fcalls.filter(c=>c.type==='Outbound').length,
    converted: leads.filter(l=>l.converted||l.status==='Converted').length,
    notCalled: leads.filter(l=>l.calls===0).length,
    transferred: leads.filter(l=>l.transferred).length
  };
  tot.nc = tot.calls - tot.conn - tot.miss;

  M = { R, leads, calls:fcalls, agg, psm:psmList, tot, group, DEAD };
  return M;
}

/* ---------------- drill-down ---------------- */
let _modalRows = null, _modalCols = null, _modalTitle='';
// Current Opportunity stage for a lead (matched by last-10-digit mobile), or null if no deal exists.
function leadDealStage(l){
  const d = String(l.mobile||'').replace(/\D/g,'');
  if(d.length < 10) return null;
  const st = DATA.dealStage && DATA.dealStage[d.slice(-10)];
  return st != null ? st : null;
}

function drill(title, kind, rows, def){
  _modalTitle = title;
  const cols = kind==='calls' ? [
      ['Call date', c=>fmtDT(c.start)],
      ['Caller (actual)', c=>esc(uname(c.ownerId))],
      ['Lead', c=>{const l=DATA.leadById.get(c.leadId); return l?`<a href="${crmLink('Leads',l.id)}" target="_blank">${esc(l.name||l.leadNo)}</a>`:'—';}],
      ['Lead owner (current)', c=>{const l=DATA.leadById.get(c.leadId); return l?esc(uname(l.ownerId)):'—';}],
      ['Type', c=>esc(c.type)],
      ['Outcome', c=> isMissed(c)?'<span class="badge b-bad">Missed</span>' : isConnected(c)?'<span class="badge b-good">Connected</span>':'<span class="badge b-warn">Not connected</span>'],
      ['Talk time', c=>hms(c.dur), 'num'],
      ['Call result', c=>esc(c.result||'—')],
      ['Subject', c=>esc(c.subject||'—')],
      ['CRM', c=>`<a href="${crmLink('Calls',c.id)}" target="_blank">open ↗</a>`]
    ] : [
      ['Lead ID', l=>esc(l.leadNo||'—')],
      ['Client', l=>`<a href="${crmLink('Leads',l.id)}" target="_blank">${esc(l.name||'—')}</a>`],
      ['Mobile', l=>esc(l.mobile||'—')],
      ['Type', l=>leadDealStage(l)!=null || l.converted ? '<span class="badge b-acc">Opportunity</span>' : '<span class="badge">Lead</span>'],
      ['Status/Stage', l=>{const st=leadDealStage(l); return st!=null ? esc(st) : esc(l.status);}],
      ['Region', l=>esc(l.region)],
      ['City', l=>esc(l.city)],
      ['Current owner', l=>esc(uname(l.ownerId))],
      ['Original/prev owner', l=>esc(l.prevOwnerName||'—')],
      ['Status', l=>esc(l.status)],
      ['Disposition', l=>esc(l.disposition)],
      ['Source', l=>esc(l.source)],
      ['Created', l=>fmtDate(l.created), 'num'],
      ['Age (d)', l=>l.age==null?'—':l.age, 'num'],
      ['Total calls', l=>l.calls, 'num'],
      ['By current PSM', l=>l.callsByCurrentPsm, 'num'],
      ['Connected', l=>l.connected, 'num'],
      ['Not connected', l=>l.notConnected, 'num'],
      ['Talk time', l=>hms(l.talk), 'num'],
      ['Last call', l=>fmtDate(l.lastCall), 'num'],
      ['Idle (d)', l=>l.idleDays==null?'—':l.idleDays, 'num'],
      ['Follow-up', l=>fmtDate(l.fuEff)],
      ['FU status', l=>fuBadge(l.fuState)],
      ['Priority FU', l=>l.isPriority ? esc(l.fuPriority)+' · '+fmtDate(l.priFu) : '—'],
      ['Visit/call FU', l=>fmtDate(l.visitFu)],
      ['Transfer', l=>l.transferred?'<span class="badge b-acc">Transferred</span>':'—'],
      ['CRM', l=>`<a href="${crmLink('Leads',l.id)}" target="_blank">open ↗</a>`]
    ];
  _modalRows = rows; _modalCols = cols;
  document.getElementById('modalTitle').textContent = `${title} — ${n(rows.length)} record${rows.length===1?'':'s'}`;
  document.getElementById('modalDef').innerHTML = def ? `<b>Definition:</b> ${def}` : '';
  const cap = rows.slice(0, 3000);
  let h = table(cols.map(c=>({h:c[0], f:c[1], cls:c[2]||''})), cap);
  if(rows.length > cap.length) h += `<div class="note" style="padding:10px 16px">Showing first ${n(cap.length)} of ${n(rows.length)} — use Export CSV for the full set.</div>`;
  document.getElementById('modalBody').innerHTML = h;
  document.getElementById('modal').classList.remove('hidden');
}
function fuBadge(s){
  if(s==='Completed') return '<span class="badge b-good">Completed</span>';
  if(s==='Overdue')   return '<span class="badge b-bad">Overdue</span>';
  if(s==='Due today') return '<span class="badge b-warn">Due today</span>';
  if(s==='Pending')   return '<span class="badge b-acc">Pending</span>';
  return '<span class="badge b-mut">None</span>';
}
function closeModal(){ document.getElementById('modal').classList.add('hidden'); }
function exportCsv(){
  if(!_modalRows) return;
  const src = _modalRows;
  const strip = s=>String(s).replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
  const q = s=>`"${strip(s).replace(/"/g,'""')}"`;
  const lines = [_modalCols.map(c=>q(c[0])).join(',')];
  for(const r of src) lines.push(_modalCols.map(c=>q(c[1](r))).join(','));
  const blob = new Blob(['﻿'+lines.join('\r\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = _modalTitle.replace(/[^\w\-]+/g,'_')+'.csv';
  a.click();
}

/* ---------------- UI helpers used by pages.js ---------------- */
const CLICK = [];               // click handler registry: data-act index
function act(fn){ CLICK.push(fn); return CLICK.length-1; }

/* Formula provenance. Every KPI and report carries the exact CRM fields, the calculation
   and the filters behind its number, so any figure can be traced back to Zoho. */
let SHOW_FX = false;
function fltSummary(){
  const f = STATE.filters, R = M ? M.R : [null,null], b = [];
  b.push('Period = ' + (R[0] ? inDate(R[0])+' → '+(R[1]?inDate(R[1]):'today') : 'All time'));
  const a = (k,v,m)=>{ if(v && v.length) b.push(k+' = '+(v.length>2 ? v.length+' selected' : v.map(m||(x=>x)).join(', '))); };
  a('PSM',f.psm,uname); a('Region',f.region); a('City',f.city); a('Source',f.source);
  a('Status',f.status); a('Team',f.team); a('Disposition',f.disp); a('Call outcome',f.outcome);
  a('Follow-up',f.fu); a('Transfer',f.transfer);
  b.push('Date applies to = ' + ({created:'lead created date + calls',
                                  activity:'lead call activity + calls',
                                  calls:'calls only (leads lifetime)'}[f.dateScope] || f.dateScope));
  return b.join(' · ');
}
// Field lists are built by concatenating FF.* constants, which can repeat a field name
// (several metrics read Follow_Up_Date_Time). Show each field once.
function dedupeFields(s){
  return [...new Set(String(s).split(",").map(x=>x.trim()).filter(Boolean))].join(", ");
}
// fx(fields, formula, extraFilter) -> the provenance block
function fx(fields, formula, extra){
  if(!SHOW_FX) return '';
  return `<div class="fx">
    <div><b>Fields:</b> <code>${dedupeFields(fields)}</code></div>
    <div><b>Formula:</b> <span class="fml">${formula}</span></div>
    <div><b>Filters:</b> <span class="flt">${extra ? extra+' · ' : ''}${fltSummary()}</span></div>
  </div>`;
}
function kpi(label, value, opts){
  opts = opts||{};
  const cls = ['kpi', opts.tone||'', opts.onClick!=null?'click':''].join(' ');
  const at = opts.onClick!=null ? ` data-act="${opts.onClick}"` : '';
  const prov = opts.fx ? fx(opts.fx[0], opts.fx[1], opts.fx[2]) : '';
  return `<div class="${cls}"${at}><div class="k">${label}</div><div class="v">${value}</div>${opts.sub?`<div class="s">${opts.sub}</div>`:''}${prov}</div>`;
}
// Section heading with its own provenance block. Every section heading, on every page, echoes the
// active non-date filters (e.g. "— (Source - A and B)") so any applied filter shows across the whole
// dashboard. activeFilterLabel() lives in pages.js and returns '' when no such filter is set.
function sec(title, fields, formula, extra){
  const fl = (typeof activeFilterLabel === 'function') ? activeFilterLabel() : '';
  return `<h2 class="sec">${title}${fl}</h2>` + ((fields && SHOW_FX) ? `<div class="fx fxsec">
    <div><b>Fields:</b> <code>${dedupeFields(fields)}</code></div>
    <div><b>Formula:</b> <span class="fml">${formula}</span></div>
    <div><b>Filters:</b> <span class="flt">${extra ? extra+' · ' : ''}${fltSummary()}</span></div>
  </div>` : '');
}
// Chart box with provenance
function chart(title, body, fields, formula, extra){
  return `<div class="chartbox"><h4>${title}</h4>${body}${fields?fx(fields,formula,extra):''}</div>`;
}
function table(cols, rows, opts){
  opts = opts||{};
  let h = `<div class="tblwrap"><table><thead><tr>${cols.map(c=>`<th class="${c.cls||''}">${c.h}</th>`).join('')}</tr></thead><tbody>`;
  for(const r of rows) h += `<tr>${cols.map(c=>{
      const v = c.f(r);
      const a = c.act ? ` data-act="${c.act(r)}" class="click ${c.cls||''}"` : ` class="${c.cls||''}"`;
      return `<td${a}>${v}</td>`;
    }).join('')}</tr>`;
  h += '</tbody>';
  if(opts.foot) h += `<tfoot><tr>${cols.map(c=>`<td class="${c.cls||''}">${opts.foot(c, rows)||''}</td>`).join('')}</tr></tfoot>`;
  h += '</table></div>';
  return h;
}
function barCell(v, max, label){
  const w = max? Math.max(1, 100*v/max) : 0;
  return `<div class="bar"><i style="width:${w}%"></i><span>${label!=null?label:n(v)}</span></div>`;
}

/* bar chart (vertical) */
function barChart(data, opts){
  opts = opts||{};
  const W = opts.w||620, H = opts.h||190, PL=38, PB=34, PT=10, PR=8;
  const max = Math.max(1, ...data.map(d=>d[1]));
  const iw = W-PL-PR, ih = H-PT-PB;
  const bw = Math.max(2, iw/Math.max(1,data.length) - 2);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">`;
  for(let i=0;i<=4;i++){ const y=PT+ih*i/4; s+=`<line class="gl" x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}"/><text x="${PL-5}" y="${y+3}" text-anchor="end">${n(max*(4-i)/4)}</text>`; }
  data.forEach((d,i)=>{
    const h = ih*d[1]/max, x = PL + i*(iw/data.length)+1, y = PT+ih-h;
    s += `<rect class="bar-r" x="${x}" y="${y}" width="${bw}" height="${h}"><title>${esc(d[0])}: ${n(d[1])}</title></rect>`;
    const every = Math.ceil(data.length/(opts.labels||12));
    if(i%every===0) s += `<text x="${x+bw/2}" y="${H-PB+13}" text-anchor="middle" transform="rotate(-35 ${x+bw/2} ${H-PB+13})">${esc(String(d[0]).slice(opts.labelSlice||0))}</text>`;
  });
  s += `<line class="ax" x1="${PL}" y1="${PT+ih}" x2="${W-PR}" y2="${PT+ih}"/></svg>`;
  return s;
}
/* horizontal bar list */
function hbar(data, opts){
  opts = opts||{};
  const max = Math.max(1, ...data.map(d=>d[1]));
  return `<table style="width:100%">${data.map(d=>{
    const a = opts.act ? ` data-act="${opts.act(d)}" class="click"` : '';
    return `<tr><td style="width:34%"${a}>${esc(d[0])}</td><td>${barCell(d[1],max,opts.fmt?opts.fmt(d):n(d[1]))}</td></tr>`;
  }).join('')}</table>`;
}

/* ---------------- boot & wiring ---------------- */
const PAGES = [
  ['workspace', 'My calling dashboard'],
  ['board',     '★ Follow-up Board'],
  ['overview',  '1 · Management Overview'],
  ['psm',       '2 · PSM Performance'],
  ['calling',   '3 · Calling Analytics'],
  ['portfolio', '4 · Lead Portfolio'],
  ['followup',  '5 · Follow-up & Priority'],
  ['region',    '6 · Region Performance'],
  ['ageing',    '7 · Lead Ageing & Stage'],
  ['transfer',  '8 · Transfer & Attribution'],
  ['detail',    '9 · Detailed Data'],
  ['daily',     '★ Daily Calling Head'],
  ['fieldmap',  '⚙ Field Map & Definitions']
];

function fillSelect(id, values, sel){
  const el = document.getElementById(id);
  el.innerHTML = values.map(v=>`<option value="${esc(v)}"${(sel||[]).includes(v)?' selected':''}>${esc(v)}</option>`).join('');
}
function readSelect(id){ return [...document.getElementById(id).selectedOptions].map(o=>o.value); }

function buildFilters(){
  const filterLeads=DATA.leads.concat(DATA.rawLeadExport?.leads||[],DATA.priorityLeadExport?.leads||[],DATA.mandateLeadExport?.leads||[]);
  const uniq = (fn)=>[...new Set(filterLeads.map(fn).filter(Boolean))].sort();
  const owners = [...new Set(filterLeads.map(l=>l.ownerId).concat(DATA.calls.map(c=>c.ownerId)))].filter(Boolean);
  const rawOwners=new Map([...(DATA.rawLeadExport?.leads||[]),...(DATA.priorityLeadExport?.leads||[]),...(DATA.mandateLeadExport?.leads||[])].map(l=>[l.ownerId,l.ownerName]));
  const optOwners = owners.map(id=>[id,rawOwners.get(id)||uname(id)]).sort((a,b)=>a[1].localeCompare(b[1]));
  document.getElementById('fPsm').innerHTML = optOwners.map(([id,nm])=>`<option value="${id}">${esc(nm)}</option>`).join('');
  document.getElementById('workspace-person').innerHTML = '<option value="">Everyone (whole team)</option>'+optOwners.map(([id,nm])=>`<option value="${esc(id)}">${esc(nm)}</option>`).join('');
  fillSelect('fRegion', uniq(l=>l.region));
  fillSelect('fCity',   uniq(l=>l.city).slice(0,600));
  fillSelect('fSource', uniq(l=>l.source));
  fillSelect('fStatus', uniq(l=>l.status));
  fillSelect('fTeam',   uniq(l=>l.teams));
  fillSelect('fDisp',   uniq(l=>l.disposition));
  fillSelect('fOutcome',['Connected','Not connected','Missed']);
  fillSelect('fFu',     ['Overdue','Due today','Pending','Completed','No follow-up set']);
  fillSelect('fTransfer',['Transferred','Not transferred']);
}
function readFilters(){
  const f = STATE.filters;
  f.preset  = document.getElementById('fPreset').value;
  f.from    = document.getElementById('fFrom').value || null;
  f.to      = document.getElementById('fTo').value || null;
  f.psm     = readSelect('fPsm');
  f.region  = readSelect('fRegion');
  f.city    = readSelect('fCity');
  f.source  = readSelect('fSource');
  f.status  = readSelect('fStatus');
  f.team    = readSelect('fTeam');
  f.disp    = readSelect('fDisp');
  f.outcome = readSelect('fOutcome');
  f.fu      = readSelect('fFu');
  f.transfer= readSelect('fTransfer');
  f.dateScope = document.getElementById('fDateScope').value;
}
function showActiveFilters(){
  const f = STATE.filters, R = M.R, bits = [];
  bits.push(`<b>Range:</b> ${R[0]?inDate(R[0])+' → '+(R[1]?inDate(R[1]):'today'):'all time'}`);
  const add=(k,v)=>{ if(v.length) bits.push(`<b>${k}:</b> ${v.length>3? v.length+' selected' : v.map(esc).join(', ')}`); };
  add('PSM', f.psm.map(uname)); add('Region',f.region); add('City',f.city); add('Source',f.source);
  add('Status',f.status); add('Team',f.team); add('Disposition',f.disp); add('Outcome',f.outcome);
  add('Follow-up',f.fu); add('Transfer',f.transfer);
  bits.push(`<b>Matched:</b> ${n(M.leads.length)} leads / ${n(M.calls.length)} logged calls`);
  document.getElementById('activeFilters').innerHTML = bits.join(' &nbsp;·&nbsp; ');
}

let FILTER_CONTEXT='workspace', WORKSPACE_OWNER='', ANALYTICS_FILTERS=null;
function ownerOnlyFilters(owner=''){
  return {preset:'all',from:null,to:null,psm:owner?[owner]:[],region:[],city:[],source:[],status:[],team:[],disp:[],outcome:[],fu:[],transfer:[],dateScope:'created'};
}
function routeFilters(page,current){
  if(page==='workspace'){
    if(FILTER_CONTEXT!=='workspace') ANALYTICS_FILTERS=JSON.parse(JSON.stringify(current));
    else WORKSPACE_OWNER=current.psm.length===1?current.psm[0]:'';
    current=ownerOnlyFilters(WORKSPACE_OWNER);
  }else if(FILTER_CONTEXT==='workspace'){
    WORKSPACE_OWNER=current.psm.length===1?current.psm[0]:'';
    current=ANALYTICS_FILTERS?JSON.parse(JSON.stringify(ANALYTICS_FILTERS)):ownerOnlyFilters();
  }
  FILTER_CONTEXT=page;
  return current;
}
function syncFilterInputs(){
  const fields={fPreset:'preset',fFrom:'from',fTo:'to',fPsm:'psm',fRegion:'region',fCity:'city',fSource:'source',fStatus:'status',fTeam:'team',fDisp:'disp',fOutcome:'outcome',fFu:'fu',fTransfer:'transfer',fDateScope:'dateScope'};
  for(const [id,key] of Object.entries(fields)){
    const input=document.getElementById(id),value=STATE.filters[key];
    if(input.multiple) for(const option of input.options) option.selected=value.includes(option.value);
    else input.value=value||'';
  }
}
function render(){
  STATE.filters=routeFilters(STATE.page,STATE.filters);
  syncFilterInputs();
  CLICK.length = 0;
  document.getElementById("workspace-person").value=STATE.filters.psm.length===1?STATE.filters.psm[0]:"";
  recompute();
  showActiveFilters();
  document.body.classList.toggle('fx-on', SHOW_FX);
  const el = document.getElementById('view');
  el.innerHTML = (RENDER[STATE.page] || RENDER.overview)();
  setupWorkspaceTables();
  el.scrollTop = 0;
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on', b.dataset.p===STATE.page));
}

function wire(){
  wireWorkspacePagination();
  document.getElementById('workspace-person').addEventListener('change',event=>{
    const owner=event.target.value;
    for(const option of document.getElementById('fPsm').options) option.selected=!!owner&&option.value===owner;
    readFilters();render();
  });
  document.getElementById('tabs').innerHTML =
    PAGES.map(([id,label])=>`<button data-p="${id}">${esc(label)}</button>`).join('');
  document.getElementById('tabs').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    STATE.page = b.dataset.p; render();
  });
  const ids = ['fPreset','fFrom','fTo','fPsm','fRegion','fCity','fSource','fStatus','fTeam','fDisp','fOutcome','fFu','fTransfer','fDateScope'];
  ids.forEach(id=>document.getElementById(id).addEventListener('change', ()=>{
    if(id==='fFrom'||id==='fTo') document.getElementById('fPreset').value='custom';
    readFilters(); render();
  }));
  document.getElementById('btnReset').addEventListener('click', ()=>{
    ids.forEach(id=>{ const el=document.getElementById(id);
      if(el.type==='checkbox') el.checked=false;
      else if(el.multiple) [...el.options].forEach(o=>o.selected=false);
      else if(id==='fPreset') el.value='all';
      else if(id==='fDateScope') el.value='created';
      else el.value=''; });
    readFilters(); render();
  });
  const btnTheme = document.getElementById('btnTheme');
  if(btnTheme){
    const glyph = () => (document.documentElement.getAttribute('data-theme')==='dark' ? '☀' : '🌙');
    btnTheme.textContent = glyph();
    btnTheme.addEventListener('click', ()=>{
      const now = (document.documentElement.getAttribute('data-theme')==='dark') ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', now);
      try{ localStorage.setItem('sunrooof-theme', now); }catch(e){}
      btnTheme.textContent = glyph();
    });
  }
  const btnSync = document.getElementById('btnSync');
  if(btnSync) btnSync.addEventListener('click', ()=>syncNow(btnSync));
  document.getElementById('btnDefs').addEventListener('click', ()=>{ STATE.page='fieldmap'; render(); });
  document.getElementById('btnFx').addEventListener('click', e=>{
    SHOW_FX = !SHOW_FX;
    e.target.textContent = 'Formulas: ' + (SHOW_FX?'ON':'OFF');
    e.target.classList.toggle('on', SHOW_FX);
    render();
  });
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCsv').addEventListener('click', exportCsv);
  document.getElementById('modal').addEventListener('click', e=>{ if(e.target.id==='modal') closeModal(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });
  document.body.addEventListener('click', e=>{
    const t = e.target.closest('[data-act]'); if(!t) return;
    const fn = CLICK[+t.dataset.act]; if(fn) fn();
  });
}

function setStamp(){
  const g = DATA.meta.generatedAt;
  const when = g ? inDate(g) + ' ' + g.slice(11,19) : '';
  document.getElementById('dataStamp').textContent =
    `CRM extract ${when} · ${n(DATA.leads.length)} leads · ${n(DATA.calls.length)} lead-linked calls`;
}
// Live refresh: a FIXED 15-minute timer (no focus/visibility triggers). Each tick polls the tiny
// meta.json; if a newer extract is detected (generatedAt changed) it reloads the full snapshot and
// re-renders, preserving the user's current filter selections.
const REFRESH_MS = 15 * 60 * 1000;
function startAutoRefresh(){
  setInterval(async () => {
    try{
      const m = await fetch('data/meta.json?t=' + Date.now()).then(r => r.json());
      if(m && m.generatedAt && m.generatedAt !== DATA.meta.generatedAt){
        await loadData(true);
        setStamp();
        render();
      }
    }catch(e){ /* transient network/extract-in-progress — retry next tick */ }
  }, REFRESH_MS);
}

// Manual "Sync now": POST /sync asks the local server to run a fresh Zoho extract, then we poll
// meta.json until generatedAt changes and reload. On static hosting (Vercel) there is no /sync
// endpoint, so we fall back to re-fetching the currently deployed snapshot.
async function syncNow(btn){
  const restore = (txt)=>{ btn.textContent = txt; setTimeout(()=>{ btn.textContent='⟳ Sync now'; btn.disabled=false; }, 4000); };
  btn.disabled = true; btn.textContent = 'Syncing…';
  try{
    const r = await fetch('/sync', {method:'POST'});
    if(!r.ok) throw new Error('CRM sync service unavailable');
    const deadline = Date.now() + 20*60*1000;
    while(Date.now() < deadline){
      const response = await fetch('/sync/status');
      if(!response.ok) throw new Error('Cannot check CRM sync status');
      const status = await response.json();
      btn.title = status.message || 'Fetching CRM records';
      document.getElementById('syncStatus').textContent = status.message || 'Syncing…';
      if(status.state === 'error') throw new Error(status.error || 'CRM sync failed');
      if(status.state === 'complete'){
        await loadData(true); setStamp(); render();
        restore('Synced ✓'); return;
      }
      await new Promise(res=>setTimeout(res, 3000));
    }
    throw new Error('CRM sync is still running. Check the progress message.');
  }catch(e){
    document.getElementById('syncStatus').textContent = e.message;
    restore('Sync not completed');
  }
}

async function boot(){
  try{
    await loadData(true);   // live dashboard: always load the current snapshot, not a cached one
    setStamp();
    buildFilters(); wire(); readFilters(); render();
    startAutoRefresh();
    const statusBox=document.createElement('div');
    statusBox.id='syncStatus'; statusBox.setAttribute('role','status');
    statusBox.style.cssText='padding:10px 18px;font-size:12px;background:#edf3fc;color:#334155';
    document.querySelector('.topbar').after(statusBox);
    let refreshing=false;
    setInterval(async()=>{
      if(refreshing) return;
      try{
        const r=await fetch('/sync/status'); if(!r.ok) return;
        const s=await r.json();
        statusBox.textContent=s.automaticSync===false ? 'Saved CRM snapshot · Live sync is off' : s.state==='running' ? s.message : s.state==='error' ? 'CRM sync failed: '+s.error+' · Automatic retry enabled.' : s.message+(s.nextRefreshAt ? ' · Next automatic fetch: '+new Date(s.nextRefreshAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'})+' IST' : '');
        if(s.state==='complete' && s.lastSuccess!==DATA.meta.generatedAt){
          refreshing=true; await loadData(true); setStamp(); render();
        }
        if(DATA.meta.supplementaryGeneratedAt && DATA.meta.supplementaryGeneratedAt!==DATA.meta.generatedAt)
          statusBox.textContent+=' · Opportunity exclusions use the '+inDate(DATA.meta.supplementaryGeneratedAt)+' snapshot.';
      }catch(e){ statusBox.textContent='CRM sync service unavailable; showing saved data.'; }
      finally{ refreshing=false; }
    },3000);
  }catch(err){
    document.getElementById('view').innerHTML =
      `<div class="loading">Failed to load data.<br><br><code>${esc(err.message)}</code><br><br>Run <b>extract.ps1</b>, then reload.</div>`;
    console.error(err);
  }
}
