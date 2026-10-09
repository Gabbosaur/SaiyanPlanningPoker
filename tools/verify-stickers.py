#!/usr/bin/env python3
"""
Checks processed sticker packs for cut-out problems:
 - leftover background (opaque corners)
 - holes punched through the middle of the artwork
 - oversized files

Usage:
    python3 tools/verify-stickers.py            # every pack
    python3 tools/verify-stickers.py marco      # one pack
"""
import glob
import os
import sys

from PIL import Image

ROOT = os.path.join('public', 'images', 'stickers')
MAX_KB = 200

# Leftover-checkerboard detection.
# A checkerboard is a REGULAR grid: two tones alternating on a fixed period.
# Testing for grey contrast alone gives false positives on ordinary line art
# (black outlines against light fills), so we require evenly spaced transitions
# within the period a 1024px checker square becomes once downscaled to 320px.
CHECK_PERIOD_MIN = 5
CHECK_PERIOD_MAX = 14
CHECK_HIT_LIMIT = 6


def count_checker_rows(im):
    w, h = im.size
    px = im.load()
    hits = 0
    for y in range(0, h, 3):
        edges = []
        prev = None
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 200 or max(r, g, b) - min(r, g, b) > 12:
                prev = None
                continue
            v = (r + g + b) // 3
            if prev is not None and abs(v - prev) > 30:
                edges.append(x)
            prev = v
        for i in range(len(edges) - 2):
            d1 = edges[i + 1] - edges[i]
            d2 = edges[i + 2] - edges[i + 1]
            if (CHECK_PERIOD_MIN <= d1 <= CHECK_PERIOD_MAX
                    and CHECK_PERIOD_MIN <= d2 <= CHECK_PERIOD_MAX
                    and abs(d1 - d2) <= 2):
                hits += 1
    return hits


def check(path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    px = im.getchannel('A').load()

    corners = [px[1, 1], px[w - 2, 1], px[1, h - 2], px[w - 2, h - 2]]

    cx0, cx1, cy0, cy1 = int(w * .3), int(w * .7), int(h * .3), int(h * .7)
    holes = cells = 0
    for y in range(cy0, cy1, 2):
        for x in range(cx0, cx1, 2):
            cells += 1
            if px[x, y] < 40:
                holes += 1
    hole = holes / cells * 100 if cells else 0
    kb = os.path.getsize(path) / 1024

    issues = []
    if max(corners) > 25:
        issues.append('background left in corners')
    if hole > 25:
        issues.append('holes in the artwork')
    if kb > MAX_KB:
        issues.append(f'{kb:.0f}KB is large')

    # Detached checker patches survive the flood fill, so check the whole image
    # rather than relying on the corners alone.
    checker = count_checker_rows(im)
    if checker > CHECK_HIT_LIMIT:
        issues.append(f'leftover checkerboard ({checker} rows) - '
                      f'run tools/clean-sticker-islands.py')

    return w, h, corners, hole, kb, issues


def main():
    packs = sys.argv[1:] or sorted(
        d for d in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, d)))
    total_issues = 0
    for pack in packs:
        files = sorted(glob.glob(os.path.join(ROOT, pack, '*.png')))
        if not files:
            print(f"\n{pack}: (empty)")
            continue
        print(f"\n{pack}  ({len(files)} files)")
        for f in files:
            w, h, corners, hole, kb, issues = check(f)
            total_issues += len(issues)
            status = 'OK  ' if not issues else 'WARN'
            note = ('  ' + '; '.join(issues)) if issues else ''
            print(f"  {status} {os.path.basename(f):18} {w}x{h:<4} {kb:5.0f}KB"
                  f"  hole {hole:3.0f}%{note}")
    print(f"\n{'no issues' if not total_issues else str(total_issues) + ' issue(s)'}")
    return 1 if total_issues else 0


if __name__ == '__main__':
    sys.exit(main())
