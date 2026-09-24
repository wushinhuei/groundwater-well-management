"""Incremental source import shared by the Drive sync command and tests."""
import json
from datetime import datetime, timezone
from pathlib import Path
from pumping_excel import parse_workbook, merge_records


def import_source(source, previous, old_state, download, work_dir):
    work_dir = Path(work_dir)
    signature = {k: source.get(k, '') for k in ('id', 'name', 'modifiedTime', 'size', 'md5Checksum')}
    if old_state.get('source') == signature and previous:
        return previous, [], [], old_state, False
    suffix = '.json' if source.get('name', '').lower().endswith('.json') else '.xlsx'
    if source.get('name', '').lower().endswith('.xls'):
        raise ValueError('Legacy .xls is unsupported; save the source as .xlsx before importing')
    target = work_dir / ('source-pumping' + suffix)
    download(source, target)
    if suffix == '.json':
        incoming = json.loads(target.read_text(encoding='utf-8-sig'))
        incoming = incoming.get('records', []) if isinstance(incoming, dict) else incoming
    else:
        incoming = parse_workbook(target, signature)
    if not incoming:
        raise ValueError('Pumping source contains no records; existing data preserved')
    records, warnings, changes = merge_records(previous, incoming)
    state = {'schemaVersion': 1, 'source': signature, 'lastSyncedAt': datetime.now(timezone.utc).isoformat(), 'recordCount': len(records)}
    return records, warnings, changes, state, True


def write_outputs(work_dir, records, warnings, changes, state, parsed):
    work_dir = Path(work_dir)
    def write(name, value):
        (work_dir / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write('pumping-index.json', records)
    write('pumping-month-index.json', [
        {'monthlyKey': f"{r['waterRightNo']}:{r['yearMinguo']}:{i+1:02}", 'waterRightNo': r['waterRightNo'], 'yearMinguo': r['yearMinguo'], 'month': i+1, 'm3': v}
        for r in records for i, v in enumerate(r['monthlyM3'])
    ])
    write('pumping-sync-index.json', state)
    write('pumping-warnings.json', warnings)
    write('pumping-changes.json', changes)
    current_year = datetime.now(timezone.utc).year - 1911
    current = [r for r in records if r['yearMinguo'] == current_year]
    coverage = {str(m): sum(r['monthlyM3'][m-1] is not None for r in current) for m in range(1, 13)}
    summary = {'records': len(records), 'monthlyRecords': len(records)*12, 'warnings': len(warnings), 'parsed': parsed, 'changedMonths': len(changes), 'yearMinguo': current_year, 'reportedWellsByMonth': coverage}
    write('pumping-sync-summary.json', summary)
    (work_dir / 'pumping-sync-summary.md').write_text('# Pumping sync\n\n' + '\n'.join(f'- {k}: {json.dumps(v, ensure_ascii=False)}' for k, v in summary.items()) + '\n', encoding='utf-8')
    return summary
