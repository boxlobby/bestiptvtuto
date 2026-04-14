/**
 * BestIPTVTuto — Homepage & Sitemap Builder (regex edition)
 */

const fs = require('fs');

const SKIP = new Set([
  'index.html','article.html','about.html','404.html',
  'privacy.html','tos.html','dmca.html'
]);

const CAT_MAP = {
  'IPTV Reviews': { cat:'reviews', tag:'t-rv', lbl:'IPTV Review' },
  'Setup Guides': { cat:'guides',  tag:'t-gd', lbl:'Guide'       },
  'Tips & Tricks':{ cat:'tips',    tag:'t-tp', lbl:'Tips'        },
  'Comparisons':  { cat:'compare', tag:'t-cm', lbl:'Comparison'  },
  'News':         { cat:'news',    tag:'t-nw', lbl:'News'        },
};

function getMeta(html, attr, val) {
  const re = new RegExp('<meta[^>]+' + attr + '=["\']' + val.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '["\'][^>]+content=["\']([^"\']+)["\']', 'i');
  let m = html.match(re);
  if (m) return m[1];
  const re2 = new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+' + attr + '=["\']' + val.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '["\']', 'i');
  m = html.match(re2);
  return m ? m[1] : '';
}

function scanArticles() {
  const files = fs.readdirSync('.').filter(f => f.endsWith('.html') && !SKIP.has(f));
  const articles = [];

  for (const file of files) {
    try {
      const html = fs.readFileSync(file, 'utf8');

      const robots = getMeta(html, 'name', 'robots');
      if (robots && robots.includes('noindex')) continue;

      const ogType = getMeta(html, 'property', 'og:type');
      if (ogType && ogType !== 'article') continue;

      const title       = getMeta(html, 'property', 'og:title');
      const description = getMeta(html, 'property', 'og:description');
      const image       = getMeta(html, 'property', 'og:image');
      const published   = getMeta(html, 'property', 'article:published_time');
      const section     = getMeta(html, 'property', 'article:section') || 'IPTV Reviews';

      if (!title) { console.warn(`Skipping ${file}: no og:title`); continue; }

      const catInfo = CAT_MAP[section] || CAT_MAP['IPTV Reviews'];

      // Extract rating from JSON-LD
      let rating = null;
      const ldMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) || [];
      for (const block of ldMatches) {
        try {
          const json = JSON.parse(block.replace(/<script[^>]*>|<\/script>/gi,''));
          const nodes = json['@graph'] || [json];
          for (const node of nodes) {
            if (node.reviewRating && node.reviewRating.ratingValue) {
              rating = parseFloat(node.reviewRating.ratingValue);
              break;
            }
          }
          if (rating) break;
        } catch(e) {}
      }

      const words = html.replace(/<[^>]+>/g,' ').trim().split(/\s+/).length;
      const readMin = Math.max(3, Math.round(words / 220));

      let dateStr = '';
      try {
        dateStr = published ? new Date(published).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : '';
      } catch(e) {}

      const id = file.replace('.html','').replace(/[^a-z0-9]/gi,'-').toLowerCase().slice(0,12);
      articles.push({ id, file, title, description, image, published, dateStr,
        cat:catInfo.cat, tag:catInfo.tag, lbl:catInfo.lbl, rating, readMin });

      console.log(`  + [${catInfo.cat}] ${title}`);
    } catch(err) {
      console.warn(`Skipping ${file}: ${err.message}`);
    }
  }

  return articles.sort((a,b) => new Date(b.published||0) - new Date(a.published||0));
}

function jsEsc(str) {
  return (str||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,' ');
}

function buildArtsArray(articles) {
  const entries = articles.map((a, i) => {
    const p = [
      `id:'${a.id}'`, `cat:'${a.cat}'`, `tag:'${a.tag}'`,
      `lbl:'${jsEsc(a.lbl)}'`, `title:'${jsEsc(a.title)}'`,
      `exc:'${jsEsc(a.description)}'`, `date:'${a.dateStr}'`, `rd:'${a.readMin} min'`
    ];
    if (a.rating) p.push(`sc:'${a.rating.toFixed(1)}'`);
    if (i === 0)  p.push(`featured:true`);
    p.push(`href:'/${a.file}'`);
    if (a.image)  p.push(`img:'${a.image.replace('w=1200','w=600')}'`);
    return `  {${p.join(', ')}}`;
  });
  return `var ARTS=[\n${entries.join(',\n')},\n];`;
}

function rebuildIndex(articles) {
  let index = fs.readFileSync('index.html', 'utf8');

  const artsStart = index.indexOf('var ARTS=[');
  const artsEnd   = index.indexOf('\n];', artsStart) + 3;
  if (artsStart === -1) { console.error('ERROR: var ARTS=[ not found in index.html'); process.exit(1); }
  index = index.slice(0, artsStart) + buildArtsArray(articles) + index.slice(artsEnd);

  // Fix card hrefs
  index = index.replace(
    /return'<a href="article\.html" class="art-card">'/g,
    `return'<a href="'+(a.href||'article.html')+'" class="art-card">'`
  );
  index = index.replace(
    /return'<a href="article\.html" class="s-item" onclick="sClose\(\)">'/g,
    `return'<a href="'+(a.href||'article.html')+'" class="s-item" onclick="sClose()">'`
  );
  // Already patched versions — leave them
  index = index.replace(
    /return'<a href="'\+\(a\.href\|\|'article\.html'\)\+'" class="art-card">'(\s*return'<a href="'\+\(a\.href)/g,
    `return'<a href="'+(a.href||'article.html')+'" class="art-card">'$1`
  );

  fs.writeFileSync('index.html', index, 'utf8');
  console.log(`Rebuilt index.html with ${articles.length} articles`);
}

function rebuildSitemap(articles) {
  const base  = 'https://bestiptvtuto.com';
  const today = new Date().toISOString().split('T')[0];
  const statics = [
    {url:'/',priority:'1.0',changefreq:'daily'},
    {url:'/about.html',priority:'0.6',changefreq:'monthly'}
  ].map(p=>`\n  <url>\n    <loc>${base}${p.url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`).join('');

  const arts = articles.map(a => {
    const lm = a.published ? a.published.split('T')[0] : today;
    const img = a.image ? `\n    <image:image>\n      <image:loc>${a.image}</image:loc>\n      <image:title>${(a.title||'').replace(/&/g,'&amp;')}</image:title>\n    </image:image>` : '';
    return `\n  <url>\n    <loc>${base}/${a.file}</loc>\n    <lastmod>${lm}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>${img}\n  </url>`;
  }).join('');

  fs.writeFileSync('sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${statics}${arts}\n</urlset>`.trim(),
    'utf8');
  console.log(`Rebuilt sitemap.xml with ${articles.length} articles`);
}

console.log('Scanning articles...');
const articles = scanArticles();
console.log(`Found ${articles.length} articles`);
rebuildIndex(articles);
rebuildSitemap(articles);
