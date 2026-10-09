#!/usr/bin/env python3
"""
Removes detached opaque islands from already-processed sticker PNGs.

Why this exists
---------------
remove-sticker-bg.py flood fills the background inward from the image border.
Background that is walled off from the border - a checker square enclosed by the
subject, or a stray patch in a corner - is unreachable, so it survives as a
detached opaque island. Visually that's the leftover checkerboard.

This pass works on the finished RGBA files: it keeps the largest connected
opaque region (the subject) and clears everything else, then re-trims.

Usage
-----
    python3 tools/clean-sticker-islands.py luigi
    python3 tools/clean-sticker-islands.py            # every pack
"""
import glob
import os
import sys
from collections import deque

from PIL import Image

ROOT = os.path.join('public', 'images', 'stickers')
# Alpha above this counts as "part of the artwork".
ALPHA_THRESHOLD = 40
PADDING = 6


def largest_region(alpha, w, h):
    """Keeps only the biggest connected run of opaque pixels."""
    opaque = bytearray(1 if a > ALPHA_THRESHOLD else 0 for a in alpha)
    seen = bytearray(w * h)
    best = []

    for start in range(w * h):
        if not opaque[start] or seen[start]:
            continue
        comp = []
        seen[start] = 1
        q = deque([start])
        while q:
            i = q.popleft()
            comp.append(i)
            x, y = i % w, i // w
            for j, ok in ((i - 1, x > 0), (i + 1, x < w - 1),
                          (i - w, y > 0), (i + w, y < h - 1)):
                if ok and opaque[j] and not seen[j]:
                    seen[j] = 1
                    q.append(j)
        if len(comp) > len(best):
            best = comp

    keep = bytearray(w * h)
    for i in best:
        keep[i] = 1
    return keep, len(best)


def process(path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    alpha = list(im.getchannel('A').getdata())

    keep, kept = largest_region(alpha, w, h)
    before = sum(1 for a in alpha if a > ALPHA_THRESHOLD)
    removed = before - kept

    if removed <= 0:
        return 0, im.size

    new_alpha = [alpha[i] if keep[i] else 0 for i in range(w * h)]
    a = Image.new('L', (w, h))
    a.putdata(new_alpha)
    im.putalpha(a)

    bbox = a.getbbox()
    if bbox:
        l, t, r, b = bbox
        im = im.crop((max(0, l - PADDING), max(0, t - PADDING),
                      min(w, r + PADDING), min(h, b + PADDING)))

    im.save(path, 'PNG', optimize=True)
    return removed, im.size


def main():
    packs = sys.argv[1:] or sorted(
        d for d in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, d)))
    for pack in packs:
        files = sorted(glob.glob(os.path.join(ROOT, pack, '*.png')))
        if not files:
            continue
        print(f"\n{pack}")
        for f in files:
            removed, size = process(f)
            note = f"removed {removed} stray px -> {size[0]}x{size[1]}" if removed else 'clean'
            print(f"  {os.path.basename(f):16} {note}")


if __name__ == '__main__':
    main()
