"""Extract the Rock Star Librarian music guide into JSON we can import.

RSL is a lineup guide, not an event list: each camp block is a venue, an address,
the hours it is running, and then the DJs playing it.

    ¡AXOLOTL! The Earth Guardian
    On The Playa                 <- address
    04:00 PM – 07:00 AM          <- the camp's window
    4pm
    DJ Laz                       <- one set
    5:30pm
    Camp AXO DJs

Every set becomes one of our events: the artist is the title, the camp is the
venue.

DATES COME FROM PAGE ORDER, NOT FROM DAY NAMES. Each page is headed with a night
("SUN PM — MON AM") and the guide runs long enough that Saturday and Sunday each
appear twice — Sat 29 Aug and Sat 5 Sep both say "SAT PM". So the parser starts
on the opening night and steps forward every time the header changes.

Within a night, PM times belong to the first day and AM times to the second,
which is what "SUN PM — MON AM" is telling you.

    python3 scripts/parse-rsl.py <pdf> [-o out.json]
"""
import argparse
import json
import re
import sys
from datetime import date, timedelta

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit('PyMuPDF required:  pip install pymupdf')

# The night the guide opens on: Saturday of build week, into gate-opening Sunday.
FIRST_NIGHT = date(2026, 8, 29)

HEADER_RE = re.compile(r'^(SAT|SUN|MON|TUE|WED|THU|FRI)\s+(AM|PM)\s*[—–-]\s*(SAT|SUN|MON|TUE|WED|THU|FRI)\s+(AM|PM)$', re.I)
WINDOW_RE = re.compile(r'^\d{1,2}:\d{2}\s*[AP]M\s*[—–-]\s*\d{1,2}:\d{2}\s*[AP]M$', re.I)
SET_TIME_RE = re.compile(r'^(\d{1,2})(?::(\d{2}))?\s*([ap])m$', re.I)

# Page furniture: the banner, the legend, folios, and the A—D index tabs.
FURNITURE = {
    'CAMPS', 'ART', 'WHEELCHAIR FRIENDLY', 'LIVE MUSIC STAGE', 'MUTANT VEHICLE',
    'RSL RECOMMENDED', 'BIPOC BEATS ARTIST', 'BIPOC BEATS FRIEND',
}
# Only ever applied ABOVE the first camp block. A bare number is a page folio up
# there and an artist called "404" down here, and stripping it in the listings
# desynchronised every time/artist pair that followed.
FURNITURE_RE = re.compile(
    r'^(PAGE\s*\d+|\d+|[A-Z]\s*[—–-]\s*[A-Z]|R\s*O\s*C\s*K.*|.*MUSIC\s*GUIDE.*)$', re.I)


def is_furniture(line, in_header):
    s = line.strip()
    if not s or s.upper() in FURNITURE:
        return True
    return in_header and bool(FURNITURE_RE.match(s))


def to_24h(h, m, ap):
    hh = int(h) % 12
    if ap.lower() == 'p':
        hh += 12
    return hh, int(m or 0)


def parse(pdf_path: str):
    doc = fitz.open(pdf_path)
    events, warnings = [], []
    night = None
    last_header = None

    for page in doc:
        lines = [l.strip() for l in page.get_text().split('\n') if l.strip()]
        header = next((l for l in lines[:8] if HEADER_RE.match(l)), None)
        if not header:
            continue  # cover, welcome, key
        if header != last_header:
            night = FIRST_NIGHT if night is None else night + timedelta(days=1)
            last_header = header

        # The masthead runs until the first camp's hours; below that every line
        # is content, however much it looks like a folio.
        first_block = next((n for n, l in enumerate(lines) if WINDOW_RE.match(l)), len(lines))
        body = [
            l for n, l in enumerate(lines)
            if not is_furniture(l, n < first_block) and not HEADER_RE.match(l)
        ]

        # Walk the page: a window line closes a camp header and opens its sets.
        i = 0
        header_buf = []
        while i < len(body):
            line = body[i]

            if WINDOW_RE.match(line):
                # The lines gathered since the last block are this camp's name,
                # any subtitle, and its address (address last).
                name = header_buf[0] if header_buf else ''
                address = header_buf[-1] if len(header_buf) > 1 else ''
                subtitle = ' · '.join(header_buf[1:-1]) if len(header_buf) > 2 else ''
                header_buf = []
                i += 1

                # Sets run until a line that is not a time.
                while i + 1 < len(body):
                    t = SET_TIME_RE.match(body[i])
                    if not t:
                        break
                    artist = body[i + 1].strip()
                    i_art = i + 1
                    # A long billing can wrap: "third wheel (Nat Turner b2b HMU
                    # b2b" / "blackbrook)". An unhealed bracket is the signal,
                    # and it is exact — no guessing at line lengths.
                    while artist.count('(') > artist.count(')') and i_art + 1 < len(body):
                        artist = f'{artist} {body[i_art + 1].strip()}'
                        i_art += 1
                    i = i_art - 1
                    hh, mm = to_24h(t.group(1), t.group(2), t.group(3))
                    # PM belongs to the first day of the night, AM to the second.
                    when = night + (timedelta(days=1) if hh < 12 else timedelta(0))
                    events.append({
                        'title': artist[:200],
                        'venue': name or None,
                        'address': address or None,
                        'subtitle': subtitle or None,
                        'startsAt': f'{when.isoformat()} {hh:02d}:{mm:02d}:00',
                    })
                    i += 2
                continue

            header_buf.append(line)
            # A camp header is at most name + a couple of subtitle lines + address.
            if len(header_buf) > 6:
                warnings.append(f'p{page.number + 1}: dropping stray line {header_buf.pop(0)!r}')
            i += 1

    return events, warnings


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('-o', '--out', default='-')
    args = ap.parse_args()

    events, warnings = parse(args.pdf)
    from collections import Counter
    by_day = Counter(e['startsAt'][:10] for e in events)
    print(f'{len(events)} sets', file=sys.stderr)
    for d in sorted(by_day):
        print(f'  {d}  {by_day[d]:4}', file=sys.stderr)
    print(f'  distinct venues: {len({e["venue"] for e in events})}', file=sys.stderr)
    print(f'  without a venue: {sum(1 for e in events if not e["venue"])}', file=sys.stderr)
    print(f'  without an address: {sum(1 for e in events if not e["address"])}', file=sys.stderr)
    for w in warnings[:10]:
        print(f'  WARN {w}', file=sys.stderr)

    text = json.dumps(events, indent=1, ensure_ascii=False)
    if args.out == '-':
        print(text)
    else:
        with open(args.out, 'w') as fh:
            fh.write(text)
        print(f'wrote {args.out}', file=sys.stderr)
