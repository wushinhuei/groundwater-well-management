import sys,unittest
from pathlib import Path
from unittest.mock import patch,Mock
sys.path.insert(0,str(Path(__file__).parent/'local-sync'))
from local_sources import select_registry,validate_sources
class LocalSourceTests(unittest.TestCase):
 def test_newest_filename_date_wins(self):
  a=Mock();a.name='1150801-抽水井一覽表.xlsx';a.stat.return_value.st_mtime_ns=999
  b=Mock();b.name='1150901-抽水井一覽表.xlsx';b.stat.return_value.st_mtime_ns=1
  with patch.object(Path,'glob',return_value=[a,b]):self.assertIs(select_registry('unused'),b)
 def test_no_automatic_cloud_fallback(self):
  with patch.object(Path,'is_file',return_value=False):
   with self.assertRaisesRegex(ValueError,'migration required'):validate_sources({'dataRoot':'unused','registryPath':'unused/registry.xlsx'})
if __name__=='__main__':unittest.main()
