"""Run the former cloud data pipeline locally, then commit via authenticated gh CLI."""
import argparse,base64,json,os,subprocess,sys,time,urllib.request
from pathlib import Path
from datetime import datetime,timezone

def same_json(a,b):return json.loads(a)==json.loads(b)
def publish_tree(api,repo,branch,parent,tree,changes):
    if not changes:return parent
    entries=[]
    for name,content in changes.items():
        blob=api(f'repos/{repo}/git/blobs',{'content':base64.b64encode(content).decode(),'encoding':'base64'})
        entries.append({'path':name,'mode':'100644','type':'blob','sha':blob['sha']})
    new_tree=api(f'repos/{repo}/git/trees',{'base_tree':tree,'tree':entries})
    commit=api(f'repos/{repo}/git/commits',{'message':'Update groundwater data from local PC','tree':new_tree['sha'],'parents':[parent]})
    # Non-force reference update rejects a competing commit; never overwrite it.
    api(f'repos/{repo}/git/refs/heads/{branch}',{'sha':commit['sha'],'force':False},method='PATCH')
    return commit['sha']

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--config',required=True);ap.add_argument('--scope',choices=['all','pumping'],default='all');args=ap.parse_args()
    c=json.loads(Path(args.config).read_text(encoding='utf-8-sig'))
    state=Path(c['stateDirectory']);root=state/'local-sync';root.mkdir(parents=True,exist_ok=True)
    result=state/'local-publish-status.json'
    def status(**data):result.write_text(json.dumps({'at':datetime.now(timezone.utc).isoformat(),**data},ensure_ascii=False,indent=2),encoding='utf-8')
    gh=c.get('githubExecutable','gh');repo=c.get('githubRepository','wushinhuei/groundwater-well-management');branch=c.get('githubBranch','main')
    def api(route,body=None,method=None):
        cmd=[gh,'api',route]
        if body is not None:cmd+=['--method',method or 'POST','--input','-']
        proc=subprocess.run(cmd,input=json.dumps(body).encode() if body is not None else None,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if proc.returncode:raise RuntimeError('GitHub request failed: '+route)
        return json.loads(proc.stdout) if proc.stdout.strip() else {}
    def download(name,ref):
        obj=api(f'repos/{repo}/contents/{name}?ref={ref}')
        return base64.b64decode(obj['content'])
    def execute(cmd,label):
        with (root/'pipeline.log').open('a',encoding='utf-8') as log:
            proc=subprocess.run(cmd,stdout=log,stderr=log,env={**os.environ,'PYTHONUTF8':'1'})
        if proc.returncode:raise RuntimeError(label+' failed; inspect local-sync/pipeline.log')
    try:
        parent=api(f'repos/{repo}/git/ref/heads/{branch}')['object']['sha']
        tree=api(f'repos/{repo}/git/commits/{parent}')['tree']['sha']
        baseline=root/'baseline';baseline.mkdir(exist_ok=True)
        existing={}
        for name in ['docs/data/wells.json','docs/data/pumping-history.json','public/data/wells.json','public/data/pumping-history.json','sync-reports/pumping-sync-index.json']:
            existing[name]=download(name,parent)
            path=baseline/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(existing[name])
        work=root/'indexes';out=root/'public';scripts=Path(__file__).parent
        execute([sys.executable,str(scripts/'groundwater_drive_sync.py'),'--service-account',c['serviceAccountFile'],'--sync-scope',args.scope,'--groundwater-root-folder-id','1TLw8JdrVw_OagddkzZz96effiJ51q3F5','--registry-folder-id','1ZwNZHe0JslvSY62ZAX2BvwPGTPosdz9d','--well-index-folder-id',c['indexFolderId'],'--pumping-index-folder-id',c['indexFolderId'],'--pumping-source-file-id',c['sourceFileId'],'--water-right-folder-id','1KxaouZafEJU6vefcXSQMzPSCnEoc-BDy','--site-wells',str(baseline/'docs/data/wells.json'),'--site-pumping-history',str(baseline/'docs/data/pumping-history.json'),'--pumping-state',str(baseline/'sync-reports/pumping-sync-index.json'),'--work-dir',str(work)],'Drive sync')
        execute([sys.executable,str(scripts/'sync_public_data.py'),'--sync-scope',args.scope,'--well-index',str(work/'well-index.json'),'--site-wells',str(baseline/'docs/data/wells.json'),'--pumping-index',str(work/'pumping-index.json'),'--site-pumping-history',str(baseline/'docs/data/pumping-history.json'),'--out-dir',str(out)],'Local public data build')
        changes={};expected={}
        for name in ['wells.json','pumping-history.json']:
            data=(out/'data'/name).read_bytes();expected[name]=json.loads(data)
            for directory in ['docs','public']:
                dest=f'{directory}/data/{name}'
                if not same_json(existing[dest],data):changes[dest]=data
        idx=work/'pumping-sync-index.json'
        if idx.exists() and not same_json(existing['sync-reports/pumping-sync-index.json'],idx.read_bytes()):changes['sync-reports/pumping-sync-index.json']=idx.read_bytes()
        commit=publish_tree(api,repo,branch,parent,tree,changes)
        status(status='committed-awaiting-pages',commit=commit,changedFiles=list(changes))
        base=c.get('publicSiteUrl','https://wushinhuei.github.io/groundwater-well-management').rstrip('/')
        for attempt in range(6):
            if attempt:time.sleep(30)
            try:
                actual={n:json.load(urllib.request.urlopen(base+'/data/'+n+'?verify='+commit,timeout=30)) for n in expected}
                if actual==expected:
                    status(status='published-verified',commit=commit,changedFiles=list(changes));print('published-verified');return
            except Exception:pass
        raise RuntimeError('PAGES_PENDING: repository is committed but public files are not verified yet; rerun publication')
    except Exception as exc:
        status(status='failed',message=str(exc));raise
if __name__=='__main__':
    try:main()
    except Exception as exc:print(str(exc),file=sys.stderr);sys.exit(1)
