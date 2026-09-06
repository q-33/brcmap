// Best-effort ingest of @bmantraffic — the org's official exodus channel on X.
//
// There is no sanctioned way to read it: the paid X API is not happening for a
// volunteer map, so this leans on the embed-widget syndication endpoint, which
// X sometimes serves and sometimes 429s. The whole design accepts that:
// opportunistic fetch, long cache, and a null result renders as "follow
// @bmantraffic directly" rather than an error. If X closes the door entirely,
// the page quietly becomes a link — which is exactly what it was before.

import { ofetch } from 'ofetch'

export interface TrafficPost {
  id: string
  text: string
  at: string // ISO
}

export async function fetchBmanTraffic(): Promise<TrafficPost[] | null> {
  try {
    const html = await ofetch<string>(
      'https://syndication.twitter.com/srv/timeline-profile/screen-name/bmantraffic',
      {
        timeout: 10_000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          'Accept': 'text/html',
        },
      },
    )
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (!m)
      return null
    const data = JSON.parse(m[1]!)
    const entries: any[] = data?.props?.pageProps?.timeline?.entries ?? []
    const posts = entries
      .map((e: any) => e?.content?.tweet)
      .filter((t: any) => t?.full_text && t?.created_at)
      .slice(0, 8)
      .map((t: any) => ({
        id: String(t.id_str ?? t.id ?? Math.random()),
        text: String(t.full_text),
        at: new Date(t.created_at).toISOString(),
      }))
    return posts.length ? posts : null
  }
  catch {
    return null
  }
}
