# Link Previews, Tags and Structured Data for Our Tools

**For:** Tristen. **From:** Ben (with Claude). **Date:** 2026-09-28.
**Why this exists:** Tom posted https://vlg.geniusdrive.com on LinkedIn and got a bare card, no image, no good title ("Tags and images for tools", Sep 28). He asked whether this is a domain thing or a per-tool HTML thing, and asked us to check every tool. This doc explains the concepts, answers his question, and gives a checklist and code you can apply to each tool. VLG is used as the worked example throughout.

---

## 1. The short answer to Tom's question

**It is per tool, in the HTML, not the domain.** DNS (GoDaddy) and CloudFront only deliver the page. What a link preview shows is decided entirely by:

1. tags inside each page's `<head>`, and
2. an image file that lives at a **public, absolute URL**.

Neither is created by the domain, the certificate or the distribution. Every tool needs its own.

**One catch that is specific to your hosting kit** (GD_TOOLS `static-site-cdk`): the stack publishes only `tool.html` (as `index.html`) and `favicon.ico`. There is nowhere to serve a preview image from, and social sites will not accept an image embedded in the page (a `data:` URI does not work for `og:image`). See section 6 for the two-line fix.

---

## 2. Vocabulary: three separate things that all live in `<head>`

| Thing | Who reads it | What it controls | Priority for our tools |
|---|---|---|---|
| **Basic SEO tags**: `<title>`, `<meta name="description">`, `<link rel="canonical">` | Google, Bing, browsers | The blue link and snippet text in search results; the browser tab | High, and trivial |
| **Social / share tags (SMO)**: Open Graph `og:*` and X `twitter:*` | LinkedIn, Facebook, X, Slack, Teams, iMessage, WhatsApp | The preview card when someone pastes the link | **Highest for us.** Our tools are mostly spread by salespeople and marketing pasting links |
| **Structured data**: a `<script type="application/ld+json">` block using the schema.org vocabulary | Google, Bing, AI search/answer engines | How the page is understood and classified (what it is, who made it, what it is about). No visible effect on the page | Medium. Helps understanding and attribution, rarely changes how results look |

Key facts:

- **None of these change what a visitor sees on the page.** They are metadata.
- **Crawlers do not run JavaScript.** LinkedIn's and most social crawlers read the raw HTML only, so the tags must be in the static `<head>`, not injected by script. Our single-file tools are fine as long as the tags are hard-coded in the file.
- **Structured data must describe what is visibly on the page.** Google penalizes markup that claims things the page does not show (e.g. ratings you do not have).

---

## 3. The share preview (Open Graph + X): what to put in `<head>`

### VLG's version (proposed, not yet live)

```html
<title>Free Value-Led Growth Assessment | Genius Drive</title>
<meta name="description" content="Free assessment for B2B go-to-market teams. Score how well you communicate, quantify and activate value, benchmark against the top decile of 122 organizations, and get a personalized report.">
<link rel="canonical" href="https://vlg.geniusdrive.com/">

<meta property="og:type" content="website">
<meta property="og:url" content="https://vlg.geniusdrive.com/">
<meta property="og:site_name" content="Genius Drive">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="Does your team sell value, or pitch features?">
<meta property="og:description" content="Take the free Value-Led Growth Assessment. See how you compare to the top decile of 122 B2B organizations, and get your personalized report and next moves.">
<meta property="og:image" content="https://vlg.geniusdrive.com/og-image-v1.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Value-Led Growth Assessment by Genius Drive: a maturity curve showing your score, the recommended next level and the top decile benchmark.">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@thegeniusdrive">
<meta name="twitter:image:alt" content="Value-Led Growth Assessment by Genius Drive: a maturity curve showing your score, the recommended next level and the top decile benchmark.">
```

### What each tag does, and the rules that matter

| Tag | Purpose | Rules / gotchas |
|---|---|---|
| `<title>` | Search result headline and browser tab | About 60 characters max. Use the tool's real name, then `| Genius Drive`. Keep it consistent with the structured data `name` |
| `meta description` | Search snippet (Google may rewrite it) | About 155 characters. Say who it is for, what they get, and that it is free |
| `canonical` | Tells search engines the one true URL, so `?utm=` variants are not treated as duplicates | Absolute URL, with the trailing slash |
| `og:url` | The URL the preview is attributed to | Same as canonical |
| `og:title` | The bold headline on the card | Can differ from `<title>`. On social, a provocative question beats a label (VLG uses its own pillar question) |
| `og:description` | Grey text under the title | 1 to 2 short sentences, the payoff. Some apps truncate after about 100 characters, so front-load it |
| `og:image` | The picture. **The single biggest factor in whether people click** | **Must be an absolute `https://` URL that returns HTTP 200 publicly.** No `data:` URIs, no relative paths, no 403 |
| `og:image:width` / `height` | Lets platforms lay out the card without downloading first | **Use 1200 x 630.** It works everywhere; 1200 x 627 is LinkedIn-only and gets slightly cropped elsewhere |
| `og:image:alt`, `twitter:image:alt` | Accessibility text for the image | Describe the image, not the marketing message |
| `og:site_name` | Small "Genius Drive" label on some cards | |
| `twitter:card` = `summary_large_image` | Tells X to show the big-image card instead of a thumbnail | X falls back to the `og:*` tags for title, description and image, so you do not need to duplicate them |
| `twitter:site` | Credits @thegeniusdrive | |

### Image specs

- **1200 x 630 px**, PNG or JPG, **under 1 MB** (VLG's is 293 KB; hard limits are about 5 MB but smaller loads faster in feeds).
- **Design for a phone:** LinkedIn mobile shows the card at about a third of full size. Big type only; check it by viewing a 400 px wide copy.
- **Keep everything important in the middle ~80%.** Some apps crop edges or show a square thumbnail.
- **Show what the user gets,** not a stock photo. VLG uses its own maturity curve with illustrative markers (no real scores).
- **Brand on-page:** same fonts and colours as the tool, so the click lands somewhere that looks like the card.
- **Logo contrast:** the grey/blue GD logo disappears on navy. VLG's draft puts the logo on a white footer strip; with the official white logo it could sit directly on navy.
- **Version the file name** (`og-image-v1.png`, `-v2`, ...). See caching below.

### How VLG's image is produced (reusable approach)

`marketing/og-image.html` in the VLG repo is a 1200 x 630 HTML page using the tool's own fonts, colours and the real `maturity-curve.js` component. A headless Chromium screenshot (Playwright) of that page produces `og-image-v1.png`. Changing the headline or wording is an edit plus a re-render, no design tool needed. The same pattern would work for any of your tools: build the card in HTML with the tool's CSS, screenshot it.

---

## 4. Caching: why a fix does not show up immediately

- **LinkedIn caches a URL's preview for about 7 days.** A post made before the fix keeps the old (blank) card forever; new posts may also show the stale card until the cache refreshes.
- **Force a refresh** by pasting the URL into **LinkedIn Post Inspector** (https://www.linkedin.com/post-inspector/). Facebook has the equivalent **Sharing Debugger** (https://developers.facebook.com/tools/debug/).
- **Changing the image?** Give it a **new file name** (`-v2`) and update `og:image`. Platforms cache images by URL, so the same name can keep serving the old picture even after a redeploy and a Post Inspector refresh.
- CloudFront is not the problem here: both our stacks invalidate `/*` on every deploy.

---

## 5. Structured data (schema.org JSON-LD)

### What it is

A hidden JSON block that describes the page in a shared vocabulary (schema.org) that Google, Bing and AI search tools read. It tells them *what* the page is (a web application), *who* made it (Genius Drive), *what it is about*, and how it relates to other things (e.g. the whitepaper it is based on). It does not change the page, load anything or track anything.

### What it will and will not do for us

- **Will:** better classification, correct attribution to Genius Drive, better odds of accurate descriptions in search and AI answers, and (with the maturity-model markup below) positioning GD as the source of the "Value-Led Growth Maturity Model" term.
- **Will not:** produce Google's special app "rich result" (stars, price). That requires `aggregateRating` / reviews, which we do not have. **Never invent ratings or reviews**; Google penalizes it.

### The VLG version (proposed, not yet live)

The key idea is an **`@graph`**: several items that reference each other by `@id`, so search engines build one connected picture (GD made this tool; the tool is based on GD's whitepaper; it applies GD's maturity model). Separate snippets cannot express those links.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": "https://vlg.geniusdrive.com/#app",
      "name": "Value-Led Growth Assessment",
      "alternateName": ["VLG Assessment", "Value-Led Growth Maturity Assessment"],
      "url": "https://vlg.geniusdrive.com/",
      "description": "Free maturity assessment for B2B go-to-market teams. Score how well your organization communicates, quantifies and activates value across eight capabilities, benchmark against the top decile of 122 B2B organizations, and get prioritized next moves plus a personalized PDF report.",
      "applicationCategory": "BusinessApplication",
      "applicationSubCategory": "Value selling and go-to-market maturity assessment",
      "operatingSystem": "Any (web browser)",
      "inLanguage": "en",
      "isAccessibleForFree": true,
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
      "audience": {
        "@type": "BusinessAudience",
        "audienceType": "B2B go-to-market leaders: sales, marketing, customer success, revenue operations, sales enablement and value engineering"
      },
      "featureList": [
        "Assess up to three pillars: Value Communication, Value Quantification and Value Activation",
        "Rate eight capabilities per pillar, from Strategy & Governance to Intelligence & Optimization, on a six-level maturity scale from Reacting to Orchestrating",
        "Benchmark your maturity score against the top decile of 122 B2B organizations",
        "See your strongest capabilities and biggest gaps",
        "Get the three highest-impact next moves for your team",
        "Receive a personalized PDF report by email"
      ],
      "about": [
        { "@type": "Thing", "name": "Value selling" },
        { "@type": "Thing", "name": "Business value quantification" },
        { "@type": "Thing", "name": "Customer value realization" },
        { "@id": "https://vlg.geniusdrive.com/#model" }
      ],
      "keywords": "value selling, value-based selling, value-led growth, value engineering, business case, ROI, value realization, go-to-market maturity, sales maturity assessment, B2B",
      "isBasedOn": { "@id": "https://vlg.geniusdrive.com/#whitepaper" },
      "creator": { "@id": "https://geniusdrive.com/#organization" },
      "publisher": { "@id": "https://geniusdrive.com/#organization" }
    },
    {
      "@type": "DefinedTermSet",
      "@id": "https://vlg.geniusdrive.com/#model",
      "name": "Value-Led Growth Maturity Model",
      "description": "Genius Drive's six-level framework for how B2B organizations communicate, quantify and activate value across the customer lifecycle.",
      "hasDefinedTerm": [
        { "@type": "DefinedTerm", "name": "Value Communication", "description": "Telling a customer value story instead of pitching features, across marketing and sales conversations." },
        { "@type": "DefinedTerm", "name": "Value Quantification", "description": "Proving the value delivered with business cases, ROI and measurable outcomes." },
        { "@type": "DefinedTerm", "name": "Value Activation", "description": "Embedding value in how teams are enabled, and how customers adopt, realize, renew and expand." }
      ]
    },
    {
      "@type": "Report",
      "@id": "https://vlg.geniusdrive.com/#whitepaper",
      "name": "The Value-Led Growth Maturity Model: A Framework for Winning in the Outcome Economy",
      "url": "https://geniusdrive.com/wp-content/uploads/2026/06/170626-Growth-Maturity-Model-GD-VGMM-WP045-1.pdf",
      "author": { "@id": "https://geniusdrive.com/#organization" }
    },
    {
      "@type": "Organization",
      "@id": "https://geniusdrive.com/#organization",
      "name": "Genius Drive",
      "url": "https://geniusdrive.com",
      "description": "Genius Drive empowers B2B solution providers to better communicate, quantify and activate value across the entire customer lifecycle.",
      "logo": "LOGO_URL_ON_WHITE_BACKGROUND",
      "sameAs": [
        "https://www.linkedin.com/company/genius-drive/",
        "https://www.youtube.com/@BusinessValueCollective",
        "https://twitter.com/thegeniusdrive",
        "https://www.instagram.com/thegeniusdrive/"
      ]
    }
  ]
}
</script>
```

### Why each part is there (the reasoning to carry to other tools)

- **`@id` links:** join the items into one graph. The `Organization` `@id` (`https://geniusdrive.com/#organization`) should be **the same on every tool**, so all tools roll up to one Genius Drive entity. If geniusdrive.com (WordPress, possibly via a plugin like Yoast) already declares an Organization with a different `@id`, reuse that one instead. **Open question:** a quick fetch of geniusdrive.com showed no JSON-LD, but the fetch tool may have stripped scripts; worth checking the page source.
- **`name` matches `<title>`;** alternates go in `alternateName`. Inconsistent names weaken the signal.
- **`description` uses buyer search language** (value selling, business case, ROI, value realization) and names the outcome, not just the tool.
- **`audience`, `featureList`, `about`** answer what AI search tries to match: who is it for, what does it do, what is it about. Everything listed is visibly true in the tool.
- **`offers` price 0 / `isAccessibleForFree`:** "free" is a real search qualifier.
- **`DefinedTermSet`:** positions GD as the source of a named framework. Worth doing for any tool built on a named GD methodology.
- **`Report` / `isBasedOn`:** ties the tool to published GD research, the strongest credibility signal available.
- **`logo`:** must be a URL to a logo that reads on a **white** background (Google shows logos on white). The only one found on geniusdrive.com is the white version, so a dark/colour logo URL is still needed.

### Types considered and rejected (so nobody adds them later)

| Type | Why not |
|---|---|
| `aggregateRating` / `Review` | Only thing that unlocks star rich results, but we have no genuine ratings. Fabricated ones get sites penalized |
| `FAQPage` | Only valid if a visible FAQ is on the page; Google now limits FAQ rich results to a few authoritative site types |
| `HowTo` | Google retired HowTo rich results |
| `Dataset` (for the benchmark) | The data is not publicly viewable or downloadable, so it does not qualify |
| `BreadcrumbList` | Single-page tools have no hierarchy |

---

## 6. Applying this to your kit (GD_TOOLS `static-site-cdk`)

The kit's `lib/site-stack.ts` stages exactly two files into the bucket: `tool.html` (as `index.html`) and `infra/assets/favicon.ico`. To serve a share image, stage one more file the same way the favicon is staged:

```ts
// After the favicon copy in lib/site-stack.ts:
// The link-preview image LinkedIn/X/Slack fetch from og:image. Must be a real
// file at a public URL -- social crawlers do not accept data: URIs. Bump the
// file name (-v2, -v3) whenever the image changes: platforms cache by URL.
fs.copyFileSync(
  path.join(__dirname, '..', 'assets', 'og-image-v1.png'),
  path.join(staging, 'og-image-v1.png'),
);
```

Then put the image at `infra/assets/og-image-v1.png`, add the section 3 tags to `tool.html` with `og:image` pointing at `https://<client-tool>.geniusdrive.com/og-image-v1.png`, and redeploy. The kit's `prune: true` removes the old image when the file name changes, and the `/*` invalidation makes it live immediately.

Alternative with no stack change: upload the image to the geniusdrive.com WordPress media library and point `og:image` at that URL. It works, but it splits the tool across two systems, so the in-repo approach above is preferable.

(VLG does not need this change: its stack was adapted to publish the whole `static-site/` folder, so an image placed there ships automatically.)

### Embedded tools (e.g. SMOMA inside Mass Group's site)

When a tool is shown inside a client's page via iframe, people share **the host page's URL**, so the preview comes from the **host page's** tags, not the tool's. The tool's own tags only matter for direct links to the tool URL. For embedded tools, the client's web team owns the preview.

---

## 7. Per-tool checklist

For each of the 12+ tools:

- [ ] `<title>`: real tool name `| Genius Drive`, about 60 characters
- [ ] `<meta name="description">`: about 155 characters, who / what they get / free
- [ ] `<link rel="canonical">` = the tool's URL with trailing slash
- [ ] `og:type`, `og:url`, `og:site_name`, `og:locale`, `og:title`, `og:description`
- [ ] `og:image` = absolute https URL, **returns 200**, 1200 x 630, under 1 MB, versioned file name
- [ ] `og:image:width` 1200, `og:image:height` 630, `og:image:type`, `og:image:alt`
- [ ] `twitter:card` = `summary_large_image`, `twitter:site` = `@thegeniusdrive`, `twitter:image:alt`
- [ ] JSON-LD `@graph` with the shared Organization `@id`; only claims visible on the page
- [ ] Numbers that are hard-coded in tags (e.g. VLG's "122") added to that tool's data-refresh checklist, because tags do not update themselves when the data changes
- [ ] After deploy: verify (section 8), then refresh in LinkedIn Post Inspector

---

## 8. How to verify

```bash
# 1. Are the tags in the raw HTML (what crawlers see)?
curl -s https://vlg.geniusdrive.com/ | grep -iE 'og:|twitter:|<title>|name="description"|canonical'

# 2. Does the image actually load publicly? Expect 200 and image/png.
curl -sI https://vlg.geniusdrive.com/og-image-v1.png | head -5

# 3. Is the JSON-LD valid JSON? (paste the block into the validators below)
```

Then use the official checkers:

- **LinkedIn Post Inspector:** https://www.linkedin.com/post-inspector/ (shows the card LinkedIn will render, and refreshes its cache)
- **Facebook Sharing Debugger:** https://developers.facebook.com/tools/debug/
- **Google Rich Results Test:** https://search.google.com/test/rich-results
- **Schema Markup Validator:** https://validator.schema.org/

---

## 9. Other SEO items worth knowing (lower priority)

- **Links from geniusdrive.com matter most for a single-page tool.** A prominent link from the relevant whitepaper or landing page (and inside the whitepaper PDF) does more for ranking than any tag.
- **`robots.txt` and `sitemap.xml`:** both currently return 403 on our tools (the kit deliberately 403s missing paths). A 4xx robots.txt is treated by Google as "no restrictions", so it is not blocking anything, but adding a two-line robots.txt pointing to a one-URL sitemap is tidy. With your kit it would be staged like the favicon.
- **Tracking where leads come from:** if shared links carry UTM tags (`?utm_source=linkedin&utm_campaign=...`), the tool's lead capture can record them, so marketing knows which channel produced each lead. The `canonical` tag keeps the UTM variants from counting as duplicate pages. (Proposed for VLG, not built yet.)

---

## 10. Status for VLG (as of 2026-09-28)

| Item | Status |
|---|---|
| Share image | Draft built: `marketing/og-image-v1.png` from `marketing/og-image.html`; awaiting Ben/Tom review |
| OG / X / title / description / canonical tags | Drafted (section 3); not live |
| JSON-LD | Drafted (section 5); needs a logo URL that reads on white, and the Organization `@id` check |
| Tracked in | VLG `PROJECT_STATE.md` O-23 (share preview) and O-24 (JSON-LD), bundled with feedback round 1 |
