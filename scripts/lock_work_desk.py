"""Keep desk geometry pixel-perfect while preserving hand-drawn character motion.

The source sprite sheets redraw the table eight times, causing width/leg/wood
grain to morph even after the v0.5.3 tabletop coordinate alignment. For
stationary working poses, reuse only the table's front rim and legs from a
canonical drawing. The animated face, hands, laptop and body are untouched.
The work setup and cleanup movements are deliberately not frozen.

Run after stabilize_work_frames.py and before VSIX packaging. This is a
build-time Pillow utility; installed companions require no image libraries.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

from stabilize_work_frames import ANIMATIONS, DESK_CLIPS, TRANSITIONS, desk_anchor

FRAME_SIZE = (256, 342)
CANONICAL = ('working', 0)


def table_mask(center_x, top_y):
    """Lock desk front and legs, *not* animated hands or laptop.

    The lower body between desk legs is never replaced. Coordinate offsets
    are relative to the verified tabletop anchor rather than the window.
    """
    x, y = center_x, top_y
    mask = Image.new('L', FRAME_SIZE)
    painter = ImageDraw.Draw(mask)
    painter.polygon(((x - 97, y + 4), (x + 98, y + 4),
                     (x + 98, y + 24), (x - 97, y + 24)), fill=255)
    painter.rectangle((x - 92, y + 19, x - 70, y + 106), fill=255)
    painter.rectangle((x + 70, y + 19, x + 96, y + 106), fill=255)
    return mask


def lock_desks(folder=ANIMATIONS, *, verbose=True):
    """Recompose 36 settled-table poses using one consistent piece of art.

    Repeatable/idempotent: the canonical frame never changes, and the same
    pixels are copied on each run. Bail out if sprite geometry changes instead
    of silently painting the table over somebody's face.
    """
    source_path = folder / CANONICAL[0] / f'{CANONICAL[1]:02}.png'
    with Image.open(source_path) as file:
        reference = file.convert('RGBA')
    if reference.size != FRAME_SIZE:
        raise ValueError(f'Unsupported frame size: {reference.size}')
    anchor = desk_anchor(reference)
    if anchor is None:
        raise ValueError('Canonical work pose does not have a stable desk')
    mask = table_mask(*anchor)
    # Drawn desktop matches only when stabilization has already run.
    entries = [(name, index) for name in DESK_CLIPS for index in range(8)]
    entries.extend(TRANSITIONS)
    changed = 0
    for name, index in entries:
        path = folder / name / f'{index:02}.png'
        with Image.open(path) as file:
            original = file.convert('RGBA')
        if original.size != FRAME_SIZE:
            raise ValueError(f'{path}: unexpected frame size')
        point = desk_anchor(original)
        if point is None or abs(point[0] - anchor[0]) > 5 or abs(point[1] - anchor[1]) > 5:
            raise ValueError(f'{path}: tabletop not aligned, run stabilize_work_frames.py first')
        locked = Image.composite(reference, original, mask)
        if ImageChops.difference(locked, original).getbbox() is None:
            continue
        locked.save(path, optimize=True)
        tk_path = folder / 'tk' / '190' / name / path.name
        if tk_path.exists():
            locked.resize((142, 190), Image.Resampling.LANCZOS).save(tk_path, optimize=True)
        changed += 1
    if verbose:
        print(f'Locked tabletop artwork in {len(entries)} poses; '
              f'{changed} frames changed (canonical {CANONICAL[0]}/00).')
    return changed


if __name__ == '__main__':
    lock_desks()
