"""Extract the QueerBurners Event Guide into JSON we can import.

The guide is a four-column zine where every event is styled differently on
purpose, so no single font identifies a title. Two things ARE consistent and the
parse rests on them:

  * titles are set in the guide's pink (#eb5065) or in a bold face, while body
    copy is near-black (#231f20)
  * every event ends with a venue line of the form "Camp Name (7:30 & F)"

Everything else — which typeface, what size — varies event to event.

Reading order is reconstructed by column (x ≈ 40 / 220 / 400 / 580) then by y,
because PDF text order in a magazine layout follows neither.

    python3 scripts/parse-queerburners.py <pdf> [-o out.json]
"""
import argparse
import json
import re
import sys

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit('PyMuPDF required:  pip install pymupdf')

TITLE_RGB = 0xEB5065
BODY_RGB = 0x231F20
# The guide sets titles twice — a white copy offset behind a coloured one, to
# fake an outline. The white layer is decoration and duplicates every title, so
# it is dropped before anything else happens.
SHADOW_RGB = 0xFFFFFF
COLUMN_X = (40, 220, 400, 580)

TIME_RE = re.compile(r'^(\d{1,2}):(\d{2})\s*([ap])m\s*[-–]\s*(\d{1,2}):(\d{2})\s*([ap])m$', re.I)
VENUE_RE = re.compile(r'^(.+?)\s*\(([^)]+)\)\s*$')
DAY_RE = re.compile(r"^(sun|mon|tues|wednes|thurs|fri|satur)day(\s*(continued|cont'?d))?$", re.I)

# The 2026 event week. Gate opens Sunday 30 August; the Man burns Saturday
# 5 September; the guide runs through to the Temple burn on the 6th.
DAY_DATE = {
    'sunday': '2026-08-30',
    'monday': '2026-08-31',
    'tuesday': '2026-09-01',
    'wednesday': '2026-09-02',
    'thursday': '2026-09-03',
    'friday': '2026-09-04',
    'saturday': '2026-09-05',
}
DAY_ORDER = list(DAY_DATE)


def column_of(x):
    return min(range(len(COLUMN_X)), key=lambda i: abs(x - COLUMN_X[i]))


def lines_in_reading_order(page):
    """Merge spans into lines carrying a `hot` flag (title styling)."""
    raw = []
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            for span in line['spans']:
                if span['text'].strip() and span['color'] != SHADOW_RGB:
                    raw.append(span)
    rows = {}
    for s in raw:
        key = (column_of(s['bbox'][0]), round(s['bbox'][1], 0))
        rows.setdefault(key, []).append(s)
    out = []
    for (col, y) in sorted(rows):
        spans = sorted(rows[(col, y)], key=lambda s: s['bbox'][0])
        text = ' '.join(s['text'].strip() for s in spans if s['text'].strip())
        text = re.sub(r'\s+', ' ', text).strip()
        if not text:
            continue
        hot = any(s['color'] == TITLE_RGB or (s['flags'] & 16) for s in spans)
        size = max(round(s['size'], 1) for s in spans)
        if out and out[-1]['text'] == text and abs(out[-1]['y'] - y) < 14:
            continue
        out.append({'text': text, 'hot': hot, 'size': size, 'col': col, 'y': y})
    return out


def join_lines(parts):
    """Join wrapped lines, healing hyphenation: "dis-" + "creet" -> "discreet"."""
    out = ''
    for part in parts:
        p = part.strip()
        if not p:
            continue
        if out.endswith('-') and p[:1].islower():
            out = out[:-1] + p
        elif out:
            out += ' ' + p
        else:
            out = p
    return re.sub(r'\s+', ' ', out).strip()


def to_24h(h, m, ap):
    h = int(h) % 12
    if ap.lower() == 'p':
        h += 12
    return h, int(m)


def parse(pdf_path):
    doc = fitz.open(pdf_path)
    events, warnings = [], []
    day = None
    seen_saturday = False

    for page in doc:
        lines = lines_in_reading_order(page)
        i = 0
        while i < len(lines):
            ln = lines[i]
            stripped = ln['text'].strip()

            # A day heading is big type naming a weekday. "Sunday Comics and
            # Coldbrew" is an EVENT, so the whole line must be the day.
            m = DAY_RE.match(stripped)
            if m and ln['size'] >= 15:
                day = m.group(1).lower() + 'day'
                if day == 'saturday':
                    seen_saturday = True
                i += 1
                continue

            t = TIME_RE.match(stripped)
            if not t:
                i += 1
                continue

            # Collect until the next time range or day heading.
            body = []
            j = i + 1
            while j < len(lines):
                nxt = lines[j]['text'].strip()
                if TIME_RE.match(nxt):
                    break
                if DAY_RE.match(nxt) and lines[j]['size'] >= 15:
                    break
                body.append(lines[j])
                j += 1

            if day is None:
                warnings.append(f'event at {stripped} before any day heading — skipped')
                i = j
                continue

            # Venue is the last line shaped "Something (address)".
            venue = address = None
            for k in range(len(body) - 1, -1, -1):
                vm = VENUE_RE.match(body[k]['text'])
                if vm:
                    venue, address = vm.group(1).strip(), vm.group(2).strip()
                    body = body[:k]
                    break

            # Titles are the styled run at the TOP of the block. Taking every
            # styled line would swallow the description on events set wholly in
            # bold, so stop at the first unstyled line.
            k = 0
            while k < len(body) and body[k]['hot']:
                k += 1
            title_parts = [b['text'] for b in body[:k]]
            desc_parts = [b['text'] for b in body[k:]]
            if not title_parts and desc_parts:
                title_parts = [desc_parts.pop(0)]
            # Wholly-styled event: everything came back as title. Keep the first
            # line and treat the rest as description.
            if title_parts and not desc_parts and len(title_parts) > 1:
                desc_parts = title_parts[1:]
                title_parts = title_parts[:1]

            title = join_lines(title_parts).strip(' :')
            desc = join_lines(desc_parts)
            # A venue that slipped into the title (no styling boundary to catch it)
            vm2 = VENUE_RE.match(title)
            if vm2 and venue is None and re.search(r'\d|plaza|esplanade', vm2.group(2), re.I):
                venue, address = vm2.group(1).strip(), vm2.group(2).strip()
                title = vm2.group(1).strip()
            # …or that wrapped into the description instead of standing alone.
            if venue is None:
                tail = re.search(r'([A-Z][^.!?]{2,40}?)\s*\(([^)]*(?:\d|plaza|esplanade)[^)]*)\)\s*$', desc, re.I)
                if tail:
                    venue, address = tail.group(1).strip(), tail.group(2).strip()
                    desc = desc[:tail.start()].strip()
            # A description that merely repeats the title carries nothing.
            if desc and title and desc.strip().lower() == title.strip().lower():
                desc = ''
            if not title:
                warnings.append(f'{day} {stripped}: no title found — skipped')
                i = j
                continue

            sh, sm = to_24h(t.group(1), t.group(2), t.group(3))
            eh, em = to_24h(t.group(4), t.group(5), t.group(6))
            # The guide opens on Sunday 30 August and closes on Sunday
            # 6 September; only the order of the headings tells them apart.
            date = '2026-09-06' if (day == 'sunday' and seen_saturday) else DAY_DATE[day]
            end_date = date
            # An end at or before the start has rolled past midnight.
            if (eh, em) <= (sh, sm):
                from datetime import date as _d, timedelta
                y, mo, dd = (int(v) for v in date.split('-'))
                end_date = (_d(y, mo, dd) + timedelta(days=1)).isoformat()

            events.append({
                'title': title,
                'description': desc,
                'venue': venue,
                'address': address,
                'day': day,
                'startsAt': f'{date} {sh:02d}:{sm:02d}:00',
                'endsAt': f'{end_date} {eh:02d}:{em:02d}:00',
            })
            i = j

    return events, warnings


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('-o', '--out', default='-')
    args = ap.parse_args()

    events, warnings = parse(args.pdf)
    from collections import Counter
    by_day = Counter(e['startsAt'][:10] for e in events)
    print(f'{len(events)} events', file=sys.stderr)
    for d in sorted(by_day):
        print(f'  {d}  {by_day[d]:3}', file=sys.stderr)
    print(f'  no venue: {sum(1 for e in events if not e["venue"])}', file=sys.stderr)
    print(f'  no description: {sum(1 for e in events if not e["description"])}', file=sys.stderr)
    for w in warnings[:20]:
        print(f'  WARN {w}', file=sys.stderr)

    text = json.dumps(events, indent=1, ensure_ascii=False)
    if args.out == '-':
        print(text)
    else:
        with open(args.out, 'w') as fh:
            fh.write(text)
        print(f'wrote {args.out}', file=sys.stderr)
