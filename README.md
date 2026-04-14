# BestIPTVTuto — Auto-Publisher Setup

## How it works

1. You upload a new article HTML file to the GitHub repo
2. GitHub Actions runs automatically
3. It reads the Open Graph / meta tags from every article file
4. It rebuilds `index.html` with the correct article cards in the right category
5. It rebuilds `sitemap.xml` with the new article included
6. Changes are committed and pushed — Cloudflare Pages deploys in ~30 seconds

No manual editing of index.html ever again.

---

## One-time setup: Add markers to index.html

Find the article grid section in your `index.html`. It will look something like:

```html
<div class="articles-grid" id="articlesGrid">
  <!-- your current hardcoded article cards -->
</div>
```

Replace the contents with two marker comments:

```html
<div class="articles-grid" id="articlesGrid">
<!-- ARTICLES_START -->
<!-- ARTICLES_END -->
</div>
```

That's it. The builder replaces everything between those two markers on every push.

---

## What the builder reads from each article

| Field | Source |
|---|---|
| Title | `og:title` |
| Description | `og:description` |
| Image | `og:image` |
| Category | `article:section` |
| Author | `article:author` |
| Publish date | `article:published_time` |
| Rating | JSON-LD `reviewRating.ratingValue` |

Claude already puts all of these in every article it generates. No extra work needed.

---

## Files added to your repo

```
.github/
  workflows/
    build-homepage.yml   ← GitHub Actions workflow
build-homepage.js        ← The builder script
package.json             ← npm dependency (node-html-parser)
```

---

## Publishing a new article

1. Go to github.com/boxlobby/bestiptvtuto
2. Upload the HTML file Claude gave you
3. Commit
4. Done — homepage updates automatically in ~1 minute
