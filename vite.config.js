import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { VitePWA } from 'vite-plugin-pwa';

// Phase 2a — shared HTML partials. Replaces placeholder comments with shared
// markup from site/partials/ at build AND in dev (transformIndexHtml runs for
// every HTML entry), so nav/footer/logo are defined once and stay consistent.
// {{VERSION}} in the footer is filled from package.json so the version is never
// stale. Injection is placeholder-driven: a page only changes if it contains the
// placeholder, so the editor (no placeholders) is left untouched.
function htmlPartials() {
  const dir = resolve(__dirname, 'site/partials');
  const read = (f) => readFileSync(resolve(dir, f), 'utf8');
  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const version = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version;
        // Everything between the nav and footer becomes the <main id="main">
        // landmark (target of the nav's skip link), unless the page has its own.
        const wrapMain = !/<main[\s>]/.test(html) && html.includes('<!--PARTIAL:nav-->') && html.includes('<!--PARTIAL:footer-->');
        return html
          .split('<!--PARTIAL:mark-->').join(read('mark.html'))
          .split('<!--PARTIAL:nav-->').join(read('nav.html') + (wrapMain ? '\n<main id="main">' : ''))
          .split('<!--PARTIAL:footer-->').join((wrapMain ? '</main>\n' : '') + read('footer.html').split('{{VERSION}}').join(version));
      }
    }
  };
}

// Canonical production site URL. og:image, og:url, canonical links, and the
// generated SEO files should always point at the custom domain — not the ugly
// per-deployment *.vercel.app URL — so social embeds and search engines resolve
// to snapshotpro.xyz. Override with OG_BASE_URL for a one-off build (e.g. a
// staging domain).
const SITE_URL = (process.env.OG_BASE_URL || 'https://snapshotpro.xyz').replace(/\/+$/, '');

// Replaces __OG_BASE__ in HTML with the absolute site URL so social embeds
// (Discord, X, Slack) resolve og:image/og:url to the canonical domain.
function ogBase() {
  return {
    name: 'og-base',
    transformIndexHtml(html) {
      return html.split('__OG_BASE__').join(SITE_URL);
    }
  };
}

// Resolve the absolute site URL the same way ogBase() does, so generated SEO
// files (sitemap/robots) match the og: tags.
function siteBase() {
  return SITE_URL;
}

// Emit sitemap.xml + robots.txt at build so Google can discover every page,
// including the SEO/tool pages. Routes are listed here; keep in sync when adding
// a public marketing page. Absolute URLs use the resolved deploy base.
function seoFiles() {
  // [path, priority, changefreq]
  const routes = [
    ['/', '1.0', 'weekly'],
    ['/editor/', '0.9', 'weekly'],
    ['/features/', '0.8', 'monthly'],
    ['/tools/', '0.8', 'monthly'],
    ['/ai/', '0.8', 'monthly'],
    ['/agent/', '0.7', 'monthly'],
    ['/gallery/', '0.7', 'weekly'],
    ['/use-cases/', '0.7', 'monthly'],
    ['/pricing/', '0.7', 'monthly'],
    ['/guide/', '0.7', 'monthly'],
    ['/changelog/', '0.6', 'weekly'],
    ['/about/', '0.5', 'yearly'],
    ['/app-store-screenshots/', '0.8', 'monthly'],
    ['/device-mockup-generator/', '0.8', 'monthly'],
    ['/product-mockups/', '0.8', 'monthly'],
    ['/studio-intelligence/', '0.8', 'monthly'],
    ['/merge/', '0.8', 'monthly'],
    ['/og-image-generator/', '0.8', 'monthly'],
    ['/drop-shadow-generator/', '0.8', 'monthly'],
    ['/social-media-mockups/', '0.8', 'monthly'],
    ['/github-readme-screenshots/', '0.8', 'monthly'],
    ['/code-screenshots/', '0.8', 'monthly'],
    ['/extension/', '0.8', 'monthly'],
    ['/alternatives/', '0.7', 'monthly'],
    ['/faq/', '0.6', 'monthly'],
    ['/roadmap/', '0.5', 'monthly'],
    ['/privacy/', '0.3', 'yearly'],
    ['/terms/', '0.3', 'yearly'],
  ];
  return {
    name: 'seo-files',
    generateBundle() {
      const base = siteBase();
      const lastmod = new Date().toISOString().slice(0, 10);
      const urls = routes
        .map(([loc, priority, changefreq]) =>
          `  <url>\n    <loc>${base}${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`)
        .join('\n');
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
      const robots = `User-agent: *\nAllow: /\n${base ? `\nSitemap: ${base}/sitemap.xml\n` : ''}`;
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
    }
  };
}

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor/index.html'),
        changelog: resolve(__dirname, 'changelog/index.html'),
        privacy: resolve(__dirname, 'privacy/index.html'),
        appStoreScreenshots: resolve(__dirname, 'app-store-screenshots/index.html'),
        guide: resolve(__dirname, 'guide/index.html'),
        features: resolve(__dirname, 'features/index.html'),
        gallery: resolve(__dirname, 'gallery/index.html'),
        useCases: resolve(__dirname, 'use-cases/index.html'),
        pricing: resolve(__dirname, 'pricing/index.html'),
        agent: resolve(__dirname, 'agent/index.html'),
        about: resolve(__dirname, 'about/index.html'),
        ai: resolve(__dirname, 'ai/index.html'),
        tools: resolve(__dirname, 'tools/index.html'),
        deviceMockupGenerator: resolve(__dirname, 'device-mockup-generator/index.html'),
        productMockups: resolve(__dirname, 'product-mockups/index.html'),
        studioIntelligence: resolve(__dirname, 'studio-intelligence/index.html'),
        merge: resolve(__dirname, 'merge/index.html'),
        ogImageGenerator: resolve(__dirname, 'og-image-generator/index.html'),
        dropShadowGenerator: resolve(__dirname, 'drop-shadow-generator/index.html'),
        socialMediaMockups: resolve(__dirname, 'social-media-mockups/index.html'),
        githubReadmeScreenshots: resolve(__dirname, 'github-readme-screenshots/index.html'),
        codeScreenshots: resolve(__dirname, 'code-screenshots/index.html'),
        extension: resolve(__dirname, 'extension/index.html'),
        alternatives: resolve(__dirname, 'alternatives/index.html'),
        faq: resolve(__dirname, 'faq/index.html'),
        roadmap: resolve(__dirname, 'roadmap/index.html'),
        terms: resolve(__dirname, 'terms/index.html')
      },
      output: {
        manualChunks: {
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-openai': ['openai'],
          'vendor-anthropic': ['@anthropic-ai/sdk'],
          'vendor-three': ['three'],
          // v24 — Code Snippet Studio's syntax highlighter, lazy-loaded on first use.
          'vendor-hljs': ['highlight.js']
        }
      }
    }
  },
  server: {
    port: 5173,
    open: true,
  },
  plugins: [
    htmlPartials(),
    ogBase(),
    seoFiles(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'SnapShotPro',
        short_name: 'SnapShotPro',
        description: 'Pro screenshot & image editor — filters, frames, AI background removal, annotations, mockups, and more.',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        // v34.1 — open the installed app on the editor; `id` keeps the original
        // identity so existing installs aren't treated as a different app.
        id: '/',
        start_url: '/editor/',
        icons: [
          { src: 'pwa-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'pwa-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: 'pwa-512-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
        ],
        // v23 — accept images shared from other apps (Android installed PWA).
        // The POST is intercepted by the worker (public/share-handler.js).
        share_target: {
          action: '/editor/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'image', accept: ['image/*'] }] }
        }
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // v33.2 — the precache downloads in the background on the first visit to
        // ANY page (homepage included), so it holds only what the editor needs
        // to boot offline. PNGs (OG cards, marketing art, gallery exports) and the
        // big lazy chunks (three.js, onnxruntime, jspdf, html2canvas, AI SDKs) are
        // left out and cached by the runtime rule below the first time they're used.
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        manifestTransforms: [async (entries) => ({
          manifest: entries.filter((e) => !(/^assets\/.*\.js$/.test(e.url) && !/^assets\/editor-/.test(e.url) && e.size > 100 * 1024)),
          warnings: []
        })],
        // v23 — share-target POST handler layered onto the generated SW, so
        // Workbox keeps owning precache / runtime caching / auto-update.
        importScripts: ['/share-handler.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://cdn.jsdelivr.net' || url.origin === 'https://staticimgly.com' || url.origin === 'https://unpkg.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-models',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            // Hashed build chunks are immutable, so cache-first is safe: lazy
            // features keep working offline once they've been opened.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'lazy-chunks',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 60 }
            }
          }
        ]
      }
    })
  ]
});
