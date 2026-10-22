import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from preferences import read_preferences, save_preferences, restore_position
from animation_runtime import peek_delay


class PreferencesTest(unittest.TestCase):
    def test_round_trip_and_explicit_size_setting_takes_precedence(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder)/'nested'/'preferences.json'
            save_preferences(str(file), dict(size=260, configuredSize=190, left=-1600, top=120,
                                            mute=True, dockEnabled=False, notifyOnDone=False))
            saved = read_preferences(str(file), 190)
            self.assertEqual((saved['size'], saved['left'], saved['top']), (260, -1600, 120))
            self.assertEqual((saved['mute'], saved['dockEnabled'], saved['notifyOnDone']), (True, False, False))
            self.assertEqual(read_preferences(str(file), 140)['size'], 140)

    def test_small_default_replaces_legacy_configured_size_and_preserves_other_preferences(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder)/'preferences.json'
            self.assertEqual(read_preferences(str(file))['size'], 140)
            for old_size in (190, 260):
                save_preferences(str(file), dict(size=old_size, configuredSize=190, left=110, top=140,
                                                mute=True, dockEnabled=False, notifyOnDone=False))
                saved = read_preferences(str(file))
                self.assertEqual((saved['size'], saved['configuredSize']), (140, 140))
                self.assertEqual((saved['left'], saved['top'], saved['mute'], saved['dockEnabled']),
                                 (110, 140, True, False))
                self.assertEqual(read_preferences(str(file), 230)['size'], 230)
            save_preferences(str(file), dict(size=180, configuredSize=140))
            self.assertEqual(read_preferences(str(file))['size'], 180)

    def test_invalid_preferences_fall_back_and_do_not_accept_truthy_strings(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder)/'preferences.json'
            for value in ('bad json', '[]', '{"version":2}', json.dumps(dict(version=1, size=-10, mute='false', dockEnabled=0, left='NaN', top=1e99))):
                file.write_text(value)
                saved = read_preferences(str(file))
                self.assertEqual(saved['size'], 140)
                self.assertFalse(saved['mute'])
                self.assertTrue(saved['dockEnabled'])
                self.assertNotIn('left', saved)

    def test_restore_clamps_to_negative_monitors_and_recovers_after_monitor_removal(self):
        areas = [(-1920, 0, 0, 1080), (0, 0, 1920, 1040)]
        self.assertEqual(restore_position(-1800, 100, 232, 266, areas), (-1800, 100))
        self.assertEqual(restore_position(-1900, 1050, 232, 266, areas), (-1900, 814))
        self.assertEqual(restore_position(-1800, 100, 232, 266, areas[1:]), (0, 100))
        self.assertEqual(restore_position(1e99, 1e99, 232, 266, areas[1:]), (1688, 774))

    def test_folded_player_sleeps_until_blink_boundaries_and_avoids_fixed_polling(self):
        for elapsed, expected in ((0, 340), (340, 4660), (5000, 230), (5230, 6970), (12200, 230)):
            self.assertEqual(peek_delay(elapsed, 'idle'), expected)
        self.assertEqual(peek_delay(1000, 'sleep'), 60000)
        elapsed, wakes = 340, 0
        while elapsed < 60000:
            elapsed += peek_delay(elapsed, 'idle')
            wakes += 1
        self.assertLess(wakes, 20)


if __name__ == '__main__':
    unittest.main()
