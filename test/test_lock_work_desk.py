"""Furniture-lock regression tests using the packaged sprite drawings."""
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from lock_work_desk import CANONICAL, DESK_CLIPS, TRANSITIONS, lock_desks, table_mask
from stabilize_work_frames import desk_anchor

ALL = [(name, i) for name in DESK_CLIPS for i in range(8)] + list(TRANSITIONS)


class LockWorkDeskTest(unittest.TestCase):
    def test_mask_keeps_face_hands_and_lower_body_clear(self):
        mask = table_mask(119, 218)
        self.assertEqual(mask.getpixel((100, 140)), 0)  # face
        self.assertEqual(mask.getpixel((141, 208)), 0)  # typing hands
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
                with Image.open(src) as image:
                    faces[(name, index)] = image.convert('RGBA').crop(
                        (40, 50, 195, 165)).tobytes()
            # Make a predictable defect even when CI preprocessed all source files.
            broken = dest / 'tool' / '01.png'
            with Image.open(broken) as image:
                frame = image.convert('RGBA')
            frame.putpixel((110, 229), (205, 141, 79, 255))
            frame.save(broken)
            self.assertGreater(lock_desks(dest, verbose=False), 0)

            with Image.open(dest / CANONICAL[0] / '00.png') as image:
                reference = image.convert('RGBA')
            mask = table_mask(*desk_anchor(reference))
            for name, index in ALL:
                with Image.open(dest / name / f'{index:02}.png') as image:
                    frame = image.convert('RGBA')
                self.assertEqual(frame.crop((40, 50, 195, 165)).tobytes(),
                                 faces[(name, index)])
                self.assertEqual(Image.composite(reference, frame, mask).tobytes(),
                                 frame.tobytes(), (name, index))
            self.assertEqual(lock_desks(dest, verbose=False), 0)


if __name__ == '__main__':
    unittest.main()
