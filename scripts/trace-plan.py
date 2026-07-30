"""Trace the official 2026 plan's VECTOR ink and bake lib/brc/planCenterCamp.ts.

Why this exists
---------------
The plan draws no strokes at all: every road is a set of short CLOSED ribbon
outlines, filled black, and each road is TWO such strokes (~4.25 m wide) with a
~4.75 m clear interior. So "the plan's geometry" is recovered by reading those
loops, not by measuring rasterised ink.

The plan carries no scale bar and no dimension text, so it is authoritative for
SHAPE only. Absolute size stays anchored to the BRC Measurements doc through
STREET_RADII in lib/brc/geocode.ts: this tool fits one (centre, px-per-metre)
against those radii and reports the residuals, which are baked into the output
as PLAN_RING_RADII so a unit test can assert the traced frame still agrees with
the geocoder. Nothing here ever moves a camp pin: geocode.ts is not touched, and
the emitted coordinates are PLAN-ORIENTED METRE OFFSETS from the Man (12:00 up),
converted at runtime by planToLngLat(), so a golden-spike recalibration moves the
traced Center Camp with the rest of the city.

Needs pymupdf + numpy, and the plan PDF (override the path with PLAN_PDF=...).
Lives in scripts/ rather than tasks/ on purpose: tasks/ is gitignored, so a
generator parked there ships a baked file nobody else can regenerate.

Run:  python3 scripts/trace-plan.py
"""
import math
import os

import fitz
import numpy as np

PDF = os.environ.get('PLAN_PDF') or os.path.expanduser('~/Desktop/BRC_City_Plan_2026_update.pdf')
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, 'lib/brc/planCenterCamp.ts')

# lib/brc/geocode.ts — the absolute-scale authority (Measurements doc)
STREET_RADII = {
    'Esplanade': 762.0, 'A': 894.6, 'B': 979.9, 'C': 1065.3, 'D': 1150.6,
    'E': 1237.5, 'F': 1385.3, 'G': 1470.7, 'H': 1556.0, 'I': 1641.4,
    'J': 1696.2, 'K': 1754.1,
}
HALF_ROAD_INK = 4.5      # a road's two strokes sit about +/- this off centreline
KEYHOLE_R = 300.0        # trace radius about the Center Camp centre (m)

page = fitz.open(PDF)[0]
drawings = page.get_drawings()

# ---------------------------------------------------------------- geometry utils
def bez(p0, p1, p2, p3, t):
    m = 1 - t
    return (m**3*p0.x + 3*m*m*t*p1.x + 3*m*t*t*p2.x + t**3*p3.x,
            m**3*p0.y + 3*m*m*t*p1.y + 3*m*t*t*p2.y + t**3*p3.y)


def drawing_polylines(dr, step=8):
    out, cur, last = [], [], None
    for it in dr['items']:
        pts = None
        if it[0] == 'l':
            pts = [(it[1].x, it[1].y), (it[2].x, it[2].y)]
        elif it[0] == 'c':
            pts = [(it[1].x, it[1].y)] + [bez(it[1], it[2], it[3], it[4], k/step)
                                          for k in range(1, step+1)]
        if not pts:
            continue
        if last is None or math.hypot(pts[0][0]-last[0], pts[0][1]-last[1]) > 0.5:
            if len(cur) > 1:
                out.append(cur)
            cur = [pts[0]]
        cur += pts[1:]
        last = cur[-1]
    if len(cur) > 1:
        out.append(cur)
    return out


def rdp(points, eps):
    pts = np.asarray(points, float)
    if len(pts) < 3:
        return pts
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts)-1)]
    while stack:
        i0, i1 = stack.pop()
        if i1 <= i0 + 1:
            continue
        p0, p1 = pts[i0], pts[i1]
        seg = p1 - p0
        L = math.hypot(*seg)
        d = (np.hypot(*(pts[i0+1:i1] - p0).T) if L == 0 else
             np.abs(seg[0]*(pts[i0+1:i1, 1]-p0[1]) - seg[1]*(pts[i0+1:i1, 0]-p0[0])) / L)
        im = int(np.argmax(d))
        if d[im] > eps:
            k = i0 + 1 + im
            keep[k] = True
            stack += [(i0, k), (k, i1)]
    return pts[keep]


# text glyphs are vector outlines too — skip anything inside a padded word box
WORDS = [(w[0]-4, w[1]-4, w[2]+4, w[3]+4) for w in page.get_text('words')]
def in_text(x, y):
    return any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in WORDS)


def black_loops():
    """Every closed black ribbon outline on the page, in PDF px."""
    for dr in drawings:
        f = dr.get('fill')
        if not f or tuple(round(c, 2) for c in f) != (0.0, 0.0, 0.0):
            continue
        for poly in drawing_polylines(dr):
            if in_text(*poly[0]):
                continue
            if math.hypot(poly[0][0]-poly[-1][0], poly[0][1]-poly[-1][1]) > 4:
                continue
            yield poly


LOOPS_PX = list(black_loops())
print(f'closed black ribbon loops on the page: {len(LOOPS_PX)}')

# ------------------------------------------------- calibrate centre + px/metre
# Start from the concentric family, then refine the centre by sharpening the
# radius histogram, then fit the scale by least squares against STREET_RADII.
def fit_circle(pts):
    P = np.asarray(pts, float)
    x, y = P[:, 0], P[:, 1]
    A = np.c_[2*x, 2*y, np.ones(len(x))]
    sol, *_ = np.linalg.lstsq(A, x*x + y*y, rcond=None)
    cx, cy = sol[0], sol[1]
    r = math.sqrt(max(0.0, sol[2] + cx*cx + cy*cy))
    return cx, cy, r, float(np.sqrt(np.mean((np.hypot(x-cx, y-cy) - r)**2)))


guess = []
for dr in drawings:
    f = dr.get('fill')
    if not f or tuple(round(c, 2) for c in f) != (0.0, 0.0, 0.0):
        continue
    for poly in drawing_polylines(dr):
        if len(poly) < 40:
            continue
        cx, cy, r, rms = fit_circle(poly)
        if r > 400 and rms < 0.02 * r:
            guess.append((cx, cy))
CX0, CY0 = (float(np.median([g[0] for g in guess])), float(np.median([g[1] for g in guess]))) \
    if guess else (1767.0, 1867.0)

ALLPTS = np.array([p for lp in LOOPS_PX for p in lp], float)

def sharpness(cx, cy):
    r = np.hypot(ALLPTS[:, 0]-cx, ALLPTS[:, 1]-cy)
    r = r[(r > 300) & (r < 1300)]
    h, _ = np.histogram(r, bins=np.arange(300, 1300, 0.6))
    return float((h.astype(float)**2).sum())


CX, CY = CX0, CY0
step = 1.0
while step > 0.02:
    improved = True
    while improved:
        improved = False
        base = sharpness(CX, CY)
        for dx, dy in ((step, 0), (-step, 0), (0, step), (0, -step)):
            s = sharpness(CX+dx, CY+dy)
            if s > base:
                CX, CY, base, improved = CX+dx, CY+dy, s, True
    step /= 2
print(f'city centre (the Man) in PDF px: ({CX:.2f}, {CY:.2f})')


def plan_m(x, y, S):
    return ((x - CX) / S, (CY - y) / S)


# ring-like loops: a tangential stroke lying along some ring street
def ring_strokes(S):
    out = []
    for lp in LOOPS_PX:
        pm = [plan_m(x, y, S) for x, y in lp]
        rs = [math.hypot(e, n) for e, n in pm]
        if max(rs) - min(rs) > 6:
            continue
        ce = sum(p[0] for p in pm)/len(pm)
        cn = sum(p[1] for p in pm)/len(pm)
        t = (math.degrees(math.atan2(ce, cn)) % 360) / 30.0
        if not (2.2 < t < 9.8) or (5.0 < t < 7.0):
            continue
        out.append((sum(rs)/len(rs), t))
    return out


best = None
for S in np.arange(0.695, 0.715, 0.00002):
    strokes = ring_strokes(S)
    if len(strokes) < 50:
        continue
    tot, n = 0.0, 0
    for r, _t in strokes:
        d = min(min(abs(r - (v - HALF_ROAD_INK)), abs(r - (v + HALF_ROAD_INK)))
                for v in STREET_RADII.values())
        if d < 6:
            tot += d*d
            n += 1
    if n > 40 and (best is None or tot/n < best[0]):
        best = (tot/n, S, n)
S = best[1]
print(f'scale: {S:.5f} px/m   (ring-stroke rms {math.sqrt(best[0]):.2f} m over {best[2]} strokes)')

# measured ring centrelines: pair the two strokes of each ring
measured = {}
strokes = ring_strokes(S)
for name, nominal in STREET_RADII.items():
    inner = [r for r, _ in strokes if abs(r - (nominal - HALF_ROAD_INK)) < 4]
    outer = [r for r, _ in strokes if abs(r - (nominal + HALF_ROAD_INK)) < 4]
    if inner and outer:
        measured[name] = (sum(inner)/len(inner) + sum(outer)/len(outer)) / 2
print('\nring      plan(m)    doc(m)   delta(m)')
for name in STREET_RADII:
    if name in measured:
        d = measured[name] - STREET_RADII[name]
        print(f'  {name:9} {measured[name]:8.2f} {STREET_RADII[name]:9.1f}   {d:+6.2f}')
    else:
        print(f'  {name:9}      —  (no stroke pair matched)')

# --------------------------------------------- Center Camp centre + ink tracing
CC = None
best = None
for d0 in np.arange(880, 950, 0.25):
    r = np.hypot(ALLPTS[:, 0]-CX, ALLPTS[:, 1]-(CY + d0*S))
    sel = r[r < KEYHOLE_R*S]
    if len(sel) < 200:
        continue
    h, _ = np.histogram(sel, bins=np.arange(0, KEYHOLE_R*S, 0.7))
    sc = float((h.astype(float)**2).sum())
    if best is None or sc > best[0]:
        best = (sc, d0)
CC = best[1]
print(f'\nCenter Camp centre: {CC:.2f} m from the Man along 6:00')

QUARTERS = [k/4 for k in range(8, 41)]

def keep_loop(pm):
    """True if this loop is Center Camp structure rather than a ring/radial
    stroke we already draw parametrically."""
    rs = [math.hypot(e, n) for e, n in pm]
    ce = sum(p[0] for p in pm)/len(pm)
    cn = sum(p[1] for p in pm)/len(pm)
    if math.hypot(ce, cn + CC) > KEYHOLE_R:
        return False
    spread = max(rs) - min(rs)
    rmid = sum(rs)/len(rs)
    # tangential stroke sitting on a ring street -> parametric already draws it
    if spread < 6:
        for v in STREET_RADII.values():
            if min(abs(rmid-(v-HALF_ROAD_INK)), abs(rmid-(v+HALF_ROAD_INK))) < 3.0:
                return False
    # radial stroke sitting on a quarter-hour avenue -> likewise
    if spread > 15:
        t = (math.degrees(math.atan2(ce, cn)) % 360) / 30.0
        for q in QUARTERS:
            if abs(math.radians((t - q) * 30)) * max(1.0, rmid) < 8.0:
                return False
    return True


rings, seen = [], set()
for lp in LOOPS_PX:
    pm = [plan_m(x, y, S) for x, y in lp]
    if not keep_loop(pm):
        continue
    simp = rdp(pm, 0.25)
    ring = [[round(float(e), 1), round(float(n), 1)] for e, n in simp]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    # drop zero-area slivers: rounding/simplification can collapse a tiny cap
    # to two distinct points, which fills nothing and only bloats the file
    if len({(p[0], p[1]) for p in ring}) < 3:
        continue
    key = (ring[0][0], ring[0][1], len(ring))
    if key in seen:          # the PDF draws some strokes twice
        continue
    seen.add(key)
    rings.append(ring)
print(f'traced Center Camp ink rings: {len(rings)}  ({sum(len(r) for r in rings)} points)')

# ------------------------------------------------------------------------ emit
L = []
L.append("// GENERATED by scripts/trace-plan.py — do not hand-edit. Re-run it when")
L.append("// Burning Man publishes a new city plan.")
L.append("//")
L.append("// Center Camp exactly as the official 2026 plan draws it. The plan uses no")
L.append("// strokes: each road is a pair of short CLOSED ribbon outlines filled black, so")
L.append("// this is the plan's own ink, traced verbatim — not a parametric guess at it.")
L.append("// Ring/radial strokes are filtered out here because cityGeoJson draws those")
L.append("// from STREET_RADII; only Center Camp's own structure is baked.")
L.append("//")
L.append("// Coordinates are PLAN-oriented metre offsets from the Man (12:00 up), rendered")
L.append("// through planToLngLat() — so they follow a golden-spike recalibration instead")
L.append("// of drifting off it, and no camp pin is ever affected.")
L.append(f"export const PLAN_CALIBRATION = {{ centrePx: [{CX:.2f}, {CY:.2f}] as const, pxPerMetre: {S:.5f} }}")
L.append("")
L.append("/** Ring centrelines MEASURED off the plan's vectors (stroke pairs). The plan has")
L.append(" *  no scale bar, so absolute size comes from STREET_RADII; these are what the")
L.append(" *  plan itself says, and a test asserts the two agree. */")
L.append("export const PLAN_RING_RADII: Record<string, number> = {")
for name in STREET_RADII:
    if name in measured:
        L.append(f"  {name}: {measured[name]:.2f},")
L.append("}")
L.append("")
L.append("/** Center Camp geometry measured off the plan's vectors. */")
L.append(f"export const PLAN_CENTER_CAMP = {{ centreM: {CC:.2f} }}")
L.append("")
L.append("export const CENTER_CAMP_INK: number[][][] = [")
for r in rings:
    L.append('  [' + ','.join('[%g,%g]' % (p[0], p[1]) for p in r) + '],')
L.append(']')
out = '\n'.join(L) + '\n'
with open(OUT, 'w') as fh:
    fh.write(out)
print(f'wrote {OUT} ({len(out)//1024} KB)')
