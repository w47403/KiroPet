"""Furniture-lock regression tests with real frames and synthetic fixtures."""
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from lock_work_desk import CANONICAL, DESK_CLIPS, TRANSITIONS, lock_desks, table_mask
from stabilize_work_frames import desk_anchor

ALL = [(name, i) for name in DESK_CLIPS for i in range(8)] + list(TRANSITIONS)


class LockWorkDeskTest(unittest.TestCase):
    def test_mask_keeps_face_hands_and_lower_body_clear(self):
        mask = table_mask(119, 218)
        self.assertEqual(mask.getpixel((100, 140)), 0)  # face
        self.assertEqual(mask.getpixel((141, 208)), 0)  # keyboard hands
        self.assertEqual(mask.getpixel((120, 290)), 0)  # shoes
        self.assertEqual(mask.getpixel((110, 229)), 255)  # table front
        self.assertEqual(mask.getpixel((37, 290)), 255)  # left leg
        self.assertEqual(mask.getpixel((202, 290)), 255)  # right leg

    def test_all_working_frames_share_one_table_and_keep_faces(self):
        folder = ROOT / 'assets' / 'animations'
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            faces = {}
            for name, index in ALL:
                src = folder / name / f'{index:02}.png'
                target = dest / name / src.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src, target)
                faces[(name, index)] = Image.open(src).convert('RGBA').crop((40, 50, 195, 165)).tobytes()
            changed = lock_desks(dest, verbose=False)
            self.assertGreater(changed, 0)
            ref = Image.open(dest / CANONICAL[0] / '00.png').convert('RGBA')
            mask = table_mask(*desk_anchor(ref))
            for name, index in ALL:
                frame = Image.open(dest / name / f'{index:02}.png').convert('RGBA')
                self.assertEqual(frame.crop((40, 50, 195, 165)).tobytes(), faces[(name, index)])
                self.assertIsNone(ImageChops.difference(
                    Image.composite(ref, frame, mask), frame).getbbox(), (name, index))
            self.assertEqual(lock_desks(dest, verbose=False), 0)


if __name__ == '__main__':
    unittest.main()
