import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { glob, file } from 'astro/loaders';

/* ------------------------------------------------------------------ *
 * site — one entry per locale. UI strings, school identity, contacts. *
 * ------------------------------------------------------------------ */
const site = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/site' }),
  schema: z.object({
    locale: z.enum(['fr', 'en']),
    schoolName: z.string(),
    motto: z.string(),
    tagline: z.string(),
    address: z.string(),
    phones: z.array(z.string()).min(1),
    /* The number the site's contact controls use: the header's utility bar
       and drawer, and the sticky mobile action bar's Call and WhatsApp links.
       Separate from phones[0] so that choice cannot leak into the footer, the
       contact page or the structured data, which publish every number the
       school supplied. (Named for the header, where it started on 12 September
       2026; the action bar joined it on the 13th, once the school confirmed
       this line is on WhatsApp.) */
    headerPhone: z.string(),
    email: z.string().email(),
    nav: z.record(z.string(), z.string()),
    pageTitles: z.record(z.string(), z.string()),
    pageDescriptions: z.record(z.string(), z.string()),
    ui: z.record(z.string(), z.string()),
  }),
});

/* ------------------------------------------------------------------ *
 * home — the homepage's editorial copy, one entry per locale.        *
 *                                                                     *
 * Kept out of `site` because the homepage needs structure (lists of   *
 * results, levels, requirements) rather than flat strings. Bilingual  *
 * parity is structural: [lang]/index.astro builds both locales from   *
 * getStaticPaths, so a missing or incomplete fr.yaml / en.yaml fails  *
 * the build rather than silently shipping one language.               *
 *                                                                     *
 * Every value here is traceable to 01-School-Information. Nothing is  *
 * asserted that the school did not supply. See 05-HOMEPAGE.md §3.     *
 * ------------------------------------------------------------------ */
const home = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/home' }),
  schema: z.object({
    locale: z.enum(['fr', 'en']),
    hero: z.object({
      /* One headline per photograph, in the order the frames are shown. The
         first is also the page's static <h1>, so it is what a crawler and a
         visitor without JavaScript see. HeroSequence fails the build if the
         count does not match the number of frames. */
      headlines: z.array(z.string().min(1)).min(1),
      lead: z.string(),
      region: z.string(),
      prev: z.string(),
      next: z.string(),
      pause: z.string(),
      play: z.string(),
      position: z.string(),        // "%s of %s" — %s placeholders, both locales
      slideRole: z.string(),       // "Photograph %s of %s"
    }),
    results: z.object({
      eyebrow: z.string(),
      title: z.string(),
      /* Optional since the correction pass of 12 September 2026. It used to
         carry an editorial note about where the figures came from; that class
         of note does not belong on a visitor-facing page, and the figures
         stand on their own. Kept as a field because a future note that is
         genuinely for the reader (a date range, a footnote) has a home. */
      note: z.string().optional(),
      items: z
        .array(z.object({ value: z.string(), label: z.string(), detail: z.string() }))
        .min(3),
    }),
    bilingual: z.object({
      eyebrow: z.string(),
      title: z.string(),
      body: z.string(),
      points: z.array(z.object({ title: z.string(), body: z.string() })).min(3),
      cta: z.string(),
    }),
    levels: z.object({
      eyebrow: z.string(),
      title: z.string(),
      intro: z.string(),
      items: z
        .array(
          z.object({
            index: z.string(),
            name: z.string(),
            range: z.string(),
            hoursLabel: z.string(),
            hours: z.string(),
            body: z.string(),
          }),
        )
        .length(3),
      cta: z.string(),
    }),
    life: z.object({
      eyebrow: z.string(),
      title: z.string(),
      body: z.string(),
      clubsLabel: z.string(),
      clubs: z.array(z.string()).min(1),
      cta: z.string(),
    }),
    heads: z.object({
      eyebrow: z.string(),
      title: z.string(),
      intro: z.string(),
      cta: z.string(),
      items: z
        .array(z.object({
          index: z.string(),
          name: z.string(),
          role: z.string(),
          image: z.string(),          // a media-manifest id
        }))
        .length(4),
    }),
    testimonial: z.object({
      eyebrow: z.string(),
      quote: z.string(),
      body: z.string(),
      attribution: z.string(),
      note: z.string().optional(),
      cta: z.string(),
    }),
    future: z.object({
      slogan: z.string(),
      kicker: z.string(),
      title: z.string(),
      body: z.string(),
      status: z.string(),
      cta: z.string(),
    }),
    admissions: z.object({
      mission: z.string(),
      eyebrow: z.string(),
      title: z.string(),
      body: z.string(),
      requirementsLabel: z.string(),
      requirements: z.array(z.string()).min(1),
      cta: z.string(),
    }),
  }),
});

/* ------------------------------------------------------------------ *
 * pages — every inner page, one entry per page per locale.            *
 *                                                                     *
 * Pages are COMPOSED, not templated: each is a title, a hero and an   *
 * ordered list of blocks drawn from one small vocabulary. That gives   *
 * the inner pages the homepage's variety without twelve bespoke        *
 * templates, and it makes bilingual parity checkable — a block missing *
 * from one language is visible in the shape, not buried in markup.     *
 *                                                                     *
 * Entry ids are "<pageKey>.<locale>", e.g. "about.fr".                *
 * ------------------------------------------------------------------ */
const richText = z.array(z.string());          // paragraphs

const block = z.discriminatedUnion('type', [
  /* A statement and its paragraphs. The page's quiet register. */
  z.object({
    type: z.literal('prose'),
    eyebrow: z.string().optional(),
    title: z.string().optional(),
    /* WCAG 3.1.2 (Language of Parts). A bilingual school writes some headings
       in the other language — "Épanouissement global" stands as an English
       page's heading. Unmarked, an English screen-reader voice reads French
       with English phonetics and the phrase is lost. This marks the heading
       only; it never alters the text. Course and subject names are NOT marked
       here: they fall under the criterion's proper-name exception and the
       school owns that call. */
    titleLang: z.enum(['fr', 'en']).optional(),
    body: richText,
    tone: z.enum(['paper', 'tint', 'deep']).default('paper'),
    measure: z.enum(['prose', 'wide']).default('prose'),
  }),
  /* Photograph and argument as one composition — the homepage's split. */
  z.object({
    type: z.literal('feature'),
    eyebrow: z.string().optional(),
    title: z.string(),
    body: richText,
    image: z.string(),
    side: z.enum(['left', 'right']).default('left'),
    /* Photographs are landscape by default. A portrait source (the Founders'
       studio portrait) sets its own ratio rather than being cropped to 3/2. */
    ratio: z.enum(['3/2', '4/3', '4/5', '16/9']).optional(),
    focus: z.string().optional(),
    points: z.array(z.object({ title: z.string(), body: z.string() })).optional(),
    cta: z.object({ label: z.string(), page: z.string() }).optional(),
  }),
  /* One photograph at size, with its manifest caption. */
  z.object({
    type: z.literal('figure'),
    /* Opt this block's photograph into the full-screen viewer. Off by default,
       so adding the viewer to the Gallery did not make every photograph on
       every other page clickable. */
    lightbox: z.boolean().default(false),
    image: z.string(),
    ratio: z.enum(['4/3', '3/2', '4/5', '16/9']).default('3/2'),
    focus: z.string().optional(),
    full: z.boolean().default(false),
  }),
  /* Lead photograph plus supporting frames — the School Life language. */
  z.object({
    type: z.literal('mosaic'),
    lightbox: z.boolean().default(false),
    eyebrow: z.string().optional(),
    title: z.string(),
    body: richText,
    lead: z.string(),
    support: z.array(z.string()).min(1).max(3),
    chipsLabel: z.string().optional(),
    chips: z.array(z.string()).optional(),
  }),
  /* A row of jump links to the albums below. Links, not filters: the
     composition is the point, and hiding two thirds of a page to show one
     category would undo it. */
  z.object({
    type: z.literal('jump'),
    label: z.string(),
    items: z.array(z.object({ label: z.string(), anchor: z.string() })).min(2),
  }),
  /* A run of photographs at equal weight — an album, not an argument.
     The editorial blocks above compose two or three pictures around a point;
     this one exists for a page that has forty to show. Every image is lazy and
     small: the grid cell is about 300px wide, so the browser never fetches a
     2400px master to fill it. */
  z.object({
    type: z.literal('album'),
    /* An anchor, so the section index at the top of the page can jump here. */
    anchor: z.string().optional(),
    eyebrow: z.string().optional(),
    title: z.string(),
    body: richText.optional(),
    tone: z.enum(['paper', 'tint']).default('paper'),
    lightbox: z.boolean().default(false),
    images: z.array(z.string()).min(2),
  }),
  /* Numbered rows read as progression — the homepage ladder. */
  z.object({
    type: z.literal('index'),
    eyebrow: z.string().optional(),
    title: z.string(),
    /* See the prose block: marks a heading written in the other language. */
    titleLang: z.enum(['fr', 'en']).optional(),
    intro: z.string().optional(),
    tone: z.enum(['paper', 'tint']).default('tint'),
    /* 'rows' is the homepage ladder: short name, then columns of detail.
       'quotes' stacks name, attribution and body in one wide column — for
       rows whose "name" is a sentence rather than a label. */
    variant: z.enum(['rows', 'quotes']).default('rows'),
    items: z.array(z.object({
      index: z.string(),
      name: z.string(),
      meta: z.string().optional(),
      body: z.string().optional(),
      asideLabel: z.string().optional(),
      aside: z.string().optional(),
    })).min(2),
  }),
  /* Figures on a deep field. */
  z.object({
    type: z.literal('stats'),
    eyebrow: z.string().optional(),
    title: z.string(),
    note: z.string().optional(),
    items: z.array(z.object({ value: z.string(), label: z.string(), detail: z.string() })).min(2),
  }),
  /* Portraits, framed as on the homepage. */
  z.object({
    type: z.literal('people'),
    eyebrow: z.string().optional(),
    title: z.string(),
    intro: z.string().optional(),
    items: z.array(z.object({
      index: z.string(), name: z.string(), role: z.string(), image: z.string(),
    })).min(1),
  }),
  /* Future-campus concepts. The labelling comes from the manifest; this
     block only decides how many and how large. */
  z.object({
    type: z.literal('concepts'),
    slogan: z.string().optional(),
    kicker: z.string(),
    title: z.string(),
    body: richText,
    status: z.string(),
    images: z.array(z.string()).min(1),
  }),
  /* A voice. Never carries Review structured data. */
  z.object({
    type: z.literal('quote'),
    eyebrow: z.string().optional(),
    quote: z.string(),
    body: z.string().optional(),
    attribution: z.string(),
    note: z.string().optional(),
  }),
  /* The school's real contact details. Nothing here is ever invented. */
  z.object({
    type: z.literal('contact'),
    eyebrow: z.string().optional(),
    title: z.string(),
    body: richText,
    addressLabel: z.string(),
    phoneLabel: z.string(),
    emailLabel: z.string(),
  }),
  /* The closing invitation. */
  z.object({
    type: z.literal('cta'),
    eyebrow: z.string().optional(),
    title: z.string(),
    body: z.string().optional(),
    primary: z.object({ label: z.string(), page: z.string() }),
    secondary: z.object({ label: z.string(), page: z.string() }).optional(),
    image: z.string().optional(),
  }),
]);

const pages = defineCollection({
  loader: glob({
    pattern: '*.yaml',
    base: './src/content/pages',
    /* The default id generator runs each filename through a GitHub slugger,
       which strips the dot: "about.en.yaml" would become "abouten". The
       filename IS the key here — "<pageKey>.<locale>" — so only the extension
       is removed. */
    generateId: ({ entry }) => entry.replace(/\.ya?ml$/, ''),
  }),
  schema: z.object({
    locale: z.enum(['fr', 'en']),
    page: z.string(),                 // a PageKey
    title: z.string(),
    lead: z.string(),
    hero: z.object({
      image: z.string().optional(),   // omitted -> a type-only opening band
      focus: z.string().optional(),
      eyebrow: z.string().optional(),
      /* The photograph a shared link previews, when it must differ from the
         one the page opens with. Normally it does not, and this stays unset:
         showing the visitor the picture they are about to see is the better
         default, and every page but one keeps it.
         The Gallery is the exception. Its masthead is deliberately NOT one of
         its own grid photographs, and the social card is derived through
         getImage(), which emits that photograph's untransformed master. A
         master is referenced only by the viewer's data-lb-full — that is, only
         when the photograph is a grid tile — so the Gallery's masthead left a
         full-size image in the build with nothing pointing at it. Naming a
         grid photograph here fixes that without touching the masthead, the
         grid, or the image pipeline. */
      social: z.string().optional(),
    }),
    blocks: z.array(block).min(1),
  }),
});

/* ------------------------------------------------------------------ *
 * media — THE IMAGE MANIFEST.                                        *
 *                                                                     *
 * The brief's central rule is enforced here, at build time: a concept  *
 * image cannot be described, categorised or rendered as a photograph   *
 * of something that exists. Violating any rule below fails the build.  *
 * ------------------------------------------------------------------ */
const CONCEPT_PREFIX = {
  en: 'Future campus concept:',
  fr: 'Projet du futur campus :',
} as const;

const media = defineCollection({
  loader: file('./src/content/media/media.yaml'),
  schema: z
    .object({
      source: z.string(),                       // path inside 02-School-Assets
      status: z.enum(['photograph', 'concept']),
      category: z.string(),
      alt: z.object({ en: z.string(), fr: z.string() }),
      caption: z.object({ en: z.string(), fr: z.string() }).optional(),
      conceptLabel: z.boolean().optional(),
      upscale: z.number().int().min(2).max(4).optional(),
      focal: z.enum(['top', 'center', 'bottom']).default('center'),
      decorative: z.boolean().default(false),
      /* An image that is DOCUMENTED but must never be published. The string is
         the reason, and it is required — an exclusion without a reason is a
         thing nobody can review later.
         An excluded entry gets no web master (scripts/prepare-assets.mjs skips
         it), so its bytes never reach `dist/` at all, and SchoolImage throws if
         a page ever asks for it. The manifest entry stays so that the decision
         is on the record rather than in somebody's memory. */
      excluded: z.string().min(20).optional(),
      /* Trim this fraction off the TOP of the derived master, 0-0.4. The
         original file is never touched; only the web master is cropped.
         It exists for one reason: two supplied photographs have painted
         signage across the top of the frame naming entities that are not the
         confirmed school name, together with telephone numbers that are not
         the school's. The pictures themselves are good and the school asked
         for them to be used, so the band comes off rather than the picture.
         `cropReason` says why, and is required with it — an unexplained crop
         is an unreviewable one. */
      cropTop: z.number().min(0.02).max(0.4).optional(),
      cropReason: z.string().min(20).optional(),

      /* `retouchMask` names a mask, under scripts/, of pixels the asset
         pipeline rebuilds by diffusion in the DERIVED web master. It exists
         for one case: a photographer's watermark on a photograph the school
         is authorised to publish. The original is never touched, and no
         subject matter is ever removed this way — `retouchReason` has to say
         what was covered and why, on the same terms as a crop. */
      retouchMask: z.string().min(1).optional(),
      retouchReason: z.string().min(20).optional(),
    })
    .superRefine((v, ctx) => {
      const fail = (message: string) =>
        ctx.addIssue({ code: 'custom', message });

      if (v.status === 'concept') {
        // 1. concept images must carry the visible label
        if (v.conceptLabel !== true)
          fail('status: concept requires conceptLabel: true');
        // 2. alt text must state the nature of the image first, in both languages
        if (!v.alt.en.startsWith(CONCEPT_PREFIX.en))
          fail(`concept alt.en must begin with "${CONCEPT_PREFIX.en}"`);
        if (!v.alt.fr.startsWith(CONCEPT_PREFIX.fr))
          fail(`concept alt.fr must begin with "${CONCEPT_PREFIX.fr}"`);
        // 3. concept images belong to exactly one category
        if (v.category !== 'future-campus')
          fail('status: concept may only use category: future-campus');
      }

      // 7. a crop must say why, and a reason must describe a real crop
      if (v.cropTop !== undefined && !v.cropReason)
        fail('cropTop requires cropReason — an unexplained crop cannot be reviewed');
      if (v.cropReason && v.cropTop === undefined)
        fail('cropReason without cropTop');

      // 7b. and the same for a retouch
      if (v.retouchMask !== undefined && !v.retouchReason)
        fail('retouchMask requires retouchReason — an unexplained retouch cannot be reviewed');
      if (v.retouchReason && v.retouchMask === undefined)
        fail('retouchReason without retouchMask');

      if (v.status === 'photograph') {
        // 4. upscaling is for generated concept art only, never a photograph
        if (v.upscale !== undefined)
          fail('upscale is only permitted on status: concept');
        // 5. a photograph must not claim to be a concept
        if (v.conceptLabel)
          fail('conceptLabel is only permitted on status: concept');
        // 6. real alt text in both languages unless explicitly decorative
        if (!v.decorative && (!v.alt.en.trim() || !v.alt.fr.trim()))
          fail('photographs require non-empty alt text in both languages');
      }
    }),
});

export const collections = { site, home, pages, media };
export { CONCEPT_PREFIX };
