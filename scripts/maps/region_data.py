#!/usr/bin/env python3
"""Addresses and the road graph of every region as one SQLite file: <region>.db.

One pass over the Ukraine extract collects addresses, entrances, address interpolation and
drivable roads. Roads are split at junctions (OSM nodes shared by two ways), so the app joins
streets by node id. Then each region bbox gets its own database.

Run with the venv from scripts/maps/README.md (needs `osmium`):
  venv/bin/python scripts/maps/region_data.py --pbf ukraine.osm.pbf --out out [--only kyiv]
"""
import argparse
import json
import math
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

import osmium

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import regions  # noqa: E402

SCHEMA_VERSION = 1
CELL = 0.02  # degrees, shared with src/services/maps/regionData.ts
ROADS = {
    'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary',
    'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service',
}
MAIN = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary',
        'secondary_link', 'tertiary', 'tertiary_link'}
MAX_INTERPOLATION_SPAN = 500
ENTRANCE_REACH_M = 42
NEAREST_STREET_M = 100


class StreetRelations(osmium.SimpleHandler):
    """First pass: houses tied to a street by an associatedStreet or street relation."""

    def __init__(self):
        super().__init__()
        self.street_of = {}  # ('n'|'w', id) -> street name
        self.street_ways = defaultdict(list)  # relation without name: street member way ids

    def relation(self, r):
        if r.tags.get('type') not in ('associatedStreet', 'street'):
            return
        name = r.tags.get('name') or r.tags.get('addr:street')
        houses = [(m.type, m.ref) for m in r.members if m.role in ('house', 'address', 'addr')]
        if not houses or not name:
            return
        for kind, ref in houses:
            self.street_of.setdefault((kind, ref), name)


def cell_of(lat, lon):
    return (math.floor(lat / CELL) + 5000) * 100000 + (math.floor(lon / CELL) + 20000)


def meters(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    d_lat, d_lon = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lon / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(a))


def maxspeed(value):
    if not value:
        return None
    text = value.strip()
    if re.fullmatch(r'UA:urban', text, re.I):
        return 50
    if re.fullmatch(r'UA:rural', text, re.I):
        return 90
    if re.fullmatch(r'UA:motorway', text, re.I):
        return 130
    match = re.search(r'(\d{2,3})', text)
    if not match:
        return None
    kmh = int(match.group(1))
    if 'mph' in text.lower():
        kmh = round(kmh * 1.609)
    return kmh if 0 < kmh < 200 else None


def simplify(points, tolerance_m=2.5):
    """Douglas–Peucker on (lon, lat). Ends always stay."""
    if len(points) <= 2:
        return points
    lat0 = math.radians(points[0][1])
    scale_x = 111_320 * math.cos(lat0)
    scale_y = 110_540

    def offset(p, a, b):
        ax, ay = a[0] * scale_x, a[1] * scale_y
        bx, by = b[0] * scale_x, b[1] * scale_y
        px, py = p[0] * scale_x, p[1] * scale_y
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        worst, index = 0.0, -1
        for i in range(start + 1, end):
            gap = offset(points[i], points[start], points[end])
            if gap > worst:
                worst, index = gap, i
        if index >= 0 and worst > tolerance_m:
            keep[index] = True
            stack.append((start, index))
            stack.append((index, end))
    return [p for p, k in zip(points, keep) if k]


class Collector(osmium.SimpleHandler):
    def __init__(self, street_of):
        super().__init__()
        self.street_of = street_of
        self.streetless = []      # (house, city, lat, lon) — street from the nearest named road later
        self.houses = []          # (street, house, city, lat, lon, entrance)
        self.named = []           # (street, lat, lon) — street-only search targets
        self.loose_entrances = []  # (lat, lon, label)
        self.interpolations = []  # (mode, [(lat, lon, tags)], way tags)
        self.ways = []            # (id, tags dict, [(node id, lon, lat)])
        self.uses = defaultdict(int)
        self.numbered_nodes = {}  # node id -> (lat, lon, tags) for interpolation ends

    def node(self, n):
        tags = n.tags
        if not n.location.valid():
            return
        lat, lon = n.location.lat, n.location.lon
        if 'addr:housenumber' in tags:
            self.numbered_nodes[n.id] = (lat, lon, dict(tags))
        entrance = tags.get('entrance')
        street = tags.get('addr:street') or tags.get('addr:place') or self.street_of.get(('n', n.id))
        house = tags.get('addr:housenumber') or (tags.get('ref') or tags.get('addr:unit') if entrance else None)
        if not street and tags.get('addr:housenumber'):
            self.streetless.append((tags['addr:housenumber'], tags.get('addr:city', ''), lat, lon))
        elif street and house:
            label = entrance and (entrance if entrance != 'yes' else tags.get('ref') or 'yes')
            self.houses.append((street, house, tags.get('addr:city', ''), lat, lon, label or ''))
        elif entrance:
            self.loose_entrances.append((lat, lon, tags.get('ref') or entrance))

    def way(self, w):
        tags = w.tags
        if 'addr:interpolation' in tags:
            chain = [(nd.ref, nd.lat, nd.lon) for nd in w.nodes if nd.location.valid()]
            self.interpolations.append((tags['addr:interpolation'], chain, dict(tags)))
            return
        street = tags.get('addr:street') or tags.get('addr:place') or self.street_of.get(('w', w.id))
        house = tags.get('addr:housenumber')
        if house:
            points = [(nd.lat, nd.lon) for nd in w.nodes if nd.location.valid()]
            if points:
                lat = sum(p[0] for p in points) / len(points)
                lon = sum(p[1] for p in points) / len(points)
                if street:
                    self.houses.append((street, house, tags.get('addr:city', ''), lat, lon, ''))
                else:
                    self.streetless.append((house, tags.get('addr:city', ''), lat, lon))
        highway = tags.get('highway')
        if highway not in ROADS:
            return
        if tags.get('access') == 'no' or tags.get('motor_vehicle') == 'no' or tags.get('motorcar') == 'no':
            return
        if highway == 'service' and tags.get('service') in ('parking_aisle', 'drive-through', 'emergency_access'):
            return
        nodes = [(nd.ref, nd.lon, nd.lat) for nd in w.nodes if nd.location.valid()]
        if len(nodes) < 2:
            return
        for ref in {node[0] for node in nodes}:
            self.uses[ref] += 1
        keep = {k: tags[k] for k in ('name', 'highway', 'oneway', 'junction', 'maxspeed') if k in tags}
        self.ways.append((w.id, keep, nodes))
        if keep.get('name'):
            mid = nodes[len(nodes) // 2]
            self.named.append((keep['name'], mid[2], mid[1]))


def interpolate(collector):
    created = []
    for mode, chain, way_tags in collector.interpolations:
        numbered = []
        for index, (ref, lat, lon) in enumerate(chain):
            node = collector.numbered_nodes.get(ref)
            if not node:
                continue
            try:
                value = int(node[2].get('addr:housenumber', ''))
            except ValueError:
                continue
            numbered.append((value, lat, lon, node[2]))
        for (v1, lat1, lon1, t1), (v2, lat2, lon2, _) in zip(numbered, numbered[1:]):
            if abs(v2 - v1) > MAX_INTERPOLATION_SPAN or v1 == v2:
                continue
            step = 2 if mode in ('odd', 'even') else 1
            direction = 1 if v2 > v1 else -1
            number = v1
            if mode == 'even' and abs(number) % 2 == 1:
                number += direction
            if mode == 'odd' and abs(number) % 2 == 0:
                number += direction
            street = t1.get('addr:street') or way_tags.get('addr:street')
            city = t1.get('addr:city') or way_tags.get('addr:city', '')
            while street and (number <= v2 if direction > 0 else number >= v2):
                if number not in (v1, v2):
                    ratio = (number - v1) / (v2 - v1)
                    created.append((street, str(number), city, lat1 + (lat2 - lat1) * ratio,
                                    lon1 + (lon2 - lon1) * ratio, ''))
                number += step * direction
    return created


def nearest_streets(collector):
    """Houses with a number but no street take the nearest named road within 100 m."""
    size = 0.002
    grid = defaultdict(list)
    for _, tags, nodes in collector.ways:
        name = tags.get('name')
        if not name:
            continue
        for (_, lon1, lat1), (_, lon2, lat2) in zip(nodes, nodes[1:]):
            for cell in {(math.floor(lat1 / size), math.floor(lon1 / size)), (math.floor(lat2 / size), math.floor(lon2 / size))}:
                grid[cell].append((name, lat1, lon1, lat2, lon2))
    found = []
    for house, city, lat, lon in collector.streetless:
        scale = math.cos(math.radians(lat))
        best, best_m = None, NEAREST_STREET_M
        cy, cx = math.floor(lat / size), math.floor(lon / size)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for name, lat1, lon1, lat2, lon2 in grid.get((cy + dy, cx + dx), ()):
                    ax, ay = lon1 * scale, lat1
                    bx, by = lon2 * scale, lat2
                    px, py = lon * scale, lat
                    vx, vy = bx - ax, by - ay
                    t = 0 if vx == 0 and vy == 0 else max(0, min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)))
                    away = math.hypot(px - (ax + t * vx), py - (ay + t * vy)) * 111_195
                    if away < best_m:
                        best, best_m = name, away
        if best:
            found.append((best, house, city, lat, lon, ''))
    return found


def attach_entrances(houses, entrances):
    numbered = [h for h in houses if h[1] and not h[5]]
    grid = defaultdict(list)
    size = 0.0004
    for house in numbered:
        grid[(math.floor(house[3] / size), math.floor(house[4] / size))].append(house)
    extra = []
    for lat, lon, label in entrances:
        best, best_m = None, ENTRANCE_REACH_M
        cy, cx = math.floor(lat / size), math.floor(lon / size)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for house in grid.get((cy + dy, cx + dx), ()):
                    away = meters(lat, lon, house[3], house[4])
                    if away < best_m:
                        best, best_m = house, away
        if best:
            extra.append((best[0], best[1], best[2], lat, lon, label or 'yes'))
    return extra


def road_edges(collector):
    """Ways split at junctions. Yields (key, a, b, name, highway, oneway, maxspeed, coords)."""
    for way_id, tags, nodes in collector.ways:
        if tags.get('oneway') == '-1':
            nodes = list(reversed(nodes))
        oneway = tags.get('oneway') in ('yes', '1', '-1') or tags.get('junction') == 'roundabout'
        speed = maxspeed(tags.get('maxspeed'))
        start = 0
        part = 0
        for index in range(1, len(nodes)):
            last = index == len(nodes) - 1
            if not last and collector.uses[nodes[index][0]] < 2:
                continue
            piece = nodes[start:index + 1]
            coords = simplify([(lon, lat) for _, lon, lat in piece])
            part += 1
            yield (f'w{way_id}:{part}', f'n{piece[0][0]}', f'n{piece[-1][0]}', tags.get('name', ''),
                   tags['highway'], 1 if oneway else 0, speed, coords)
            start = index


def inside(lat, lon, box):
    _, west, south, east, north = box
    return west <= lon <= east and south <= lat <= north


def write_region(path, box, houses, named, edges, version):
    if path.exists():
        path.unlink()
    db = sqlite3.connect(path)
    db.executescript('''
      PRAGMA journal_mode = OFF;
      PRAGMA page_size = 4096;
      CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE streets(id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL, lat REAL, lon REAL);
      CREATE TABLE houses(street INTEGER NOT NULL, house TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
                          entrance TEXT, cell INTEGER NOT NULL);
      CREATE TABLE edges(id INTEGER PRIMARY KEY, key TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, name TEXT,
                         highway TEXT NOT NULL, oneway INTEGER NOT NULL, maxspeed INTEGER, coords TEXT NOT NULL);
      CREATE TABLE edge_cells(cell INTEGER NOT NULL, main INTEGER NOT NULL, edge INTEGER NOT NULL,
                              PRIMARY KEY(main, cell, edge)) WITHOUT ROWID;
    ''')
    street_ids = {}

    def street_id(name, city, lat=None, lon=None):
        key = (name, city)
        if key not in street_ids:
            street_ids[key] = len(street_ids) + 1
            db.execute('INSERT INTO streets VALUES (?, ?, ?, ?, ?)', (street_ids[key], name, city, lat, lon))
        return street_ids[key]

    for name, lat, lon in named:
        if inside(lat, lon, box) and (name, '') not in street_ids:
            street_id(name, '', round(lat, 6), round(lon, 6))
    rows = []
    seen = set()
    for street, house, city, lat, lon, entrance in houses:
        if not inside(lat, lon, box):
            continue
        key = (street.lower(), house.lower(), round(lat, 5), round(lon, 5))
        if key in seen:
            continue
        seen.add(key)
        rows.append((street_id(street, city), house, round(lat, 6), round(lon, 6), entrance or None, cell_of(lat, lon)))
    db.executemany('INSERT INTO houses VALUES (?, ?, ?, ?, ?, ?)', rows)

    edge_count = 0
    for key, a, b, name, highway, oneway, speed, coords in edges:
        if not any(inside(lat, lon, box) for lon, lat in coords):
            continue
        edge_count += 1
        text = json.dumps([[round(lon, 6), round(lat, 6)] for lon, lat in coords], separators=(',', ':'))
        db.execute('INSERT INTO edges VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                   (edge_count, key, a, b, name, highway, oneway, speed, text))
        main = 1 if highway in MAIN else 0
        cells = {cell_of(lat, lon) for lon, lat in coords}
        db.executemany('INSERT OR IGNORE INTO edge_cells VALUES (?, ?, ?)', [(c, main, edge_count) for c in cells])

    db.executescript('''
      CREATE INDEX houses_street ON houses(street);
      CREATE INDEX houses_cell ON houses(cell);
    ''')
    db.executemany('INSERT INTO meta VALUES (?, ?)', [
        ('schema', str(SCHEMA_VERSION)), ('version', version), ('cell', str(CELL)),
        ('houses', str(len(rows))), ('streets', str(len(street_ids))), ('edges', str(edge_count)),
    ])
    db.commit()
    db.execute('VACUUM')
    db.close()
    return len(rows), edge_count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pbf', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--only', nargs='*')
    args = parser.parse_args()

    relations = StreetRelations()
    print('reading street relations', args.pbf)
    relations.apply_file(str(args.pbf))
    print(f'{len(relations.street_of)} houses tied to a street by relation')
    collector = Collector(relations.street_of)
    print('reading', args.pbf)
    collector.apply_file(str(args.pbf), locations=True, idx='flex_mem')
    guessed = nearest_streets(collector)
    print(f'{len(guessed)} of {len(collector.streetless)} street-less houses got the nearest named road')
    houses = collector.houses + guessed + interpolate(collector)
    houses += attach_entrances(houses, collector.loose_entrances)
    edges = list(road_edges(collector))
    print(f'{len(houses)} addresses, {len(edges)} road edges, {len(collector.named)} named ways')

    wanted = set(args.only or [])
    report = {}
    for box in regions():
        if wanted and box[0] not in wanted:
            continue
        path = args.out / f'{box[0]}.db'
        count, edge_count = write_region(path, box, houses, collector.named, edges, args.version)
        report[box[0]] = path.stat().st_size
        print(f'  {box[0]:15} {count:8} houses {edge_count:8} edges {path.stat().st_size / 1e6:6.1f} MB')
    return report


if __name__ == '__main__':
    main()
