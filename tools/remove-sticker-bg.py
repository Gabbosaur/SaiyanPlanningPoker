#!/usr/bin/env python3
"""
Removes the flattened "transparency checkerboard" background from sticker PNGs
and writes trimmed, web-sized RGBA files.

Why this is needed
------------------
The source art was exported with the editor's transparency checkerboard baked
into the image, so the files are opaque RGB with a grey chequered background.

Approach
--------
1. Identify candidate background pixels: near-greyscale AND close to one of the
   two checkerboard greys.
2. Flood fill from the image border through those candidates. Using a flood fill
   (rather than removing every matching pixel) means grey pixels *inside* the
   subject - hair shading, outlines, clothing - are preserved, because they're
   not reachable from the edge.
3. Feather the mask edge slightly to avoid jagged alpha.
4. Crop to the remaining content, resize to fit a sensible max dimension, and
   save as RGBA PNG.

Usage
-----
    python3 tools/remove-sticker-bg.py <input-dir> [more dirs...]
    python3 tools/remove-sticker-bg.py --all        # every pack under images/stickers

Originals are left untouched; results go to <dir>/processed/ unless --in-place
is given.
"""

import argparse
import os
import re
import shutil
import sys
from collections import Counter, deque

try:
    from PIL import Image, ImageFilter
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")

STICKERS_ROOT = os.path.join('public', 'images', 'stickers')

# How far a pixel's luminance may sit from a checker tone to still count.
LUM_TOLERANCE = 26
# Max channel spread for a pixel to be considered "grey" (kills coloured art).
MAX_SATURATION = 18
# Output sizing. 320px is plenty: stickers render at ~96-140px on screen, and
# this keeps each file well under 100KB.
MAX_SIZE = 320
# Transparent margin kept around the trimmed subject.
PADDING = 8

# Shared naming vocabulary. Source filenames vary wildly between packs (mixed
# languages, generator hashes), so they're normalised onto these names, keeping
# every pack consistent and the catalogue entries predictable.
# First match wins, so order matters: more specific patterns go first.
NAME_PATTERNS = [
    ('victory',   r'victor|vittoria|win'),
    ('thumbsup',  r'thumbs?[_\-]?up|pollice|approval|approv'),
    ('surprised', r'surprise|shock|stupit|sorpres'),
    ('thanks',    r'thank|grazie|pray|bow'),
    ('laugh',     r'laugh|risat|ridere|lol'),
    ('hello',     r'hello|salut|saluto|wave|ciao|greet'),
    ('angry',     r'angry|minaccios|arrabbiat|rage|furious|menacing'),
    ('confident', r'confident|fiducia'),
    ('coolpose',  r'cool|confidence|posa'),
    ('fantasy',   r'fantasy|magic|magia'),
]


def detect_checker_tones(img):
    """
    Infers the checkerboard's two tones from the image border, rather than
    assuming fixed values: different exports use different palettes (one pack
    came with dark greys ~90/140, another with light ones ~205/255).

    Returns a list of luminance values to treat as background.
    """
    w, h = img.size
    px = img.load()
    samples = []
    step_x = max(1, w // 80)
    step_y = max(1, h // 80)
    for x in range(0, w, step_x):
        samples += [px[x, 0], px[x, h - 1]]
    for y in range(0, h, step_y):
        samples += [px[0, y], px[w - 1, y]]

    greys = []
    for r, g, b in [(p[0], p[1], p[2]) for p in samples]:
        if max(r, g, b) - min(r, g, b) <= MAX_SATURATION:
            greys.append(round((r + g + b) / 3))
    if not greys:
        return []

    # Cluster the border greys; a checkerboard yields two dominant tones.
    counts = Counter(greys)
    tones = []
    for lum, _ in counts.most_common():
        if all(abs(lum - t) > LUM_TOLERANCE for t in tones):
            tones.append(lum)
        if len(tones) == 2:
            break
    return tones


def is_background_candidate(px, tones):
    r, g, b = px[0], px[1], px[2]
    if max(r, g, b) - min(r, g, b) > MAX_SATURATION:
        return False
    lum = (r + g + b) / 3
    return any(abs(lum - t) <= LUM_TOLERANCE for t in tones)


def build_alpha(img):
    """Returns an 'L' mask: 0 = background, 255 = keep."""
    w, h = img.size
    px = img.load()

    tones = detect_checker_tones(img)
    if not tones:
        # Nothing grey on the border: assume it's already cut out.
        return Image.new('L', (w, h), 255), tones

    candidate = bytearray(w * h)
    for y in range(h):
        row = y * w
        for x in range(w):
            if is_background_candidate(px[x, y], tones):
                candidate[row + x] = 1

    # Flood fill the candidate region inward from every border pixel.
    background = bytearray(w * h)
    q = deque()

    def push(x, y):
        i = y * w + x
        if candidate[i] and not background[i]:
            background[i] = 1
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        if x > 0:
            push(x - 1, y)
        if x < w - 1:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y < h - 1:
            push(x, y + 1)

    # The flood fill can't reach background that's walled off from the border -
    # a checker square boxed in by the subject, or a stray patch floating in a
    # corner. Those survive as detached opaque islands, which is exactly how the
    # leftover checkerboard showed up. Drop every connected region except the
    # largest one (the subject itself).
    keep = _largest_component(background, w, h)

    mask = Image.new('L', (w, h))
    mask.putdata([255 if k else 0 for k in keep])
    return mask, tones


def _largest_component(background, w, h):
    """
    Labels the connected regions of non-background pixels and keeps only the
    biggest. Returns a bytearray flag per pixel: 1 = keep.
    """
    seen = bytearray(w * h)
    keep = bytearray(w * h)
    best_size = 0
    best_pixels = None

    for start in range(w * h):
        if background[start] or seen[start]:
            continue

        # BFS over this component.
        component = []
        seen[start] = 1
        q = deque([start])
        while q:
            i = q.popleft()
            component.append(i)
            x, y = i % w, i // w
            if x > 0:
                j = i - 1
                if not background[j] and not seen[j]:
                    seen[j] = 1
                    q.append(j)
            if x < w - 1:
                j = i + 1
                if not background[j] and not seen[j]:
                    seen[j] = 1
                    q.append(j)
            if y > 0:
                j = i - w
                if not background[j] and not seen[j]:
                    seen[j] = 1
                    q.append(j)
            if y < h - 1:
                j = i + w
                if not background[j] and not seen[j]:
                    seen[j] = 1
                    q.append(j)

        if len(component) > best_size:
            best_size = len(component)
            best_pixels = component

    if best_pixels:
        for i in best_pixels:
            keep[i] = 1
    return keep


def process(path, out_dir, in_place=False):
    img = Image.open(path).convert('RGB')
    mask, tones = build_alpha(img)

    # Soften the cut so edges aren't aliased, then harden the midpoint back up
    # to keep the silhouette crisp.
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    mask = mask.point(lambda v: 0 if v < 110 else (255 if v > 170 else int((v - 110) * 255 / 60)))

    rgba = img.convert('RGBA')
    rgba.putalpha(mask)

    bbox = mask.getbbox()
    if bbox:
        l, t, r, b = bbox
        l = max(0, l - PADDING)
        t = max(0, t - PADDING)
        r = min(rgba.width, r + PADDING)
        b = min(rgba.height, b + PADDING)
        rgba = rgba.crop((l, t, r, b))

    rgba.thumbnail((MAX_SIZE, MAX_SIZE), Image.LANCZOS)

    name = os.path.basename(path)
    if in_place:
        target = path
    else:
        os.makedirs(out_dir, exist_ok=True)
        target = os.path.join(out_dir, name)

    rgba.save(target, 'PNG', optimize=True)

    opaque = sum(1 for a in rgba.getchannel('A').getdata() if a > 10)
    total = rgba.width * rgba.height
    return target, rgba.size, (opaque / total if total else 0), tones


def derive_name(basename, taken):
    """
    Maps a source filename onto the shared vocabulary. Unrecognised files get a
    numbered `pose-N` name, and collisions are suffixed rather than silently
    overwriting an existing file.
    """
    low = basename.lower()
    name = None
    for candidate, pattern in NAME_PATTERNS:
        if re.search(pattern, low):
            name = candidate
            break

    if name is None:
        i = 1
        while f'pose-{i}' in taken:
            i += 1
        name = f'pose-{i}'

    if name in taken:
        i = 2
        while f'{name}-{i}' in taken:
            i += 1
        name = f'{name}-{i}'

    taken.add(name)
    return name


def finalise(pack_dir):
    """
    Replaces the opaque originals with the processed transparent versions and
    renames them onto the shared vocabulary. Run after processing a pack.
    """
    processed = os.path.join(pack_dir, 'processed')
    if not os.path.isdir(processed):
        print(f"  nothing to finalise (no {processed})")
        return []

    for f in os.listdir(pack_dir):
        if f.lower().endswith('.png'):
            os.remove(os.path.join(pack_dir, f))

    taken = set()
    renames = []
    for src in sorted(os.listdir(processed)):
        if not src.lower().endswith('.png'):
            continue
        name = derive_name(src, taken)
        shutil.move(os.path.join(processed, src), os.path.join(pack_dir, f'{name}.png'))
        renames.append((src, name))

    try:
        os.rmdir(processed)
    except OSError:
        pass
    return renames


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dirs', nargs='*', help='directories of sticker PNGs')
    ap.add_argument('--all', action='store_true', help='process every pack under images/stickers')
    ap.add_argument('--in-place', action='store_true', help='overwrite the originals')
    ap.add_argument('--finalise', action='store_true',
                    help='replace originals with the processed files and rename them')
    args = ap.parse_args()

    dirs = list(args.dirs)
    if args.all:
        if not os.path.isdir(STICKERS_ROOT):
            sys.exit(f"{STICKERS_ROOT} not found (run from the project root)")
        dirs += [os.path.join(STICKERS_ROOT, d) for d in sorted(os.listdir(STICKERS_ROOT))
                 if os.path.isdir(os.path.join(STICKERS_ROOT, d))]
    if not dirs:
        ap.error('give at least one directory, or --all')

    for d in dirs:
        files = [os.path.join(d, f) for f in sorted(os.listdir(d))
                 if f.lower().endswith('.png') and os.path.isfile(os.path.join(d, f))]
        if not files:
            continue
        print(f"\n{d}  ({len(files)} files)")
        for f in files:
            target, size, ratio, tones = process(f, os.path.join(d, 'processed'), args.in_place)
            warn = '  <-- nothing removed, check the source' if ratio > 0.95 else ''
            print(f"  {os.path.basename(f)[:40]:42} -> {size[0]}x{size[1]}  "
                  f"subject {ratio*100:3.0f}%  tones {tones}{warn}")

        if args.finalise and not args.in_place:
            print("  finalising:")
            for src, name in finalise(d):
                print(f"    {src[:46]:48} -> {name}.png")


if __name__ == '__main__':
    main()
