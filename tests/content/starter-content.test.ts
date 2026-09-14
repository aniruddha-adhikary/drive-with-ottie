import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  type Rule,
  type SourceLocator,
  type SourceRef,
  type Term,
  type Topic,
  CONTRACT_VERSION,
  assetId,
  ruleId,
  sha256,
  sourceId,
  termId,
  topicId,
} from '@ottie/contracts';
import { DEVELOPMENT_CONTENT_BUNDLE, FIXTURE_SOURCES } from '@ottie/contracts/fixtures';
import officialSourcesJson from '@ottie/content/syllabus/official-sources.json';
import inventoryJson from '@ottie/content/syllabus/tp-handbook-2026-inventory.json';
import starterRulesJson from '@ottie/content/rules/starter-rules.json';
import starterTermsJson from '@ottie/content/terms/starter/starter-terms.json';
import { repoRoot } from '../../config/aliases';

/* ---------- boundary schemas: JSON -> branded F0 contract types ---------- */

const bbox = z.tuple([z.number(), z.number(), z.number(), z.number()]).readonly();

const locatorSchema = z
  .object({
    sourceId: z.string().transform(sourceId),
    pdfPage: z.number().int().positive().nullable(),
    printedPage: z.string().nullable(),
    drawing: z.string().nullable(),
    drawingRevision: z.string().nullable(),
    bboxPdfPoints: bbox.nullable(),
    bboxDisplayPdfPoints: bbox.nullable().optional(),
    section: z.string().nullable().optional(),
    quote: z.string().nullable().optional(),
  })
  .strict()
  .transform(({ bboxDisplayPdfPoints, section, quote, ...rest }): SourceLocator => ({
    ...rest,
    ...(bboxDisplayPdfPoints === undefined ? {} : { bboxDisplayPdfPoints }),
    ...(section === undefined ? {} : { section }),
    ...(quote === undefined ? {} : { quote }),
  }));

const sourceRefSchema = z
  .object({
    id: z.string().transform(sourceId),
    url: z.url(),
    publisher: z.string(),
    edition: z.string().nullable(),
    collectionRevision: z.string().nullable(),
    publishedOn: z.string().nullable(),
    effectiveFrom: z.string().nullable(),
    retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sha256: z.string().transform(sha256),
    hashScope: z.string(),
    pageCount: z.number().int().positive().nullable(),
    verifiedFacts: z.array(z.string()).readonly(),
    unresolved: z.array(z.string()).readonly(),
  })
  .strict();

const termSchema = z
  .object({
    id: z.string().transform(termId),
    label: z.string().min(1),
    shortDefinition: z.string().min(1),
    explainer: z.array(z.string().min(1)).min(1).readonly(),
    confusableWith: z.array(z.string().transform(termId)).readonly(),
    illustratedBy: z
      .array(
        z
          .object({ id: z.string().transform(assetId), version: z.number().int().positive() })
          .strict(),
      )
      .readonly(),
    sourceRefs: z.array(locatorSchema).min(1).readonly(),
    reviewStatus: z.literal('development'),
  })
  .strict();

const ruleSchema = z
  .object({
    id: z.string().transform(ruleId),
    version: z.number().int().positive(),
    summary: z.string().min(1),
    predicate: z.string().min(1),
    sourceRefs: z.array(locatorSchema).min(1).readonly(),
    unresolved: z.array(z.string()).readonly(),
  })
  .strict();

const topicSchema = z
  .object({
    id: z.string().transform(topicId),
    label: z.string().min(1),
    description: z.string().min(1),
    questionIds: z.array(z.never()).readonly(),
    termIds: z.array(z.string().transform(termId)).readonly(),
  })
  .strict();

const COVERAGE = ['sourced', 'partial', 'conflicted', 'missing'] as const;

const conflictSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    summary: z.string().min(1),
    locators: z.array(locatorSchema).readonly(),
    resolution: z.string().startsWith('unresolved'),
  })
  .strict();

const sectionSchema = z
  .object({
    id: z.string().regex(/^[abc]\.[a-z0-9.-]+$/),
    label: z.string().min(1),
    printedPage: z.string().regex(/^\d+$/),
    pdfPage: z.number().int().positive(),
    coverage: z.enum(COVERAGE),
    termIds: z.array(z.string().transform(termId)).readonly(),
    ruleIds: z.array(z.string().transform(ruleId)).readonly(),
    conflicts: z.array(conflictSchema).readonly(),
    note: z.string().optional(),
  })
  .strict();

const bundleHeader = {
  $comment: z.string(),
  contractVersion: z.literal(CONTRACT_VERSION),
  reviewStatus: z.literal('development'),
};

const officialSourcesSchema = z
  .object({ ...bundleHeader, sources: z.array(sourceRefSchema).min(1).readonly() })
  .strict();
const starterRulesSchema = z
  .object({ ...bundleHeader, rules: z.array(ruleSchema).min(1).readonly() })
  .strict();
const starterTermsSchema = z
  .object({ ...bundleHeader, terms: z.array(termSchema).min(1).readonly() })
  .strict();
const inventorySchema = z
  .object({
    ...bundleHeader,
    sourceId: z.string().transform(sourceId),
    contentsLocator: locatorSchema,
    coverageStates: z.record(z.enum(COVERAGE), z.string()),
    parts: z
      .array(
        z
          .object({
            id: z.enum(['part-a', 'part-b', 'part-c']),
            label: z.string(),
            testedInBtt: z.boolean(),
            note: z.string(),
            sections: z.array(sectionSchema).min(1).readonly(),
          })
          .strict(),
      )
      .length(3)
      .readonly(),
    topics: z.array(topicSchema).readonly(),
    topicsNote: z.string(),
  })
  .strict();

const sources: readonly SourceRef[] = officialSourcesSchema.parse(officialSourcesJson).sources;
const rules: readonly Rule[] = starterRulesSchema.parse(starterRulesJson).rules;
const terms: readonly Term[] = starterTermsSchema.parse(starterTermsJson).terms;
const inventory = inventorySchema.parse(inventoryJson);
const topics: readonly Topic[] = inventory.topics;
const sections = inventory.parts.flatMap((p) => p.sections);

const sourceIds = new Set(sources.map((s) => s.id));
const termIds = new Set(terms.map((t) => t.id));
const ruleIds = new Set(rules.map((r) => r.id));

const byId = <T extends { readonly id: string }>(items: readonly T[], id: string): T => {
  const found = items.find((i) => i.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

const allLocators = (): readonly SourceLocator[] => [
  ...terms.flatMap((t) => t.sourceRefs),
  ...rules.flatMap((r) => r.sourceRefs),
  ...sections.flatMap((s) => s.conflicts.flatMap((c) => c.locators)),
  inventory.contentsLocator,
];

const rule11Capture = readFileSync(
  path.join(repoRoot, 'tools/asset_extraction/assemblies/rule11-web-text.txt'),
  'utf8',
).replace(/\s+/g, ' ');

interface IndexAsset {
  readonly id: string;
  readonly release_ready: boolean;
}
const assetIndex = JSON.parse(
  readFileSync(path.join(repoRoot, 'assets/sg/index.json'), 'utf8'),
) as {
  readonly assets: readonly IndexAsset[];
};

/* ---------- tests ---------- */

describe('official sources (content/syllabus/official-sources.json)', () => {
  it('match the F0 fixture source register byte-for-byte on identity fields', () => {
    expect(sources.map((s) => s.id).sort()).toEqual(FIXTURE_SOURCES.map((s) => s.id).sort());
    for (const fixture of FIXTURE_SOURCES) {
      const ours = byId(sources, fixture.id);
      expect(ours.url).toBe(fixture.url);
      expect(ours.sha256).toBe(fixture.sha256);
      expect(ours.hashScope).toBe(fixture.hashScope);
      expect(ours.edition).toBe(fixture.edition);
      expect(ours.collectionRevision).toBe(fixture.collectionRevision);
      expect(ours.pageCount).toBe(fixture.pageCount);
    }
  });

  it('keep the Rule 11 capture limitation unresolved', () => {
    const rule11 = byId(sources, 'rule11');
    expect(rule11.unresolved.some((u) => u.includes('403'))).toBe(true);
    expect(rule11Capture.endsWith('vehicles, notw')).toBe(true);
  });
});

describe('source locators', () => {
  it('reference registered sources with an exact page or section locator', () => {
    for (const loc of allLocators()) {
      expect(sourceIds.has(loc.sourceId)).toBe(true);
      const source = byId(sources, loc.sourceId);
      if (source.pageCount === null) {
        expect(loc.pdfPage).toBeNull();
        expect(loc.section).toBeTruthy();
        expect(loc.quote).toBeTruthy();
      } else {
        expect(loc.pdfPage).not.toBeNull();
        expect(loc.printedPage).not.toBeNull();
        if (loc.pdfPage !== null) expect(loc.pdfPage).toBeLessThanOrEqual(source.pageCount);
      }
    }
  });

  it('quote Rule 11 verbatim from the stored, hash-verified capture', () => {
    const quotes = allLocators()
      .filter((l) => l.sourceId === 'rule11')
      .map((l) => l.quote)
      .filter((q): q is string => typeof q === 'string');
    expect(quotes.length).toBeGreaterThan(0);
    for (const quote of quotes) {
      expect(rule11Capture).toContain(quote.replace(/\s+/g, ' '));
    }
  });

  it('use the Traffic Police handbook for every learner-facing meaning', () => {
    for (const item of [...terms, ...rules]) {
      expect(item.sourceRefs.some((l) => l.sourceId === 'spf-btt-2026')).toBe(true);
    }
  });
});

describe('starter terms (content/terms/starter)', () => {
  it('have unique IDs, resolvable confusables and no self-confusion', () => {
    expect(termIds.size).toBe(terms.length);
    for (const term of terms) {
      for (const other of term.confusableWith) {
        expect(other).not.toBe(term.id);
        expect(termIds.has(other)).toBe(true);
      }
    }
  });

  it('illustrate only with quarantined, release_ready=false library assets', () => {
    const index = new Map(assetIndex.assets.map((a) => [a.id, a]));
    for (const term of terms) {
      for (const ref of term.illustratedBy) {
        const asset = index.get(ref.id);
        expect(asset, ref.id).toBeDefined();
        expect(asset?.release_ready).toBe(false);
      }
    }
  });

  it('own every term ID the F0 development fixtures use, with the same concept boundary', () => {
    for (const fixtureTerm of DEVELOPMENT_CONTENT_BUNDLE.terms) {
      const ours = byId(terms, fixtureTerm.id);
      expect(ours.illustratedBy.map((a) => a.id)).toEqual(
        fixtureTerm.illustratedBy.map((a) => a.id),
      );
    }
  });

  it('separate Give Way from Stop and circular green from the red arrow', () => {
    const giveWay = byId(terms, 'give-way-sign');
    const stop = byId(terms, 'stop-sign');
    expect(giveWay.confusableWith).toContain('stop-sign');
    expect(stop.confusableWith).toContain('give-way-sign');
    expect(giveWay.shortDefinition.toLowerCase()).toContain('stop only if');
    expect(stop.shortDefinition.toLowerCase()).toContain('complete stop');

    const green = byId(terms, 'circular-green-signal');
    const redArrow = byId(terms, 'red-arrow-signal');
    expect(green.confusableWith).toContain('red-arrow-signal');
    expect(redArrow.confusableWith).toContain('circular-green-signal');
    expect(redArrow.shortDefinition.toLowerCase()).toContain('even if the round green is lit');
  });
});

describe('starter rules (content/rules)', () => {
  it('have unique IDs and supersede (not fork) the F0 fixture rules', () => {
    expect(ruleIds.size).toBe(rules.length);
    for (const fixtureRule of DEVELOPMENT_CONTENT_BUNDLE.rules) {
      const ours = byId(rules, fixtureRule.id);
      expect(ours.version).toBeGreaterThanOrEqual(fixtureRule.version);
    }
  });

  it('encode that Give Way is not an unconditional Stop', () => {
    const giveWay = byId(rules, 'give-way-at-double-broken-line');
    const stop = byId(rules, 'stop-before-stop-line');
    expect(giveWay.predicate).toContain('slow_stop_if_necessary');
    expect(giveWay.predicate).toContain('NOT required(full_stop)');
    expect(stop.predicate).toContain('required(full_stop)');
    expect(stop.predicate).not.toContain('NOT required(full_stop)');
  });

  it('encode that circular green never overrides a lit red arrow', () => {
    const green = byId(rules, 'circular-green-permits-uncontrolled-movements');
    const redArrow = byId(rules, 'red-arrow-prohibits-movement');
    expect(redArrow.predicate).toContain(`overrides(${green.id})`);
    expect(green.predicate).not.toContain('overrides(');
    expect(green.predicate).toContain('¬∃ aspect(arrow_*');
    expect(redArrow.predicate).toContain('permission(movement) = stop');
    expect(
      redArrow.sourceRefs.some(
        (l) => l.sourceId === 'rule11' && l.section === 'Rule 11, red arrow',
      ),
    ).toBe(true);
    expect(redArrow.sourceRefs.some((l) => l.sourceId === 'spf-btt-2026' && l.pdfPage === 47)).toBe(
      true,
    );
  });

  it('only override rules that exist', () => {
    for (const rule of rules) {
      for (const match of rule.predicate.matchAll(/overrides\(([a-z0-9-]+)\)/g)) {
        expect(ruleIds.has(ruleId(match[1] ?? ''))).toBe(true);
      }
    }
  });

  it('record the truncated Rule 11 green-arrow paragraph as unresolved rather than citing it', () => {
    const greenArrow = byId(rules, 'green-arrow-permits-indicated-movement');
    expect(greenArrow.unresolved.some((u) => u.includes('truncated'))).toBe(true);
    for (const loc of greenArrow.sourceRefs) {
      if (loc.sourceId === 'rule11') expect(loc.section).not.toMatch(/final paragraph/);
    }
  });
});

describe('handbook syllabus inventory (content/syllabus)', () => {
  it('lists every section once with consistent printed/PDF paging', () => {
    const ids = sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of sections) {
      expect(section.pdfPage).toBe(Number(section.printedPage) + 1);
      expect(section.pdfPage).toBeLessThanOrEqual(90);
    }
    expect(byId(inventory.parts, 'part-b').testedInBtt).toBe(true);
    expect(byId(inventory.parts, 'part-a').testedInBtt).toBe(false);
    expect(byId(inventory.parts, 'part-c').testedInBtt).toBe(false);
  });

  it('distinguishes sourced, partial, conflicted and missing coverage honestly', () => {
    const counts = { sourced: 0, partial: 0, conflicted: 0, missing: 0 };
    for (const section of sections) {
      counts[section.coverage] += 1;
      switch (section.coverage) {
        case 'sourced':
        case 'partial':
          expect(section.termIds.length + section.ruleIds.length).toBeGreaterThan(0);
          break;
        case 'conflicted':
          expect(section.conflicts.length).toBeGreaterThan(0);
          break;
        case 'missing':
          expect(section.termIds).toEqual([]);
          expect(section.ruleIds).toEqual([]);
          expect(section.conflicts).toEqual([]);
          break;
      }
    }
    expect(counts.sourced).toBeGreaterThan(0);
    expect(counts.partial).toBeGreaterThan(0);
    expect(counts.conflicted).toBeGreaterThan(0);
    expect(counts.missing).toBeGreaterThan(counts.sourced + counts.partial + counts.conflicted);
  });

  it('references only defined terms and rules, and every term and rule is placed in the syllabus', () => {
    const placedTerms = new Set<string>();
    const placedRules = new Set<string>();
    for (const section of sections) {
      for (const id of section.termIds) {
        expect(termIds.has(id)).toBe(true);
        placedTerms.add(id);
      }
      for (const id of section.ruleIds) {
        expect(ruleIds.has(id)).toBe(true);
        placedRules.add(id);
      }
    }
    expect([...placedTerms].sort()).toEqual([...termIds].sort());
    expect([...placedRules].sort()).toEqual([...ruleIds].sort());
  });

  it('claims no question bank or exam format', () => {
    for (const topic of topics) expect(topic.questionIds).toEqual([]);
    const text = JSON.stringify(inventoryJson).toLowerCase();
    expect(text).not.toMatch(/\d+\s*questions/);
    expect(text).not.toMatch(/pass mark[^,]*\d/);
    expect(text).not.toMatch(/comfortdelgro|bukit batok|ssdc|bbdc|cdc\b(?! material)/);
    expect(text).toContain('no question bank');
  });

  it('topics cover every starter term exactly once and match the F0 fixture topic IDs', () => {
    const topicTermIds = topics.flatMap((t) => t.termIds);
    expect(new Set(topicTermIds).size).toBe(topicTermIds.length);
    expect([...topicTermIds].sort()).toEqual([...termIds].sort());
    expect(topics.map((t) => t.id).sort()).toEqual(
      DEVELOPMENT_CONTENT_BUNDLE.topics.map((t) => t.id).sort(),
    );
  });
});
