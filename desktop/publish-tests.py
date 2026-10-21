import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('publisher',Path(__file__).parent/'local-sync'/'publish.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PublishingTests(unittest.TestCase):
 def test_no_change_does_not_commit(self):
  def api(*args,**kw):self.fail('API must not be called')
  self.assertEqual(m.publish_tree(api,'owner/repo','main','old','tree',{}),'old')
 def test_atomic_commit_uses_parent_and_nonforce_ref(self):
  calls=[]
  def api(route,body,method=None):
   calls.append((route,body,method));return {'sha':'new'}
  self.assertEqual(m.publish_tree(api,'owner/repo','main','old','tree',{'docs/a.json':b'{}','public/a.json':b'{}'}),'new')
  self.assertEqual(len([c for c in calls if c[0].endswith('/git/commits')]),1)
  self.assertEqual(calls[-2][1]['parents'],['old']);self.assertFalse(calls[-1][1]['force']);self.assertEqual(calls[-1][2],'PATCH')
 def test_competing_commit_error_is_not_forced(self):
  calls=[]
  def api(route,body,method=None):
   calls.append(body)
   if method=='PATCH':raise RuntimeError('conflict')
   return {'sha':'new'}
  with self.assertRaises(RuntimeError):m.publish_tree(api,'r/p','main','old','tree',{'a':b'1'})
  self.assertFalse(calls[-1]['force'])
 def test_json_format_only_is_unchanged(self):self.assertTrue(m.same_json(b'{"a":1}',b'{ "a": 1 }'))
if __name__=='__main__':unittest.main()
