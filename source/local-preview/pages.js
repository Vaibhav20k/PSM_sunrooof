/* SUNROOOF PSM Calling Head Dashboard — page renderers
   Every KPI and every report carries its Fields / Formula / Filters provenance block. */

const D = {  // definition strings shown on every drill-down
  calls:  'A call counts as MADE when Zoho <code>Calls.Outgoing_Call_Status</code> is empty (inbound/missed) or "Completed". Scheduled/Overdue/Cancelled rows are planned activities and are excluded.',
  attrib: 'Calls are attributed to <code>Calls.Owner</code> — the person who actually made the call — never to the current Lead Owner.',
  conn:   'Connected = <code>Call_Duration_in_seconds &gt; 0</code>. <code>Call_Result</code> is populated on only ~3.7% of records so it cannot be used as the connection signal.',
  fu:     'Follow-up date = <code>Follow_Up_Date_Time</code> only. <code>Follow_Up_Date</code> (date-only) is not used anywhere on this dashboard. The CRM has no "follow-up completed" field — completion is evidenced by a logged call on the lead on/after the scheduled date/time.',
  pri:    'A lead is a PRIORITY follow-up when <code>Follow_up_Priority</code> is not null (High / Medium / Low Priority). It is due on <code>Follow_Up_Date_Time</code>, because <code>Follow_up_Priority</code> is a priority label rather than a date field.',
  visit:  'Visit/call requested = <code>Visit_Call_Date_Time</code> on leads where <code>Priority_Type</code> is set. Tracked separately from Follow up Priority.',
  xfer:   'Transfer = <code>Previous_Owner_Name</code> present and different from <code>Current_Owner_Name</code>. Before/after split uses <code>Lead_Assigned_Date</code> as the transfer timestamp proxy.'
};

/* Reusable field / predicate strings so formulas stay consistent across pages */
const FF = {
  lead:   'Leads.id',
  call:   'Calls.id, Calls.Outgoing_Call_Status',
  callOwn:'Calls.Owner (actual caller), Calls.What_Id → Leads.id',
  dur:    'Calls.Call_Duration_in_seconds',
  type:   'Calls.Call_Type',
  start:  'Calls.Call_Start_Time',
  own:    'Leads.Owner / Current_Owner_Name',
  status: 'Leads.Lead_Status',
  fu:     'Leads.Follow_Up_Date_Time',
  pri:    'Leads.Follow_up_Priority, Leads.Follow_Up_Date_Time',
  visit:  'Leads.Priority_Type, Leads.Visit_Call_Date_Time',
  created:'Leads.Created_Time',
  conv:   'Leads.Converted__s, Leads.Lead_Status',
  xfer:   'Leads.Previous_Owner_Name, Leads.Current_Owner_Name, Leads.Lead_Assigned_Date'
};
const LOGGED = 'Outgoing_Call_Status IS NULL OR = "Completed"';
const DEADLIST = 'Not Interested, Junk Lead, Not Qualified, Converted, Non-Serviceable, Non-Servisable, Magppie';

/* Fixed PSM roster — these people always appear as a row in the Fresh Lead Status and
   Lead Contact Time tables, even when they have zero records in the selected period.
   (Respects an active PSM/Owner filter: if the user filters to specific PSMs, only the
   roster members inside that filter are forced in.) */
const PSM_ROSTER = [
  '887064000027462001', // Aanchal Ahuja
  '887064000013490475', // Anubhav Singh
  '887064000038833001', // Aparna Bharti
  '887064000046157001', // Avesh Tiwari
  '887064000046154001', // Harsha Vardhan
  '887064000010901001', // Mansi Rajan
  '887064000042335001', // Muskan Sharma
  '887064000022367001', // Pallavi
  '887064000027466001', // Shivalee
  '887064000001046118', // Shrishti Choudhary
  '887064000010902001'  // Vanshika Bhardwaj
];
// PSMs removed from the ENTIRE Follow-up Board (owner request). Excluded from every board component.
const BOARD_EXCLUDE_OWNERS = new Set([
  '887064000044943001', // Mahalakshmi
  '887064000049371001', // Lakshmi
  '887064000046158001', // Sukesh
  '887064000001046238'  // Prince Mark Paul
]);
const boardOwnerOk = l => !BOARD_EXCLUDE_OWNERS.has(l.ownerId);
// Lead statuses removed from the ENTIRE Follow-up Board (owner request 2026-09-01, extended 2026-09-14).
const BOARD_EXCLUDE_STATUS = new Set(['Not Interested', 'not interetsed', 'Non-Serviceable', 'Non-Servisable']);
// Leads whose deal EVER hit "Raw Quote" (Opportunity Stage History, matched by mobile) are also removed.
const mob10 = m => { const d = String(m||'').replace(/\D/g,''); return d.length>=10 ? d.slice(-10) : null; };
const boardStatusOk = l => {
  if(BOARD_EXCLUDE_STATUS.has(l.status)) return false;
  const m = mob10(l.mobile);
  if(!m) return true;
  if(DATA.rawQuoteMob && DATA.rawQuoteMob.has(m)) return false;
  // Deals whose CURRENT Opportunity stage says they're done — off the calling board.
  const ds = DATA.dealStage && DATA.dealStage[m];
  return !(ds === 'Closure' || ds === 'Not Interested');
};
function rosterIds(){
  const sel = STATE.filters.psm;
  return sel && sel.length ? PSM_ROSTER.filter(id=>sel.includes(id)) : PSM_ROSTER;
}

/* A compact " — (Source - A and B · Region - Delhi)" suffix listing the active non-date filters,
   for appending to section headings. Empty string when no such filter is set. */
function activeFilterLabel(){
  const f = STATE.filters, parts = [];
  const add = (name, vals, map) => { if(vals && vals.length) parts.push(name + ' - ' + vals.map(map||(x=>x)).map(esc).join(', ')); };
  add('PSM', f.psm, uname); add('Region', f.region); add('City', f.city); add('Source', f.source);
  add('Status', f.status); add('Team', f.team); add('Disposition', f.disp); add('Call outcome', f.outcome);
  add('Follow-up', f.fu); add('Transfer', f.transfer);
  return parts.length ? ' &mdash; (' + parts.join(' · ') + ')' : '';
}

const RENDER = {};

/* ============ helper builders ============ */
function leadKpi(label, rows, opts){
  opts = opts||{};
  return kpi(label, n(rows.length), Object.assign({
    onClick: act(()=>drill(label,'leads',rows,opts.def))
  }, opts));
}
function callKpi(label, rows, opts){
  opts = opts||{};
  return kpi(label, n(rows.length), Object.assign({
    onClick: act(()=>drill(label,'calls',rows,opts.def || D.calls+' '+D.attrib))
  }, opts));
}
function psmLeads(p){ return M.leads.filter(l=>l.ownerId===p.id); }
function psmCalls(p){ return M.calls.filter(c=>c.ownerId===p.id); }

/* ============ PAGE 1 — MANAGEMENT OVERVIEW ============ */
RENDER.overview = function(){
  const t = M.tot, L = M.leads, C = M.calls;
  const notCalled = L.filter(l=>l.calls===0);
  const idle = L.filter(l=>l.idleDays!=null && l.idleDays>30 && !M.DEAD.has(l.status));
  const fuOver = L.filter(l=>l.fuState==='Overdue');
  const fuDueT = L.filter(l=>l.fuState==='Due today');
  const priOver= L.filter(l=>l.priState==='Overdue');
  const conv   = L.filter(l=>l.converted||l.status==='Converted');
  const stuck  = L.filter(l=>!M.DEAD.has(l.status) && l.age!=null && l.age>60 && l.calls>0 && l.connected===0);
  const attention = new Set([...notCalled, ...idle, ...fuOver, ...priOver].map(l=>l.id));

  let h = sec('Overall performance', FF.lead+', '+FF.call+', '+FF.dur,
    'Base population = Leads matching the filters; calls = Calls WHERE ('+LOGGED+') AND What_Id ∈ that lead set.',
    'Base: all Leads');
  h += `<div class="kpis">`;
  h += leadKpi('Total leads (filtered)', L, {tone:'accent',
        fx:[FF.lead, 'COUNT(DISTINCT Leads.id)', 'Base']});
  h += leadKpi('Active leads', L.filter(l=>!M.DEAD.has(l.status)), {tone:'accent',
        def:'Active = Lead_Status not in ('+DEADLIST+').',
        fx:[FF.status, 'COUNT(DISTINCT Leads.id) WHERE Lead_Status NOT IN ('+DEADLIST+')', 'Base']});
  h += callKpi('Total calls', C, {tone:'accent',
        fx:[FF.call, 'COUNT(DISTINCT Calls.id) WHERE '+LOGGED, 'Excludes Scheduled / Overdue / Cancelled']});
  h += kpi('Unique leads called', n(t.uniqCalled), {tone:'accent',
        sub:`of ${n(t.leads)} leads`,
        fx:[FF.callOwn, 'COUNT(DISTINCT Calls.What_Id) WHERE '+LOGGED, 'A lead with 5 calls counts once'],
        onClick: act(()=>drill('Unique leads called','leads', L.filter(l=>l.calls>0), D.calls))});
  h += callKpi('Connected calls', C.filter(isConnected), {tone:'good', def:D.conn+' '+D.attrib,
        fx:[FF.dur, 'COUNT(Calls) WHERE Call_Duration_in_seconds > 0', 'Logged calls only']});
  h += callKpi('Not connected', C.filter(c=>!isConnected(c)&&!isMissed(c)), {tone:'warn', def:D.conn,
        fx:[FF.dur+', '+FF.type, 'COUNT(Calls) WHERE Call_Duration_in_seconds = 0 AND Call_Type ≠ "Missed"', 'Logged calls only']});
  h += callKpi('Missed calls', C.filter(isMissed), {tone:'bad', def:'Missed = <code>Call_Type = "Missed"</code>.',
        fx:[FF.type, 'COUNT(Calls) WHERE Call_Type = "Missed"', 'Logged calls only']});
  h += kpi('Contactability %', pctS(t.uniqConnected, t.uniqCalled),
        {tone: pct(t.uniqConnected,t.uniqCalled)>=60?'good':'warn',
         sub:`${n(t.uniqConnected)} of ${n(t.uniqCalled)} called leads`,
         fx:[FF.callOwn+', '+FF.dur,
             '100 × COUNT(DISTINCT What_Id WHERE duration &gt; 0) ÷ COUNT(DISTINCT What_Id)', 'Logged calls only'],
         onClick: act(()=>drill('Leads with ≥1 connected call','leads', L.filter(l=>l.connected>0),
           'Contactability % = unique leads with ≥1 connected call ÷ unique leads called × 100.'))});
  h += kpi('Calling coverage %', pctS(t.uniqCalled, t.leads), {tone: pct(t.uniqCalled,t.leads)>=70?'good':'warn',
         sub:'unique leads called ÷ total leads',
         fx:[FF.lead+', '+FF.callOwn, '100 × COUNT(DISTINCT What_Id) ÷ COUNT(DISTINCT Leads.id)', 'Base']});
  h += kpi('Total talk time', hms(t.talk), {tone:'teal', sub:`avg ${hms(t.conn? t.talk/t.conn : 0)} / connected call`,
         fx:[FF.dur, 'SUM(Call_Duration_in_seconds); average = SUM ÷ COUNT(connected calls)', 'Logged calls only']});
  h += kpi('Calls per lead', dec(t.leads? t.calls/t.leads : 0, 2), {sub:'total calls ÷ total leads',
         fx:[FF.call+', '+FF.lead, 'COUNT(logged Calls) ÷ COUNT(DISTINCT Leads.id)', 'Base']});
  h += leadKpi('Follow-ups due today', fuDueT, {tone:'warn', def:D.fu,
        fx:[FF.fu, 'COUNT(Leads) WHERE Follow_Up_Date_Time = today AND no logged call on/after it', 'Base']});
  h += leadKpi('Overdue follow-ups', fuOver, {tone:'bad', def:D.fu,
        fx:[FF.fu+', '+FF.start, 'COUNT(Leads) WHERE follow-up date &lt; today AND no logged call on/after that date', 'Base']});
  h += leadKpi('Priority Follow-ups Over Deal', priOver, {tone:'bad', def:D.pri,
        sub: DATA.leads.some(l=>l.isPriority) ? null
             : '<span class="badge b-warn">Follow up Priority not yet filled in CRM</span>',
        fx:[FF.pri, 'COUNT(Leads) WHERE Follow_up_Priority IS NOT NULL AND Follow_Up_Date_Time &lt; today AND no logged call on/after it',
            n(DATA.leads.filter(l=>l.isPriority).length)+' of '+n(DATA.leads.length)+' leads carry a Follow up Priority label']});
  h += kpi('Conversion %', pctS(conv.length, L.length), {tone:'good', sub:`${n(conv.length)} converted`,
         fx:[FF.conv, '100 × COUNT(Leads WHERE Converted__s = true OR Lead_Status = "Converted") ÷ COUNT(Leads)', 'Converted leads merged in via records API'],
         onClick: act(()=>drill('Converted leads','leads',conv,'Converted = <code>Converted__s = true</code> or <code>Lead_Status = "Converted"</code>.'))});
  h += kpi('Leads requiring attention', n(attention.size), {tone:'bad',
         sub:'never called, idle 30d+, or follow-up overdue',
         fx:[FF.lead+', '+FF.fu+', Leads.Last_Activity_Time',
             'COUNT(DISTINCT Leads) in UNION(0 calls, idle &gt; 30d AND active, follow-up overdue, priority follow-up overdue)', 'Base'],
         onClick: act(()=>drill('Leads requiring attention','leads', L.filter(l=>attention.has(l.id)),
           'Union of: never called, no activity 30+ days (active leads), follow-up overdue, priority follow-up overdue.'))});
  h += `</div>`;

  // top performers
  const rank = (key, fmt, min) => {
    const arr = M.psm.filter(p=>(min? p[min.k]>=min.v : true)).slice().sort((a,b)=>b[key]-a[key]).slice(0,5);
    return arr.map(p=>`<tr><td data-act="${act(()=>drill('PSM: '+p.name,'calls',psmCalls(p),D.attrib))}" class="click">${esc(p.name)}</td><td class="num">${fmt(p)}</td></tr>`).join('');
  };
  h += sec('Top performers', FF.callOwn+', '+FF.own,
    'Ranked per PSM. Call metrics group by Calls.Owner (actual caller); lead metrics group by current Lead Owner.', 'Base');
  h += `<div class="grid3">
    ${chart('Highest calls made', `<table>${rank('calls',p=>n(p.calls))}</table>`,
       FF.callOwn, 'COUNT(logged Calls) GROUP BY Calls.Owner, ORDER BY count DESC, TOP 5')}
    ${chart('Best connected %', `<table>${rank('connPct',p=>dec(p.connPct)+'%',{k:'calls',v:200})}</table>`,
       FF.dur+', '+FF.callOwn, '100 × COUNT(duration &gt; 0) ÷ COUNT(logged Calls) GROUP BY Calls.Owner', 'Minimum 200 calls')}
    ${chart('Best contactability %', `<table>${rank('contact',p=>dec(p.contact)+'%',{k:'uniqCalled',v:100})}</table>`,
       FF.callOwn+', '+FF.dur, '100 × COUNT(DISTINCT connected leads) ÷ COUNT(DISTINCT leads called) GROUP BY Calls.Owner', 'Minimum 100 leads called')}
    ${chart('Best follow-up compliance', `<table>${rank('compliance',p=>dec(p.compliance)+'%',{k:'fuDue',v:20})}</table>`,
       FF.fu+', '+FF.own, '100 × COUNT(follow-ups completed) ÷ COUNT(follow-ups set) GROUP BY Lead Owner', 'Minimum 20 follow-ups set')}
    ${chart('Highest conversion %', `<table>${rank('convPct',p=>dec(p.convPct)+'%',{k:'leads',v:100})}</table>`,
       FF.conv+', '+FF.own, '100 × COUNT(converted Leads) ÷ COUNT(Leads) GROUP BY Lead Owner', 'Minimum 100 leads')}
    ${chart('Lowest follow-up delay', `<table>${M.psm.filter(p=>p.fuDelayN>=10).sort((a,b)=>a.avgDelay-b.avgDelay).slice(0,5)
        .map(p=>`<tr><td>${esc(p.name)}</td><td class="num">${dec(p.avgDelay)} d</td></tr>`).join('')}</table>`,
       FF.fu, 'AVG(completion delay for done follow-ups, days overdue for pending) GROUP BY Lead Owner, ASC', 'Minimum 10 dated follow-ups')}
  </div>`;

  // alerts
  h += sec('Management alerts — attention required', FF.lead+', '+FF.call+', '+FF.fu,
    'Each tile is an independent COUNT(DISTINCT Leads.id) over the filtered lead set; click to open the records.', 'Base');
  h += `<div class="alerts">`;
  const alert=(cls,title,desc,rows,def,formula)=>`<div class="alert ${cls}" data-act="${act(()=>drill(title,'leads',rows,def))}">
      <span class="n">${n(rows.length)}</span><div class="t">${title}</div><div class="d">${desc}</div>
      ${SHOW_FX?`<div class="fx"><div><b>Formula:</b> <span class="fml">${formula}</span></div></div>`:''}</div>`;
  h += alert('crit','Leads never called','Zero logged calls in the selected range', notCalled, D.calls,
        'COUNT(Leads) WHERE COUNT(logged Calls on lead) = 0');
  h += alert('crit','Overdue follow-ups','Scheduled follow-up date passed with no call since', fuOver, D.fu,
        'COUNT(Leads) WHERE follow-up date &lt; today AND no logged call on/after it');
  h += alert('crit','Priority follow-ups overdue','Priority visit/call date passed, not actioned', priOver, D.pri,
        'COUNT(Leads) WHERE Visit_Call_Date_Time &lt; today AND not actioned');
  h += alert('','No activity for 30+ days','Active leads with no call and no CRM activity', idle,
        'Idle days = today − max(last logged call, Last_Activity_Time).',
        'COUNT(Leads) WHERE today − MAX(last call, Last_Activity_Time) &gt; 30 AND status is active');
  h += alert('','Called but never connected','Active leads 60d+ old with calls but zero connects', stuck, D.conn,
        'COUNT(Leads) WHERE age &gt; 60 AND calls &gt; 0 AND SUM(duration &gt; 0) = 0 AND status is active');
  h += alert('','Transferred leads','Lead has a different previous owner', L.filter(l=>l.transferred), D.xfer,
        'COUNT(Leads) WHERE Previous_Owner_Name IS NOT NULL AND ≠ Current_Owner_Name');
  h += alert('','High call count, no connection','5+ calls, zero connected', L.filter(l=>l.calls>=5&&l.connected===0), D.conn,
        'COUNT(Leads) WHERE COUNT(logged Calls) ≥ 5 AND COUNT(duration &gt; 0) = 0');
  h += alert('','Active leads with no next follow-up','No Follow_Up_Date_Time set', L.filter(l=>!l.fuEff && !M.DEAD.has(l.status)), D.fu,
        'COUNT(Leads) WHERE Follow_Up_Date_Time IS NULL AND status is active');
  h += `</div>`;

  const lowCov = M.psm.filter(p=>p.leads>=50 && p.coverage<50);
  const lowCon = M.psm.filter(p=>p.calls>=200 && p.connPct<40);
  const hiOver = M.psm.filter(p=>p.fuOver>=20);
  h += sec('PSM alerts', FF.callOwn+', '+FF.own+', '+FF.fu,
    'PSMs breaching a management threshold. Thresholds are stated on each panel.', 'Base');
  h += `<div class="grid3">
    ${chart('Low calling coverage (&lt;50%, ≥50 leads)', psmMini(lowCov,p=>dec(p.coverage)+'%'),
      FF.own+', '+FF.callOwn, '100 × unique leads called ÷ leads owned &lt; 50', 'PSMs owning ≥ 50 leads')}
    ${chart('Low connected % (&lt;40%, ≥200 calls)', psmMini(lowCon,p=>dec(p.connPct)+'%'),
      FF.dur, '100 × COUNT(duration &gt; 0) ÷ COUNT(logged Calls) &lt; 40', 'PSMs with ≥ 200 calls')}
    ${chart('High overdue follow-ups (≥20)', psmMini(hiOver,p=>n(p.fuOver)),
      FF.fu, 'COUNT(Leads WHERE follow-up overdue) GROUP BY Lead Owner ≥ 20', 'Base')}
  </div>`;
  return h;
};
function psmMini(arr, fmt){
  if(!arr.length) return '<div class="note">None — all clear.</div>';
  return `<table>${arr.map(p=>`<tr><td class="click" data-act="${act(()=>drill('PSM: '+p.name,'leads',psmLeads(p)))}">${esc(p.name)}</td><td class="num">${fmt(p)}</td></tr>`).join('')}</table>`;
}

/* ============ PAGE 2 — PSM PERFORMANCE ============ */
RENDER.psm = function(){
  const rows = M.psm;
  const cols = [
    {h:'PSM', f:p=>esc(p.name), act:p=>act(()=>drill('PSM portfolio: '+p.name,'leads',psmLeads(p),'Leads where this PSM is the CURRENT Lead Owner.'))},
    {h:'Total leads', cls:'num', f:p=>n(p.leads), act:p=>act(()=>drill('Leads owned by '+p.name,'leads',psmLeads(p)))},
    {h:'Active', cls:'num', f:p=>n(p.active), act:p=>act(()=>drill('Active leads — '+p.name,'leads',psmLeads(p).filter(l=>!M.DEAD.has(l.status))))},
    {h:'Leads called', cls:'num', f:p=>n(p.uniqCalled), act:p=>act(()=>drill('Leads called by '+p.name,'leads',M.leads.filter(l=>p.leadsCalled.has(l.id)),D.attrib))},
    {h:'Coverage %', cls:'num', f:p=>dec(p.coverage)+'%'},
    {h:'Connected leads', cls:'num', f:p=>n(p.uniqConnected)},
    {h:'Contactability %', cls:'num', f:p=>dec(p.contact)+'%'},
    {h:'Calls made', cls:'num', f:p=>n(p.calls), act:p=>act(()=>drill('Calls made by '+p.name,'calls',psmCalls(p),D.attrib+' '+D.calls))},
    {h:'Connected', cls:'num', f:p=>n(p.conn), act:p=>act(()=>drill('Connected calls — '+p.name,'calls',psmCalls(p).filter(isConnected),D.conn))},
    {h:'Not conn.', cls:'num', f:p=>n(p.nc), act:p=>act(()=>drill('Not-connected calls — '+p.name,'calls',psmCalls(p).filter(c=>!isConnected(c)&&!isMissed(c)),D.conn))},
    {h:'Missed', cls:'num', f:p=>n(p.miss), act:p=>act(()=>drill('Missed calls — '+p.name,'calls',psmCalls(p).filter(isMissed)))},
    {h:'Conn %', cls:'num', f:p=>dec(p.connPct)+'%'},
    {h:'Calls/lead', cls:'num', f:p=>dec(p.cpl,2)},
    {h:'Talk time', cls:'num', f:p=>hms(p.talk)},
    {h:'Avg talk', cls:'num', f:p=>hms(p.avgTalk)},
    {h:'FU set', cls:'num', f:p=>n(p.fuDue)},
    {h:'FU done', cls:'num', f:p=>n(p.fuDone)},
    {h:'FU pending', cls:'num', f:p=>n(p.fuPend)},
    {h:'FU overdue', cls:'num', f:p=>n(p.fuOver), act:p=>act(()=>drill('Overdue follow-ups — '+p.name,'leads',psmLeads(p).filter(l=>l.fuState==='Overdue'),D.fu))},
    {h:'Compliance %', cls:'num', f:p=>dec(p.compliance)+'%'},
    {h:'Avg delay (d)', cls:'num', f:p=>dec(p.avgDelay)},
    {h:'Max delay (d)', cls:'num', f:p=>n(p.fuMaxDelay)},
    {h:'Priority FU', cls:'num', f:p=>n(p.priTot)},
    {h:'Pri overdue', cls:'num', f:p=>n(p.priOver)},
    {h:'Transferred in', cls:'num', f:p=>n(p.tIn)},
    {h:'Transferred out', cls:'num', f:p=>n(p.tOut)},
    {h:'Never called', cls:'num', f:p=>n(p.noCall), act:p=>act(()=>drill('Never-called leads — '+p.name,'leads',psmLeads(p).filter(l=>l.calls===0)))},
    {h:'Idle 30d+', cls:'num', f:p=>n(p.idle30)},
    {h:'Converted', cls:'num', f:p=>n(p.converted)},
    {h:'Conv %', cls:'num', f:p=>dec(p.convPct)+'%'}
  ];
  const sum = k => rows.reduce((s,p)=>s+p[k],0);
  let h = sec('PSM scorecard — every column is clickable',
    FF.own+' · '+FF.callOwn+' · '+FF.dur+' · '+FF.fu,
    'Two different GROUP BY keys, deliberately: lead columns GROUP BY current Lead Owner; call columns GROUP BY Calls.Owner (actual caller). '+
    'Coverage % = 100 × unique leads called ÷ leads owned. Contactability % = 100 × connected leads ÷ leads called. '+
    'Conn % = 100 × COUNT(duration &gt; 0) ÷ calls. Calls/lead = calls ÷ leads owned. '+
    'Compliance % = 100 × follow-ups completed ÷ follow-ups set. Avg delay = AVG(completion delay | days overdue).',
    'Sorted by calls made DESC');
  h += table(cols, rows, {foot:(c, shown)=>{
    // totals follow the column filters so the footer always matches the visible rows
    const S = k => (shown||rows).reduce((s,p)=>s+p[k],0);
    const map = {'PSM':'TOTAL','Total leads':n(S('leads')),'Active':n(S('active')),
      'Calls made':n(S('calls')),'Connected':n(S('conn')),'Not conn.':n(S('nc')),'Missed':n(S('miss')),
      'Talk time':hms(S('talk')),'FU set':n(S('fuDue')),'FU done':n(S('fuDone')),
      'FU pending':n(S('fuPend')),'FU overdue':n(S('fuOver')),'Priority FU':n(S('priTot')),
      'Pri overdue':n(S('priOver')),'Transferred in':n(S('tIn')),'Transferred out':n(S('tOut')),
      'Never called':n(S('noCall')),'Idle 30d+':n(S('idle30')),'Converted':n(S('converted')),
      'Conn %':dec(pct(S('conn'),S('calls')))+'%'};
    return map[c.h]||'';
  }});

  h += sec('Calls made — by actual caller', FF.callOwn+', '+FF.call,
    'COUNT(DISTINCT Calls.id) WHERE '+LOGGED+' GROUP BY Calls.Owner. Never grouped by Lead Owner.', 'Top 25');
  h += `<div class="chartbox">
    ${hbar(rows.slice(0,25).map(p=>[p.name,p.calls]), {act:d=>{
      const p = rows.find(x=>x.name===d[0]);
      return act(()=>drill('Calls made by '+p.name,'calls',psmCalls(p),D.attrib));
    }})}</div>`;

  h += sec('Calling coverage vs contactability', FF.own+', '+FF.callOwn+', '+FF.dur,
    'Coverage answers "did the PSM work the list?"; contactability answers "did anyone pick up?".', 'Base');
  h += `<div class="grid2">
    ${chart('Calling coverage % (leads called ÷ leads owned)',
      hbar(rows.filter(p=>p.leads>=20).slice(0,25).map(p=>[p.name,+p.coverage.toFixed(1)]),{fmt:d=>d[1]+'%'}),
      FF.own+', '+FF.callOwn, '100 × COUNT(DISTINCT leads called) ÷ COUNT(leads owned)', 'PSMs owning ≥ 20 leads')}
    ${chart('Contactability % (connected leads ÷ leads called)',
      hbar(rows.filter(p=>p.uniqCalled>=20).slice(0,25).map(p=>[p.name,+p.contact.toFixed(1)]),{fmt:d=>d[1]+'%'}),
      FF.dur+', '+FF.callOwn, '100 × COUNT(DISTINCT leads with duration &gt; 0) ÷ COUNT(DISTINCT leads called)', 'PSMs with ≥ 20 leads called')}
  </div>`;
  return h;
};

/* ============ PAGE 3 — CALLING ANALYTICS ============ */
RENDER.calling = function(){
  const C = M.calls, t = M.tot;
  let h = sec('Calling activity', FF.call+', '+FF.dur+', '+FF.type+', '+FF.start,
    'All counts are over Calls WHERE '+LOGGED+', restricted to calls whose What_Id resolves to a lead in the filtered set.',
    'Base');
  h += `<div class="kpis">`;
  h += callKpi('Total calls', C, {tone:'accent', fx:[FF.call,'COUNT(DISTINCT Calls.id) WHERE '+LOGGED,'Base']});
  h += kpi('Unique leads called', n(t.uniqCalled), {tone:'accent',
        fx:[FF.callOwn,'COUNT(DISTINCT Calls.What_Id)','Base'],
        onClick:act(()=>drill('Unique leads called','leads',M.leads.filter(l=>l.calls>0)))});
  h += callKpi('Connected', C.filter(isConnected), {tone:'good', def:D.conn,
        fx:[FF.dur,'COUNT(Calls) WHERE Call_Duration_in_seconds &gt; 0','Base']});
  h += callKpi('Not connected', C.filter(c=>!isConnected(c)&&!isMissed(c)), {tone:'warn',
        fx:[FF.dur+', '+FF.type,'COUNT(Calls) WHERE duration = 0 AND Call_Type ≠ "Missed"','Base']});
  h += callKpi('Incoming', C.filter(c=>c.type==='Inbound'), {tone:'teal',
        fx:[FF.type,'COUNT(Calls) WHERE Call_Type = "Inbound"','Base']});
  h += callKpi('Outgoing', C.filter(c=>c.type==='Outbound'), {tone:'purple',
        fx:[FF.type,'COUNT(Calls) WHERE Call_Type = "Outbound"','Base']});
  h += callKpi('Missed', C.filter(isMissed), {tone:'bad',
        fx:[FF.type,'COUNT(Calls) WHERE Call_Type = "Missed"','Base']});
  h += kpi('Total talk time', hms(t.talk), {tone:'teal',
        fx:[FF.dur,'SUM(Call_Duration_in_seconds)','Base']});
  h += kpi('Avg talk time', hms(t.conn? t.talk/t.conn : 0), {sub:'per connected call',
        fx:[FF.dur,'SUM(duration) ÷ COUNT(Calls WHERE duration &gt; 0)','Connected calls only — not diluted by 0-second rows']});
  h += kpi('Connected %', pctS(t.conn,t.calls), {tone: pct(t.conn,t.calls)>=50?'good':'warn',
        fx:[FF.dur,'100 × COUNT(duration &gt; 0) ÷ COUNT(logged Calls)','Base']});
  h += kpi('Calls per lead called', dec(t.uniqCalled? t.calls/t.uniqCalled : 0,2),
        {fx:[FF.callOwn,'COUNT(logged Calls) ÷ COUNT(DISTINCT What_Id)','Base']});
  h += `</div>`;

  const byDay = new Map();
  for(const c of C){ if(c.day) byDay.set(c.day,(byDay.get(c.day)||0)+1); }
  const days = [...byDay.entries()].sort((a,b)=>a[0]<b[0]?-1:1).slice(-120);
  const connByDay = new Map();
  for(const c of C){ if(c.day && isConnected(c)) connByDay.set(c.day,(connByDay.get(c.day)||0)+1); }
  const byHour = Array.from({length:24},(_,i)=>[String(i).padStart(2,'0')+':00',0]);
  for(const c of C){ if(c.start) byHour[+c.start.slice(11,13)][1]++; }
  const wd = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>[d,0]);
  for(const c of C){ if(c.day){ const i=(new Date(c.day+'T00:00:00Z').getUTCDay()+6)%7; wd[i][1]++; } }

  h += sec('Trend', FF.start+', '+FF.dur, 'Calls bucketed by Call_Start_Time — by calendar date, hour of day and weekday.', 'Base');
  h += `<div class="grid2">
    ${chart(`Calls by date (last ${days.length} active days)`, barChart(days,{labelSlice:5,h:200}),
      FF.start, 'COUNT(logged Calls) GROUP BY DATE(Call_Start_Time)', 'Last 120 days that had activity')}
    ${chart('Connected calls by date', barChart(days.map(d=>[d[0],connByDay.get(d[0])||0]),{labelSlice:5,h:200}),
      FF.start+', '+FF.dur, 'COUNT(Calls WHERE duration &gt; 0) GROUP BY DATE(Call_Start_Time)', 'Same date axis')}
    ${chart('Calls by hour of day', barChart(byHour,{h:200,labels:24}),
      FF.start, 'COUNT(logged Calls) GROUP BY HOUR(Call_Start_Time)', 'Org local time (IST)')}
    ${chart('Calls by day of week', barChart(wd,{h:200,labels:7}),
      FF.start, 'COUNT(logged Calls) GROUP BY WEEKDAY(Call_Start_Time)', 'Monday-first')}
  </div>`;

  const y=addDays(TODAY,-1), sw=startOfWeek(TODAY), lw=addDays(sw,-7), ms=monthStart(TODAY), lme=addDays(ms,-1), lms=monthStart(lme);
  const win=(f,t)=>C.filter(c=>c.day&&c.day>=f&&c.day<=t);
  const cmpRows=[
    {label:'Today vs Yesterday', A:win(TODAY,TODAY), B:win(y,y), an:'Today', bn:'Yesterday'},
    {label:'This week vs Last week', A:win(sw,TODAY), B:win(lw,addDays(lw,6)), an:'This week', bn:'Last week'},
    {label:'This month vs Last month', A:win(ms,TODAY), B:win(lms,lme), an:'This month', bn:'Last month'}
  ].map(r=>Object.assign(r,{chg: r.B.length? ((r.A.length-r.B.length)/r.B.length*100) : 0}));
  h += sec('Period comparison', FF.start,
    'Change % = 100 × (current − previous) ÷ previous, counting logged calls in each calendar window.',
    'Calendar periods — independent of the date filter');
  h += table([
    {h:'Comparison', f:r=>esc(r.label)},
    {h:'Current', cls:'num', f:r=>n(r.A.length), act:r=>act(()=>drill(r.an,'calls',r.A))},
    {h:'Previous', cls:'num', f:r=>n(r.B.length), act:r=>act(()=>drill(r.bn,'calls',r.B))},
    {h:'Change', cls:'num', f:r=>`<span class="badge ${r.chg>=0?'b-good':'b-bad'}">${r.chg>=0?'+':''}${dec(r.chg)}%</span>`},
    {h:'Conn. (cur)', cls:'num', f:r=>n(r.A.filter(isConnected).length)},
    {h:'Conn. (prev)', cls:'num', f:r=>n(r.B.filter(isConnected).length)}
  ], cmpRows);

  const grp=(fn)=>{ const m=new Map(); for(const c of C){ const k=fn(c)||'(None)'; m.set(k,(m.get(k)||0)+1);} return [...m.entries()].sort((a,b)=>b[1]-a[1]); };
  h += sec('Breakdowns', FF.call+', Calls.Call_Result, Calls.Call_Purpose, '+FF.type+', '+FF.dur,
    'COUNT(logged Calls) GROUP BY the stated dimension. Region and status are taken from the call\'s parent lead.', 'Base');
  h += `<div class="grid3">
    ${chart('By call result (<code>Call_Result</code>)', hbar(grp(c=>c.result),{act:d=>act(()=>drill('Call result: '+d[0],'calls',C.filter(c=>(c.result||'(None)')===d[0])))}),
      'Calls.Call_Result','COUNT(logged Calls) GROUP BY Call_Result','Populated on only ~3.7% of calls — never used for connection logic')}
    ${chart('By region (of the lead)', hbar(grp(c=>{const l=DATA.leadById.get(c.leadId);return l&&l.region;}).slice(0,12),{act:d=>act(()=>drill('Calls — region '+d[0],'calls',C.filter(c=>{const l=DATA.leadById.get(c.leadId);return l&&l.region===d[0];})))}),
      'Calls.What_Id → Leads.Region','COUNT(logged Calls) GROUP BY parent Lead.Region','Top 12')}
    ${chart('By lead status', hbar(grp(c=>{const l=DATA.leadById.get(c.leadId);return l&&l.status;}).slice(0,12),{act:d=>act(()=>drill('Calls — status '+d[0],'calls',C.filter(c=>{const l=DATA.leadById.get(c.leadId);return l&&l.status===d[0];})))}),
      'Calls.What_Id → Leads.Lead_Status','COUNT(logged Calls) GROUP BY parent Lead.Lead_Status','Top 12')}
    ${chart('By call purpose', hbar(grp(c=>c.purpose).slice(0,10)),
      'Calls.Call_Purpose','COUNT(logged Calls) GROUP BY Call_Purpose','Top 10')}
    ${chart('By call type', hbar(grp(c=>c.type),{act:d=>act(()=>drill('Calls — type '+d[0],'calls',C.filter(c=>(c.type||'(None)')===d[0])))}),
      FF.type,'COUNT(logged Calls) GROUP BY Call_Type','Base')}
    ${chart('Talk-time band', hbar((()=>{const b=[['0s (not connected)',0],['1–30s',0],['31–60s',0],['1–3 min',0],['3–10 min',0],['10 min+',0]];
        for(const c of C){const d=c.dur; b[d<=0?0:d<=30?1:d<=60?2:d<=180?3:d<=600?4:5][1]++;} return b;})()),
      FF.dur,'COUNT(logged Calls) bucketed on Call_Duration_in_seconds','Bands: 0 / ≤30s / ≤60s / ≤180s / ≤600s / &gt;600s')}
  </div>`;
  return h;
};

/* ============ PAGE 4 — LEAD PORTFOLIO ============ */
RENDER.portfolio = function(){
  const L = M.leads;
  let h = sec('Lead portfolio health', FF.lead+', '+FF.call+', '+FF.dur+', '+FF.fu,
    'Each tile is COUNT(DISTINCT Leads.id) over the filtered lead set, qualified by its own predicate.', 'Base');
  h += `<div class="kpis">`;
  h += leadKpi('Total leads', L, {tone:'accent', fx:[FF.lead,'COUNT(DISTINCT Leads.id)','Base']});
  h += leadKpi('Never called', L.filter(l=>l.calls===0), {tone:'bad',
        fx:[FF.callOwn,'COUNT(Leads) WHERE COUNT(logged Calls on lead) = 0','Base']});
  h += leadKpi('Called, not connected', L.filter(l=>l.calls>0&&l.connected===0), {tone:'warn', def:D.conn,
        fx:[FF.dur,'COUNT(Leads) WHERE calls &gt; 0 AND COUNT(duration &gt; 0) = 0','Base']});
  h += leadKpi('Connected at least once', L.filter(l=>l.connected>0), {tone:'good', def:D.conn,
        fx:[FF.dur,'COUNT(Leads) WHERE COUNT(duration &gt; 0) ≥ 1','Base']});
  h += leadKpi('No follow-up set', L.filter(l=>!l.fuEff), {tone:'warn', def:D.fu,
        fx:[FF.fu,'COUNT(Leads) WHERE Follow_Up_Date_Time IS NULL','Base']});
  h += leadKpi('Idle 30d+', L.filter(l=>l.idleDays!=null&&l.idleDays>30), {tone:'bad',
        fx:['Leads.Last_Activity_Time, '+FF.start,'COUNT(Leads) WHERE today − MAX(last logged call, Last_Activity_Time) &gt; 30','Base']});
  h += leadKpi('Transferred', L.filter(l=>l.transferred), {tone:'purple', def:D.xfer,
        fx:[FF.xfer,'COUNT(Leads) WHERE Previous_Owner_Name IS NOT NULL AND ≠ Current_Owner_Name','Base']});
  h += leadKpi('Converted', L.filter(l=>l.converted||l.status==='Converted'), {tone:'good',
        fx:[FF.conv,'COUNT(Leads) WHERE Converted__s = true OR Lead_Status = "Converted"','Base']});
  h += `</div>`;

  h += sec('Call-intensity distribution (how hard each lead is worked)', FF.callOwn+', '+FF.dur+', '+FF.conv,
    'Leads bucketed by COUNT(logged Calls on the lead). Contactability % within a bucket = 100 × leads with ≥1 connected call ÷ leads with ≥1 call. '+
    'Conversion % = 100 × converted leads ÷ leads in bucket.', 'Base');
  const buckets = [['0 calls',l=>l.calls===0],['1 call',l=>l.calls===1],['2 calls',l=>l.calls===2],
    ['3 calls',l=>l.calls===3],['4–5 calls',l=>l.calls>=4&&l.calls<=5],['6–10 calls',l=>l.calls>=6&&l.calls<=10],
    ['10+ calls',l=>l.calls>10]];
  const bcols = [
    {h:'Calls on lead', f:r=>r.label, act:r=>act(()=>drill('Leads with '+r.label,'leads',r.rows,D.calls))},
    {h:'Leads', cls:'num', f:r=>n(r.rows.length)},
    {h:'% of total', cls:'num', f:r=>pctS(r.rows.length,L.length)},
    {h:'Connected leads', cls:'num', f:r=>n(r.rows.filter(l=>l.connected>0).length)},
    {h:'Contactability %', cls:'num', f:r=>pctS(r.rows.filter(l=>l.connected>0).length, r.rows.filter(l=>l.calls>0).length)},
    {h:'Converted', cls:'num', f:r=>n(r.rows.filter(l=>l.converted||l.status==='Converted').length)},
    {h:'Conversion %', cls:'num', f:r=>pctS(r.rows.filter(l=>l.converted||l.status==='Converted').length, r.rows.length)},
    {h:'Avg lead age (d)', cls:'num', f:r=>dec(avg(r.rows.map(l=>l.age)))},
    {h:'Distribution', f:r=>barCell(r.rows.length, L.length, '')}
  ];
  h += table(bcols, buckets.map(b=>({label:b[0], rows:L.filter(b[1])})));

  h += sec('Portfolio by PSM → region → stage', FF.own+', Leads.Region, '+FF.status+', Leads.Lead_Source, Leads.Lead_Disposition, Leads.City',
    'COUNT(DISTINCT Leads.id) GROUP BY the stated dimension, ordered DESC.', 'Base');
  h += `<div class="grid3">
    ${chart('Leads by PSM (current owner)', hbarLeads(l=>uname(l.ownerId),L,25), FF.own, 'COUNT(Leads) GROUP BY current Lead Owner', 'Top 25')}
    ${chart('Leads by region', hbarLeads(l=>l.region,L,12), 'Leads.Region', 'COUNT(Leads) GROUP BY Region', 'Top 12')}
    ${chart('Leads by status', hbarLeads(l=>l.status,L,20), FF.status, 'COUNT(Leads) GROUP BY Lead_Status', 'Top 20')}
    ${chart('Leads by source', hbarLeads(l=>l.source,L,15), 'Leads.Lead_Source', 'COUNT(Leads) GROUP BY Lead_Source', 'Top 15')}
    ${chart('Leads by disposition', hbarLeads(l=>l.disposition,L,20), 'Leads.Lead_Disposition', 'COUNT(Leads) GROUP BY Lead_Disposition', 'Top 20')}
    ${chart('Leads by city (top 15)', hbarLeads(l=>l.city,L,15), 'Leads.City', 'COUNT(Leads) GROUP BY City', 'Top 15')}
  </div>`;
  return h;
};
function avg(a){ const v=a.filter(x=>x!=null); return v.length? v.reduce((s,x)=>s+x,0)/v.length : null; }
function hbarLeads(fn, L, top){
  const m = new Map();
  for(const l of L){ const k = fn(l)||'(None)'; m.set(k,(m.get(k)||0)+1); }
  const d = [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,top);
  return hbar(d, {act:x=>act(()=>drill(x[0],'leads',L.filter(l=>(fn(l)||'(None)')===x[0])))});
}

/* ============ PAGE 5 — FOLLOW-UP & PRIORITY ============ */
RENDER.followup = function(){
  const L = M.leads;
  const withFu = L.filter(l=>l.fuEff);
  const st = s => withFu.filter(l=>l.fuState===s);
  const due = (from,to) => withFu.filter(l=>{ const d=l.fuEff.slice(0,10); return d>=from && d<=to && l.fuState!=='Completed'; });
  const pri = L.filter(l=>l.isPriority);
  const visit = L.filter(l=>l.visitFu);
  const priTotalAll = DATA.leads.filter(l=>l.isPriority).length;

  let h = '';
  if(priTotalAll === 0){
    h += `<div class="note" style="background:rgba(229,72,77,.08);border:1px solid rgba(229,72,77,.3);border-radius:8px;padding:10px 12px;color:var(--tx)">
      <b>Follow up Priority is not being filled in.</b> Priority follow-ups are counted from
      <code>Leads.Follow_up_Priority</code> (High / Medium / Low Priority), exactly as requested — but that field is
      currently <b>empty on all ${n(DATA.leads.length)} leads in this extract</b>, and a live CRM scan of all
      64,415 leads (including converted) found <b>0</b> populated. Every priority KPI below therefore reads 0.
      They will populate automatically as soon as the team starts setting <b>Follow up Priority</b> on leads —
      no dashboard change needed, just re-run <code>extract.ps1</code>.
      There is also no follow-up <b>completion</b> field, so completion is inferred from logged calls. See the Field Map page.</div>`;
  }

  h += sec('Follow-up management', FF.fu+', '+FF.start,
    'Effective follow-up date = Follow_Up_Date_Time. A follow-up is COMPLETED when a logged call '+
    'exists on the lead on/after that date; otherwise it is Pending (future), Due today, or Overdue (past).', 'Base');
  h += `<div class="kpis">`;
  h += leadKpi('Follow-ups set', withFu, {tone:'accent', def:D.fu,
        fx:[FF.fu,'COUNT(Leads) WHERE Follow_Up_Date_Time IS NOT NULL','Base']});
  h += leadKpi('Due today', due(TODAY,TODAY), {tone:'warn', def:D.fu,
        fx:[FF.fu,'COUNT(Leads) WHERE follow-up date = today AND status ≠ Completed','Base']});
  h += leadKpi('Due tomorrow', due(addDays(TODAY,1),addDays(TODAY,1)), {tone:'warn', def:D.fu,
        fx:[FF.fu,'COUNT(Leads) WHERE follow-up date = today + 1 AND status ≠ Completed','Base']});
  h += leadKpi('Due this week', due(TODAY,addDays(startOfWeek(TODAY),6)), {tone:'warn', def:D.fu,
        fx:[FF.fu,'COUNT(Leads) WHERE follow-up date BETWEEN today AND end of week AND status ≠ Completed','Week ends Sunday']});
  h += leadKpi('Completed', st('Completed'), {tone:'good', def:D.fu,
        fx:[FF.fu+', '+FF.start,'COUNT(Leads) WHERE ∃ logged call with Call_Start_Time ≥ follow-up date','Inferred — no completion field exists']});
  h += leadKpi('Pending (future)', st('Pending'), {tone:'accent', def:D.fu,
        fx:[FF.fu,'COUNT(Leads) WHERE follow-up date &gt; today AND no qualifying call','Base']});
  h += leadKpi('Overdue', st('Overdue'), {tone:'bad', def:D.fu,
        fx:[FF.fu,'COUNT(Leads) WHERE follow-up date &lt; today AND no qualifying call','Base']});
  h += kpi('Compliance %', pctS(st('Completed').length, withFu.length), {tone:'good', sub:'completed ÷ follow-ups set',
        fx:[FF.fu,'100 × COUNT(completed) ÷ COUNT(follow-ups set)','Base']});
  const delays = st('Completed').map(l=>Math.max(0,l.fuDelay)).filter(x=>x!=null);
  const overd  = st('Overdue').map(l=>l.fuOverdueDays);
  h += kpi('Avg completion delay', dec(avg(delays))+' d', {tone:'warn', sub:`${n(delays.length)} completed`,
        fx:[FF.fu+', '+FF.start,'AVG(DATE(first qualifying call) − follow-up date), negatives clamped to 0','Completed follow-ups only']});
  h += kpi('Max completion delay', n(Math.max(0,...delays))+' d', {tone:'bad',
        fx:[FF.fu+', '+FF.start,'MAX(DATE(first qualifying call) − follow-up date)','Completed follow-ups only']});
  h += kpi('Avg overdue age', dec(avg(overd))+' d', {tone:'bad', sub:`${n(overd.length)} overdue`,
        fx:[FF.fu,'AVG(today − follow-up date)','Overdue follow-ups only']});
  h += leadKpi('No follow-up set', L.filter(l=>!l.fuEff), {tone:'warn',
        fx:[FF.fu,'COUNT(Leads) WHERE Follow_Up_Date_Time IS NULL','Base']});
  h += `</div>`;

  const priScope = n(priTotalAll)+' of '+n(DATA.leads.length)+' leads carry a Follow up Priority label';
  h += sec('Priority follow-up (<code>Follow_up_Priority</code>)', FF.pri+', '+FF.fu+', '+FF.start,
    'A lead is a priority follow-up when <code>Follow_up_Priority</code> IS NOT NULL (High / Medium / Low Priority). '+
    'Its due date is Follow_Up_Date_Time, and it is Completed when a logged call exists on/after that date. '+
    'Priority Delay Days = today − follow-up date while still unactioned.', priScope);
  h += `<div class="kpis">`;
  h += leadKpi('Priority follow-ups', pri, {tone:'purple', def:D.pri,
        fx:[FF.pri,'COUNT(Leads) WHERE Follow_up_Priority IS NOT NULL',priScope]});
  h += leadKpi('Priority Follow-ups Over Deal', pri.filter(l=>l.priState==='Overdue'), {tone:'bad', def:D.pri,
        fx:[FF.pri+', '+FF.fu,'COUNT WHERE Follow_up_Priority IS NOT NULL AND follow-up date &lt; today AND no qualifying call',priScope]});
  h += leadKpi('Priority completed', pri.filter(l=>l.priState==='Completed'), {tone:'good', def:D.pri,
        fx:[FF.pri+', '+FF.start,'COUNT WHERE Follow_up_Priority IS NOT NULL AND ∃ logged call ≥ follow-up date','Inferred — no completion field']});
  h += leadKpi('Priority pending', pri.filter(l=>l.priState==='Pending'||l.priState==='Due today'), {tone:'warn', def:D.pri,
        fx:[FF.pri+', '+FF.fu,'COUNT WHERE Follow_up_Priority IS NOT NULL AND follow-up date ≥ today AND no qualifying call',priScope]});
  h += leadKpi('Priority, no follow-up date', pri.filter(l=>l.priState==='No follow-up set'), {tone:'warn', def:D.pri,
        fx:[FF.pri+', '+FF.fu,'COUNT WHERE Follow_up_Priority IS NOT NULL AND Follow_Up_Date_Time IS NULL','Flagged priority but undated — cannot be chased']});
  h += kpi('Avg priority delay', dec(avg(pri.filter(l=>l.priDelay!=null).map(l=>l.priDelay)))+' d', {tone:'bad',
        fx:[FF.pri+', '+FF.fu,'AVG(today − follow-up date)','Overdue priority follow-ups only']});
  h += `</div>`;

  // by priority label
  if(priTotalAll){
    h += sec('By priority label', FF.pri+', '+FF.fu,
      'COUNT(Leads) GROUP BY Follow_up_Priority, split by follow-up state.', priScope);
    const labels = [...new Set(DATA.leads.filter(l=>l.isPriority).map(l=>l.fuPriority))].sort();
    h += table([
      {h:'Follow up Priority', f:r=>esc(r.k), act:r=>act(()=>drill('Priority: '+r.k,'leads',r.rows,D.pri))},
      {h:'Leads', cls:'num', f:r=>n(r.rows.length)},
      {h:'Overdue', cls:'num', f:r=>n(r.rows.filter(l=>l.priState==='Overdue').length), act:r=>act(()=>drill('Overdue — '+r.k,'leads',r.rows.filter(l=>l.priState==='Overdue'),D.pri))},
      {h:'Due today', cls:'num', f:r=>n(r.rows.filter(l=>l.priState==='Due today').length)},
      {h:'Pending', cls:'num', f:r=>n(r.rows.filter(l=>l.priState==='Pending').length)},
      {h:'Completed', cls:'num', f:r=>n(r.rows.filter(l=>l.priState==='Completed').length)},
      {h:'No date set', cls:'num', f:r=>n(r.rows.filter(l=>l.priState==='No follow-up set').length)},
      {h:'Avg delay (d)', cls:'num', f:r=>dec(avg(r.rows.filter(l=>l.priDelay!=null).map(l=>l.priDelay)))}
    ], labels.map(k=>({k, rows:pri.filter(l=>l.fuPriority===k)})));
  }

  // secondary, dated signal kept intact
  h += sec('Visit / call requested (<code>Priority_Type</code> + <code>Visit_Call_Date_Time</code>)', FF.visit+', '+FF.fu,
    'Separate from Follow up Priority. Due date = Visit_Call_Date_Time where Priority_Type is set. '+
    'Gap Days = Visit_Call_Date_Time − normal follow-up date; Delay Days = today − Visit_Call_Date_Time while unactioned.',
    n(DATA.leads.filter(l=>l.visitFu).length)+' leads carry Priority_Type + a visit/call date');
  h += `<div class="kpis">`;
  h += leadKpi('Visit/call requested', visit, {tone:'purple', def:D.visit,
        fx:[FF.visit,'COUNT(Leads) WHERE Priority_Type IS NOT NULL AND Visit_Call_Date_Time IS NOT NULL','Base']});
  h += leadKpi('Visit/call overdue', visit.filter(l=>l.visitState==='Overdue'), {tone:'bad', def:D.visit,
        fx:[FF.visit,'COUNT WHERE Visit_Call_Date_Time &lt; today AND no qualifying call','Base']});
  h += leadKpi('Visit/call completed', visit.filter(l=>l.visitState==='Completed'), {tone:'good', def:D.visit,
        fx:[FF.visit+', '+FF.start,'COUNT WHERE ∃ logged call ≥ Visit_Call_Date_Time','Inferred']});
  h += kpi('Avg visit/call delay', dec(avg(visit.filter(l=>l.visitDelay!=null).map(l=>l.visitDelay)))+' d', {tone:'bad',
        fx:[FF.visit,'AVG(today − Visit_Call_Date_Time)','Overdue only']});
  h += kpi('Avg gap vs normal FU', dec(avg(visit.filter(l=>l.visitGap!=null).map(l=>l.visitGap)))+' d', {tone:'purple',
        fx:[FF.visit+', '+FF.fu,'AVG(Visit_Call_Date_Time − Follow_Up_Date_Time)','Leads carrying both dates']});
  h += `</div>`;

  h += sec('Completion-delay classification', FF.fu+', '+FF.start,
    'Completion Delay = DATE(first logged call on/after the scheduled follow-up) − scheduled follow-up date, bucketed.',
    'Completed follow-ups only');
  const db = [['On time',l=>l.fuDelay<=0],['1 day late',l=>l.fuDelay===1],['2 days late',l=>l.fuDelay===2],
    ['3–5 days late',l=>l.fuDelay>=3&&l.fuDelay<=5],['6–10 days late',l=>l.fuDelay>=6&&l.fuDelay<=10],
    ['11+ days late',l=>l.fuDelay>10]];
  const done = st('Completed');
  h += table([
    {h:'Delay band', f:r=>r.label, act:r=>act(()=>drill('Follow-ups '+r.label,'leads',r.rows,D.fu))},
    {h:'Leads', cls:'num', f:r=>n(r.rows.length)},
    {h:'% of completed', cls:'num', f:r=>pctS(r.rows.length,done.length)},
    {h:'', f:r=>barCell(r.rows.length,done.length,'')}
  ], db.map(b=>({label:b[0], rows:done.filter(l=>l.fuDelay!=null&&b[1](l))})));

  h += sec('Overdue ageing', FF.fu, 'Days Overdue = today − scheduled follow-up date, for follow-ups still unactioned.', 'Overdue follow-ups only');
  const ob=[['1–3 days',1,3],['4–7 days',4,7],['8–15 days',8,15],['16–30 days',16,30],['31–60 days',31,60],['60+ days',61,99999]];
  h += table([
    {h:'Days overdue', f:r=>r.label, act:r=>act(()=>drill('Overdue '+r.label,'leads',r.rows,D.fu))},
    {h:'Leads', cls:'num', f:r=>n(r.rows.length)},
    {h:'% of overdue', cls:'num', f:r=>pctS(r.rows.length, st('Overdue').length)},
    {h:'', f:r=>barCell(r.rows.length, st('Overdue').length,'')}
  ], ob.map(b=>({label:b[0], rows:st('Overdue').filter(l=>l.fuOverdueDays>=b[1]&&l.fuOverdueDays<=b[2])})));

  h += sec('Follow-up discipline by PSM', FF.fu+', '+FF.own,
    'GROUP BY current Lead Owner. Compliance % = 100 × completed ÷ set. Avg delay = AVG(completion delay for done, days overdue for overdue). '+
    'Max delay = MAX of the same series.', 'PSMs with ≥ 1 follow-up set, sorted by overdue DESC');
  const pr = M.psm.filter(p=>p.fuDue>0).sort((a,b)=>b.fuOver-a.fuOver);
  h += table([
    {h:'PSM', f:p=>esc(p.name), act:p=>act(()=>drill('Follow-ups — '+p.name,'leads',psmLeads(p).filter(l=>l.fuEff),D.fu))},
    {h:'Follow-ups set', cls:'num', f:p=>n(p.fuDue)},
    {h:'Completed', cls:'num', f:p=>n(p.fuDone), act:p=>act(()=>drill('Completed FU — '+p.name,'leads',psmLeads(p).filter(l=>l.fuState==='Completed'),D.fu))},
    {h:'Pending', cls:'num', f:p=>n(p.fuPend)},
    {h:'Overdue', cls:'num', f:p=>n(p.fuOver), act:p=>act(()=>drill('Overdue FU — '+p.name,'leads',psmLeads(p).filter(l=>l.fuState==='Overdue'),D.fu))},
    {h:'Compliance %', cls:'num', f:p=>dec(p.compliance)+'%'},
    {h:'Avg delay (d)', cls:'num', f:p=>dec(p.avgDelay)},
    {h:'Max delay (d)', cls:'num', f:p=>n(p.fuMaxDelay)},
    {h:'Priority FU', cls:'num', f:p=>n(p.priTot)},
    {h:'Priority overdue', cls:'num', f:p=>n(p.priOver)},
    {h:'', f:p=>barCell(p.fuOver, Math.max(1,...pr.map(x=>x.fuOver)), n(p.fuOver)+' overdue')}
  ], pr);

  if(pr.length){
    const worst = pr[0], best = pr.slice().sort((a,b)=>b.compliance-a.compliance)[0];
    h += `<div class="note">Highest overdue load: <b>${esc(worst.name)}</b> (${n(worst.fuOver)} overdue, avg ${dec(worst.avgDelay)} d).
          Best compliance: <b>${esc(best.name)}</b> (${dec(best.compliance)}% of ${n(best.fuDue)} follow-ups).</div>`;
  }

  h += sec('All dated follow-ups', FF.fu+', '+FF.pri+', '+FF.start,
    'One row per lead carrying a follow-up date, ordered by that date ascending.', 'First 1,500 rows');
  h += table([
    {h:'Lead ID', f:l=>esc(l.leadNo||'—')},
    {h:'Client', f:l=>`<a href="${crmLink('Leads',l.id)}" target="_blank">${esc(l.name||'—')}</a>`},
    {h:'Owner', f:l=>esc(uname(l.ownerId))},
    {h:'Region', f:l=>esc(l.region)},
    {h:'Status', f:l=>esc(l.status)},
    {h:'Normal FU', cls:'num', f:l=>fmtDate(l.fuEff)},
    {h:'FU type', f:l=>esc(l.fuType||'—')},
    {h:'Priority label', f:l=>esc(l.fuPriority||'—')},
    {h:'Visit/call FU', cls:'num', f:l=>fmtDate(l.visitFu)},
    {h:'FU status', f:l=>fuBadge(l.fuState)},
    {h:'Completed on', cls:'num', f:l=>fmtDate(l.fuDoneOn)},
    {h:'Delay (d)', cls:'num', f:l=>l.fuDelay==null?'—':l.fuDelay},
    {h:'Overdue (d)', cls:'num', f:l=>l.fuOverdueDays==null?'—':l.fuOverdueDays},
    {h:'Priority delay (d)', cls:'num', f:l=>l.priDelay==null?'—':l.priDelay},
    {h:'Calls', cls:'num', f:l=>n(l.calls)},
    {h:'Last call', cls:'num', f:l=>fmtDate(l.lastCall)},
    {h:'CRM', f:l=>`<a href="${crmLink('Leads',l.id)}" target="_blank">open ↗</a>`}
  ], withFu.slice().sort((a,b)=>(a.fuEff<b.fuEff?-1:1)));
  if(withFu.length>1500) h += `<div class="note">Showing 1,500 of ${n(withFu.length)} — click any KPI above for a filtered, exportable list.</div>`;
  return h;
};

/* ============ PAGE 6 — REGION PERFORMANCE ============ */
RENDER.region = function(){
  const L = M.leads, C = M.calls;
  const regions = new Map();
  for(const l of L){
    let r = regions.get(l.region);
    if(!r){ r={name:l.region,leads:[],calls:[]}; regions.set(l.region,r); }
    r.leads.push(l);
  }
  for(const c of C){ const l=DATA.leadById.get(c.leadId); if(l&&regions.has(l.region)) regions.get(l.region).calls.push(c); }
  const rows = [...regions.values()].map(r=>{
    const called = new Set(r.calls.map(c=>c.leadId));
    const conn   = new Set(r.calls.filter(isConnected).map(c=>c.leadId));
    const active = r.leads.filter(l=>!M.DEAD.has(l.status));
    return Object.assign(r,{
      nLeads:r.leads.length, nActive:active.length, nCalls:r.calls.length,
      nConn:r.calls.filter(isConnected).length, nNc:r.calls.filter(c=>!isConnected(c)&&!isMissed(c)).length,
      uniq:called.size, uniqConn:conn.size, talk:r.calls.reduce((s,c)=>s+c.dur,0),
      psms:new Set(r.leads.map(l=>l.ownerId)).size,
      fuDue:r.leads.filter(l=>l.fuEff&&l.fuState!=='Completed').length,
      fuOver:r.leads.filter(l=>l.fuState==='Overdue').length,
      pri:r.leads.filter(l=>l.isPriority).length,
      priOver:r.leads.filter(l=>l.priState==='Overdue').length,
      conv:r.leads.filter(l=>l.converted||l.status==='Converted').length,
      avgAge:avg(r.leads.map(l=>l.age))
    });
  }).sort((a,b)=>b.nLeads-a.nLeads);

  let h = sec('Region scorecard — click any figure to drill down',
    'Leads.Region · '+FF.callOwn+' · '+FF.dur+' · '+FF.fu+' · '+FF.conv,
    'GROUP BY Leads.Region. A call belongs to a region via its parent lead (Calls.What_Id → Leads.Region). '+
    'Coverage % = 100 × unique leads called ÷ total leads. Contactability % = 100 × connected leads ÷ leads called. '+
    'Conversion % = 100 × converted ÷ total leads. Avg lead age = AVG(today − Created_Time).',
    'Base');
  h += table([
    {h:'Region', f:r=>esc(r.name), act:r=>act(()=>drill('Region: '+r.name,'leads',r.leads))},
    {h:'Total leads', cls:'num', f:r=>n(r.nLeads), act:r=>act(()=>drill('Leads — '+r.name,'leads',r.leads))},
    {h:'Active', cls:'num', f:r=>n(r.nActive)},
    {h:'PSMs', cls:'num', f:r=>n(r.psms)},
    {h:'Total calls', cls:'num', f:r=>n(r.nCalls), act:r=>act(()=>drill('Calls — '+r.name,'calls',r.calls,D.attrib))},
    {h:'Unique leads called', cls:'num', f:r=>n(r.uniq)},
    {h:'Connected', cls:'num', f:r=>n(r.nConn), act:r=>act(()=>drill('Connected calls — '+r.name,'calls',r.calls.filter(isConnected),D.conn))},
    {h:'Not connected', cls:'num', f:r=>n(r.nNc)},
    {h:'Coverage %', cls:'num', f:r=>dec(pct(r.uniq,r.nLeads))+'%'},
    {h:'Contactability %', cls:'num', f:r=>dec(pct(r.uniqConn,r.uniq))+'%'},
    {h:'Calls / lead', cls:'num', f:r=>dec(r.nLeads?r.nCalls/r.nLeads:0,2)},
    {h:'Talk time', cls:'num', f:r=>hms(r.talk)},
    {h:'FU due', cls:'num', f:r=>n(r.fuDue)},
    {h:'FU overdue', cls:'num', f:r=>n(r.fuOver), act:r=>act(()=>drill('Overdue FU — '+r.name,'leads',r.leads.filter(l=>l.fuState==='Overdue'),D.fu))},
    {h:'Priority FU', cls:'num', f:r=>n(r.pri)},
    {h:'Pri overdue', cls:'num', f:r=>n(r.priOver)},
    {h:'Converted', cls:'num', f:r=>n(r.conv)},
    {h:'Conversion %', cls:'num', f:r=>dec(pct(r.conv,r.nLeads))+'%'},
    {h:'Avg lead age (d)', cls:'num', f:r=>dec(r.avgAge,0)}
  ], rows, {foot:(c, shown)=>{
    const S=k=>(shown||rows).reduce((s,r)=>s+r[k],0);
    const map={'Region':'TOTAL','Total leads':n(S('nLeads')),'Active':n(S('nActive')),'Total calls':n(S('nCalls')),
      'Connected':n(S('nConn')),'Not connected':n(S('nNc')),'Talk time':hms(S('talk')),'FU due':n(S('fuDue')),
      'FU overdue':n(S('fuOver')),'Priority FU':n(S('pri')),'Pri overdue':n(S('priOver')),'Converted':n(S('conv'))};
    return map[c.h]||'';
  }});

  h += sec('Region → PSM drill-down', 'Leads.Region, '+FF.own,
    'COUNT(Leads) GROUP BY Region, current Lead Owner. Click a bar for Region → PSM → lead records.', 'Top 8 regions, top 12 PSMs each');
  h += `<div class="grid2">`;
  for(const r of rows.slice(0,8)){
    const byP = new Map();
    for(const l of r.leads){ byP.set(l.ownerId,(byP.get(l.ownerId)||0)+1); }
    const d=[...byP.entries()].map(([id,c])=>[uname(id),c]).sort((a,b)=>b[1]-a[1]).slice(0,12);
    h += `<div class="chartbox"><h4>${esc(r.name)} — ${n(r.nLeads)} leads by PSM</h4>${hbar(d,{act:x=>act(()=>
      drill(r.name+' → '+x[0],'leads', r.leads.filter(l=>uname(l.ownerId)===x[0])))})}</div>`;
  }
  h += `</div>`;
  return h;
};

/* ============ PAGE 7 — LEAD AGEING & STAGE ============ */
RENDER.ageing = function(){
  const L = M.leads;
  const buckets=[['0–3 days',0,3],['4–7 days',4,7],['8–15 days',8,15],['16–30 days',16,30],
    ['31–60 days',31,60],['61–90 days',61,90],['90+ days',91,999999]];
  const bk = buckets.map(b=>({label:b[0], rows:L.filter(l=>l.age!=null&&l.age>=b[1]&&l.age<=b[2])}));

  let h = sec('Lead ageing', FF.created+', '+FF.callOwn+', '+FF.conv,
    'Lead Age = today − DATE(Created_Time), in days, bucketed. Conversion % within a bucket = 100 × converted ÷ leads in bucket. '+
    'Avg calls = AVG(COUNT(logged Calls on lead)).', 'Base');
  h += table([
    {h:'Age bucket', f:r=>r.label, act:r=>act(()=>drill('Leads aged '+r.label,'leads',r.rows))},
    {h:'Leads', cls:'num', f:r=>n(r.rows.length)},
    {h:'% of total', cls:'num', f:r=>pctS(r.rows.length,L.length)},
    {h:'Never called', cls:'num', f:r=>n(r.rows.filter(l=>l.calls===0).length), act:r=>act(()=>drill('Never called, aged '+r.label,'leads',r.rows.filter(l=>l.calls===0)))},
    {h:'Connected', cls:'num', f:r=>n(r.rows.filter(l=>l.connected>0).length)},
    {h:'Overdue FU', cls:'num', f:r=>n(r.rows.filter(l=>l.fuState==='Overdue').length)},
    {h:'Converted', cls:'num', f:r=>n(r.rows.filter(l=>l.converted||l.status==='Converted').length)},
    {h:'Conversion %', cls:'num', f:r=>pctS(r.rows.filter(l=>l.converted||l.status==='Converted').length,r.rows.length)},
    {h:'Avg calls', cls:'num', f:r=>dec(avg(r.rows.map(l=>l.calls)),2)},
    {h:'', f:r=>barCell(r.rows.length,L.length,'')}
  ], bk);

  h += sec('Ageing by PSM / region / source', FF.created+', '+FF.own+', Leads.Region, Leads.Lead_Source',
    'AVG(today − Created_Time) GROUP BY PSM; COUNT(Leads WHERE age &gt; 90) GROUP BY Region / Source.', 'Base');
  h += `<div class="grid3">
    ${chart('Avg lead age by PSM (top 20 by volume)',
      hbar(M.psm.slice(0,20).map(p=>[p.name, Math.round(avg(psmLeads(p).map(l=>l.age))||0)]).sort((a,b)=>b[1]-a[1]),{fmt:d=>d[1]+' d'}),
      FF.created+', '+FF.own, 'AVG(today − DATE(Created_Time)) GROUP BY current Lead Owner', 'Top 20 PSMs by call volume')}
    ${chart('90+ day leads by region', hbarLeads(l=>l.region, L.filter(l=>l.age>90), 12),
      FF.created+', Leads.Region', 'COUNT(Leads WHERE age &gt; 90) GROUP BY Region', 'Top 12')}
    ${chart('90+ day leads by source', hbarLeads(l=>l.source, L.filter(l=>l.age>90), 12),
      FF.created+', Leads.Lead_Source', 'COUNT(Leads WHERE age &gt; 90) GROUP BY Lead_Source', 'Top 12')}
  </div>`;

  h += sec('Lead status analysis (actual <code>Lead_Status</code> values)',
    FF.status+', Leads.Modified_Time, '+FF.callOwn+', '+FF.fu,
    'COUNT(Leads) GROUP BY Lead_Status. "Avg days since change" = AVG(today − DATE(Modified_Time)) — the CRM exposes no '+
    'per-stage entry timestamp via API, so Modified_Time is the last-change proxy.',
    'These are the real picklist values in this CRM — none invented');
  const stMap = new Map();
  for(const l of L){ if(!stMap.has(l.status)) stMap.set(l.status,[]); stMap.get(l.status).push(l); }
  const stRows = [...stMap.entries()].map(([s,rows])=>({s,rows})).sort((a,b)=>b.rows.length-a.rows.length);
  h += table([
    {h:'Lead status', f:r=>esc(r.s), act:r=>act(()=>drill('Status: '+r.s,'leads',r.rows))},
    {h:'Leads', cls:'num', f:r=>n(r.rows.length)},
    {h:'% of total', cls:'num', f:r=>pctS(r.rows.length,L.length)},
    {h:'PSMs', cls:'num', f:r=>n(new Set(r.rows.map(l=>l.ownerId)).size)},
    {h:'Regions', cls:'num', f:r=>n(new Set(r.rows.map(l=>l.region)).size)},
    {h:'Calls made', cls:'num', f:r=>n(r.rows.reduce((s,l)=>s+l.calls,0))},
    {h:'Connected', cls:'num', f:r=>n(r.rows.reduce((s,l)=>s+l.connected,0))},
    {h:'Avg calls/lead', cls:'num', f:r=>dec(avg(r.rows.map(l=>l.calls)),2)},
    {h:'Avg days since change', cls:'num', f:r=>dec(avg(r.rows.map(l=>l.modified? TODAY_N-dayNum(l.modified):null)),0)},
    {h:'FU pending', cls:'num', f:r=>n(r.rows.filter(l=>l.fuState==='Pending'||l.fuState==='Due today').length)},
    {h:'FU overdue', cls:'num', f:r=>n(r.rows.filter(l=>l.fuState==='Overdue').length)},
    {h:'Never called', cls:'num', f:r=>n(r.rows.filter(l=>l.calls===0).length)},
    {h:'', f:r=>barCell(r.rows.length,L.length,'')}
  ], stRows);

  h += sec('Stuck leads', FF.status+', Leads.Modified_Time, '+FF.created+', '+FF.dur,
    'Leads that have stopped moving. Each tile is COUNT(DISTINCT Leads.id) with the predicate shown on the card.', 'Base');
  h += `<div class="kpis">`;
  h += leadKpi('No status change in 60+ days (active)', L.filter(l=>!M.DEAD.has(l.status)&&l.modified&&TODAY_N-dayNum(l.modified)>60), {tone:'bad',
        fx:['Leads.Modified_Time, '+FF.status,'COUNT(Leads) WHERE today − DATE(Modified_Time) &gt; 60 AND status is active','Base']});
  h += leadKpi('Still "Raw" after 15+ days', L.filter(l=>l.status==='Raw'&&l.age>15), {tone:'bad',
        fx:[FF.status+', '+FF.created,'COUNT(Leads) WHERE Lead_Status = "Raw" AND age &gt; 15','Base']});
  h += leadKpi('Open/Prospect, never connected', L.filter(l=>['Open','Prospect','Priority Prospect'].includes(l.status)&&l.connected===0), {tone:'warn',
        fx:[FF.status+', '+FF.dur,'COUNT(Leads) WHERE Lead_Status IN (Open, Prospect, Priority Prospect) AND COUNT(duration &gt; 0) = 0','Base']});
  h += leadKpi('90+ days old, still active', L.filter(l=>!M.DEAD.has(l.status)&&l.age>90), {tone:'warn',
        fx:[FF.created+', '+FF.status,'COUNT(Leads) WHERE age &gt; 90 AND status is active','Base']});
  h += `</div>`;

  h += sec('Project stage (<code>Project_Stage</code>)', 'Leads.Project_Stage',
    'COUNT(Leads) GROUP BY Project_Stage — the construction-phase picklist, distinct from Lead_Status.', 'Base');
  h += `<div class="chartbox">${hbarLeads(l=>l.projStage,L,10)}</div>`;
  return h;
};

/* ============ PAGE 8 — TRANSFER & ATTRIBUTION ============ */
RENDER.transfer = function(){
  const L = M.leads, xf = L.filter(l=>l.transferred);
  let h = `<div class="note" style="background:rgba(76,141,255,.08);border:1px solid rgba(76,141,255,.3);border-radius:8px;padding:10px 12px;color:var(--tx)">
    <b>The attribution rule.</b> Every call is counted against <code>Calls.Owner</code> — the PSM who actually made it —
    never against the current Lead Owner. A lead transferred from A to B shows A's calls under A and B's calls under B;
    the lead's total is the sum. Transfer detection uses <code>Previous_Owner_Name</code> vs <code>Current_Owner_Name</code>;
    the before/after split uses <code>Lead_Assigned_Date</code> as the transfer timestamp (the CRM exposes no owner-change audit trail via API).</div>`;

  h += sec('Transfer overview', FF.xfer+', '+FF.callOwn,
    'Transferred = Previous_Owner_Name IS NOT NULL AND ≠ Current_Owner_Name. '+
    'Calls before transfer = COUNT(logged Calls WHERE Call_Start_Time &lt; Lead_Assigned_Date); after = the complement.', 'Base');
  h += `<div class="kpis">`;
  h += leadKpi('Transferred leads', xf, {tone:'purple', def:D.xfer,
        fx:[FF.xfer,'COUNT(Leads) WHERE Previous_Owner_Name IS NOT NULL AND ≠ Current_Owner_Name','Base']});
  h += kpi('% of portfolio', pctS(xf.length,L.length), {tone:'purple',
        fx:[FF.xfer,'100 × COUNT(transferred) ÷ COUNT(Leads)','Base']});
  h += leadKpi('Transferred & never called since', xf.filter(l=>l.callsAfter===0&&l.assigned), {tone:'bad', def:D.xfer,
        fx:[FF.xfer+', '+FF.start,'COUNT(transferred Leads) WHERE COUNT(logged Calls ≥ Lead_Assigned_Date) = 0','Leads carrying Lead_Assigned_Date']});
  h += kpi('Calls before transfer', n(xf.reduce((s,l)=>s+l.callsBefore,0)), {tone:'teal',
        sub:'preserved against the original PSM',
        fx:[FF.start+', Leads.Lead_Assigned_Date','SUM over transferred leads of COUNT(logged Calls WHERE Call_Start_Time &lt; Lead_Assigned_Date)','Base']});
  h += kpi('Calls after transfer', n(xf.reduce((s,l)=>s+l.callsAfter,0)), {tone:'accent',
        fx:[FF.start+', Leads.Lead_Assigned_Date','SUM over transferred leads of COUNT(logged Calls WHERE Call_Start_Time ≥ Lead_Assigned_Date)','Base']});
  h += leadKpi('Transferred with zero total calls', xf.filter(l=>l.calls===0), {tone:'bad',
        fx:[FF.xfer+', '+FF.callOwn,'COUNT(transferred Leads) WHERE COUNT(logged Calls) = 0','Base']});
  h += `</div>`;

  h += sec('Transfer flow — from → to', FF.xfer+', '+FF.start,
    'COUNT(Leads) GROUP BY (Previous_Owner_Name → Current_Owner_Name), with call totals split at Lead_Assigned_Date.',
    'Top 40 flows by lead count');
  const flow = new Map();
  for(const l of xf){ const k=(l.prevOwnerName||'?')+' → '+(l.ownerName||uname(l.ownerId));
    if(!flow.has(k)) flow.set(k,[]); flow.get(k).push(l); }
  const fRows=[...flow.entries()].map(([k,rows])=>({k,rows})).sort((a,b)=>b.rows.length-a.rows.length).slice(0,40);
  h += table([
    {h:'From → To', f:r=>esc(r.k), act:r=>act(()=>drill('Transfer '+r.k,'leads',r.rows,D.xfer))},
    {h:'Leads', cls:'num', f:r=>n(r.rows.length)},
    {h:'Calls before', cls:'num', f:r=>n(r.rows.reduce((s,l)=>s+l.callsBefore,0))},
    {h:'Calls after', cls:'num', f:r=>n(r.rows.reduce((s,l)=>s+l.callsAfter,0))},
    {h:'Total calls', cls:'num', f:r=>n(r.rows.reduce((s,l)=>s+l.calls,0))},
    {h:'Untouched since transfer', cls:'num', f:r=>n(r.rows.filter(l=>l.callsAfter===0).length)},
    {h:'', f:r=>barCell(r.rows.length, Math.max(...fRows.map(x=>x.rows.length)),'')}
  ], fRows);

  h += sec('Transferred in / out by PSM', FF.xfer+', '+FF.callOwn,
    'Transferred in = COUNT(Leads owned now that were previously someone else\'s). '+
    'Transferred out = COUNT(Leads WHERE Previous_Owner_Name = this PSM). Net = in − out. '+
    'Calls made stays attributed to Calls.Owner regardless of transfers.', 'PSMs with any transfer activity');
  h += table([
    {h:'PSM', f:p=>esc(p.name)},
    {h:'Transferred in', cls:'num', f:p=>n(p.tIn), act:p=>act(()=>drill('Transferred in — '+p.name,'leads',psmLeads(p).filter(l=>l.transferred),D.xfer))},
    {h:'Transferred out', cls:'num', f:p=>n(p.tOut), act:p=>act(()=>drill('Transferred out — '+p.name,'leads',L.filter(l=>l.transferred&&l.prevOwnerName===p.name),D.xfer))},
    {h:'Net', cls:'num', f:p=>{const v=p.tIn-p.tOut; return `<span class="badge ${v>=0?'b-good':'b-warn'}">${v>=0?'+':''}${v}</span>`;}},
    {h:'Calls made (actual)', cls:'num', f:p=>n(p.calls), act:p=>act(()=>drill('Calls made by '+p.name,'calls',psmCalls(p),D.attrib))}
  ], M.psm.filter(p=>p.tIn||p.tOut).sort((a,b)=>b.tIn-a.tIn));

  h += sec('Multi-PSM leads — per-lead call attribution', FF.callOwn+', '+FF.xfer,
    'Leads WHERE COUNT(DISTINCT Calls.Owner) &gt; 1. The attribution column is COUNT(logged Calls) GROUP BY Calls.Owner '+
    'within that single lead — this is the proof that each PSM keeps their own calls.', 'Top 400 by call count');
  const multi = L.filter(l=>l.a && l.a.byOwner.size>1)
                 .sort((a,b)=>b.calls-a.calls).slice(0,400);
  h += table([
    {h:'Lead ID', f:l=>esc(l.leadNo||'—')},
    {h:'Client', f:l=>`<a href="${crmLink('Leads',l.id)}" target="_blank">${esc(l.name||'—')}</a>`},
    {h:'Region', f:l=>esc(l.region)},
    {h:'Current owner', f:l=>esc(uname(l.ownerId))},
    {h:'Previous owner', f:l=>esc(l.prevOwnerName||'—')},
    {h:'Assigned (transfer proxy)', cls:'num', f:l=>fmtDate(l.assigned)},
    {h:'Total calls', cls:'num', f:l=>n(l.calls), act:l=>act(()=>drill('Call history — '+(l.name||l.leadNo),'calls',
        M.calls.filter(c=>c.leadId===l.id).sort((a,b)=>a.start<b.start?-1:1), D.attrib))},
    {h:'Attribution by actual caller', f:l=>[...l.a.byOwner.entries()].sort((a,b)=>b[1].tot-a[1].tot)
        .map(([id,o])=>`<span class="badge ${id===l.ownerId?'b-acc':'b-mut'}">${esc(uname(id))}: ${o.tot}</span>`).join(' ')},
    {h:'Before transfer', cls:'num', f:l=>n(l.callsBefore)},
    {h:'After transfer', cls:'num', f:l=>n(l.callsAfter)},
    {h:'Connected', cls:'num', f:l=>n(l.connected)},
    {h:'CRM', f:l=>`<a href="${crmLink('Leads',l.id)}" target="_blank">open ↗</a>`}
  ], multi);
  if(L.filter(l=>l.a&&l.a.byOwner.size>1).length>400)
    h += `<div class="note">Showing 400 of ${n(L.filter(l=>l.a&&l.a.byOwner.size>1).length)} multi-PSM leads.</div>`;
  return h;
};

/* ============ PAGE 9 — DETAILED DATA ============ */
RENDER.detail = function(){
  const L = M.leads;
  let h = sec(`Complete lead-level drill-down (${n(L.length)} leads matched)`,
    'All Lead fields + '+FF.callOwn+', '+FF.dur,
    'One row per lead in the filtered set. Per-lead call columns are COUNT(logged Calls on the lead); '+
    '"By current PSM" is COUNT(logged Calls WHERE Calls.Owner = current Lead Owner) — the difference against Total calls '+
    'is exactly the work done by previous owners.', 'First 10 rows shown; View more displays the full list');
  h += `<div style="margin-bottom:10px"><button class="ghost" data-act="${act(()=>drill('Full filtered lead list','leads',L,'All filters applied.'))}">Open full list / export CSV</button>
    <button class="ghost" data-act="${act(()=>drill('Full filtered call list','calls',M.calls,D.calls+' '+D.attrib))}">Open all matched calls / export CSV</button></div>`;
  h += table([
    {h:'PSM (owner)', f:l=>esc(uname(l.ownerId))},
    {h:'Lead ID', f:l=>esc(l.leadNo||'—')},
    {h:'Client', f:l=>`<a href="${crmLink('Leads',l.id)}" target="_blank">${esc(l.name||'—')}</a>`},
    {h:'Mobile', f:l=>esc(l.mobile||'—')},
    {h:'Region', f:l=>esc(l.region)},
    {h:'City', f:l=>esc(l.city)},
    {h:'Source', f:l=>esc(l.source)},
    {h:'Created', cls:'num', f:l=>fmtDate(l.created)},
    {h:'Original/prev owner', f:l=>esc(l.prevOwnerName||'—')},
    {h:'Status', f:l=>esc(l.status)},
    {h:'Project stage', f:l=>esc(l.projStage||'—')},
    {h:'Disposition', f:l=>esc(l.disposition)},
    {h:'Priority', f:l=>esc(l.priority||'—')},
    {h:'Follow-up', cls:'num', f:l=>fmtDate(l.fuEff)},
    {h:'Priority label', f:l=>esc(l.fuPriority||'—')},
    {h:'Last call', cls:'num', f:l=>fmtDate(l.lastCall)},
    {h:'Last outcome', f:l=>l.a? (l.a.lastDur>0?'<span class="badge b-good">Connected</span>':'<span class="badge b-warn">Not connected</span>') : '—'},
    {h:'Total calls', cls:'num', f:l=>n(l.calls), act:l=>act(()=>drill('Calls — '+(l.name||l.leadNo),'calls',M.calls.filter(c=>c.leadId===l.id),D.attrib))},
    {h:'By current PSM', cls:'num', f:l=>n(l.callsByCurrentPsm)},
    {h:'Connected', cls:'num', f:l=>n(l.connected)},
    {h:'Not connected', cls:'num', f:l=>n(l.notConnected)},
    {h:'Talk time', cls:'num', f:l=>hms(l.talk)},
    {h:'Last activity', cls:'num', f:l=>fmtDate(l.lastAnyActivity)},
    {h:'Idle (d)', cls:'num', f:l=>l.idleDays==null?'—':l.idleDays},
    {h:'Lead age (d)', cls:'num', f:l=>l.age==null?'—':l.age},
    {h:'Transfer', f:l=>l.transferred?'<span class="badge b-acc">Transferred</span>':'—'},
    {h:'CRM', f:l=>`<a href="${crmLink('Leads',l.id)}" target="_blank">open ↗</a>`}
  ], L);
  return h;
};

/* ============ DAILY CALLING HEAD ============ */
RENDER.daily = function(){
  const all = DATA.calls.filter(isLogged);
  const today = all.filter(c=>c.day===TODAY);
  const yest  = all.filter(c=>c.day===addDays(TODAY,-1));
  const L = DATA.leads;
  const assignedToday = L.filter(l=>l.assigned && l.assigned.slice(0,10)===TODAY);
  const createdToday  = L.filter(l=>l.created && l.created.slice(0,10)===TODAY);
  const fuToday = L.filter(l=>l.fuEff && l.fuEff.slice(0,10)===TODAY);
  const fuOver  = L.filter(l=>l.fuState==='Overdue');
  const priToday= L.filter(l=>l.isPriority && l.priFu && l.priFu.slice(0,10)===TODAY);
  const priOver = L.filter(l=>l.priState==='Overdue');
  const IGNORE = 'Whole CRM extract — this page ignores the date filter';

  let h = sec(`Today — ${TODAY}`, FF.start+', '+FF.created+', Leads.Lead_Assigned_Date, '+FF.fu,
    'All tiles are counted over the whole extract with DATE(field) = today; the "vs yesterday" tile compares against today − 1.',
    IGNORE);
  h += `<div class="kpis">`;
  h += leadKpi('Leads created today', createdToday, {tone:'accent',
        fx:[FF.created,'COUNT(Leads) WHERE DATE(Created_Time) = today',IGNORE]});
  h += leadKpi('Leads assigned today', assignedToday, {tone:'accent', def:'<code>Lead_Assigned_Date</code> = today.',
        fx:['Leads.Lead_Assigned_Date','COUNT(Leads) WHERE DATE(Lead_Assigned_Date) = today',IGNORE]});
  h += callKpi('Calls made today', today, {tone:'accent',
        fx:[FF.start+', '+FF.call,'COUNT(Calls) WHERE DATE(Call_Start_Time) = today AND '+LOGGED,IGNORE]});
  h += kpi('Leads called today', n(new Set(today.map(c=>c.leadId)).size), {tone:'accent',
        fx:[FF.callOwn,'COUNT(DISTINCT Calls.What_Id) WHERE DATE(Call_Start_Time) = today',IGNORE],
        onClick:act(()=>drill('Leads called today','leads', L.filter(l=>today.some(c=>c.leadId===l.id))))});
  h += callKpi('Connected today', today.filter(isConnected), {tone:'good', def:D.conn,
        fx:[FF.dur,'COUNT(today\'s Calls) WHERE Call_Duration_in_seconds &gt; 0',IGNORE]});
  h += callKpi('Not connected today', today.filter(c=>!isConnected(c)&&!isMissed(c)), {tone:'warn',
        fx:[FF.dur+', '+FF.type,'COUNT(today\'s Calls) WHERE duration = 0 AND Call_Type ≠ "Missed"',IGNORE]});
  h += callKpi('Missed today', today.filter(isMissed), {tone:'bad',
        fx:[FF.type,'COUNT(today\'s Calls) WHERE Call_Type = "Missed"',IGNORE]});
  h += kpi('Talk time today', hms(today.reduce((s,c)=>s+c.dur,0)), {tone:'teal',
        fx:[FF.dur,'SUM(Call_Duration_in_seconds) WHERE DATE(Call_Start_Time) = today',IGNORE]});
  h += kpi('vs yesterday', (yest.length? ((today.length-yest.length)/yest.length*100>=0?'+':'')+dec((today.length-yest.length)/yest.length*100)+'%' : '—'),
        {tone: today.length>=yest.length?'good':'bad', sub:`${n(today.length)} today vs ${n(yest.length)} yesterday`,
         fx:[FF.start,'100 × (calls today − calls yesterday) ÷ calls yesterday',IGNORE],
         onClick:act(()=>drill('Calls yesterday','calls',yest))});
  h += leadKpi('Follow-ups due today', fuToday, {tone:'warn', def:D.fu,
        fx:[FF.fu,'COUNT(Leads) WHERE Follow_Up_Date_Time = today',IGNORE]});
  h += leadKpi('Follow-ups completed today', fuToday.filter(l=>l.fuState==='Completed'), {tone:'good', def:D.fu,
        fx:[FF.fu+', '+FF.start,'COUNT(today\'s follow-ups) WHERE ∃ logged call on/after the follow-up date',IGNORE]});
  h += leadKpi('Overdue follow-ups', fuOver, {tone:'bad', def:D.fu,
        fx:[FF.fu,'COUNT(Leads) WHERE follow-up date &lt; today AND no qualifying call',IGNORE]});
  h += leadKpi('Priority FU due today', priToday, {tone:'warn', def:D.pri,
        fx:[FF.pri,'COUNT(Leads) WHERE DATE(Visit_Call_Date_Time) = today',IGNORE]});
  h += leadKpi('Priority FU overdue', priOver, {tone:'bad', def:D.pri,
        fx:[FF.pri,'COUNT(Leads) WHERE Visit_Call_Date_Time &lt; today AND no qualifying call',IGNORE]});
  h += `</div>`;

  const byP = new Map();
  for(const c of today){
    let p=byP.get(c.ownerId);
    if(!p){ p={id:c.ownerId,calls:0,conn:0,talk:0,leads:new Set()}; byP.set(c.ownerId,p); }
    p.calls++; p.talk+=c.dur; p.leads.add(c.leadId); if(isConnected(c)) p.conn++;
  }
  const yByP = new Map();
  for(const c of yest){ yByP.set(c.ownerId,(yByP.get(c.ownerId)||0)+1); }
  const rows=[...byP.values()].sort((a,b)=>b.calls-a.calls);
  h += sec("Today's PSM ranking (by actual caller)", FF.callOwn+', '+FF.dur,
    'COUNT(Calls WHERE DATE(Call_Start_Time) = today) GROUP BY Calls.Owner, ordered DESC. '+
    'Change = 100 × (today − yesterday) ÷ yesterday for the same caller.', IGNORE);
  h += rows.length ? table([
    {h:'#', cls:'num', f:(p)=>rows.indexOf(p)+1},
    {h:'PSM', f:p=>esc(uname(p.id))},
    {h:'Calls today', cls:'num', f:p=>n(p.calls), act:p=>act(()=>drill('Calls today — '+uname(p.id),'calls',today.filter(c=>c.ownerId===p.id),D.attrib))},
    {h:'Leads touched', cls:'num', f:p=>n(p.leads.size)},
    {h:'Connected', cls:'num', f:p=>n(p.conn), act:p=>act(()=>drill('Connected today — '+uname(p.id),'calls',today.filter(c=>c.ownerId===p.id&&isConnected(c)),D.conn))},
    {h:'Connected %', cls:'num', f:p=>dec(pct(p.conn,p.calls))+'%'},
    {h:'Talk time', cls:'num', f:p=>hms(p.talk)},
    {h:'Yesterday', cls:'num', f:p=>n(yByP.get(p.id)||0)},
    {h:'Change', cls:'num', f:p=>{const y=yByP.get(p.id)||0; const d=y?((p.calls-y)/y*100):0;
        return y? `<span class="badge ${d>=0?'b-good':'b-bad'}">${d>=0?'+':''}${dec(d)}%</span>`:'<span class="badge b-mut">new</span>';}},
    {h:'', f:p=>barCell(p.calls, rows[0].calls, n(p.calls))}
  ], rows) : `<div class="note">No calls logged today (${TODAY}) in this extract.</div>`;
  return h;
};

/* ============ FIELD MAP & DEFINITIONS ============ */
RENDER.fieldmap = function(){
  const rowsOK = [
    ['Calls.Owner','Call Owner','<b>Actual caller</b> — the sole basis for PSM call attribution','ownerlookup'],
    ['Calls.Call_Start_Time','Call Start Time','Call date/time, hour-of-day and trend analysis','datetime'],
    ['Calls.Call_Duration_in_seconds','Call Duration (s)','Talk time; <b>&gt;0 ⇒ Connected</b>','integer'],
    ['Calls.Call_Type','Call Type','Outbound / Inbound / Missed','picklist'],
    ['Calls.Outgoing_Call_Status','Outgoing Call Status','null or "Completed" ⇒ call actually made; Scheduled/Overdue/Cancelled ⇒ planned','picklist'],
    ['Calls.What_Id','Related To','Links the call to its Lead record','lookup'],
    ['Calls.Call_Result','Call Result','Shown as-is; <b>only ~3.7% populated</b>, so not used for connection logic','picklist'],
    ['Leads.Owner / Current_Owner_Name','Lead Owner','Current lead ownership (lead-portfolio metrics only)','ownerlookup / picklist'],
    ['Leads.Previous_Owner_Name','Previous Owner Name','Transfer detection','picklist'],
    ['Leads.Lead_Assigned_Date','Lead Assigned Date','Transfer timestamp proxy for before/after call split','datetime'],
    ['Leads.Region','Region','Region reporting (Delhi NCR, North/Central/East/West/South India, UAE)','picklist'],
    ['Leads.City / State1','City / State.','City & state reporting','text / picklist'],
    ['Leads.Lead_Status','Lead Status','Stage analysis — 17 real values, none invented','picklist'],
    ['Leads.Project_Stage','Project Stage','Planning / Under Construction / Renovation / Near Completion','picklist'],
    ['Leads.Lead_Disposition','Lead Disposition','Call-outcome style dispositions (23 values)','picklist'],
    ['Leads.Follow_Up_Date_Time','Follow Up Date &amp; Time','<b>The single follow-up date</b> for every follow-up, overdue and priority metric','datetime'],
    ['Leads.Priority_Type + Visit_Call_Date_Time','Priority Type + Visit/Call Date/Time','<b>Used as the Priority Follow-up</b> — see gaps below','picklist + datetime'],
    ['Leads.Created_Time','Created Time','Lead age &amp; ageing buckets','datetime'],
    ['Leads.Last_Activity_Time','Last Activity Time','Idle-days calculation (with last logged call)','datetime'],
    ['Leads.Converted__s / Converted_Date_Time','Is Converted','Conversion &amp; conversion %','boolean / datetime'],
    ['Leads.Lead_Source','Lead Source','Source reporting','picklist'],
    ['Leads.Teams','Teams','Team filter (PSM, Sales (WS), Designers, …)','picklist'],
    ['Leads.Lead_ID','Lead ID.','Human-readable lead number (SUN…)','autonumber']
  ];
  const gaps = [
    ['Follow up Priority not populated','Priority follow-ups are driven by <code>Follow_up_Priority</code> (High / Medium / Low Priority) as requested. The field exists on the Leads layout but is <b>empty on all '+n(DATA.leads.length)+' leads in this extract</b>; a live scan of all 64,415 CRM leads (including converted) found <b>0</b> populated. All priority KPIs therefore read 0 until the team fills it in.','Start setting <b>Follow up Priority</b> on leads, then re-run <code>extract.ps1</code> — no dashboard change is needed.'],
    ['Priority Follow-up Date','No dedicated priority <i>date</i> field exists. <code>Follow_up_Priority</code> is a label, so priority follow-ups are due on <code>Follow_Up_Date_Time</code>. <code>Visit_Call_Date_Time</code> + <code>Priority_Type</code> is the only priority-dated pair and is reported separately as "Visit / call requested".','Add <code>Priority_Follow_Up_Date</code> on Leads if priority items need their own due date.'],
    ['Leads carrying only <code>Follow_Up_Date</code>','The dashboard now runs entirely off <code>Follow_Up_Date_Time</code> as requested, so the date-only <code>Follow_Up_Date</code> field is ignored. <b>'+
      n(DATA.leads.filter(l=>!l.fuDateTime && l.fuDate).length)+' leads have a Follow Up Date but no Follow Up Date &amp; Time</b>, and therefore carry no follow-up on this dashboard at all — they are counted under "No follow-up set", not as due or overdue.',
      'Back-fill <code>Follow_Up_Date_Time</code> on those leads (or have the team always set the dated+timed field), otherwise that work stays invisible to management.'],
    ['Follow-up completion date','No field records when a follow-up was actually done. Completion is <b>inferred</b> from the first logged call on/after the scheduled date.','Add <code>Follow_Up_Completed_On</code>, or close follow-ups via a Task with a completion date.'],
    ['Owner-change audit trail','<code>Lead_Status_History</code> tracks status, not owner. Only <code>Previous_Owner_Name</code> (one step back) and <code>Lead_Assigned_Date</code> are available, so multi-hop transfer chains and true transfer dates cannot be reconstructed.','Enable field-history tracking on Lead Owner.'],
    ['Stage entry timestamps','No per-stage entry date, so "average days in stage" uses <code>Modified_Time</code> as the last-change proxy.','Enable field-history tracking on <code>Lead_Status</code> with date capture.'],
    ['Quotes Shared (per lead)','The <code>Quotes</code> module is not linked to Leads, and <code>Lead_Status</code> has no "Quote Shared" value.','Add a lead-level quote flag/date, or link Quotes to Leads.'],
    ['Calling Head / supervisor','No reporting-manager field on Leads. <code>Teams</code> and <code>Sales_Manager</code> (PSM Name) are the closest groupings; the Calling Head filter therefore maps to Team.','Add a supervisor lookup on Leads or use CRM role hierarchy.'],
    ['Calls on converted leads','When a lead converts, Zoho re-parents its activities to the Deal/Contact. <b>'+n(DATA.meta.callCount-DATA.calls.length)+' calls</b> ('+dec(pct(DATA.meta.callCount-DATA.calls.length, DATA.meta.callCount))+'% of '+n(DATA.meta.callCount)+') no longer point at a Lead and are therefore outside lead-level call metrics.','Extend the extract to the Deals module and union the call history, if pre-conversion effort must be credited.'],
    ['Region data quality','<code>Leads.Region</code> is a picklist with 8 valid values, but the data holds <b>'+
      n(new Set(DATA.leads.map(l=>l.region)).size)+' distinct values</b> — free text such as "Mumbai", "Bombay", "Mumbaii", "Ahemdabad", "DelhiNCR" has been written past the picklist. '+
      'Worse, Region is <b>empty on '+n(DATA.leads.filter(l=>l.region==='(No region)').length)+' of '+n(DATA.leads.length)+
      ' leads ('+dec(pct(DATA.leads.filter(l=>l.region==='(No region)').length, DATA.leads.length))+'%)</b>, so region reporting covers only the minority that are tagged.',
      'Make Region mandatory, restrict writes to the picklist, and back-fill from City/State on existing leads.'],
    ['Converted leads in COQL','Zoho COQL silently omits converted leads, which would have shown conversion as 0. They are pulled separately via the records API (<code>converted=true</code>) — '+n(DATA.meta.convertedLeadCount||0)+' leads — and merged into this extract.','None — handled by <code>extract-converted.ps1</code>.']
  ];
  const rules = [
    ['PSM Call Count','<code>COUNT(Calls WHERE Calls.Owner = PSM)</code> — never <code>Lead.Owner = PSM</code>.'],
    ['Call made (logged)','<code>Outgoing_Call_Status IS NULL OR = "Completed"</code>. Excludes 706 Scheduled/Overdue/Cancelled rows.'],
    ['Connected call','<code>Call_Duration_in_seconds &gt; 0</code>.'],
    ['Missed call','<code>Call_Type = "Missed"</code>.'],
    ['Not connected','duration = 0 and type ≠ Missed.'],
    ['Unique leads called','<code>COUNT(DISTINCT Calls.What_Id)</code> — a lead with 5 calls counts as 5 total calls but 1 unique lead.'],
    ['Calling coverage %','unique leads called ÷ leads owned × 100.'],
    ['Contactability %','unique leads with ≥1 connected call ÷ unique leads called × 100.'],
    ['Talk time','SUM of <code>Call_Duration_in_seconds</code>; average is per <i>connected</i> call.'],
    ['Lead age','today − <code>Created_Time</code>.'],
    ['Idle days','today − MAX(last logged call, <code>Last_Activity_Time</code>).'],
    ['Follow-up date','<code>Follow_Up_Date_Time</code> only — the date-only <code>Follow_Up_Date</code> field is not used anywhere.'],
    ['Follow-up completed','A logged call exists on the lead on/after the scheduled follow-up date.'],
    ['Completion delay','date of that first call − scheduled follow-up date.'],
    ['Normal delay (overdue)','today − scheduled follow-up date, only while still pending.'],
    ['Priority follow-up','<code>Follow_up_Priority</code> IS NOT NULL (High / Medium / Low Priority), due on <code>Follow_Up_Date_Time</code>.'],
    ['Priority Follow-ups Over Deal','priority lead whose follow-up date has passed with no logged call on/after it.'],
    ['Priority delay days','today − follow-up date, while the priority follow-up is not actioned.'],
    ['Visit/call gap days','<code>Visit_Call_Date_Time</code> − normal follow-up date (secondary metric).'],
    ['Visit/call delay days','today − <code>Visit_Call_Date_Time</code>, while not actioned (secondary metric).'],
    ['Active lead','<code>Lead_Status</code> NOT IN ('+DEADLIST+').'],
    ['Transfer','<code>Previous_Owner_Name</code> present and ≠ <code>Current_Owner_Name</code>; split point = <code>Lead_Assigned_Date</code>.'],
    ['De-duplication','Calls keyed by unique Call Id, leads by unique Lead Id — no record is counted twice.']
  ];
  const dropped = DATA.meta.callCount - DATA.calls.length;
  let h = sec('Extract summary', 'data/meta.json', 'Row counts from the local extract produced by extract.ps1.', 'Unfiltered');
  h += `<div class="kpis">
    ${kpi('Leads extracted', n(DATA.meta.leadCount), {fx:['data/leads.json','COUNT(rows) = COQL Leads + records-API converted Leads','Unfiltered']})}
    ${kpi('Calls extracted', n(DATA.meta.callCount), {fx:['data/calls.json','COUNT(rows) from COQL over the whole Calls module','Unfiltered — includes planned calls']})}
    ${kpi('Calls linked to a lead', n(DATA.calls.length), {sub:`${n(dropped)} linked to Deals/Contacts — excluded`,
      fx:['Calls.What_Id → Leads.id','COUNT(Calls WHERE What_Id resolves to a Lead in this extract)','Unfiltered']})}
    ${kpi('PSMs / users resolved', n(Object.keys(DATA.users).length), {fx:['meta.json users map','COUNT(DISTINCT user id → full name) from Leads.Owner / Current_Owner_Name','Unfiltered']})}
    ${kpi('Extract timestamp', (DATA.meta.generatedAt||'').replace('T',' '), {fx:['meta.generatedAt','Wall-clock time extract.ps1 finished the COQL pass','Re-run extract.ps1 to refresh']})}
  </div>`;

  h += sec('Metric → CRM field map', '', '');
  h += `<div class="fmap">` + table([
    {h:'Zoho field (API name)', f:r=>r[0]},
    {h:'CRM label', f:r=>esc(r[1])},
    {h:'Used for', f:r=>r[2]},
    {h:'Type', f:r=>esc(r[3])}
  ], rowsOK) + `</div>`;

  h += sec('Missing fields — required by spec, not present in this CRM', '', '');
  h += `<div class="note">Per the brief, these are named exactly rather than filled with fabricated data.</div>`;
  h += table([
    {h:'Required', f:g=>'<b>'+esc(g[0])+'</b>'},
    {h:'What is actually available', f:g=>g[1]},
    {h:'Recommended CRM change', f:g=>g[2]}
  ], gaps);

  h += sec('Calculation rules — master list', '', '');
  h += table([
    {h:'Metric', f:r=>'<b>'+esc(r[0])+'</b>'},
    {h:'Definition', f:r=>r[1]}
  ], rules);

  h += sec('Filter semantics', '', '');
  h += `<div class="note" style="font-size:12px;line-height:1.7">
    <b>PSM filter</b> is applied two ways, deliberately: lead-portfolio metrics use the <b>current Lead Owner</b>,
    while all call/activity metrics use the <b>actual caller</b>. This is what keeps a transferred lead's history intact.<br>
    <b>Date range</b> narrows both populations, so every KPI and report moves with it. Calls are always bound by
    <code>Call_Start_Time</code>; what the range means for leads is set by <b>"Date range applies to"</b>:
    <code>Lead created date + calls</code> (default — leads created inside the range),
    <code>Lead call activity + calls</code> (leads with at least one logged call inside the range), or
    <code>Calls only</code> (leads stay lifetime — the old behaviour).<br>
    <b>Follow-up status</b> and <b>Transfer status</b> filters are computed per lead before the lead filter is applied.<br>
    <b>Daily Calling Head</b> page deliberately ignores the date filter.<br>
    <b>Formulas: ON/OFF</b> in the header shows or hides the Fields / Formula / Filters block on every KPI and report.</div>`;
  return h;
};

/* ============ ★ FOLLOW-UP BOARD ============
   Four management components driven by Leads.Follow_up_Priority:
     1. Today's Priority follow-ups   (High Priority, due today)
     2. Today's Normal follow-ups     (every follow-up due today, any priority label)
     3. Overdue Priority follow-ups   (High Priority, date passed, unactioned)
     4. Overdue Normal follow-ups     (every overdue follow-up, any priority label)   */
const HIGH = 'High Priority';

function boardCols(kind){
  const note = l => {
    const t = l.lastNote || '';
    if(!t) return '<span style="color:var(--tx3)">—</span>';
    const short = t.length > 90 ? t.slice(0,90)+'…' : t;
    return `<span title="${esc(t)}">${esc(short)}</span>`;
  };
  const base = [
    {h:'Client Name', f:l=>`<a href="${crmLink('Leads',l.id)}" target="_blank">${esc(l.name||l.leadNo||'—')}</a>`},
    {h:'Number', f:l=>esc(l.mobile||'—')},
    {h:'Current Lead Status', f:l=>esc(l.status)},
    {h:'Follow-up Date', cls:'num', f:l=>fmtDate(l.fuEff)},
    {h:'Priority', f:l=>l.fuPriority
        ? `<span class="badge ${l.fuPriority===HIGH?'b-bad':(l.fuPriority==='Medium Priority'?'b-warn':'b-mut')}">${esc(l.fuPriority)}</span>`
        : '<span class="badge b-mut">Not set</span>'},
    {h:'Last Notes', f:note},
    {h:'PSM', f:l=>esc(uname(l.ownerId))},
    {h:'Days past', cls:'num', f:l=>{
        const d = l.fuEff ? (TODAY_N - dayNum(l.fuEff)) : null;
        if(d==null) return '—';
        return d>0 ? `<span class="badge b-bad">${d}</span>` : (d===0 ? '<span class="badge b-warn">today</span>' : d);
      }},
    {h:'Pending since (d)', cls:'num', f:l=>l.idleDays==null?'—':l.idleDays},
    {h:'Last call', cls:'num', f:l=>fmtDate(l.lastCall)},
    {h:'Calls', cls:'num', f:l=>n(l.calls)},
    {h:'CRM', f:l=>`<a href="${crmLink('Leads',l.id)}" target="_blank">open ↗</a>`}
  ];
  if(kind==='today'){
    // "Today's follow-ups (latest to oldest)" — the scheduled time drives the ordering
    base.splice(4, 0, {h:"Today's follow-up time", cls:'num',
      f:l=>l.fuDateTime ? l.fuDateTime.slice(11,16) : '<span style="color:var(--tx3)">no time</span>'});
  }
  return base;
}

/* Priority bands, in the order used on the FTD / MTD sheets.
   `key` is the literal Leads.Follow_up_Priority picklist value in Zoho — note the CRM
   stores "Mandate Call" while the sheet heading reads MANDATED CALL. */
const PRI_BANDS = [
  { key:'High Priority',   label:'HIGH PRIORITY',   cls:'bd-high' },
  { key:'Medium Priority', label:'MEDIUM PRIORITY', cls:'bd-med'  },
  { key:'Low Priority',    label:'LOW PRIORITY',    cls:'bd-low'  },
  { key:'Mandate Call',    label:'MANDATED CALL',   cls:'bd-man'  }
];

/* MANDATED CALL band override, computed on Source = "A and B" fresh leads CREATED in [from,to].
   Each NOT-CONNECTED lead must get 2 attempts/day (4 calls; an attempt = 2 dials ≤ 3 min apart).
   Returns Map(ownerId -> {notConn:[leads], doneLeads, backlogLeads, dialledAtt, backlogAtt}) where
     dialledAtt = Σ min(full attempts made, 2)      → MANDATED CALL "attempts done"
     backlogAtt = Σ max(0, 2 − full attempts made)  → MANDATED CALL backlog, counted in ATTEMPTS. */
const MANDATE_ATTEMPTS_REQUIRED = 2;
function sopBandByOwner(from, to){
  const fresh = DATA.leads.filter(l => l.source === 'A and B' && boardOwnerOk(l) && boardStatusOk(l) && l.created &&
                 l.created.slice(0,10) >= from && l.created.slice(0,10) <= to);
  const ids = new Set(fresh.map(l => l.id));
  const byLead = new Map();
  for(const c of DATA.calls){
    if(!ids.has(c.leadId)) continue;
    if(c.day && (c.day < from || c.day > to)) continue;   // dials within the same window
    let e = byLead.get(c.leadId); if(!e){ e={ob:[], conn:false}; byLead.set(c.leadId, e); }
    if(isConnected(c)) e.conn = true;
    if(c.type === 'Outbound') e.ob.push(c);
  }
  const REQ = MANDATE_ATTEMPTS_REQUIRED;
  const m = new Map();
  for(const l of fresh){
    const e = byLead.get(l.id) || {ob:[], conn:false};
    if(e.conn) continue;                                   // resolved (contact established) — excluded
    const made = sopEval(e.ob).full;                       // full attempts = 2 dials ≤ 3 min apart
    let o = m.get(l.ownerId); if(!o){ o={notConn:[], doneLeads:[], backlogLeads:[], dialledAtt:0, backlogAtt:0}; m.set(l.ownerId, o); }
    o.notConn.push(l);
    o.dialledAtt += Math.min(made, REQ);
    o.backlogAtt += Math.max(0, REQ - made);
    if(made >= 1)   o.doneLeads.push(l);       // leads with ≥ 1 attempt made (drill for ATTEMPTS DONE)
    if(made < REQ)  o.backlogLeads.push(l);    // leads still owing attempts (drill for BACKLOG)
  }
  return m;
}

/* PSM x priority-band matrix.
   Assigned = follow-ups whose Follow_Up_Date_Time falls inside the period.
   Dialled  = of those, a logged call exists on/after the follow-up date/time.
   Backlog  = assigned - dialled.
   MANDATED CALL band is overridden with the A-and-B fresh-lead SOP formula (see sopBandByOwner). */
function fuMatrix(leads, from, to, periodName){
  const scoped = leads.filter(l => l.fuEff && l.fuEff.slice(0,10) >= from && l.fuEff.slice(0,10) <= to);

  const byPsm = new Map();
  for(const l of scoped){
    let p = byPsm.get(l.ownerId);
    if(!p){
      p = { id:l.ownerId, name:uname(l.ownerId), bands:{}, totBacklog:0 };
      PRI_BANDS.forEach(b => p.bands[b.key] = {assigned:[], dialled:[], backlog:[]});
      byPsm.set(l.ownerId, p);
    }
    const band = p.bands[l.fuPriority];
    if(!band) continue;                        // lead carries no priority label
    band.assigned.push(l);
    if(l.fuState === 'Completed') band.dialled.push(l); else band.backlog.push(l);
  }
  // always include the fixed PSM roster, even with no labelled follow-ups this period
  const rosterSet = new Set(rosterIds());
  rosterSet.forEach(id => {
    if(byPsm.has(id)) return;
    const p = { id, name:uname(id), bands:{}, totBacklog:0 };
    PRI_BANDS.forEach(b => p.bands[b.key] = {assigned:[], dialled:[], backlog:[]});
    byPsm.set(id, p);
  });
  // MANDATED CALL band → A-and-B fresh-lead SOP attempts ONLY when the Source filter is exactly "A and B".
  // For any other / no source filter, the mandate band keeps its normal Follow_up_Priority="Mandate Call"
  // behaviour (DIALLED / BACKLOG in leads) — no SOP.
  const sourceIsAB = STATE.filters.source.length === 1 && STATE.filters.source[0] === 'A and B';
  const MANDEF = 'MANDATED CALL (Source A and B) = not-connected fresh leads. Each needs 2 attempts/day '+
    '(4 calls; an attempt = 2 dials ≤ 3 min apart). ATTEMPTS DONE / BACKLOG are counted in attempts (2 per lead owed).';
  if(sourceIsAB){
    const sopMap = sopBandByOwner(from, to);
    sopMap.forEach((o, ownerId) => {
      if(STATE.filters.psm.length && !STATE.filters.psm.includes(ownerId)) return;
      if(byPsm.has(ownerId)) return;
      const p = { id:ownerId, name:uname(ownerId), bands:{}, totBacklog:0 };
      PRI_BANDS.forEach(b => p.bands[b.key] = {assigned:[], dialled:[], backlog:[]});
      byPsm.set(ownerId, p);
    });
    for(const p of byPsm.values()){
      const o = sopMap.get(p.id) || {notConn:[], doneLeads:[], backlogLeads:[], dialledAtt:0, backlogAtt:0};
      p.bands['Mandate Call'] = { assigned:o.notConn, dialled:[], backlog:[] };  // assigned = leads (drillable)
      p.manDialled = o.dialledAtt;   p.manDoneLeads    = o.doneLeads;      // attempts done + leads behind them
      p.manBacklog = o.backlogAtt;   p.manBacklogLeads = o.backlogLeads;   // attempts owed + leads behind them
    }
  }
  // Total backlog per row: priority bands in LEADS + (A-and-B) mandate band in ATTEMPTS owed.
  const rowBacklog = p => PRI_BANDS.reduce((s,b) =>
    s + (sourceIsAB && b.key==='Mandate Call' ? (p.manBacklog||0) : p.bands[b.key].backlog.length), 0);
  // Backlog leads behind a row's TOTAL BACK LOG cell (for drill).
  const rowBacklogLeads = p => PRI_BANDS.flatMap(b =>
    (sourceIsAB && b.key==='Mandate Call') ? (p.manBacklogLeads||[]) : p.bands[b.key].backlog);
  const rows = [...byPsm.values()];
  rows.forEach(p => p.totBacklog = rowBacklog(p));
  const shown = rows.filter(p => rosterSet.has(p.id) || PRI_BANDS.some(b => p.bands[b.key].assigned.length))
                    .sort((a,b) => b.totBacklog - a.totBacklog || a.name.localeCompare(b.name));

  const cell = (arr, label, cls) => arr.length
    ? `<td class="num ${cls} click" data-act="${act(()=>drill(label,'leads',arr,D.pri))}">${n(arr.length)}</td>`
    : `<td class="num ${cls} zero">0</td>`;
  // Numeric cell whose VALUE is an attempt count but that drills to the LEADS behind it.
  const attCell = (v, leads, label, cls) => (v || (leads && leads.length))
    ? `<td class="num ${cls} click" data-act="${act(()=>drill(label,'leads',leads||[],MANDEF))}">${n(v)}</td>`
    : `<td class="num ${cls} zero">0</td>`;

  const manIsAtt = sourceIsAB;   // render mandate band as attempts only when Source = A and B
  let head = '<tr><th>PSM</th>';
  for(const b of PRI_BANDS){
    const isMan = b.key==='Mandate Call' && manIsAtt;
    head += `<th class="num ${b.cls}">${b.label}</th>`
          + `<th class="num ${b.cls}">${isMan?'ATTEMPTS DONE':'DIALLED'}</th>`
          + `<th class="num ${b.cls}">${isMan?'BACKLOG (ATTEMPTS)':'BACKLOG'}</th>`;
  }
  head += '<th class="num bd-tot">TOTAL BACK LOG</th></tr>';

  let body = '';
  for(const p of shown){
    body += `<tr><td>${esc(p.name)}</td>`;
    for(const b of PRI_BANDS){
      const B = p.bands[b.key];
      if(b.key==='Mandate Call' && manIsAtt){
        body += cell(B.assigned, `${periodName} · MANDATED CALL leads · ${p.name}`, b.cls);
        body += attCell(p.manDialled, p.manDoneLeads,    `${periodName} · mandate attempts done · ${p.name}`, b.cls);
        body += attCell(p.manBacklog, p.manBacklogLeads, `${periodName} · mandate attempt backlog · ${p.name}`, b.cls);
      } else {
        body += cell(B.assigned, `${periodName} · ${b.label} · ${p.name}`, b.cls);
        body += cell(B.dialled,  `${periodName} · ${b.label} dialled · ${p.name}`, b.cls);
        body += cell(B.backlog,  `${periodName} · ${b.label} backlog · ${p.name}`, b.cls);
      }
    }
    body += attCell(p.totBacklog, rowBacklogLeads(p), `${periodName} · total backlog · ${p.name}`, 'bd-tot');
    body += '</tr>';
  }
  if(!shown.length){
    body = '<tr><td colspan="14" style="padding:16px;text-align:center;color:var(--tx3)">No labelled follow-ups due in this period.</td></tr>';
  }

  let foot = '';
  if(shown.length){
    foot = '<tr><td>TOTAL</td>';
    for(const b of PRI_BANDS){
      if(b.key==='Mandate Call' && manIsAtt){
        foot += cell(shown.flatMap(p => p.bands[b.key].assigned), `${periodName} · MANDATED CALL leads · all PSMs`, b.cls)
              + attCell(shown.reduce((s,p)=>s+(p.manDialled||0),0), shown.flatMap(p=>p.manDoneLeads||[]),    `${periodName} · mandate attempts done · all PSMs`, b.cls)
              + attCell(shown.reduce((s,p)=>s+(p.manBacklog||0),0), shown.flatMap(p=>p.manBacklogLeads||[]), `${periodName} · mandate attempt backlog · all PSMs`, b.cls);
      } else {
        foot += cell(shown.flatMap(p => p.bands[b.key].assigned), `${periodName} · ${b.label} · all PSMs`, b.cls)
              + cell(shown.flatMap(p => p.bands[b.key].dialled),  `${periodName} · ${b.label} dialled · all PSMs`, b.cls)
              + cell(shown.flatMap(p => p.bands[b.key].backlog),  `${periodName} · ${b.label} backlog · all PSMs`, b.cls);
      }
    }
    foot += attCell(shown.reduce((s,p)=>s+p.totBacklog,0), shown.flatMap(rowBacklogLeads), `${periodName} · total backlog · all PSMs`, 'bd-tot');
    foot += '</tr>';
  }

  return `<div class="tblwrap"><table class="matrix">
    <thead>${head}</thead><tbody>${body}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>`
    + (manIsAtt ? `<div class="note" style="padding:8px 4px 0">MANDATED CALL band (Source "A and B") = not-connected fresh leads.
       Each requires <b>2 attempts/day</b> (4 calls; an attempt = 2 dials ≤ 3 min apart).
       <b>ATTEMPTS DONE</b> &amp; <b>BACKLOG (ATTEMPTS)</b> are counted in attempts (2 × leads owed) — click any figure to see the leads.
       TOTAL BACK LOG adds this to the priority-band backlogs.</div>` : '');
}

RENDER.board = function(){
  // The board follows the SELECTED date range: the FTD window = the picked day/range (defaults to
  // today when 'All time' is selected); MTD = month-to-date of that anchor day. Leads are filtered
  // by every NON-date filter, so Follow_Up_Date_Time is the only date constraint on the board.
  const R = M.R;
  const fFrom = R[0] || TODAY, fTo = R[1] || R[0] || TODAY;
  const anchor = fTo, mFrom = monthStart(anchor), mTo = anchor;
  const singleDay = (fFrom === fTo);
  const dayLbl = singleDay ? inDate(fTo) : (inDate(fFrom) + ' → ' + inDate(fTo));
  const f = STATE.filters;
  const nonDatePass = l => {
    if(!boardOwnerOk(l)) return false;   // PSMs removed from the board
    if(!boardStatusOk(l)) return false;  // statuses removed from the board
    if(f.psm.length      && !f.psm.includes(l.ownerId))    return false;
    if(f.region.length   && !f.region.includes(l.region))  return false;
    if(f.city.length     && !f.city.includes(l.city))      return false;
    if(f.source.length   && !f.source.includes(l.source))  return false;
    if(f.status.length   && !f.status.includes(l.status))  return false;
    if(f.team.length     && !f.team.includes(l.teams))     return false;
    if(f.disp.length     && !f.disp.includes(l.disposition)) return false;
    if(f.transfer.length){ const t = l.transferred ? 'Transferred' : 'Not transferred'; if(!f.transfer.includes(t)) return false; }
    if(f.fu.length       && !f.fu.includes(l.fuState))     return false;
    return true;
  };
  const L = DATA.leads.filter(nonDatePass);
  const labelled  = DATA.leads.filter(l => l.isPriority).length;
  const scope     = n(labelled) + ' of ' + n(DATA.leads.length) + ' leads carry a Follow up Priority label';
  const dateOnly  = DATA.leads.filter(l => !l.fuDateTime && l.fuDate).length;

  let h = '';
  if(dateOnly){
    h += `<div class="note" style="background:rgba(232,163,61,.09);border:1px solid rgba(232,163,61,.35);border-radius:8px;padding:10px 12px;color:var(--tx)">
      <b>Every figure below uses <code>Follow_Up_Date_Time</code> only.</b> <b>${n(dateOnly)} leads</b> have a
      Follow Up Date but no Follow Up Date &amp; Time, so they carry no follow-up here at all. Back-fill
      <b>Follow Up Date &amp; Time</b> to bring them into view.</div>`;
  }

  const mFormula = 'Rows = PSM (current Lead Owner). For each band: the <b>band column</b> = '+
    'COUNT(Leads WHERE Follow_up_Priority = that value AND DATE(Follow_Up_Date_Time) inside the period); '+
    '<b>DIALLED</b> = of those, a logged call exists with Call_Start_Time &ge; Follow_Up_Date_Time; '+
    '<b>BACKLOG</b> = band &minus; dialled. TOTAL BACK LOG = sum of the four backlogs. '+
    'MANDATED CALL reads the picklist value <code>"Mandate Call"</code>. Every cell opens its records.';

  h += sec(singleDay ? `FTD &mdash; for the day (${inDate(fTo)})` : `Follow-ups &mdash; selected period (${inDate(fFrom)} &rarr; ${inDate(fTo)})`,
           FF.pri+', '+FF.fu+', '+FF.start, mFormula,
           'Follow_Up_Date_Time = ' + dayLbl + ' · ' + scope);
  h += fuMatrix(L, fFrom, fTo, 'FTD');

  h += sec(`MTD &mdash; month to date (${inDate(mFrom)} &rarr; ${inDate(mTo)})`, FF.pri+', '+FF.fu+', '+FF.start, mFormula,
           'Follow_Up_Date_Time between ' + mFrom + ' and ' + mTo + ' · ' + scope);
  h += fuMatrix(L, mFrom, mTo, 'MTD');

  /* ---- fresh-lead status + lead contact time (embedded in the board) ---- */
  h += `<div class="board-sub">FRESH LEAD STATUS &amp; CONTACT SPEED — set the period filter to <b>Today</b> for the daily standup view</div>`;
  h += boardFreshLead();
  h += boardLeadStatusMatrix();
  h += boardContactTime();

  /* ---- detail lists kept below the matrices ---- */
  const inWindow = l => l.fuEff && l.fuEff.slice(0,10) >= fFrom && l.fuEff.slice(0,10) <= fTo;
  const open    = l => l.fuState !== 'Completed';
  const todayAll  = L.filter(l => inWindow(l) && open(l));
  const todayHigh = todayAll.filter(l => l.fuPriority === HIGH);
  const overAll   = L.filter(l => l.fuEff && l.fuEff.slice(0,10) < fFrom && open(l));
  const overHigh  = overAll.filter(l => l.fuPriority === HIGH);
  const byTimeDesc = (a,b) => (b.fuEff||'').localeCompare(a.fuEff||'');
  const byOldest   = (a,b) => (a.fuEff||'').localeCompare(b.fuEff||'');
  todayAll.sort(byTimeDesc); todayHigh.sort(byTimeDesc);
  overAll.sort(byOldest);    overHigh.sort(byOldest);

  const block = (title, rows, kind, fields, formula, filters) => {
    let s = sec(title + ` <span class="badge b-acc">${n(rows.length)}</span>`, fields, formula, filters);
    s += rows.length ? table(boardCols(kind), rows)
                     : '<div class="note">Nothing in this bucket right now.</div>';
    if(rows.length > 1000) s += `<div class="note">Showing 1,000 of ${n(rows.length)}.</div>`;
    return s;
  };
  h += block('Priority Follow-up &mdash; due ('+dayLbl+')', todayHigh, 'today',
    FF.pri+', '+FF.fu+', Leads.Last_Note',
    'Follow_up_Priority = "High Priority" AND Follow_Up_Date_Time = '+dayLbl+' AND not actioned. Latest scheduled time first.', scope);
  h += block('Normal Follow-up &mdash; due ('+dayLbl+')', todayAll, 'today',
    FF.fu+', Leads.Last_Note',
    'Follow_Up_Date_Time = '+dayLbl+' AND not actioned, any priority label. Latest scheduled time first.', 'All labels');
  h += block('Overdue Priority Follow-ups (as of '+inDate(fFrom)+')', overHigh, 'overdue',
    FF.pri+', '+FF.fu+', '+FF.start+', Leads.Last_Note',
    'Follow_up_Priority = "High Priority" AND Follow_Up_Date_Time &lt; '+fFrom+' AND no logged call on/after it. Longest overdue first.', scope);
  h += block('Overdue Normal Follow-ups (as of '+inDate(fFrom)+')', overAll, 'overdue',
    FF.fu+', '+FF.start+', Leads.Last_Note',
    'Follow_Up_Date_Time &lt; '+fFrom+' AND no logged call on/after it, any priority label. Longest overdue first.', 'All labels');

  return h;
};

/* ============ PAGE — LEAD CONTACT TIME ============
   How long after a lead is created is it first REACHED (first connected call)?
   Rows = the actual caller (Calls.Owner) of that first connected call — the house
   attribution rule. Time = first connected Call_Start_Time − Leads.Created_Time. */
const CT_BUCKETS = [
  ['0–15 min', 15],
  ['15–25 min', 25],
  ['25–35 min', 35],
  ['35 min–1 hr', 60],
  ['1–2 hr', 120],
  ['2–6 hr', 360],
  ['6–12 hr', 720],
  ['12–24 hr', 1440],
  ['> 24 hr', Infinity]
];
function ctBucket(m){ for(let i=0;i<CT_BUCKETS.length;i++) if(m < CT_BUCKETS[i][1]) return i; return CT_BUCKETS.length-1; }
function _mins(a,b){ return (Date.parse(b)-Date.parse(a))/60000; }
function _median(arr){ if(!arr.length) return null; const s=[...arr].sort((a,b)=>a-b); const k=Math.floor(s.length/2); return s.length%2? s[k] : (s[k-1]+s[k])/2; }
function ctFmt(m){ if(m==null) return '—'; if(m<60) return Math.round(m)+'m'; if(m<1440) return (m/60).toFixed(1)+'h'; return (m/1440).toFixed(1)+'d'; }

function boardContactTime(){
  // first CONNECTED call per lead, within the current filters/period
  const firstConn = new Map();
  for(const c of M.calls){
    if(!isConnected(c) || !c.start) continue;
    const cur = firstConn.get(c.leadId);
    if(!cur || c.start < cur.start) firstConn.set(c.leadId, {start:c.start, ownerId:c.ownerId});
  }
  const rowsMap = new Map();
  const row = id => { let r=rowsMap.get(id); if(!r){ r={id,name:uname(id),all:[],total:0,mins:[],buckets:CT_BUCKETS.map(()=>[])}; rowsMap.set(id,r);} return r; };
  const allMins=[];
  for(const l of M.leads){
    if(!l.created || !boardOwnerOk(l) || !boardStatusOk(l)) continue;   // PSMs/statuses removed from the board
    const r = row(l.ownerId);          // GROUP BY current Lead Owner
    r.all.push(l);                     // every owned lead in the period
    const fc = firstConn.get(l.id);
    if(!fc) continue;
    let m = _mins(l.created, fc.start); if(m<0 || isNaN(m)) m=0;
    const bi = ctBucket(m);
    l._ctMin = m;
    r.buckets[bi].push(l); r.total++; r.mins.push(m); allMins.push(m);
  }
  rosterIds().forEach(id=>row(id));   // always show the fixed PSM roster, even at 0
  const rows = [...rowsMap.values()].sort((a,b)=> b.all.length-a.all.length || b.total-a.total || a.name.localeCompare(b.name));
  const notContacted = M.leads.filter(l=>l.created && boardOwnerOk(l) && boardStatusOk(l) && !firstConn.has(l.id));

  const CTDEF = 'Contact time = first CONNECTED call (Call_Duration_in_seconds &gt; 0) minus Leads.Created_Time. '+
    'Row = current Lead Owner. All leads = leads owned in the period; Contacted = of those, the leads that got a '+
    'connected call (bucketed by contact time). The rest are not yet contacted.';

  const R = M.R;
  const ctPeriodLbl = R[0] ? (R[0]===R[1] ? inDate(R[0]) : inDate(R[0])+' → '+(R[1]?inDate(R[1]):'today')) : 'all time';
  let h = sec('Lead contact time · ' + ctPeriodLbl + ' — speed from lead creation to first connection',
    FF.created+', '+FF.own+', '+FF.start+', '+FF.dur,
    'GROUP BY current Lead Owner. All leads = COUNT(leads owned in period). For each lead: first connected call = '+
    'MIN(Call_Start_Time) WHERE Call_Duration_in_seconds &gt; 0; contact time = that − Leads.Created_Time, bucketed below. '+
    'Contacted = leads with a connected call; Median = median contact time of those. '+CTDEF,
    'Sorted by All leads DESC');

  h += `<div class="kpis">
    ${kpi('All leads', n(allMins.length + notContacted.length), {tone:'good', sub:'owned in period',
      onClick: act(()=>drill('All leads','leads', rows.flatMap(r=>r.all), CTDEF))})}
    ${kpi('Leads contacted', n(allMins.length), {tone:'good', sub:'have ≥ 1 connected call',
      onClick: act(()=>drill('Contacted leads','leads', rows.flatMap(r=>r.buckets.flat()), CTDEF))})}
    ${kpi('Not yet contacted', n(notContacted.length), {tone: notContacted.length?'warn':'', sub:'created, no connection yet',
      onClick: act(()=>drill('Not yet contacted (no connected call)','leads', notContacted, CTDEF))})}
    ${kpi('Median time to contact', ctFmt(_median(allMins)), {sub:'across all contacted leads'})}
    ${kpi('≤ 15 min', n(rows.reduce((s,r)=>s+r.buckets[0].length,0)), {tone:'good', sub: allMins.length? dec(pct(rows.reduce((s,r)=>s+r.buckets[0].length,0), allMins.length))+'% of contacted' : '—'})}
  </div>`;

  const cols = [
    {h:'PSM', f:r=>esc(r.name), act:r=>act(()=>drill('All leads — '+r.name,'leads', r.all, CTDEF))},
    {h:'All leads', cls:'num', f:r=>n(r.all.length), act:r=>act(()=>drill('All leads — '+r.name,'leads', r.all, CTDEF))},
    ...CT_BUCKETS.map((b,i)=>({h:b[0], cls:'num', f:r=> n(r.buckets[i].length),
      act:r=>act(()=>drill(b[0]+' to contact — '+r.name,'leads', r.buckets[i], CTDEF))})),
    {h:'Contacted', cls:'num', f:r=>n(r.total), act:r=>act(()=>drill('Contacted leads — '+r.name,'leads', r.buckets.flat(), CTDEF))},
    {h:'Median', cls:'num', f:r=>ctFmt(_median(r.mins))}
  ];
  h += table(cols, rows, {foot:(c, shown)=>{
    const S = shown||rows;
    if(c.h==='PSM') return 'TOTAL';
    if(c.h==='All leads') return n(S.reduce((s,r)=>s+r.all.length,0));
    if(c.h==='Contacted') return n(S.reduce((s,r)=>s+r.total,0));
    if(c.h==='Median') return ctFmt(_median(S.flatMap(r=>r.mins)));
    const i = CT_BUCKETS.findIndex(b=>b[0]===c.h);
    return i>=0 ? n(S.reduce((s,r)=>s+r.buckets[i].length,0)) : '';
  }});

  h += `<div class="note" style="padding:10px 16px">Buckets are contiguous, non-overlapping ranges on the boundaries you specified
    (0–15, 15–25, 25–35 min, then 35 min–1 hr, 1–2 hr, 2–6 hr, 6–12 hr, 12–24 hr, &gt; 24 hr). "Contact" = first
    <b>connected</b> call (duration &gt; 0); tell me if you'd rather measure the first call <i>attempt</i> instead.</div>`;

  h += sec('Overall contact-time distribution', FF.created+', '+FF.start+', '+FF.dur,
    'COUNT(leads) in each contact-time bucket across all PSMs.', 'All contacted leads');
  h += `<div class="chartbox">${hbar(CT_BUCKETS.map((b,i)=>[b[0], rows.reduce((s,r)=>s+r.buckets[i].length,0)]),
    {act:d=>{ const i=CT_BUCKETS.findIndex(b=>b[0]===d[0]); return act(()=>drill(d[0]+' to contact','leads', rows.flatMap(r=>r.buckets[i]), CTDEF)); }})}</div>`;
  return h;
};

/* ============ PAGE — FRESH LEAD STATUS ============
   The day's fresh leads (Leads.Created_Time in the selected period) and how they are being
   worked. GROUP BY current Lead Owner. CALLING ATTEMPT = the SUNROOOF SOP unit: the PSM dials a
   customer twice within three minutes, and those two dials count as ONE attempt. Attempts are built
   by clustering a lead's OUTBOUND calls in time — calls ≤ 3 minutes apart belong to the same
   attempt; a gap > 3 minutes starts a new attempt. Outgoing calls = the raw outbound dial count
   (≈ 2 × attempts when the two-dials rule is followed). */
const ATTEMPT_WINDOW_MS = 3*60000;   // two dials within this window = one attempt (SOP: 3 minutes)
// Cluster one lead's outbound calls into attempts by the ≤ 3-minute rule.
function groupAttempts(calls){
  const sorted = calls.filter(c=>c.start).slice().sort((a,b)=> a.start < b.start ? -1 : 1);
  const attempts = []; let cur = null, prev = null;
  for(const c of sorted){
    const t = Date.parse(c.start);
    if(cur && (t - prev) <= ATTEMPT_WINDOW_MS) cur.calls.push(c);
    else { cur = {calls:[c]}; attempts.push(cur); }
    prev = t;
  }
  return attempts;   // each attempt = {calls:[...]}, connected if any call has duration > 0
}

const SOP_GAP_MS = 30*60000;   // required minimum gap between attempt 1 and attempt 2
// Evaluate one lead's OUTBOUND calls against the SOP.
// A "full attempt" = a ≤3-minute cluster containing ≥ 2 dials (the PSM dialled twice within 3 minutes).
// Compliant (only meaningful for not-connected leads) = ≥ 2 full attempts, with the last full attempt
// starting ≥ 30 minutes after the first (measured on Call_Start_Time).
function sopEval(obCalls){
  const attempts = groupAttempts(obCalls);
  const full = attempts.filter(a => a.calls.length >= 2);
  let compliant = false;
  if(full.length >= 2){
    const t0 = Date.parse(full[0].calls[0].start);
    const tN = Date.parse(full[full.length-1].calls[0].start);
    compliant = (tN - t0) >= SOP_GAP_MS;
  }
  return { attempts: attempts.length, full: full.length, compliant };
}

function boardFreshLead(){
  const R = M.R;
  const inRange = l => l.created && (!R[0] || (l.created.slice(0,10) >= R[0] && (!R[1] || l.created.slice(0,10) <= R[1])));
  // This component DEFAULTS to Source = "A and B" (only here). If the user sets an explicit
  // Lead Source filter, that takes over; otherwise we scope to A and B leads.
  const srcDefault = !STATE.filters.source.length;
  const fresh = M.leads.filter(inRange).filter(l => srcDefault ? l.source === 'A and B' : true).filter(boardOwnerOk).filter(boardStatusOk);
  const freshIds = new Set(fresh.map(l=>l.id));

  // gather each fresh lead's calls: outbound dials + whether contact was ever established
  const byLead = new Map();
  for(const c of M.calls){
    if(!freshIds.has(c.leadId)) continue;
    let e = byLead.get(c.leadId); if(!e){ e={ob:[], conn:false}; byLead.set(c.leadId, e); }
    if(isConnected(c)) e.conn = true;            // connected on ANY call ⇒ contact established
    if(c.type==='Outbound') e.ob.push(c);
  }

  const rowsMap = new Map();
  const row = id => { let r=rowsMap.get(id); if(!r){ r={id,name:uname(id),leads:[],conn:[],nc:[],comp:[],noncomp:[],
      ob:[], out:0, attempts:0, ncAtt:0, ncCalls:[]}; rowsMap.set(id,r);} return r; };
  for(const l of fresh){
    const r = row(l.ownerId); r.leads.push(l);
    const e = byLead.get(l.id) || {ob:[], conn:false};
    const ev = sopEval(e.ob);
    r.out += e.ob.length; r.attempts += ev.attempts; if(e.ob.length) r.ob.push(...e.ob);
    if(e.conn) r.conn.push(l);                    // resolved — no further calls required
    else {
      r.nc.push(l); (ev.compliant ? r.comp : r.noncomp).push(l);
      // "Not connected attempts as per A and B Rule" = full attempts (2 dials ≤ 3 min = 1 attempt) on this not-connected lead
      r.ncAtt += ev.full; if(e.ob.length) r.ncCalls.push(...e.ob);
    }
  }
  rosterIds().forEach(id=>row(id));   // always show the fixed PSM roster, even at 0
  const rows = [...rowsMap.values()].sort((a,b)=> b.leads.length-a.leads.length || a.name.localeCompare(b.name));

  const totFresh = fresh.length;
  const sumA = (arr,k) => arr.reduce((s,r)=>s+(Array.isArray(r[k])?r[k].length:r[k]),0);
  const totConn = sumA(rows,'conn'), totNc = sumA(rows,'nc'), totComp = sumA(rows,'comp');
  const totOut = sumA(rows,'out'), totAtt = sumA(rows,'attempts');
  const periodLbl = R[0] ? (R[0]===R[1] ? inDate(R[0]) : inDate(R[0])+' → '+(R[1]?inDate(R[1]):'today')) : 'all time';

  // The written definitions the owner asked for — the SOP + the compliance test, spelled out.
  const ATTEMPT_DEF = '<b>Calling attempt</b> = the SUNROOOF SOP unit: the PSM dials the customer <b>twice within three '+
    'minutes</b> (judged on Call_Start_Time) and those two dials count as <b>one attempt</b>. <b>Outgoing calls</b> = the raw '+
    'number of outbound dials (≈ 2 × attempts when the two-dials rule is followed).';
  const COMPLY_DEF = '<b>SOP compliance is checked ONLY on not-connected leads.</b> Once contact is established (any '+
    'connected call, duration &gt; 0) the lead is <b>resolved</b> — no further calls are required, so it is excluded from the '+
    'compliance base. A not-connected lead is <b>Compliant</b> when the PSM made <b>at least two full attempts</b> that day — '+
    'each a pair of dials within three minutes — with the <b>second attempt starting ≥ 30 minutes after the first</b>. Everything '+
    'else is <b>Non-compliant</b> (never dialled, only one attempt, single dials, or the two attempts &lt; 30 min apart).';
  const FLDEF = 'Fresh leads = Leads.Created_Time in period ('+periodLbl+'), grouped by current Lead Owner. '+
    'Compliance base = not-connected fresh leads. Compliant = ≥2 full attempts (2 dials ≤3 min apart) with ≥30 min between attempt 1 and attempt 2.';

  let h = sec('Fresh lead status & SOP compliance — new leads · ' + periodLbl + (srcDefault ? ' · Source: A and B' : ''),
    FF.created+', '+FF.own+', '+FF.call+', '+FF.type+', '+FF.start+', '+FF.dur,
    'Fresh leads GROUP BY Leads.Owner WHERE Created_Time in period. Per lead, OUTBOUND calls are ordered by '+
    'Call_Start_Time and clustered into attempts (dials ≤ 3 min apart = one attempt). '+
    'Connected = any call with duration &gt; 0 (contact established ⇒ no further calls needed). '+
    'For the remaining not-connected leads: Compliant = ≥ 2 full attempts (≥ 2 dials each) with the 2nd attempt ≥ 30 min after the 1st. '+ATTEMPT_DEF+' '+COMPLY_DEF,
    'Period = '+periodLbl+' · sorted by fresh leads DESC');

  const cols = [
    {h:'PSM', f:r=>esc(r.name), act:r=>act(()=>drill('Fresh leads — '+r.name,'leads', r.leads, FLDEF))},
    {h:'Total Fresh Leads', cls:'num', f:r=>n(r.leads.length), act:r=>act(()=>drill('Total Fresh Leads — '+r.name,'leads', r.leads, FLDEF))},
    {h:'Connected Leads', cls:'num', f:r=>n(r.conn.length), act:r=>act(()=>drill('Connected Leads (resolved) — '+r.name,'leads', r.conn, FLDEF))},
    {h:'Not Connected Leads', cls:'num', f:r=>n(r.nc.length), act:r=>act(()=>drill('Not Connected Leads (SOP base) — '+r.name,'leads', r.nc, FLDEF))},
    {h:'Total Calls', cls:'num', f:r=>n(r.out), act:r=>act(()=>drill('Total Calls (outgoing dials) — '+r.name,'calls', r.ob, ATTEMPT_DEF.replace(/<[^>]+>/g,'')+' '+D.calls))},
    {h:'Not connected attempts<br><small>as per A and B Rule</small>', cls:'num', f:r=>n(r.ncAtt), act:r=>act(()=>drill('Not-connected attempts (dials on not-connected leads) — '+r.name,'calls', r.ncCalls, ATTEMPT_DEF.replace(/<[^>]+>/g,'')+' '+D.calls))}
  ];
  h += table(cols, rows, {foot:(c, shown)=>{
    const S = shown||rows;
    const A = k => sumA(S,k);
    const map = {'PSM':'TOTAL','Total Fresh Leads':n(A('leads')),'Connected Leads':n(A('conn')),'Not Connected Leads':n(A('nc')),
      'Total Calls':n(A('out')),'Not connected attempts<br><small>as per A and B Rule</small>':n(A('ncAtt'))};
    return map[c.h]||'';
  }});

  h += `<div class="note" style="padding:10px 16px">Set the period filter to <b>Today</b> (or Yesterday) for the daily fresh-lead standup view.
    This component defaults to <b>Source = "A and B"</b> (only here) unless you pick a Lead Source filter.
    Current column mapping: <b>Total Calls</b> = outgoing dials; <b>Not connected attempts as per A and B Rule</b> = attempts made on
    not-connected leads, where <b>2 dials within 3 minutes = 1 attempt</b> (the SOP wants 2 such attempts/day, ≥ 30 min apart).
    Connected leads need no further calls.</div>`;
  return h;
};


/* Full status visibility: intentionally includes statuses and opportunity-linked leads
   excluded by boardStatusOk in the operational calling tables. */
function boardLeadStatusModel(){
  const R = M.R;
  const srcDefault = !STATE.filters.source.length;
  const sourceOk = l => srcDefault ? l.source === 'A and B' : STATE.filters.source.includes(l.source);
  const statusOf = l => l.status === 'not interetsed' ? 'Not Interested' : (l.status || '(No status)');
  const leads = M.leads.filter(l => sourceOk(l) && !l.converted && l.created &&
    (!R[0] || l.created.slice(0,10) >= R[0]) && (!R[1] || l.created.slice(0,10) <= R[1]));
  // Keep columns stable across date/owner filters, including zero-count statuses.
  const preferred = ['Raw', 'Open', 'Prospect', 'Priority Prospect', 'Handled by SM', 'Future Prospect'];
  const other = [...new Set(['Not Interested', ...DATA.leads.filter(l=>sourceOk(l) && !l.converted).map(statusOf)])]
    .filter(s => !preferred.includes(s)).sort((a,b)=>a.localeCompare(b));
  const statuses = [...preferred, ...other];
  const byOwner = new Map();
  const row = id => {
    if(!byOwner.has(id)) byOwner.set(id, {id, name:uname(id), leads:[], counts:new Map()});
    return byOwner.get(id);
  };
  for(const lead of leads){
    const r = row(lead.ownerId), status = statusOf(lead);
    r.leads.push(lead);
    if(!r.counts.has(status)) r.counts.set(status, []);
    r.counts.get(status).push(lead);
  }
  rosterIds().forEach(row);
  const rows = [...byOwner.values()].sort((a,b)=>b.leads.length-a.leads.length || a.name.localeCompare(b.name));
  return {rows, statuses, leads, srcDefault};
}
function boardLeadStatusMatrix(){
  const {rows, statuses, leads, srcDefault} = boardLeadStatusModel();
  const callsByLead=new Map();
  const openIds=new Set(leads.filter(l=>l.status==='Open'&&l.source==='A and B').map(l=>l.id));
  for(const call of DATA.calls){if(openIds.has(call.leadId)){if(!callsByLead.has(call.leadId))callsByLead.set(call.leadId,[]);callsByLead.get(call.leadId).push(call);}}
  const cycleNow=Date.now();
  for(const row of rows){
    row.openCycles=(row.counts.get('Open')||[]).filter(l=>l.source==='A and B').map(lead=>({lead,cycle:abOpenCycle(lead,callsByLead.get(lead.id)||[],cycleNow)}));
    row.pendingAttempts=row.openCycles.reduce((sum,x)=>sum+x.cycle.pendingAttempts,0);
    row.moveCandidates=row.openCycles.filter(x=>x.cycle.callRuleMet).map(x=>x.lead);
  }
  const attemptDef='Source A and B, current Open and unconverted leads only. Cycle inferred from the current PSM’s first unsuccessful outbound call after the latest connected call. '+
    'One attempt = two distinct calls within 3 minutes on the same IST date. Two attempts per qualifying day, with at least 30 minutes from the end of attempt 1 to the start of attempt 2. '+
    'Successive qualifying days start at least 24 hours apart. Six qualifying days = 12 attempts. Missed days do not qualify. Pending Attempts is the remaining attempt count across the six-day cycle; an incomplete past day earns no credit. '+
    'Historical Open status at call time is not available in this snapshot; completed call cycles are candidates, not verified CRM-update eligibility. Calculations use all loaded call history, not the selected call date range.';

  const R = M.R;
  const period = R[0] ? inDate(R[0]) + (R[1] && R[1] !== R[0] ? ' → '+inDate(R[1]) : '') : 'all time';
  const source = srcDefault ? 'A and B' : STATE.filters.source.join(', ');
  const definition = 'Leads created in the selected period, grouped by current Lead Owner and current Lead Status. '+
    'Includes statuses and opportunity-linked leads excluded from the calling tables; includes all owners, excludes converted leads and respects active filters. '+
    'CRM spelling "not interetsed" is grouped under Not Interested.';
  let h = '<section class="psm-status-section" aria-label="PSM lead status breakdown">';
  h += sec('PSM lead status breakdown — '+period+' · Source: '+esc(source),
    FF.lead+', '+FF.own+', '+FF.status+', '+FF.created,
    'Count lead records by current PSM and current status. Each lead belongs to one status column.', definition);
  const cols = [
    {h:'PSM', f:r=>esc(r.name), act:r=>act(()=>drill('All statuses — '+r.name,'leads',r.leads,definition))},
    ...statuses.flatMap(status=>{
      const count={h:esc(status), status, cls:'num'+(['Raw','Open'].includes(status)?' status-alert':''), f:r=>n((r.counts.get(status)||[]).length),
        act:r=>act(()=>drill(status+' — '+r.name,'leads',r.counts.get(status)||[],definition))};
      return status!=='Open' ? [count] : [count,
        {h:'Pending Attempts',key:'pending',cls:'num open-attempts',f:r=>n(r.pendingAttempts),
          act:r=>act(()=>drill('Pending attempts: '+n(r.pendingAttempts)+' — '+r.name,'leads',r.openCycles.filter(x=>x.cycle.pendingAttempts>0).map(x=>x.lead),attemptDef))},
        {h:'Move to Not Interested',key:'move',cls:'num open-attempts',f:r=>n(r.moveCandidates.length),
          act:r=>act(()=>drill('Six-day call cycles — '+r.name,'leads',r.moveCandidates,attemptDef+' Supplied CRM credentials passed read checks. Automatic updates are not enabled; the full call cycle and historical Open status still need verification.'))}
      ];
    }),
    {h:'Total Leads', cls:'num', total:true, f:r=>n(r.leads.length),
      act:r=>act(()=>drill('All statuses — '+r.name,'leads',r.leads,definition))}
  ];
  let statusTable=table(cols,rows,{foot:c=>c.h==='PSM' ? 'TOTAL' : n(c.total ? leads.length :
    c.key==='pending' ? rows.reduce((sum,r)=>sum+r.pendingAttempts,0) :
    c.key==='move' ? rows.reduce((sum,r)=>sum+r.moveCandidates.length,0) :
    rows.reduce((sum,r)=>sum+(r.counts.get(c.status)||[]).length,0))});
  const activeStatuses=['Raw','Open','Prospect','Priority Prospect','Handled by SM','Future Prospect'];
  const inactiveCount=statuses.filter(status=>!activeStatuses.includes(status)).length;
  const groupHeader='<th rowspan="3" scope="col" class="psm-owner-heading">PSM</th>'+
    '<th colspan="8" scope="colgroup" class="status-group-active">Active</th>'+
    '<th colspan="'+inactiveCount+'" scope="colgroup" class="status-group-inactive">Inactive</th>'+
    '<th rowspan="3" scope="col" class="num">Total Leads</th>';
  const statusHeader=cols.filter(c=>c.status).map(c=>c.status==='Open' ?
    '<th colspan="3" scope="colgroup" class="num status-alert">Open</th>' :
    '<th rowspan="2" scope="col" class="'+(c.cls||'')+'">'+c.h+'</th>').join('');
  statusTable=statusTable.replace(/<thead>.*?<\/thead>/,
    '<thead><tr>'+groupHeader+'</tr><tr>'+statusHeader+'</tr><tr><th scope="col" class="num status-alert">Total Open</th><th scope="col" class="num">Pending Attempts<small>Remaining of 12 per lead</small></th><th scope="col" class="num">Move to Not Interested<small>Call rule met · verification pending</small></th></tr></thead>');
  h += statusTable;
  h += '<div class="note ab-rule-note"><b>A and B calling rule:</b> 2 calls within 3 minutes = 1 attempt; 2 attempts per day, separated by at least 30 minutes. Complete 6 qualifying days, with their starts at least 24 hours apart. The cycle starts from unsuccessful calling, not creation or assignment. Pending Attempts counts the remaining attempts out of 12 per Open lead. A missed day does not qualify. Other sources are excluded from these two sub-columns.</div>';
  h += '<div class="note ab-blocked-note"><b>CRM connection checked:</b> supplied credentials successfully read dashboard leads and a sample status timeline. Automatic updates are not enabled yet: six-day candidates still require complete call and historical Open-status verification. No CRM statuses have been changed.</div>';
  h += '<div class="note" style="padding:10px 16px">Current lead statuses for leads created in the selected period. '+
    'Includes Not Interested and other statuses excluded from the calling tables, so totals may differ. '+
    'The CRM spelling “not interetsed” is grouped under Not Interested. Click a count to view its leads; scroll horizontally for all statuses.</div>';
  if(!leads.length) h += '<div class="note" style="padding:0 16px 12px">No leads match the selected filters and creation period.</div>';
  return h+'</section>';
}

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


/* Agent workspace: filtered lead cohort; full-history evidence for mandated cycles. */
function workspaceMandateRows(leads, calls, now=Date.now()){
  const byLead=new Map();
  for(const c of calls){if(!byLead.has(c.leadId)) byLead.set(c.leadId,[]);byLead.get(c.leadId).push(c);}
  const cycles=leads.filter(l=>l.source==='A and B'&&l.status==='Open'&&!l.converted)
    .map(l=>({lead:l,cycle:abOpenCycle(l,byLead.get(l.id)||[],now)}))
    .filter(x=>x.cycle.start!==null);
  return Array.from({length:5},(_,i)=>{
    const reached=cycles.filter(x=>x.cycle.completedDays>=i);
    const complete=reached.filter(x=>x.cycle.completedDays>i);
    const pending=reached.filter(x=>x.cycle.completedDays===i);
    const ready=pending.filter(x=>!x.cycle.nextAllowedAt||x.cycle.nextAllowedAt<=now);
    return {day:i+1,reached:reached.map(x=>x.lead),complete:complete.map(x=>x.lead),pending:pending.map(x=>x.lead),ready:ready.map(x=>x.lead),dates:new Map(pending.map(x=>[x.lead.id,x.cycle.nextAllowedAt]))};
  });
}
function workspaceZohoMandateRows(leads, now=Date.now()){
  const active=leads.filter(l=>l.taskId&&!['Completed','Closed','Cancelled'].includes(l.taskStatus));
  return Array.from({length:5},(_,i)=>{
    const pending=active.filter(l=>l.rnrDay===i+1).sort((a,b)=>workspaceDateOrder(a.rnrDue,b.rnrDue)||String(a.name||'').localeCompare(String(b.name||'')));
    const ready=pending.filter(l=>Number.isFinite(Date.parse(l.rnrDue))&&Date.parse(l.rnrDue)<=now);
    return {day:i+1,pending,ready,dates:new Map(pending.map(l=>[l.taskId,Date.parse(l.rnrDue)]))};
  });
}
function workspaceZohoMandateLeads(){
  return (DATA.mandateLeadExport?.leads||[]).map(l=>({...DATA.leadById.get(l.id),...l})).filter(l=>leadPasses(l,[null,null])&&(!M.R[0]||l.dueDate>=M.R[0])&&(!M.R[1]||l.dueDate<=M.R[1]));
}
function workspacePhoneLink(lead, className='ws-dial'){
  const phone=String(lead.mobile||'').trim(),dial=phone.replace(/[\s().-]/g,'');
  if(!/^\+?\d{6,15}$/.test(dial)) return '<span class="ws-no-calls">No number</span>';
  return `<a class="${className}" href="tel:${esc(dial)}" aria-label="Call ${esc(lead.name||'lead')} on ${esc(phone)}">${workspaceIcon("phone")}<span>Call</span></a>`;
}
function workspaceFollowupWindow(lead, now=Date.now()){
  if(lead.fuState==='Completed') return 'Follow-up actioned';
  if(!lead.fuEff) return 'No call window set';
  const due=Date.parse(lead.fuEff);
  if(!Number.isFinite(due)) return 'Check follow-up time';
  return due>now?'Upcoming call window':'Follow-up due';
}
function workspaceDateOrder(a,b,newestFirst=false){
  const time=value=>{
    if(value==null||value==='') return Infinity;
    const parsed=typeof value==='number'?value:Date.parse(value);
    return Number.isFinite(parsed)?parsed:Infinity;
  };
  const first=time(a),second=time(b);
  if(first===second) return 0;
  if(first===Infinity) return 1;
  if(second===Infinity) return -1;
  return (first<second?-1:1)*(newestFirst?-1:1);
}
function workspaceLeadList(leads, label, compact=false){
  const date=l=>compact?l.fuEff:l.created;
  const sorted=[...leads].sort((a,b)=>workspaceDateOrder(date(a),date(b)) || String(a.name||'').localeCompare(String(b.name||'')));
  if(!sorted.length) return '<div class="ws-list-empty">No leads in this selection.</div>';
  return `<div class="ws-visible-list ${compact?'ws-compact-list':''}" tabindex="0" role="region" aria-label="${esc(label)} — all matching leads"><table class="ws-leads-table ws-simple-table"><thead><tr><th scope="col">Name</th><th scope="col" aria-sort="ascending">${compact?'Follow-up date':'Date received'} ↑</th><th scope="col">Call</th></tr></thead><tbody>${sorted.map(l=>`<tr><td><strong class="ws-lead-name">${esc(l.name||l.leadNo||'Unnamed lead')}</strong></td><td class="ws-simple-date">${date(l)?fmtDate(date(l)):'—'}</td><td>${workspacePhoneLink(l,'ws-call-button')}</td></tr>`).join('')}</tbody></table></div>`;
}

function workspaceRawLeads(){
  if(!DATA.rawLeadExport) return M.leads.filter(l=>!l.converted&&String(l.status).trim().toLowerCase()==='raw');
  return DATA.rawLeadExport.leads.map(l=>({...DATA.leadById.get(l.id),...l})).filter(l=>leadPasses(l,M.R));
}
function workspacePriorityLeads(){
  if(!DATA.priorityLeadExport) return M.leads.filter(l=>!l.converted&&boardOwnerOk(l)&&boardStatusOk(l));
  return DATA.priorityLeadExport.leads.map(exported=>{
    const original=DATA.leadById.get(exported.id);
    const lead={...original,...exported,isPriority:true,priFu:exported.fuEff};
    computeFollowUp(lead,original?.a);
    return lead;
  }).filter(l=>leadPasses(l,M.R));
}
function workspaceRawOwners(leads){
  return workspaceLeadList(leads,'Raw leads',true);
}
function workspaceCallIndex(){
  const byLead=new Map();
  for(const c of DATA.calls.filter(isLogged)){
    if(!byLead.has(c.leadId)) byLead.set(c.leadId,[]);
    byLead.get(c.leadId).push(c);
  }
  for(const calls of byLead.values()) calls.sort((a,b)=>workspaceDateOrder(a.start,b.start,true));
  return byLead;
}
function workspaceCallHistory(calls=[]){
  if(!calls.length) return '<p class="ws-no-calls">No saved call logs for this lead.</p>';
  return `<ol class="ws-expanded-history" aria-label="Saved call history">${calls.map(c=>`<li><a href="${esc(crmLink('Calls',c.id))}" target="_blank" rel="noopener noreferrer">${fmtDT(c.start)}</a><strong>${esc(c.result||c.outStatus||'No result recorded')}</strong><span>${esc(c.caller||uname(c.ownerId))} · ${esc(c.type||'Type not set')} · ${c.durationKnown===false?'Duration not recorded':hms(c.dur)}</span><span>${esc(c.subject||'No subject')}${c.purpose?' · '+esc(c.purpose):''}</span></li>`).join('')}</ol>`;
}
function workspacePriorityList(leads, label, callIndex){
  if(!leads.length) return '<div class="ws-list-empty">No leads in this selection.</div>';
  const sorted=[...leads].sort((a,b)=>workspaceDateOrder(a.fuEff,b.fuEff)||String(a.name||'').localeCompare(String(b.name||'')));
  return `<div class="ws-visible-list" role="region" aria-label="${esc(label)} leads and call logs"><table class="ws-leads-table ws-simple-table"><thead><tr><th scope="col">Name</th><th scope="col">Follow-up date ↑</th><th scope="col">Call</th></tr></thead>${sorted.map(l=>`<tbody data-priority-lead="${esc(l.id)}"><tr><td><a href="${esc(crmLink('Leads',l.id))}" target="_blank" rel="noopener noreferrer"><strong class="ws-lead-name">${esc(l.name||l.leadNo||'Unnamed lead')}</strong></a><span class="ws-lead-meta">${esc(l.ownerName||uname(l.ownerId))}</span></td><td class="ws-simple-date">${l.fuEff?fmtDate(l.fuEff):'Not set'}</td><td>${workspacePhoneLink(l,'ws-call-button')}</td></tr><tr class="ws-history-row"><td colspan="3"><strong>Saved call logs (${n((callIndex.get(l.id)||[]).length)})</strong>${workspaceCallHistory(callIndex.get(l.id))}</td></tr></tbody>`).join('')}</table></div>`;
}
function workspaceTaskList(leads, full=false, callIndex=new Map()){
  if(!leads.length) return '<div class="ws-day-empty">No open RNR tasks in this selection.</div>';
  const sorted=[...leads].sort((a,b)=>workspaceDateOrder(a.rnrDue,b.rnrDue)||String(a.taskId).localeCompare(String(b.taskId)));
  return `<div class="ws-visible-list"><table class="ws-leads-table ws-simple-table ${full?'ws-all-tasks':'ws-day-table'}"><thead><tr><th scope="col">${full?'Name':'Customer / owner'}</th><th scope="col">Callback due ↑ (IST)</th><th scope="col">Call</th></tr></thead>${sorted.map(l=>`<tbody data-task-id="${esc(l.taskId)}"><tr><td><a href="${esc(crmLink('Tasks',l.taskId))}" target="_blank" rel="noopener noreferrer" title="${esc(l.taskSubject)}"><strong class="ws-lead-name">${esc(l.name||'Unnamed lead')}</strong></a>${full?`<span class="ws-lead-meta">D${l.rnrDay} · ${esc(l.ownerName||uname(l.ownerId))}<br>${esc(l.taskStatus||'Open')} · ${esc(l.taskSubject||'')}</span>`:`<span class="ws-lead-meta">${esc(l.ownerName||uname(l.ownerId)||'Unassigned')}</span>`}</td><td class="ws-simple-date">${Number.isFinite(Date.parse(l.rnrDue))?(l.dueHasTime?fmtDT(l.rnrDue):fmtDate(l.dueDate)):'Not set'}<span class="ws-lead-meta">${Number.isFinite(Date.parse(l.rnrDue))?(Date.parse(l.rnrDue)>Date.now()?'Upcoming':'Due now'):'Date unavailable'}</span></td><td>${workspacePhoneLink(l,'ws-call-button')}${full?`<span class="ws-lead-meta">${esc(l.mobile||'No number')}</span>`:''}</td></tr>${full?`<tr class="ws-task-detail"><td colspan="3"><dl class="ws-task-facts"><div><dt>Task ID</dt><dd>${esc(l.taskId)}</dd></div><div><dt>Lead ID</dt><dd><a href="${esc(crmLink('Leads',l.id))}" target="_blank" rel="noopener noreferrer">${esc(l.id)}</a></dd></div><div><dt>Lead status</dt><dd>${esc(l.status||'Not set')}</dd></div><div><dt>Source</dt><dd>${esc(l.source||'Not set')}</dd></div><div><dt>Region / city</dt><dd>${esc([l.region,l.city].filter(Boolean).join(' / ')||'Not set')}</dd></div><div><dt>Lead created</dt><dd>${fmtDate(l.created)}</dd></div><div><dt>Team</dt><dd>${esc(Array.isArray(l.teams)?l.teams.join(', '):l.teams||'Not set')}</dd></div></dl><strong>Saved lead call logs (${n((callIndex.get(l.id)||[]).length)})</strong>${workspaceCallHistory(callIndex.get(l.id))}</td></tr>`:''}</tbody>`).join('')}</table></div>`;
}

function workspaceIcon(name){
  const paths={phone:'M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L9 11a16 16 0 0 0 4 4l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 2.7 3Z',search:'m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',arrow:'M5 12h14m-6-6 6 6-6 6',clock:'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',close:'m6 6 12 12M6 18 18 6'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.arrow}"/></svg>`;
}
function workspacePreview(leads,limit=2){
  const sorted=[...leads].sort((a,b)=>workspaceDateOrder(a.fuEff,b.fuEff)||String(a.name||'').localeCompare(String(b.name||'')));
  if(!sorted.length) return '<p class="ws-preview-empty">No matching leads. Adjust your search or filters.</p>';
  return `<div class="ws-preview-labels"><span>Name</span><span>Follow-up</span><span>Call</span></div>${sorted.slice(0,limit).map(l=>`<div class="ws-preview-record"><div><strong>${esc(l.name||l.leadNo||'Unnamed lead')}</strong><small>${esc(l.ownerName||uname(l.ownerId))}</small></div><time>${l.fuEff?fmtDate(l.fuEff):'Not set'}</time>${workspacePhoneLink(l,'ws-call-button')}</div>`).join('')}`;
}
function workspaceExpandedDays(rows){
  return `<div class="ws-mandate-expanded ws-mandate-horizontal" tabindex="0" role="region" aria-label="Day 1 to Day 5 call lists; scroll horizontally on smaller screens">${rows.map(r=>`<section id="ws-day-${r.day}" class="ws-day-column ws-day-expanded" aria-label="Day ${r.day} call list"><header class="ws-day-heading"><div><h3>Day ${r.day} <span>${n(r.pending.length)} tasks</span></h3><p>${n(r.ready.length)} due now · ${n(r.pending.filter(l=>Date.parse(l.rnrDue)>Date.now()).length)} upcoming</p></div></header>${r.pending.length?`<ol class="ws-day-preview" tabindex="0" aria-label="Day ${r.day}: first 10 tasks">${r.pending.slice(0,10).map(l=>`<li data-task-id="${esc(l.taskId)}"><a class="ws-day-customer" href="${esc(crmLink('Tasks',l.taskId))}" target="_blank" rel="noopener noreferrer"><strong>${esc(l.name||'Unnamed lead')}</strong></a><span class="ws-day-owner">${esc(l.ownerName||uname(l.ownerId)||'Unassigned')}</span><div class="ws-day-action"><div><span>Callback due · IST</span><time>${Number.isFinite(Date.parse(l.rnrDue))?(l.dueHasTime?fmtDT(l.rnrDue):fmtDate(l.dueDate)):'Not set'}</time></div>${workspacePhoneLink(l,'ws-call-button')}</div></li>`).join('')}</ol>`:`<div class="ws-day-empty">No open tasks scheduled for Day ${r.day}${STATE.filters.psm.length?' for this team member':''}.</div>`}<footer class="ws-day-preview-footer">Showing ${Math.min(10,r.pending.length)} of ${n(r.pending.length)}</footer></section>`).join('')}</div>`;
}
function workspaceOverview(raw,bands,rows){
  const total=rows.reduce((sum,r)=>sum+r.pending.length,0);
  return `<section class="ws-overview" aria-label="Calling overview"><section class="ws-overview-raw"><header><div><h2>Raw leads <span>${n(raw.length)}</span></h2><p>Start a conversation. Schedule the next step.</p></div><a href="#ws-raw" class="ws-text-link">All raw leads ${workspaceIcon('arrow')}</a></header>${workspacePreview(raw,3)}<div class="ws-preview-foot">First ${Math.min(3,raw.length)} by follow-up date · Full list expanded below</div></section><div class="ws-overview-priorities">${bands.map((b,i)=>`<section class="ws-overview-priority ws-tone-${i}"><header><h2>${esc(b.label.toLowerCase().replace(/^./,c=>c.toUpperCase()))}</h2><span class="ws-overview-count">${n(b.all.length)}</span></header><p>${n(b.all.filter(l=>l.fuState!=='Completed').length)} to follow up</p>${workspacePreview(b.all)}<a class="ws-preview-footer" href="#ws-priority-${i}">All leads & call logs ${workspaceIcon('arrow')}</a></section>`).join('')}</div><section class="ws-mandate-board" aria-label="Expanded mandated calls"><section class="ws-overview-mandates"><header><div><h2>Mandated calls <span>${n(total)} tasks</span></h2><p>Open RNR tasks, arranged by assigned call day.</p></div><a href="#ws-mandated">All task details ${workspaceIcon('arrow')}</a></header><div class="ws-overview-days">${rows.map(r=>`<a href="#ws-day-${r.day}"><span>Day ${r.day}</span><strong>${n(r.pending.length)}</strong><small>${r.pending.length?n(r.ready.length)+' due now':'No open tasks'}</small>${workspaceIcon('arrow')}</a>`).join('')}</div></section>${workspaceExpandedDays(rows)}</section></section>`;
}
const WORKSPACE_TABLES=new Map();
let workspaceTableObserver=null;
function workspacePageWindow(total,page,size){
  const pages=Math.max(1,Math.ceil(total/size));
  page=Math.max(0,Math.min(pages-1,page));
  return {page,pages,start:page*size,end:Math.min(total,(page+1)*size)};
}
function workspaceFixedRows(model){
  const range=workspacePageWindow(model.rows.length,model.page,model.size);
  model.page=range.page;
  if(!model.rows.length) return `<tr class="ws-fixed-empty"><td colspan="3">No ${model.task?'open tasks':'leads'} for this selection.</td></tr>`;
  return model.rows.slice(range.start,range.end).map(l=>{
    const date=model.task?l.rnrDue:l.fuEff;
    const display=Number.isFinite(Date.parse(date))?(model.task&&l.dueHasTime?fmtDT(date):fmtDate(model.task?l.dueDate:date)):'Not set';
    return `<tr data-record-id="${esc(model.task?l.taskId:l.id)}"><td><a class="ws-fixed-name" href="${esc(crmLink(model.task?'Tasks':'Leads',model.task?l.taskId:l.id))}" target="_blank" rel="noopener noreferrer" title="${esc(l.name||'Unnamed lead')}">${esc(l.name||'Unnamed lead')}</a><small title="${esc(l.ownerName||uname(l.ownerId))}">${esc(l.ownerName||uname(l.ownerId))}</small></td><td class="ws-fixed-date" title="${esc(display)}">${model.task&&l.dueHasTime&&Number.isFinite(Date.parse(date))?`<span>${fmtDate(date)}</span><span>${String(date).slice(11,16)}</span>`:display}</td><td>${workspacePhoneLink(l,'ws-call-button')}</td></tr>`;
  }).join('');
}
function workspaceFixedCard(rows,title,classes,id,task=false){
  const sorted=[...rows].sort((a,b)=>workspaceDateOrder(task?a.rnrDue:a.fuEff,task?b.rnrDue:b.fuEff)||String(task?a.taskId:a.id).localeCompare(String(task?b.taskId:b.id)));
  const model={rows:sorted,title,task,page:0,size:1};WORKSPACE_TABLES.set(id,model);
  return `<section id="${id}" class="ws-fixed-card ws-compact-card ${classes}" aria-label="${esc(title)}"><header class="ws-compact-heading"><h2>${esc(title)}</h2><span>${n(rows.length)} ${task?'tasks':'leads'}</span></header><div class="ws-fixed-body"><table class="ws-fixed-table"><thead><tr><th scope="col">Name / owner</th><th scope="col">${task?'Callback due':'Follow-up'}${task?' (IST)':''}</th><th scope="col">Call</th></tr></thead><tbody>${workspaceFixedRows(model)}</tbody></table></div><footer class="ws-table-pagination"><span class="ws-page-range" role="status" aria-live="polite"></span><div><button type="button" data-ws-table="${id}" data-ws-step="-1" aria-label="Previous page of ${esc(title)}" title="Previous page">${workspaceIcon('arrow')}</button><label class="sr-only" for="${id}-page">Page of ${esc(title)}</label><input id="${id}-page" data-ws-table="${id}" data-ws-jump type="number" min="1" value="1" inputmode="numeric"><span class="ws-page-total"></span><button type="button" data-ws-table="${id}" data-ws-step="1" aria-label="Next page of ${esc(title)}" title="Next page">${workspaceIcon('arrow')}</button></div></footer></section>`;
}
function workspacePaintTable(id){
  const model=WORKSPACE_TABLES.get(id),card=document.getElementById(id);if(!model||!card) return;
  const range=workspacePageWindow(model.rows.length,model.page,model.size);model.page=range.page;
  card.querySelector('tbody').innerHTML=workspaceFixedRows(model);
  card.querySelector('.ws-page-range').textContent=model.rows.length?`${n(range.start+1)}–${n(range.end)} of ${n(model.rows.length)}`:'0 records';
  const input=card.querySelector('[data-ws-jump]');input.value=range.page+1;input.max=range.pages;input.disabled=!model.rows.length;
  card.querySelector('.ws-page-total').textContent=`/ ${n(range.pages)}`;
  card.querySelector('[data-ws-step="-1"]').disabled=range.page===0;
  card.querySelector('[data-ws-step="1"]').disabled=range.page===range.pages-1;
}
function setupWorkspaceTables(){
  workspaceTableObserver?.disconnect();
  if(!document.querySelector('.ws-fixed-dashboard')) return;
  const fit=card=>{
    const model=WORKSPACE_TABLES.get(card.id);if(!model) return;
    const available=card.querySelector('.ws-fixed-body').clientHeight-card.querySelector('thead').getBoundingClientRect().height;
    const size=Math.max(1,Math.min(10,Math.floor(available/48)));
    if(size!==model.size){const first=model.page*model.size;model.size=size;model.page=Math.floor(first/size);}
    workspacePaintTable(card.id);
  };
  workspaceTableObserver=new ResizeObserver(entries=>{for(const entry of entries) fit(entry.target.closest('.ws-fixed-card'));});
  for(const card of document.querySelectorAll('.ws-fixed-card')){fit(card);workspaceTableObserver.observe(card.querySelector('.ws-fixed-body'));}
}
function workspaceJumpToPage(input){
  const model=WORKSPACE_TABLES.get(input.dataset.wsTable);if(!model) return;
  const value=Number(input.value);model.page=Number.isFinite(value)?Math.trunc(value)-1:0;workspacePaintTable(input.dataset.wsTable);
}
function wireWorkspacePagination(){
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-ws-step]');if(!button||button.disabled) return;
    const model=WORKSPACE_TABLES.get(button.dataset.wsTable);if(!model) return;
    model.page+=Number(button.dataset.wsStep);workspacePaintTable(button.dataset.wsTable);
  });
  document.addEventListener('change',event=>{
    const input=event.target.closest('[data-ws-jump]');if(input) workspaceJumpToPage(input);
  });
  document.addEventListener('keydown',event=>{
    const input=event.target.closest('[data-ws-jump]');
    if(input&&event.key==='Enter'){event.preventDefault();workspaceJumpToPage(input);}
  });
}
// Workspace periods use calendar boundaries in IST, independent of analytics filters.
const WORKSPACE_PERIODS=[['today','Today'],['thisweek','This week'],['lastweek','Last week'],['thismonth','This month'],['lastmonth','Last month'],['thisyear','This year'],['all','All time'],['custom','Custom date / time']];
function workspaceTime(value){
  if(value==null||value==='') return NaN;
  if(typeof value==='number') return value;
  let text=String(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)) text+='T00:00:00+05:30';
  else if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) text+='+05:30';
  return Date.parse(text);
}
function workspaceDateRange(filter=STATE.workspace,now=Date.now()){
  const today=new Date(now+330*60000).toISOString().slice(0,10),year=+today.slice(0,4),month=+today.slice(5,7);
  const monthBoundary=(y,m)=>new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
  let start,end;
  switch(filter.period){
    case 'all': return {start:-Infinity,end:Infinity,label:'All time',valid:true};
    case 'custom': {
      start=workspaceTime(filter.from);end=workspaceTime(filter.to)+60000;
      return {start,end,label:'Custom date / time',valid:Number.isFinite(start)&&Number.isFinite(end)&&start<end};
    }
    case 'thisweek': start=startOfWeek(today);end=addDays(start,7);break;
    case 'lastweek': end=startOfWeek(today);start=addDays(end,-7);break;
    case 'thismonth': start=monthStart(today);end=monthBoundary(year,month);break;
    case 'lastmonth': start=monthBoundary(year,month-2);end=monthStart(today);break;
    case 'thisyear': start=year+'-01-01';end=(year+1)+'-01-01';break;
    default: start=today;end=addDays(today,1);
  }
  return {start:workspaceTime(start),end:workspaceTime(end),label:fmtDate(start)+(addDays(end,-1)!==start?' – '+fmtDate(addDays(end,-1)):''),valid:true};
}
function workspaceRecordTime(record){return workspaceTime(record.task?(record.lead.rnrDue||record.lead.dueDate):record.lead.fuEff);}
function workspaceDateMatches(record,range=workspaceDateRange()){
  if(!range.valid) return false;
  if(range.start===-Infinity&&range.end===Infinity) return true;
  const time=workspaceRecordTime(record);
  return Number.isFinite(time)&&time>=range.start&&time<range.end;
}
function workspacePlainRows(filter=STATE.workspace,now=Date.now()){
  const sort=leads=>[...leads].sort((a,b)=>workspaceDateOrder(a.fuEff,b.fuEff)||String(a.id).localeCompare(String(b.id)));
  const raw=sort(workspaceRawLeads()).map(lead=>({lead,category:'Raw lead',tone:'raw',task:false}));
  const priority=workspacePriorityLeads();
  const bands=PRI_BANDS.slice(0,3).flatMap((band,i)=>sort(priority.filter(l=>l.fuPriority===band.key)).map(lead=>({lead,category:band.label.toLowerCase().replace(/^./,c=>c.toUpperCase()),tone:['high','medium','low'][i],task:false})));
  const days=workspaceZohoMandateRows(workspaceZohoMandateLeads()).flatMap(day=>day.pending.map(lead=>({lead,category:'Day '+day.day+' mandated',tone:'day',task:true})));
  const range=workspaceDateRange(filter,now);
  return [...raw,...bands,...days].filter(row=>workspaceDateMatches(row,range));
}
function workspaceGroups(records){
  return [{id:'raw',title:'Raw leads',tone:'raw',rows:records.filter(r=>r.tone==='raw')},
    ...['high','medium','low'].map(tone=>({id:tone,title:tone[0].toUpperCase()+tone.slice(1)+' priority',tone,rows:records.filter(r=>r.tone===tone)})),
    ...Array.from({length:5},(_,i)=>({id:'day-'+(i+1),title:'Day '+(i+1),tone:'day',rows:records.filter(r=>r.task&&r.lead.rnrDay===i+1)})),
    {id:'all',title:'All matching records',tone:'all',rows:[...records].sort((a,b)=>workspaceDateOrder(workspaceRecordTime(a),workspaceRecordTime(b)))}];
}
function workspaceDisplayDate(record){
  const time=workspaceRecordTime(record);
  if(!Number.isFinite(time)) return 'Not set';
  const date=new Date(time+330*60000).toISOString();
  const hasTime=record.task?record.lead.dueHasTime:String(record.lead.fuEff).includes('T');
  return hasTime?fmtDT(date):fmtDate(date);
}
function workspaceSection(group){
  const full=STATE.workspace.expanded.has(group.id),rows=full?group.rows:group.rows.slice(0,10),all=group.id==='all';
  return `<section id="ws-section-${group.id}" class="ws-period-section ws-section-${group.tone}" aria-labelledby="ws-title-${group.id}"><header class="ws-section-heading"><h2 id="ws-title-${group.id}">${group.title}</h2><span>${n(group.rows.length)} ${group.tone==='day'?'tasks':'records'}</span></header><table class="ws-period-table"><caption class="sr-only">${group.title}, follow-up / Callback due in IST, earliest first</caption><thead><tr>${all?'<th scope="col">Category</th>':''}<th scope="col">Name / owner</th><th scope="col">${group.tone==='day'?'Callback due':'Follow-up'} <small>IST</small></th><th scope="col">Call</th></tr></thead><tbody>${rows.length?rows.map(record=>{
    const {lead:l,category,task}=record;
    return `<tr data-record-id="${esc(task?l.taskId:l.id)}" data-category="${esc(category)}">${all?`<td>${esc(category)}</td>`:''}<td><a href="${esc(crmLink(task?'Tasks':'Leads',task?l.taskId:l.id))}" target="_blank" rel="noopener noreferrer">${esc(l.name||l.leadNo||'Unnamed lead')}</a><small>${esc(l.ownerName||uname(l.ownerId)||'Unassigned')}</small></td><td>${workspaceDisplayDate(record)}</td><td>${workspacePhoneLink(l,'ws-call-button')}</td></tr>`;
  }).join(''):`<tr><td colspan="${all?4:3}" class="ws-period-empty">No matching records. Choose another period or team member.</td></tr>`}</tbody></table><footer class="table-preview-footer"><span>Showing ${n(rows.length)} of ${n(group.rows.length)}</span>${group.rows.length>10?`<button type="button" class="ghost" data-ws-expand="${group.id}" aria-controls="ws-section-${group.id}" aria-expanded="${full}" aria-label="${full?'Show top 10 in':'View more in'} ${group.title}">${full?'Show top 10':'View more'}</button>`:''}</footer></section>`;
}
function workspaceChangePeriod(period){
  STATE.workspace.period=WORKSPACE_PERIODS.some(p=>p[0]===period)?period:'today';
  STATE.workspace.expanded.clear();
  if(period==='custom'&&(!STATE.workspace.from||!STATE.workspace.to)){
    const date=new Date(Date.now()+330*60000).toISOString().slice(0,10);
    STATE.workspace.from=date+'T00:00';STATE.workspace.to=date+'T23:59';
  }
}
function wireWorkspaceDateFilters(){
  document.getElementById('view').addEventListener('change',event=>{
    if(event.target.id==='workspace-period') workspaceChangePeriod(event.target.value);
    else if(['workspace-from','workspace-to'].includes(event.target.id)){
      STATE.workspace[event.target.id==='workspace-from'?'from':'to']=event.target.value;
      STATE.workspace.expanded.clear();
    }else return;
    const id=event.target.id;render();document.getElementById(id)?.focus({preventScroll:true});
  });
  document.getElementById('view').addEventListener('click',event=>{
    const button=event.target.closest('[data-ws-expand]');if(!button) return;
    const id=button.dataset.wsExpand,group=workspaceGroups(workspacePlainRows()).find(g=>g.id===id);if(!group) return;
    if(STATE.workspace.expanded.has(id)) STATE.workspace.expanded.delete(id);else STATE.workspace.expanded.add(id);
    document.getElementById('ws-section-'+id).outerHTML=workspaceSection(group);
    document.querySelector(`[data-ws-expand="${id}"]`)?.focus({preventScroll:true});
  });
}
RENDER.workspace=function(){
  const range=workspaceDateRange(),records=workspacePlainRows(),groups=workspaceGroups(records),filter=STATE.workspace;
  return `<div class="psm-workspace ws-designed ws-plain-dashboard ws-period-dashboard"><header class="ws-plain-heading"><h1>Calling workspace</h1><p>${n(records.length)} matching records · Saved snapshot ${fmtDate(DATA.meta.generatedAt)}</p></header><section class="ws-period-controls" aria-label="Follow-up date filter"><div><label for="workspace-period">Follow-up date / time</label><select id="workspace-period" aria-describedby="workspace-period-help">${WORKSPACE_PERIODS.map(([value,label])=>`<option value="${value}"${filter.period===value?' selected':''}>${label}</option>`).join('')}</select></div>${filter.period==='custom'?`<div><label for="workspace-from">From (IST)</label><input type="datetime-local" id="workspace-from" value="${esc(filter.from)}"></div><div><label for="workspace-to">Through (IST)</label><input type="datetime-local" id="workspace-to" value="${esc(filter.to)}"></div>`:''}<p id="workspace-period-help">${range.valid?esc(range.label)+' · IST. Weeks run Monday–Sunday.':'Choose a valid start and end time.'}<br>Filters follow-ups and mandated callbacks. ${filter.period==='all'?'Includes records without a date.':'Records without a date are excluded.'}</p></section>${!range.valid?'<p role="alert" class="ws-range-error">Enter both dates, with the end on or after the start.</p>':''}${workspaceSection(groups[0])}<div class="ws-priority-tables">${groups.slice(1,4).map(workspaceSection).join('')}</div><section class="ws-mandated-group" aria-labelledby="ws-mandated-title"><h2 id="ws-mandated-title">Mandated calls</h2><div class="ws-day-tables">${groups.slice(4,9).map(workspaceSection).join('')}</div></section>${workspaceSection(groups[9])}</div>`;
};
