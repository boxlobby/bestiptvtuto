/**
 * BestIPTVTuto — Homepage & Sitemap Builder
 * Scans all article HTML files, extracts metadata from Open Graph / meta tags,
 * then rebuilds index.html article grid and sitemap.xml automatically.
 */

const fs   = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');

// ─── Files to skip (not articles) ─────────────────────────────────────────────
const SKIP = new Set([
  'index.html','article.html','about.html','404.html',
  'privacy.html','tos.html','dmca.html'
]);

// ─── Valid categories ──────────────────────────────────────────────────────────
const VALID_CATEGORIES = new Set([
  'IPTV Reviews','Setup Guides','Tips & Tricks','Comparisons','News'
]);

// ─── Scan all HTML files ───────────────────────────────────────────────────────
function scanArticles() {
  const files = fs.readdirSync('.').filter(f =>
    f.endsWith('.html') && !SKIP.has(f)
  );

  const articles = [];

  for (const file of files) {
    try {
      const html  = fs.readFileSync(file, 'utf8');
      const root  = parse(html);

      const getMeta = (attr, val) => {
        const el = root.querySelector(`meta[${attr}="${val}"]`);
        return el ? el.getAttribute('content') || '' : '';
      };

      // Skip non-article pages (noindex)
      const robots = getMeta('name','robots');
      if (robots && robots.includes('noindex')) continue;

      // Skip pages that aren't typed as articles
      const ogType = getMeta('property','og:type');
      if (ogType && ogType !== 'article') continue;

      const title       = getMeta('property','og:title')       || getMeta('name','title') || '';
      const description = getMeta('property','og:description') || getMeta('name','description') || '';
      const image       = getMeta('property','og:image')       || '';
      const published   = getMeta('property','article:published_time') || '';
      let   category    = getMeta('property','article:section') || 'IPTV Reviews';
      const author      = getMeta('property','article:author') || getMeta('name','author') || 'James Doyle';

      // Fallback category
      if (!VALID_CATEGORIES.has(category)) category = 'IPTV Reviews';

      // Extract rating from JSON-LD
      let rating = null;
      const scripts = root.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        try {
          const json = JSON.parse(s.text);
          const graph = json['@graph'] || [json];
          for (const node of graph) {
            if (node.reviewRating && node.reviewRating.ratingValue) {
              rating = parseFloat(node.reviewRating.ratingValue);
              break;
            }
          }
          if (rating) break;
        } catch {}
      }

      if (!title) continue; // skip if no title found

      articles.push({ file, title, description, image, published, category, author, rating });

    } catch (err) {
      console.warn(`Skipping ${file}: ${err.message}`);
    }
  }

  // Sort newest first
  articles.sort((a, b) => {
    const da = a.published ? new Date(a.published) : new Date(0);
    const db = b.published ? new Date(b.published) : new Date(0);
    return db - da;
  });

  return articles;
}

// ─── Format date ──────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch { return ''; }
}

// ─── Build article card HTML ──────────────────────────────────────────────────
function buildCard(article) {
  const { file, title, description, image, published, category, author, rating } = article;
  const dateStr = formatDate(published);
  const ratingBadge = rating
    ? `<span class="article-rating">${rating.toFixed(1)}/10</span>`
    : '';
  const imgAttr = image
    ? `src="${image.replace('w=1200','w=600')}" alt="${title.replace(/"/g,'&quot;')}" loading="lazy" width="600" height="338"`
    : `src="https://images.unsplash.com/photo-1593784991095-a205069470b6?w=600&q=80" alt="${title.replace(/"/g,'&quot;')}" loading="lazy" width="600" height="338"`;

  return `
          <article class="article-card" data-category="${category}">
            <a href="/${file}" class="card-image-link">
              <img ${imgAttr}/>
              ${ratingBadge}
            </a>
            <div class="card-body">
              <span class="card-category">${category}</span>
              <h2 class="card-title"><a href="/${file}">${title}</a></h2>
              <p class="card-excerpt">${description}</p>
              <div class="card-meta">
                <span class="card-author">${author}</span>
                ${dateStr ? `<time datetime="${published}">${dateStr}</time>` : ''}
              </div>
            </div>
          </article>`;
}

// ─── Read index.html and replace article grid ─────────────────────────────────
function rebuildIndex(articles) {
  let index = fs.readFileSync('index.html', 'utf8');

  const cards = articles.map(buildCard).join('\n');

  // Replace everything between the two markers
  const START = '<!-- ARTICLES_START -->';
  const END   = '<!-- ARTICLES_END -->';

  const si = index.indexOf(START);
  const ei = index.indexOf(END);

  if (si === -1 || ei === -1) {
    console.error('ERROR: Could not find ARTICLES_START / ARTICLES_END markers in index.html');
    process.exit(1);
  }

  index = index.slice(0, si + START.length) + '\n' + cards + '\n          ' + index.slice(ei);

  fs.writeFileSync('index.html', index, 'utf8');
  console.log(`Rebuilt index.html with ${articles.length} articles`);
}

// ─── Rebuild sitemap.xml ──────────────────────────────────────────────────────
function rebuildSitemap(articles) {
  const base = 'https://bestiptvtuto.com';
  const today = new Date().toISOString().split('T')[0];

  const staticPages = [
    { url: '/',            priority: '1.0', changefreq: 'daily'   },
    { url: '/about.html', priority: '0.6', changefreq: 'monthly' },
  ];

  const staticEntries = staticPages.map(p => `
  <url>
    <loc>${base}${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('');

  const articleEntries = articles.map(a => {
    const lastmod = a.published ? a.published.split('T')[0] : today;
    const imageBlock = a.image ? `
    <image:image>
      <image:loc>${a.image}</image:loc>
      <image:title>${a.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</image:title>
    </image:image>` : '';
    return `
  <url>
    <loc>${base}/${a.file}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>${imageBlock}
  </url>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${staticEntries}
${articleEntries}
</urlset>`;

  fs.writeFileSync('sitemap.xml', xml.trim(), 'utf8');
  console.log(`Rebuilt sitemap.xml with ${articles.length} article entries`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const articles = scanArticles();
console.log(`Found ${articles.length} articles`);
articles.forEach(a => console.log(` - [${a.category}] ${a.title}`));
rebuildIndex(articles);
rebuildSitemap(articles);
