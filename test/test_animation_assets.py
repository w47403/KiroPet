"""Validate the complete imported catalog, transparency, timing and offline package."""
import json
from pathlib import Path
import sys
import unittest
from zipfile import ZipFile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from animation_runtime import frame_at, IdleDirector
MANIFEST = json.loads((ROOT / 'assets/animations/manifest.json').read_text(encoding='utf-8'))


class AnimationAssetsTest(unittest.TestCase):
    def test_complete_upstream_catalog_and_runtime_mapping(self):
        self.assertEqual(len(MANIFEST['catalog']), 95)
        self.assertEqual(len({a['id'] for a in MANIFEST['catalog']}), 95)
        self.assertEqual(MANIFEST['clips']['working']['sourceId'], 'coding')
        self.assertEqual(MANIFEST['clips']['editing']['sourceId'], 'taking_notes')
        self.assertEqual(MANIFEST['clips']['drag']['sourceId'], 'dragged_in_midair')
        for clip in MANIFEST['clips'].values():
            self.assertTrue(all(p.startswith('dsh/') for p in clip['frames']))
            self.assertEqual(len(clip['frames']), len(clip['durations']))
            self.assertTrue(all(t > 0 for t in clip['durations']))
        for action in MANIFEST['catalog']:
            clip = MANIFEST['clips'][action['id']]
            self.assertEqual(len(clip['frames']), action['frameCount'])
            self.assertAlmostEqual(sum(clip['durations']), 1000*action['frameCount']/action['fps'], delta=1)

    def test_every_source_frame_is_packaged_with_tk_variants(self):
        package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
        with ZipFile(ROOT.parent / f"{package['name']}-{package['version']}.vsix") as archive:
            names = set(archive.namelist())
            for relative in {p for c in MANIFEST['clips'].values() for p in c['frames']}:
                for prefix in ('', 'tk/140/', 'tk/190/'):
                    path = 'assets/animations/' + prefix + relative
                    self.assertTrue((ROOT/path).is_file(), path)
                    self.assertIn('extension/' + path, names)
            self.assertIn('extension/THIRD_PARTY_ASSETS.md', names)
            self.assertFalse(any('/tween/' in p or '/registered/' in p for p in names))
            for name in ('WhalePet.ps1','HookSignal.ps1','PetPreferences.ps1','animation_timing.ps1'):
                self.assertTrue(archive.read('extension/scripts/'+name).startswith(b'\xef\xbb\xbf'))

    def test_each_action_has_transparent_start_middle_and_end(self):
        for action in MANIFEST['catalog']:
            clip = MANIFEST['clips'][action['id']]
            for index in (0,len(clip['frames'])//2,len(clip['frames'])-1):
                for prefix, size in (('',(608,342)),('tk/140/',(249,140)),('tk/190/',(338,190))):
                    with Image.open(ROOT/'assets/animations'/prefix/clip['frames'][index]) as raw:
                        frame=raw.convert('RGBA')
                    self.assertEqual(frame.size,size)
                    alpha=frame.getchannel('A')
                    self.assertEqual(alpha.getextrema(),(0,255))
                    self.assertIsNotNone(alpha.getbbox())
                    self.assertEqual(frame.getpixel((0,0))[3],0)

    def test_actions_keep_the_same_character_scale(self):
        self.assertEqual(MANIFEST['sourceFrameSize'], [640,360])
        self.assertEqual(MANIFEST['artSize'], [598,336])
        heights = []
        for name in ('breathing', 'deep_thought', 'shy_surprise',
                     'setting_off_fireworks', 'water_gun_play', 'butterflies_and_blossoms'):
            with Image.open(ROOT/'assets/animations'/MANIFEST['clips'][name]['frames'][0]) as raw:
                # The central body region excludes distant particles and props.
                alpha = raw.convert('RGBA').getchannel('A').crop((190,0,418,342))
                bounds = alpha.point(lambda a: 255 if a>=128 else 0).getbbox()
                heights.append(bounds[3]-bounds[1])
        self.assertLess(max(heights)-min(heights), 20, heights)

    def test_timing_boundaries_and_idle_breathing(self):
        for clip in MANIFEST['clips'].values():
            self.assertEqual(frame_at(clip,clip['durations'][0]-1),0)
            self.assertEqual(frame_at(clip,clip['durations'][0]),1)
            self.assertEqual(frame_at(clip,sum(clip['durations'])),0 if clip['loop'] else len(clip['frames'])-1)
        idle=IdleDirector(MANIFEST,0)
        self.assertEqual(idle.sample(0),('idle',0))
        self.assertGreater(idle.sample(1000)[1],0)
        self.assertNotEqual(idle.sample(22000)[0],'idle')


if __name__ == '__main__':
    unittest.main()
