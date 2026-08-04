"""Import Burning Man's OFFICIAL surveyed GIS and bake lib/brc/planCity.ts.

Why this exists
---------------
Until now the drawn city was parametric (perfect circles from STREET_RADII) with
the irregular bits traced off the plan PDF. Burning Man publishes the real thing:
surveyed street centrelines, city blocks, plazas and the trash fence, released
annually at github.com/burningmantech/innovate-GIS-data. That is the authority
for SHAPE, and it carries per-street widths the plan PDF never had.

Measured against our parametric model (2026 data), we were already close:
  golden spike   1.17 m from the GIS ring centre
  ring radii     +0.41 m (Esplanade) .. +0.93 m (K) — a uniform +0.053% scale
  radials        median 0.049 deg, i.e. 1.5 m at the K ring
So this is a refinement, not a rescue — but it also replaces "perfect circles"
with the city as actually staked, which is never quite regular.

WHAT THIS DOES NOT TOUCH: lib/brc/geocode.ts. Addresses are still derived from
STREET_RADII, so no camp pin moves and no stored address changes. The drawn
street under a pin shifts by at most ~2.5 m.

Output coordinates are PLAN-oriented metre offsets from the Man (12:00 up) and
render through planToLngLat(), so a golden-spike recalibration carries them with
the rest of the city instead of stranding them.

Licence note: this bakes DERIVED geometry (re-projected, simplified), it does not
redistribute Burning Man's files. Use of the data is governed by the Terms of
Service for Burning Man APIs and Datasets. Ask before widening that use.

Run:  python3 scripts/import-gis.py [--year 2026]
"""
import argparse
import json
import math
import os
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, 'lib/brc/planCity.ts')
RAW = 'https://raw.githubusercontent.com/burningmantech/innovate-GIS-data/master/{year}/GeoJSON/{layer}.geojson'
LAYERS = ('street_lines', 'city_blocks', 'plazas', 'trash_fence')

# must mirror lib/brc/geocode.ts
MAN = {'lat': 40.783242, 'lng': -119.207871}
M_PER_DEG_LAT = 111320.0
STREET_RADII = {'Esplanade': 762.0, 'A': 894.6, 'B': 979.9, 'C': 1065.3, 'D': 1150.6,
                'E': 1237.5, 'F': 1385.3, 'G': 1470.7, 'H': 1556.0, 'I': 1641.4,
                'J': 1696.2, 'K': 1754.1}
GIS_RING_NAME = {'ESP': 'Esplanade'}
SQRT2_2 = math.sqrt(2) / 2
MLNG = M_PER_DEG_LAT * math.cos(math.radians(MAN['lat']))

ap = argparse.ArgumentParser()
ap.add_argument('--year', default='2026')
ap.add_argument('--cache', default=os.environ.get('GIS_CACHE', '/tmp/brc-gis'))
args = ap.parse_args()


def layer(name):
    os.makedirs(args.cache, exist_ok=True)
    path = os.path.join(args.cache, f'{args.year}-{name}.geojson')
    if not os.path.exists(path):
        url = RAW.format(year=args.year, layer=name)
        print(f'  fetching {url}')
        urllib.request.urlretrieve(url, path)
    with open(path) as fh:
        return json.load(fh)


def to_plan(lng, lat):
    """WGS84 -> plan-oriented metre offsets from the Man (12:00 up)."""
    e = (lng - MAN['lng']) * MLNG
    n = (lat - MAN['lat']) * M_PER_DEG_LAT
    return ((e - n) * SQRT2_2, (e + n) * SQRT2_2)


def radius(px, py):
    return math.hypot(px, py)


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i0, i1 = stack.pop()
        if i1 <= i0 + 1:
            continue
        (x0, y0), (x1, y1) = pts[i0], pts[i1]
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy)
        best, bi = -1.0, i0
        for i in range(i0 + 1, i1):
            x, y = pts[i]
            d = (math.hypot(x - x0, y - y0) if L == 0
                 else abs(dx * (y - y0) - dy * (x - x0)) / L)
            if d > best:
                best, bi = d, i
        if best > eps:
            keep[bi] = True
            stack += [(i0, bi), (bi, i1)]
    return [p for p, k in zip(pts, keep) if k]


def conv(coords, eps):
    pts = [to_plan(c[0], c[1]) for c in coords]
    pts = rdp(pts, eps)
    return [[round(x, 1), round(y, 1)] for x, y in pts]


def dedupe(ring):
    out = [ring[0]]
    for p in ring[1:]:
        if p != out[-1]:
            out.append(p)
    return out


print(f'Burning Man official GIS — {args.year}')
data = {name: layer(name) for name in LAYERS}

# ---------------------------------------------------------------- streets ----
streets, ring_pts = [], {}
for f in data['street_lines']['features']:
    p = f['properties'] or {}
    src = p.get('source')
    if src == 'center_camp':
        continue          # Center Camp is drawn from the traced plan ink
    line = conv(f['geometry']['coordinates'], 0.2)
    line = dedupe(line)
    if len(line) < 2:
        continue
    name = str(p.get('name') or '')
    streets.append({'n': name, 's': src, 'w': p.get('width_ft') or 30, 'p': line})
    if src == 'annular':
        ring_pts.setdefault(GIS_RING_NAME.get(name, name), []).extend(line)

measured = {}
for name, pts in ring_pts.items():
    if name in STREET_RADII:
        measured[name] = sum(radius(*p) for p in pts) / len(pts)

print('\nring       GIS(m)     ours(m)   delta(m)')
worst = 0.0
for name in STREET_RADII:
    if name in measured:
        d = measured[name] - STREET_RADII[name]
        worst = max(worst, abs(d))
        print(f'  {name:10} {measured[name]:8.2f} {STREET_RADII[name]:9.1f}   {d:+6.2f}')
print(f'worst ring delta vs the geocoder: {worst:.2f} m')

# ----------------------------------------------------------------- blocks ----
blocks = []
for f in data['city_blocks']['features']:
    g = f['geometry']
    rings = g['coordinates'] if g['type'] == 'Polygon' else [r for poly in g['coordinates'] for r in poly]
    outer = conv(rings[0], 0.35)
    outer = dedupe(outer)
    if len(outer) < 4:
        continue
    if outer[0] != outer[-1]:
        outer.append(outer[0])
    blocks.append(outer)

# ----------------------------------------------------------------- plazas ----
plazas = []
for f in data['plazas']['features']:
    p = f['properties'] or {}
    ring = dedupe(conv(f['geometry']['coordinates'][0], 0.2))
    if len(ring) < 4:
        continue
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    # plazas are drawn as circles; fit centre + radius so street cutting can use
    # the same circle logic the parametric city used
    body = ring[:-1]
    cx = sum(q[0] for q in body) / len(body)
    cy = sum(q[1] for q in body) / len(body)
    rs = [math.hypot(q[0] - cx, q[1] - cy) for q in body]
    rr = sum(rs) / len(rs)
    # Only genuinely circular plazas may cut streets with a circle. The 2:00 and
    # 10:00 & B "plazas" are rectangular keyholes, and a fitted circle there would
    # gouge the streets around them.
    round_ = max(abs(r - rr) for r in rs) / rr < 0.12
    plazas.append({'n': str(p.get('name') or ''), 'c': [round(cx, 1), round(cy, 1)],
                   'r': round(rr, 1), 'round': round_, 'p': ring})

print('\nplaza                        r (m)   circular')
for p in plazas:
    print(f"  {p['n']:26} {p['r']:6.1f}   {p['round']}")

# ------------------------------------------------------------------ fence ----
fence = dedupe(conv(data['trash_fence']['features'][0]['geometry']['coordinates'][0], 0.5))
if fence[0] != fence[-1]:
    fence.append(fence[0])

print(f'\nstreets {len(streets)} ({sum(len(s["p"]) for s in streets)} pts) · '
      f'blocks {len(blocks)} ({sum(len(b) for b in blocks)} pts) · '
      f'plazas {len(plazas)} · fence {len(fence)} pts')

# ------------------------------------------------------------------- emit ----
def pts_ts(pts):
    return '[' + ','.join(f'[{x:g},{y:g}]' for x, y in pts) + ']'


L = []
L.append("// GENERATED by scripts/import-gis.py — do not hand-edit. Re-run it when")
L.append(f"// Burning Man publishes the next year's GIS release.")
L.append("//")
L.append(f"// Burning Man's OFFICIAL surveyed city, {args.year}: street centrelines (with real")
L.append("// widths), city blocks, plazas and the trash fence, from")
L.append("// github.com/burningmantech/innovate-GIS-data. This is the city as actually")
L.append("// staked, so the rings are not perfect circles and the radials are not exactly")
L.append("// 30 degrees apart — which is the point.")
L.append("//")
L.append("// Coordinates are PLAN-oriented metre offsets from the Man (12:00 up), rendered")
L.append("// through planToLngLat(), so a golden-spike recalibration carries them along.")
L.append("//")
L.append("// geocode.ts is deliberately NOT driven by this: addresses still come from")
L.append("// STREET_RADII, so no camp pin moves and no stored address changes.")
L.append(f"export const GIS_YEAR = {args.year}")
L.append("")
L.append("/** Ring radii MEASURED off the official GIS. A test pins these against")
L.append(" *  STREET_RADII so the drawn city and the geocoder can never drift apart. */")
L.append("export const GIS_RING_RADII: Record<string, number> = {")
for name in STREET_RADII:
    if name in measured:
        L.append(f"  {name}: {measured[name]:.2f},")
L.append("}")
L.append("")
L.append("export interface GisStreet { n: string, s: string, w: number, p: number[][] }")
L.append("/** Street centrelines. `w` is the real surveyed width in FEET (20/30/40/50).")
L.append(" *  Center Camp's own roads are excluded — those come from the traced plan ink. */")
L.append("export const GIS_STREETS: GisStreet[] = [")
for s in streets:
    L.append(f"  {{ n: '{s['n']}', s: '{s['s']}', w: {s['w']}, p: {pts_ts(s['p'])} }},")
L.append("]")
L.append("")
L.append("export const GIS_BLOCKS: number[][][] = [")
for b in blocks:
    L.append(f"  {pts_ts(b)},")
L.append("]")
L.append("")
L.append("/** Plazas as surveyed. `c`/`r` are the fitted centre and radius and `round` says")
L.append(" *  the shape really is a circle, so streets may be cut at it the way the plan")
L.append(" *  prints them; the 2:00 and 10:00 & B plazas are rectangular and are not cut.")
L.append(" *  `p` is the surveyed ring, always drawn as-is. */")
L.append("export interface GisPlaza { n: string, c: number[], r: number, round: boolean, p: number[][] }")
L.append("export const GIS_PLAZAS: GisPlaza[] = [")
for p in plazas:
    L.append(f"  {{ n: '{p['n']}', c: [{p['c'][0]:g},{p['c'][1]:g}], r: {p['r']:g}, "
             f"round: {'true' if p['round'] else 'false'}, p: {pts_ts(p['p'])} }},")
L.append("]")
L.append("")
L.append(f"export const GIS_FENCE: number[][] = {pts_ts(fence)}")
out = '\n'.join(L) + '\n'
with open(OUT, 'w') as fh:
    fh.write(out)
print(f'wrote {OUT} ({len(out) // 1024} KB)')
