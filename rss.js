export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url param' });

  try {
    const response = await fetch(decodeURIComponent(url), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DailyBriefBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`Feed returned ${response.status}`);

    const xml = await response.text();

    // Parse XML into items
    const items = [];
    const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>|<entry[^>]*>([\s\S]*?)<\/entry>/gi);

    for (const match of itemMatches) {
      const block = match[1] || match[2];

      const getTag = (tags) => {
        for (const tag of tags) {
          const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/${tag}>`, 'i'));
          if (m && m[1]?.trim()) return m[1].trim();
        }
        // Try self-closing link with href
        const linkHref = block.match(/<link[^>]+href=["']([^"']+)["']/i);
        if (tags.includes('link') && linkHref) return linkHref[1];
        return '';
      };

      const title = getTag(['title']);
      if (!title) continue;

      const description = getTag(['description', 'summary', 'content:encoded', 'content'])
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ')
        .replace(/\s+/g,' ').trim()
        .slice(0, 250);

      const link = getTag(['link', 'guid']);
      const pubDate = getTag(['pubDate', 'published', 'updated', 'dc:date']);

      items.push({ title, description, link, pubDate });
      if (items.length >= 10) break;
    }

    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
