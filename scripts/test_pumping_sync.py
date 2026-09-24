import copy
import json
import tempfile
import uuid
from contextlib import contextmanager
import unittest
from pathlib import Path
from datetime import date
from pumping_excel import merge_records, parse_workbook
from pumping_sync import import_source
from sync_public_data import merge_wells

ROOT = Path(__file__).resolve().parents[1]

@contextmanager
def test_directory():
    # Avoid Windows Python's private-mode mkdtemp ACL, incompatible with sandbox tokens.
    path = ROOT / ('.test-pumping-' + uuid.uuid4().hex)
    path.mkdir()
    try:
        yield path
    finally:
        for child in path.iterdir(): child.unlink()
        path.rmdir()


class PumpingTests(unittest.TestCase):
    def record(self):
        return {'waterRightNo': 'B0108729', 'yearMinguo': 115, 'monthlyM3': [1]*7+[None]*5, 'sourceTotalM3': 7}

    def test_august_zero_and_history_preserved(self):
        old = self.record()
        older = {**old, 'yearMinguo': 114}
        new = copy.deepcopy(old)
        new['monthlyM3'][0] = None
        new['monthlyM3'][7] = 0
        new['sourceTotalM3'] = 6
        records, warnings, changes = merge_records([old, older], [new])
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]['monthlyM3'], [1]*7+[0]+[None]*4)
        self.assertEqual(records[0]['sourceTotalM3'], 7)
        self.assertEqual(changes, [{'waterRightNo':'B0108729', 'yearMinguo':115, 'month':8, 'before':None, 'after':0}])
        self.assertTrue(warnings)

    def test_invalid_and_duplicate_rejected(self):
        for value in [-1, float('nan'), 'unknown']:
            r = self.record(); r['monthlyM3'][0] = value
            with self.assertRaises(ValueError): merge_records([], [r])
        r = self.record(); other = copy.deepcopy(r)
        other['monthlyM3'][0] = 2; other['sourceTotalM3'] = 8
        with self.assertRaises(ValueError): merge_records([], [r, other])
        other['sourceTotalM3'] = 99
        with self.assertRaises(ValueError): merge_records([], [other])

    def test_cached_blank_formulas_in_original_workbook(self):
        records = parse_workbook(ROOT/'docs/data/pumping-records/pumping-records-115.xlsx', {'name':'115年地下水水權用水紀錄表'})
        self.assertEqual(len(records), 111)
        row = next(r for r in records if r['waterRightNo']=='B0108729')
        self.assertIsNone(row['monthlyM3'][7])
        self.assertAlmostEqual(row['sourceTotalM3'], 272332.8)

    def test_unchanged_source_downloaded_once(self):
        source = {'id':'fixture', 'name':'pumping.json', 'modifiedTime':'1'}
        calls = []
        def download(_, path):
            calls.append(path); path.write_text(json.dumps([self.record()]))
        with test_directory() as tmp:
            records, _, _, state, parsed = import_source(source, [], {}, download, tmp)
            self.assertTrue(parsed)
            again = import_source(source, records, state, download, tmp)
            self.assertFalse(again[-1]); self.assertEqual(len(calls), 1)
            source['modifiedTime']='2'
            self.assertTrue(import_source(source, records, state, download, tmp)[-1])
            self.assertEqual(len(calls), 2)

    def test_only_selected_well_changes(self):
        old = [{'waterRightNo':'B0108729', 'name':'old'}, {'waterRightNo':'B0108730', 'name':'untouched'}]
        index = [{'wellKey':r['waterRightNo'], 'source':{'井別':'new'}} for r in old]
        result, _ = merge_wells(old, index, date(2026,9,24), 90, {'B0108729'})
        self.assertEqual(next(r for r in result if r['waterRightNo']=='B0108730'), old[1])
        self.assertEqual(next(r for r in result if r['waterRightNo']=='B0108729')['name'], 'new')

if __name__ == '__main__': unittest.main()
