"""Import explicit open Zoho RNR tasks; never infer a scheduled day from lead counters."""
import csv,io,zipfile,json,re,hashlib,sys
from pathlib import Path
from datetime import datetime
ROOT=Path(__file__).resolve().parents[1]
def read_zip(p):
 with zipfile.ZipFile(p) as z:
  return list(csv.DictReader(io.TextIOWrapper(z.open(z.namelist()[0]),encoding='utf-8-sig')))
def clean(v): return (v or '').removeprefix('zcrm_')
def dt(v): return v.replace(' ','T')+'+05:30' if v else None
src=Path(sys.argv[1]); export_id=sys.argv[2]; exported_at=sys.argv[3]
rows=read_zip(src)
leadrows={clean(r['Record Id']):r for r in read_zip(Path(sys.argv[4]) if len(sys.argv)>4 else ROOT/'data/imports/leads-all-fields.zip')}
snapshot={r[0]:r for r in json.loads((ROOT/'data/snapshot/leads.json').read_text(encoding='utf-8'))}
out=[];excluded=[]
for r in rows:
 if 'RNR' not in r['Subject']: continue
 match=re.match(r'^RNR Call #(\d+)\s*-',r['Subject'])
 if not match or r['Status'] in ('Completed','Closed','Cancelled'):
  excluded.append(clean(r['Record Id']));continue
 day=int(match.group(1));lead_id=clean(r['Related To.id']);l=leadrows.get(lead_id,{});old=snapshot.get(lead_id,[])
 # Retain task even when its linked lead is newer than the contact snapshot; show no number.
 if not 1<=day<=5: raise ValueError('Task outside RNR Days 1-5')
 due_match=re.search(r'Call after (\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2} [AP]M)',r['Description'])
 due=(datetime.strptime(due_match.group(1),'%d-%b-%Y %I:%M %p').isoformat()+'+05:30') if due_match else dt(r['Reminder']) if r['Reminder'] and r['Reminder'].startswith(r['Due Date']) else r['Due Date']+'T00:00:00+05:30'
 assert due[:10]==r['Due Date'], 'Task description due date differs from task Due Date'
 out.append(dict(id=lead_id,taskId=clean(r['Record Id']),taskSubject=r['Subject'],taskStatus=r['Status'],rnrDay=day,rnrDue=due,dueDate=r['Due Date'],dueHasTime=bool(due_match or r['Reminder']),name=l.get('Lead Name') or r['Related To'],mobile=l.get('Mobile') or (old[3] if old else None),ownerId=clean(r['Task Owner.id']),ownerName=r['Task Owner'],created=dt(l.get('Created Time')) or (old[9] if old else None),source=l.get('Lead Source') or (old[8] if old else None),status=l.get('Lead Status') or (old[15] if old else None),region=l.get('Region') or '(No region)',city=l.get('City'),teams=l.get('Teams') or '(No team)'))
assert len({x['taskId'] for x in out})==len(out)
result=dict(sourceKind='zoho-rnr-tasks',exportedAt=exported_at,exportId=export_id,sourceView='Open Tasks',sourceRecordCount=len(rows),recordCount=len(out),excludedTaskIds=excluded,sha256=hashlib.sha256(src.read_bytes()).hexdigest(),leads=out)
dest=ROOT/'data/snapshot/mandateleads.json'
if not (ROOT/'data/mandateleads-before-tasks.json').exists(): (ROOT/'data/mandateleads-before-tasks.json').write_bytes(dest.read_bytes())
dest.write_text(json.dumps(result,separators=(',',':')),encoding='utf-8')
print(json.dumps({'records':len(out),'days':{str(n):sum(x['rnrDay']==n for x in out) for n in range(1,6)},'excluded':len(excluded)}))
