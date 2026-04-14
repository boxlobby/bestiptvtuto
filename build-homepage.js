/**
 * BestIPTVTuto — Homepage & Sitemap Builder
 * Scans all article HTML files, extracts metadata from Open Graph / meta tags,
 * then rebuilds the ARTS[] array in index.html and sitemap.xml automatically.
 */

const fs   = require('fs');
const { parse } = require('node-html-parser');

// ─── Files to skip (not articles) ─────────────────────────────────────────────
const SKIP = new Set([
  'index.html','article.html','about.html','404.html',
  'privacy.html','tos.html','dmca.html'
]);

// ─── Category mapping ──────────────────────────────────────────────────────────
const CAT_MAP = {
  'IPTV Reviews': { cat:'reviews', tag:'t-rv', lbl:'IPTV Review' },
  'Setup Guides': { cat:'guides',  tag:'t-gd', lbl:'Guide'       },
  'Tips & Tricks':{ cat:'tips',    tag:'t-tp', lbl:'Tips'        },
  'Comparisons':  { cat:'compare', tag:'t-cm', lbl:'Comparison'  },
  'News':         { cat:'news',    tag:'t-nw', lbl:'News'        },
};

function scanArticles() {
  const files = fs.readdirSync('.').filter(f =>
    f.endsWith('.html') && !SKIP.has(f)
  );
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
      const scripts = root.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        try {
          const json  = JSON.parse(s.text);
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

      const bodyText = root.querySelector('body') ? root.querySelector('body').text : '';
      const wordCount = bodyText.trim().split(/\s+/).length;
      const readMin   = Math.max(3, Math.round(wordCount / 220));

      let dateStr = '';
      if (published) {
        try {
          dateStr = new Date(published).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric'
          });
        } catch {}
      }

      const id = file.replace('.html','').replace(/[^a-z0-9]/gi,'-').toLowerCase().slice(0,12);

      articles.push({ id, file, title, description, image, published, dateStr,
        cat: catInfo.cat, tag: catInfo.tag, lbl: catInfo.lbl, rating, readMin });
    } catch (err) {
      console.warn(`Skipping ${file}: ${err.message}`);
    }
  }

  articles.sort((a, b) => {
    const da = a.published ? new Date(a.published) : new Date(0);
    const db = b.published ? new Date(b.published) : new Date(0);
    return db - da;
  });

  return articles;
}

function jsEsc(str) {
  return str.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,' ');
}

function buildArtsArray(articles) {
  const entries = articles.map((a, i) => {
    const p = [];
    p.push(`id:'${a.id}'`);
    p.push(`cat:'${a.cat}'`);
    p.push(`tag:'${a.tag}'`);
    p.push(`lbl:'${jsEsc(a.lbl)}'`);
    p.push(`title:'${jsEsc(a.title)}'`);
    p.push(`exc:'${jsEsc(a.description)}'`);
    p.push(`date:'${a.dateStr}'`);
    p.push(`rd:'${a.readMin} min'`);
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
  const artsRegex = /var ARTS\s*=\s*\[[\s\S]*?\];/;
  if (!artsRegex.test(index)) {
    console.error('ERROR: Could not find "var ARTS=[...];" in index.html');
    process.exit(1);
  }
  let patched = index.replace(artsRegex, buildArtsArray(articles));
  // Patch renderGrid to use a.href instead of hardcoded "article.html"
  patched = patched.replace(
    '<a href="article.html" class="art-card">',
    '<a href="\'+(a.href||\'article.html\')+\'" class="art-card">'
  );
  patched = patched.replace(
    "'<a href=\"article.html\" class=\"art-card\">'",
    "'<a href=\"'+(a.href||'article.html')+'\" class=\"art-card\">'"
  );
  fs.writeFileSync('index.html', patched, 'utf8');
  console.log(`Rebuilt index.html with ${articles.length} articles`);
}

function rebuildSitemap(articles) {
  const base  = 'https://bestiptvtuto.com';
  const today = new Date().toISOString().split('T')[0];
  const staticEntries = [
    { url:'/',            priority:'1.0', changefreq:'daily'   },
    { url:'/about.html', priority:'0.6', changefreq:'monthly' },
  ].map(p => `
  <url>
    <loc>${base}${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('');

  const articleEntries = articles.map(a => {
    const lastmod    = a.published ? a.published.split('T')[0] : today;
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

const articles = scanArticles();
console.log(`Found ${articles.length} articles:`);
articles.forEach(a => console.log(` - [${a.cat}] ${a.title}`));
rebuildIndex(articles);
rebuildSitemap(articles);
