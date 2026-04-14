/**
 * BestIPTVTuto — Homepage & Sitemap Builder
 */

const fs = require('fs');
const { parse } = require('node-html-parser');

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

function scanArticles() {
  const files = fs.readdirSync('.').filter(f => f.endsWith('.html') && !SKIP.has(f));
  const articles = [];

  for (const file of files) {
    try {
      const html = fs.readFileSync(file, 'utf8');
      const root = parse(html);
      const getMeta = (attr, val) => {
        const el = root.querySelector(`meta[${attr}="${val}"]`);
        return el ? (el.getAttribute('content') || '') : '';
      };
      const robots = getMeta('name','robots');
      if (robots && robots.includes('noindex')) continue;
      const ogType = getMeta('property','og:type');
      if (ogType && ogType !== 'article') continue;

      const title       = getMeta('property','og:title') || '';
      const description = getMeta('property','og:description') || '';
      const image       = getMeta('property','og:image') || '';
      const published   = getMeta('property','article:published_time') || '';
      const section     = getMeta('property','article:section') || 'IPTV Reviews';
      if (!title) continue;

      const catInfo = CAT_MAP[section] || CAT_MAP['IPTV Reviews'];

      let rating = null;
      for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const graph = (JSON.parse(s.text)['@graph']) || [JSON.parse(s.text)];
          for (const node of graph) {
            if (node.reviewRating) { rating = parseFloat(node.reviewRating.ratingValue); break; }
          }
          if (rating) break;
        } catch {}
      }

      const wordCount = (root.querySelector('body') ? root.querySelector('body').text : '').trim().split(/\s+/).length;
      const readMin = Math.max(3, Math.round(wordCount / 220));

      let dateStr = '';
      try { dateStr = published ? new Date(published).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : ''; } catch {}

      const id = file.replace('.html','').replace(/[^a-z0-9]/gi,'-').toLowerCase().slice(0,12);
      articles.push({ id, file, title, description, image, published, dateStr,
        cat:catInfo.cat, tag:catInfo.tag, lbl:catInfo.lbl, rating, readMin });
    } catch(err) { console.warn(`Skipping ${file}: ${err.message}`); }
  }

  return articles.sort((a,b) => new Date(b.published||0) - new Date(a.published||0));
}

function jsEsc(str) {
  return str.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,' ');
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

  // Replace ARTS array
  const artsStart = index.indexOf('var ARTS=[');
  const artsEnd   = index.indexOf('\n];', artsStart) + 3;
  if (artsStart === -1) { console.error('ERROR: var ARTS=[ not found in index.html'); process.exit(1); }
  index = index.slice(0, artsStart) + buildArtsArray(articles) + index.slice(artsEnd);

  // Patch article card links to use a.href
  // The renderGrid function has: return'<a href="article.html" class="art-card">'
  index = index.replace(
    /return'<a href="article\.html" class="art-card">'/,
    `return'<a href="'+(a.href||'article.html')+'" class="art-card">'`
  );

  if (index.includes("a.href||'article.html'")) {
    console.log('href patch: OK');
  } else {
    console.warn('WARNING: href patch did not apply');
  }

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
    const img = a.image ? `\n    <image:image>\n      <image:loc>${a.image}</image:loc>\n      <image:title>${a.title.replace(/&/g,'&amp;')}</image:title>\n    </image:image>` : '';
    return `\n  <url>\n    <loc>${base}/${a.file}</loc>\n    <lastmod>${lm}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>${img}\n  </url>`;
  }).join('');

  fs.writeFileSync('sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${statics}${arts}\n</urlset>`.trim(),
    'utf8');
  console.log(`Rebuilt sitemap.xml with ${articles.length} articles`);
}

const articles = scanArticles();
console.log(`Found ${articles.length} articles:`);
articles.forEach(a => console.log(` - [${a.cat}] ${a.title}`));
rebuildIndex(articles);
rebuildSitemap(articles);
