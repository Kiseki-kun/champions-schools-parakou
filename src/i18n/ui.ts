import { getCollection, getEntry } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { Locale, PageKey } from './routes';

/** The parents' portal (installable app). One place to change if the address ever moves. */
export const PORTAL_URL = 'https://portail.championsschoolsparakou.com';

export type SiteData = {
  locale: Locale;
  schoolName: string;
  motto: string;
  tagline: string;
  address: string;
  phones: string[];
  /** The one the header and the sticky action bar use — see src/content/site/*.yaml. */
  headerPhone: string;
  email: string;
  nav: Record<string, string>;
  pageTitles: Record<string, string>;
  pageDescriptions: Record<string, string>;
  ui: Record<string, string>;
};

/** Typed accessor for the per-locale site strings. */
export async function getSite(locale: Locale): Promise<SiteData> {
  const entry = await getEntry('site', locale);
  if (!entry) throw new Error(`Missing site content for locale "${locale}"`);
  return entry.data as SiteData;
}

/** The homepage's editorial copy, shaped by the `home` schema in content.config.ts. */
export type HomeData = CollectionEntry<'home'>['data'];

/**
 * Typed accessor for the per-locale homepage copy — the counterpart to
 * getSite(), so every collection on this project is reached the same way.
 *
 * The three failure modes are told apart deliberately, because they have three
 * different fixes and the page cannot distinguish them:
 *
 *  1. The collection loaded NO entries. The files are on disk but Astro's
 *     content store was written while `src/content/home/` did not yet exist,
 *     and a store is only invalidated when content.config.ts changes. This is
 *     what broke the local homepage after Phase 5 landed: the files arrived
 *     under a dev server that had already cached the collection as empty.
 *     `astro sync` rebuilds the store; `npm run dev` and `npm run build` now
 *     run it first, so this cannot persist.
 *  2. This locale is absent while others are present — a real parity break.
 *  3. The file is mis-keyed: `xx.yaml` declaring a different `locale:`. The
 *     glob loader keys the entry by filename, so a mismatch would silently
 *     serve one language's copy under the other's route.
 */
export async function getHome(locale: Locale): Promise<HomeData> {
  const entry = await getEntry('home', locale);

  if (!entry) {
    const present = await getCollection('home');
    if (present.length === 0) {
      throw new Error(
        'The "home" content collection loaded no entries at all. The locale files are ' +
          'in the repository, so this is a stale Astro content store rather than missing ' +
          'content. Run `npx astro sync` (npm run dev and npm run build now do this ' +
          'automatically), or delete the .astro folder and restart.',
      );
    }
    throw new Error(
      `Missing homepage content for locale "${locale}". Expected ` +
        `src/content/home/${locale}.yaml. Locales currently loaded: ` +
        `${present.map((e) => e.id).join(', ')}.`,
    );
  }

  if (entry.data.locale !== locale) {
    throw new Error(
      `src/content/home/${locale}.yaml declares locale: "${entry.data.locale}". ` +
        'The filename keys the entry, so the two must agree.',
    );
  }

  return entry.data;
}

export function navLabel(site: SiteData, key: PageKey): string {
  const label = site.nav[key];
  if (!label) throw new Error(`Missing nav label "${key}" for locale ${site.locale}`);
  return label;
}

/** Digits only, for tel: and wa.me links. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
export function waHref(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}`;
}
