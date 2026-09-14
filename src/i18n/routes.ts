/**
 * THE ROUTE MAP — single source of truth.
 *
 * Routes, the language switcher, hreflang, the sitemap and the navigation all
 * derive from this table. Adding a page means adding one row. A page cannot
 * exist in one language and not the other: the type requires both slugs.
 */

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';

export type PageKey =
  | 'home' | 'about' | 'founders' | 'leadership' | 'academics'
  | 'admissions' | 'calendar' | 'school-life' | 'gallery'
  | 'achievements' | 'future-campus' | 'contact' | 'privacy';

/** Slug per locale. Empty string = the locale root. */
export const ROUTES: Record<PageKey, Record<Locale, string>> = {
  'home':          { fr: '',                                 en: '' },
  'about':         { fr: 'a-propos',                         en: 'about' },
  'founders':      { fr: 'a-propos/message-des-fondateurs',  en: 'about/founders-message' },
  'leadership':    { fr: 'a-propos/direction',               en: 'about/leadership' },
  'academics':     { fr: 'programmes',                       en: 'academics' },
  'admissions':    { fr: 'admissions',                       en: 'admissions' },
  'calendar':      { fr: 'calendrier-et-horaires',           en: 'calendar-and-hours' },
  'school-life':   { fr: 'vie-scolaire',                     en: 'school-life' },
  'gallery':       { fr: 'vie-scolaire/galerie',             en: 'school-life/gallery' },
  'achievements':  { fr: 'distinctions',                     en: 'achievements' },
  'future-campus': { fr: 'futur-campus',                     en: 'future-campus' },
  'contact':       { fr: 'contact',                          en: 'contact' },
  'privacy':       { fr: 'confidentialite',                  en: 'privacy' },
};

export const PAGE_KEYS = Object.keys(ROUTES) as PageKey[];

/** Path for a page in a locale, always with a trailing slash. */
export function pathFor(key: PageKey, locale: Locale): string {
  const slug = ROUTES[key][locale];
  return slug ? `/${locale}/${slug}/` : `/${locale}/`;
}

/** Absolute URL, for canonical / hreflang / Open Graph. */
export function urlFor(key: PageKey, locale: Locale, site: URL | string): string {
  return new URL(pathFor(key, locale), site).href;
}

/** The other locale — with two locales this is total. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'fr' ? 'en' : 'fr';
}

/** Resolve a URL pathname back to its page key, for the language switcher. */
export function keyFromPath(pathname: string): { key: PageKey; locale: Locale } | null {
  const clean = pathname.replace(/^\/+|\/+$/g, '');
  const [maybeLocale, ...rest] = clean.split('/');
  if (!LOCALES.includes(maybeLocale as Locale)) return null;
  const locale = maybeLocale as Locale;
  const slug = rest.join('/');
  const key = PAGE_KEYS.find((k) => ROUTES[k][locale] === slug);
  return key ? { key, locale } : null;
}

/** Primary navigation, with optional submenus. Labels come from the site collection. */
export const PRIMARY_NAV: { key: PageKey; children?: PageKey[] }[] = [
  { key: 'home' },
  { key: 'about', children: ['about', 'founders', 'leadership', 'achievements'] },
  { key: 'academics' },
  { key: 'admissions' },
  { key: 'school-life', children: ['school-life', 'gallery'] },
  { key: 'future-campus' },
  { key: 'contact' },
];

export const FOOTER_NAV: PageKey[] = [
  'about', 'academics', 'admissions', 'school-life',
  'achievements', 'future-campus', 'gallery',
];
