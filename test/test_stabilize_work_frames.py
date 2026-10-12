"""Synthetic registration tests; do not depend on the original sprite sheets."""
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from stabilize_work_frames import desk_anchor, safe_shift, stabilize_frames, DESK_CLIPS, TRANSITIONS


class DeskStabilizationTest(unittest.TestCase):
    @staticmethod
    def picture(cx=128, top=238):
        img = Image.new('RGBA', (256, 342))
        d = ImageDraw.Draw(img)
        d.ellipse((85, 45, 168, 145), fill=(248, 208, 189, 255))
        d.rectangle((cx-82, top, cx+82, top+17), fill=(210, 145, 87, 255))
        d.rectangle((cx-75, top+18, cx-66, top+85), fill=(192, 121, 68, 255))
        d.rectangle((cx+65, top+18, cx+74, top+85), fill=(192, 121, 68, 255))
        return img

    def test_detects_tabletop_not_face_or_legs(self):
        self.assertEqual(desk_anchor(self.picture(128, 238)), (128, 238))
        self.assertEqual(desk_anchor(self.picture(123, 244)), (123, 244))
        self.assertIsNone(desk_anchor(Image.new('RGBA', (256, 342))))

    def test_safe_translation_keeps_transparency_margin(self):
        self.assertEqual(safe_shift(self.picture(128, 238), 0, -300), (0, -42))
        self.assertEqual(safe_shift(self.picture(128, 238), 50, 0)[0], 42)

    def test_stabilization_and_tk_images_are_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in DESK_CLIPS:
                (root / name).mkdir()
                (root / 'tk' / '190' / name).mkdir(parents=True)
                for index in range(8):
                    cx = 120 + (index % 3) * 4
                    top = 221 + (index % 4) * 2
                    self.picture(cx, top).save(root / name / f'{index:02}.png')
                    self.picture(cx, top).resize((142, 190)).save(root / 'tk' / '190' / name / f'{index:02}.png')
            for name, index in TRANSITIONS:
                (root / name).mkdir()
                self.picture(127, 224).save(root / name / f'{index:02}.png')
            shifts = stabilize_frames(root, verbose=False)
            self.assertTrue(any(dx or dy for _, _, dx, dy, _, _ in shifts))
            anchors = []
            for name in DESK_CLIPS:
                for index in range(8):
                    with Image.open(root / name / f'{index:02}.png') as frame:
                        anchors.append(desk_anchor(frame))
            self.assertLessEqual(max(x for x, y in anchors)-min(x for x, y in anchors), 1)
            self.assertLessEqual(max(y for x, y in anchors)-min(y for x, y in anchors), 1)
            second = stabilize_frames(root, verbose=False)
            self.assertTrue(all(dx == dy == 0 for _, _, dx, dy, _, _ in second))
            with Image.open(root / 'tk' / '190' / 'working' / '07.png') as thumb:
                self.assertEqual(thumb.size, (142, 190))


if __name__ == '__main__':
    unittest.main()
