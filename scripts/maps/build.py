#!/usr/bin/env python3
"""Builds offline map files for every region in src/constants/map.ts.

Output (in --out): <region>.pmtiles, fonts, sprites, styles and manifest.json.
Upload them to the GitHub release with scripts/maps/publish.sh.

Needs Java 21+ (planetiler) and the pmtiles CLI. Everything else is downloaded into --work.
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLANETILER = 'https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar'
PBF = 'https://download.geofabrik.de/europe/ukraine-latest.osm.pbf'
OFM = 'https://tiles.openfreemap.org'
FONTS = {'regular': 'Noto Sans Regular', 'bold': 'Noto Sans Bold', 'italic': 'Noto Sans Italic'}
# Latin, Latin Extended, combining accents (е́ in OSM names), Cyrillic, punctuation (– — “ ” …), №.
RANGES = ['0-255', '256-511', '512-767', '768-1023', '1024-1279', '8192-8447', '8448-8703']
SPRITES = {'sprite-ofm.json': 'ofm.json', 'sprite-ofm.png': 'ofm.png',
           'sprite-ofm-2x.json': 'ofm@2x.json', 'sprite-ofm-2x.png': 'ofm@2x.png'}
STYLES = {'light': 'positron', 'dark': 'dark'}


def regions():
    source = (ROOT / 'src/constants/map.ts').read_text()
    pattern = re.compile(
        r"\{id: '([\w-]+)', name: '[^']+', sizeMb: \d+, west: ([\d.]+), south: ([\d.]+), east: ([\d.]+), north: ([\d.]+)\}")
    found = [(m[1], *map(float, m.groups()[1:])) for m in pattern.finditer(source)]
    if not found:
        sys.exit('no regions parsed from src/constants/map.ts')
    return found


def fetch(url, target, force=False):
    if target.exists() and not force:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    print(f'↓ {url}')
    request = urllib.request.Request(url, headers={'User-Agent': 'navi-maps-build'})
    with urllib.request.urlopen(request) as response, open(f'{target}.part', 'wb') as out:
        while chunk := response.read(1 << 20):
            out.write(chunk)
    Path(f'{target}.part').rename(target)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        while chunk := handle.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def run(command):
    print('$', ' '.join(map(str, command)))
    subprocess.run(command, check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--java', default='java')
    parser.add_argument('--pmtiles', default='pmtiles')
    parser.add_argument('--memory', default='12g')
    parser.add_argument('--fresh-osm', action='store_true', help='download a new Ukraine extract')
    parser.add_argument('--only', nargs='*', help='region ids to extract')
    parser.add_argument('--data', type=Path, help='folder with <region>.db from region_data.py')
    args = parser.parse_args()
    work, out = args.work.resolve(), args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)

    jar = work / 'tools/planetiler.jar'
    pbf = work / 'data/ukraine-latest.osm.pbf'
    country = work / 'data/ukraine.pmtiles'
    fetch(PLANETILER, jar)
    fetch(PBF, pbf, force=args.fresh_osm)
    if not country.exists() or country.stat().st_mtime < pbf.stat().st_mtime:
        run([args.java, f'-Xmx{args.memory}', '-jar', jar, f'--osm-path={pbf}', '--download',
             f'--download-dir={work / "data/sources"}', f'--tmpdir={work / "tmp"}',
             f'--output={country}', '--maxzoom=14', '--force'])

    manifest = {'version': time.strftime('%Y%m%d'), 'built': int(time.time()), 'maxZoom': 14,
                'regions': {}, 'assets': []}
    wanted = set(args.only or [])
    for region_id, west, south, east, north in regions():
        if wanted and region_id not in wanted:
            continue
        target = out / f'{region_id}.pmtiles'
        run([args.pmtiles, 'extract', country, target, f'--bbox={west},{south},{east},{north}', '--maxzoom=14'])
        entry = {'asset': target.name, 'bytes': target.stat().st_size, 'sha256': sha256(target)}
        database = args.data / f'{region_id}.db' if args.data else None
        if database and database.exists():
            copy = out / database.name
            shutil.copyfile(database, copy)
            entry['data'] = {'asset': copy.name, 'bytes': copy.stat().st_size}
        manifest['regions'][region_id] = entry

    for slug, font in FONTS.items():
        for glyphs in RANGES:
            asset = f'font-{slug}-{glyphs}.pbf'
            fetch(f'{OFM}/fonts/{urllib.request.quote(font)}/{glyphs}.pbf', out / asset, force=True)
            # The local style names fonts without spaces, so file:// glyph URLs need no escaping.
            manifest['assets'].append({'asset': asset, 'path': f'fonts/{font.replace(" ", "-")}/{glyphs}.pbf'})
    for asset, name in SPRITES.items():
        fetch(f'{OFM}/sprites/ofm_f384/{name}', out / asset, force=True)
        manifest['assets'].append({'asset': asset, 'path': f'sprites/{name}'})
    for mode, style in STYLES.items():
        asset = f'style-{mode}.json'
        fetch(f'{OFM}/styles/{style}', out / asset, force=True)
        manifest['assets'].append({'asset': asset, 'path': f'styles/{mode}.json'})
    for item in manifest['assets']:
        item['bytes'] = (out / item['asset']).stat().st_size

    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    total = sum(item['bytes'] for item in manifest['regions'].values()) / 1e6
    print(f'✓ {len(manifest["regions"])} regions, {total:.0f} MB → {out}')


if __name__ == '__main__':
    main()
