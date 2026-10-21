"""D: is authoritative. Mirror verified files to Drive before the publisher reads them."""
import hashlib,json,shutil
from pathlib import Path
from groundwater_drive_sync import parse_source_date,classify_excel,write_json,drive_service
from pumping_excel import merge_records

def select_registry(root):
    candidates=[f for f in Path(root).glob('*.xlsx') if '抽水井一覽' in f.name and not f.name.startswith('~$')]
    if not candidates:raise ValueError('No local well registry Excel found')
    return max(candidates,key=lambda f:(parse_source_date(f.name) or '0000-00-00',f.stat().st_mtime_ns,f.name))
def source_paths(config):
    root=Path(config.get('dataRoot','D:/地下水井管理系統'))
    registry=Path(config['registryPath']) if config.get('registryPath') else select_registry(root)
    pumping=Path(config.get('pumpingSourcePath',str(root/'抽水紀錄'/'pumping-history.json')))
    return root,registry,pumping

def validate_sources(config):
    root,registry,pumping=source_paths(config)
    if not pumping.is_file():raise ValueError('Local pumping history missing; explicit first-time migration required')
    payload=json.loads(pumping.read_text(encoding='utf-8-sig'));records=payload.get('records')
    if not records:raise ValueError('Local pumping history is empty')
    merge_records([],records)
    wells,stations,warnings=classify_excel(registry)
    if not wells:raise ValueError('Local registry is empty')
    index=root/'系統索引';index.mkdir(exist_ok=True)
    write_json(index/'well-index.json',wells)
    return root,registry,pumping

def mirror_file(service,local,file_id):
    from googleapiclient.http import MediaFileUpload
    before=hashlib.md5(local.read_bytes()).hexdigest()
    meta=service.files().get(fileId=file_id,fields='id,md5Checksum,version').execute()
    changed=meta.get('md5Checksum')!=before
    if changed:
        service.files().update(fileId=file_id,media_body=MediaFileUpload(str(local),resumable=False),fields='id').execute()
    after=service.files().get(fileId=file_id,fields='id,md5Checksum,version').execute()
    if after.get('md5Checksum')!=before or hashlib.md5(local.read_bytes()).hexdigest()!=before:
        raise RuntimeError('Drive mirror verification failed: '+local.name)
    return {'id':file_id,'md5Checksum':before,'version':after.get('version'),'changed':changed}

def mirror_sources(config):
    root,registry,pumping=validate_sources(config)
    service=drive_service(Path(config['serviceAccountFile']))
    registry_id=config.get('registryBackupFileId')
    if not registry_id:raise ValueError('Configure registryBackupFileId before publishing')
    results={'registry':mirror_file(service,registry,registry_id),'pumping':mirror_file(service,pumping,config['sourceFileId'])}
    write_json(root/'系統索引'/'drive-mirror-status.json',results)
    return results

def verify_mirror(config,mirrored):
    service=drive_service(Path(config['serviceAccountFile']))
    for r in mirrored.values():
        current=service.files().get(fileId=r['id'],fields='md5Checksum,version').execute()
        if current.get('md5Checksum')!=r['md5Checksum'] or current.get('version')!=r['version']:
            raise RuntimeError('Drive mirror changed during build; publication stopped')
    _,registry,pumping=source_paths(config)
    for name,file in [('registry',registry),('pumping',pumping)]:
        if hashlib.md5(file.read_bytes()).hexdigest()!=mirrored[name]['md5Checksum']:raise RuntimeError('Local source changed during build')
