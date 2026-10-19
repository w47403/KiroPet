"""Validate alpha, distinct artwork, packaging and Python timing."""
import hashlib
import json
from pathlib import Path
import sys
import unittest
from zipfile import ZipFile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from animation_runtime import frame_at
from lock_work_desk import table_mask
from stabilize_work_frames import desk_anchor
MANIFEST = json.loads((ROOT / 'assets/animations/manifest.json').read_text(encoding='utf-8'))


class AnimationAssetsTest(unittest.TestCase):
    def test_new_work_drawings_keep_the_same_desk(self):
        folder=ROOT/'assets/animations'
        reference=Image.open(folder/'working/00.png').convert('RGBA')
        mask=table_mask(*desk_anchor(reference))
        for index in range(8):
            with Image.open(folder/'work_bridge'/f'{index:02}.png') as image:
                frame=image.convert('RGBA')
                self.assertEqual(Image.composite(reference,frame,mask).tobytes(),frame.tobytes())

    def test_idle_scenes_have_explicit_entry_exit_and_shared_standing_pose(self):
        for name in ('sit','nap','stretch','rice_full'):
            clip=MANIFEST['clips'][name]
            self.assertEqual(clip['frames'][0],'sit_down/00.png')
            self.assertEqual(clip['frames'][-1],'idle/00.png')
            self.assertFalse(clip['loop'])
        self.assertIn('lie_down/07.png',MANIFEST['clips']['nap']['frames'])

    def test_rgba_frames_are_complete_and_distinct(self):
        for name, clip in MANIFEST['clips'].items():
            hashes = set()
            for relative in clip['frames']:
                image = Image.open(ROOT / 'assets/animations' / relative)
                self.assertEqual(image.mode, 'RGBA')
                self.assertEqual(image.size, (256, 342))
                alpha = image.getchannel('A')
                self.assertEqual(alpha.getextrema()[0], 0)
                self.assertGreater(alpha.getextrema()[1], 240)
                bounds = alpha.getbbox()
                self.assertIsNotNone(bounds)
                self.assertGreaterEqual(bounds[0], 3)
                self.assertGreaterEqual(bounds[1], 3)
                self.assertLessEqual(bounds[2], 253)
                self.assertLessEqual(bounds[3], 339)
                hashes.add(hashlib.sha256(image.tobytes()).hexdigest())
            self.assertEqual(len(hashes),len(set(clip['frames'])),name)
            self.assertEqual(len(clip['frames']),len(clip['durations']))

    def test_timing_boundaries_match_js(self):
        for clip in MANIFEST['clips'].values():
            self.assertEqual(frame_at(clip, clip['durations'][0] - 1), 0)
            self.assertEqual(frame_at(clip, clip['durations'][0]), 1)
            self.assertEqual(frame_at(clip, sum(clip['durations'])), 0 if clip['loop'] else len(clip['frames'])-1)

    def test_vsix_contains_all_runtime_assets(self):
        package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
        with ZipFile(ROOT.parent / f"{package['name']}-{package['version']}.vsix") as archive:
            names = set(archive.namelist())
            for clip in MANIFEST['clips'].values():
                for relative in clip['frames']:
                    self.assertIn('extension/assets/animations/' + relative, names)
                    self.assertIn('extension/assets/animations/tk/190/' + relative, names)
            self.assertIn('extension/src/animation-player.js', names)
            self.assertIn('extension/scripts/animation_runtime.py', names)
            self.assertIn('extension/assets/animations/manifest.json', names)
            self.assertFalse(any('/source/' in name for name in names))
            for name in ('WhalePet.ps1', 'HookSignal.ps1'):
                self.assertTrue(archive.read('extension/scripts/' + name).startswith(b'\xef\xbb\xbf'))


if __name__ == '__main__':
    unittest.main()
