// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { LOCALES, PAGE_KEYS, ROUTES, pathFor } from './src/i18n/routes.ts';

const SITE = 'https://championsschoolsparakou.com';

/**
 * Language alternates for the sitemap, built from the route map.
 *
 * The sitemap integration's own `i18n` option cannot pair these pages: it
 * matches on a shared path with a swapped locale segment, and our slugs are
 * localised (/fr/a-propos/ vs /en/about/). Left to itself it emitted a
 * duplicate `fr` alternate on the home page and none at all on the rest.
 * Deriving them here keeps one authoritative source: the route map.
 */
const ALTERNATES = new Map();
for (const key of PAGE_KEYS) {
  const links = [
    ...LOCALES.map((lang) => ({ lang, url: new URL(pathFor(key, lang), SITE).href })),
    /* The <head> of every page declares x-default alongside fr and en. Google
       asks that the two ways of annotating hreflang agree, and the sitemap was
       carrying only the two languages — so a crawler reading the sitemap saw a
       different set of annotations from one reading the page. Same target as
       the <head>: the default locale's URL. */
    { lang: 'x-default', url: new URL(pathFor(key, 'fr'), SITE).href },
  ];
  for (const lang of LOCALES) ALTERNATES.set(new URL(pathFor(key, lang), SITE).href, links);
}

export default defineConfig({
  site: SITE,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  i18n: {
    locales: ['fr', 'en'],
    defaultLocale: 'fr',
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  integrations: [
    sitemap({
      // `/` is a noindex redirect and `/404` is an error route: neither belongs here.
      filter: (page) => {
        const path = new URL(page).pathname;
        return path !== '/' && !path.includes('/404');
      },
      serialize: (item) => {
        const links = ALTERNATES.get(item.url);
        return links ? { ...item, links } : item;
      },
    }),
  ],
  image: { responsiveStyles: true },
});
