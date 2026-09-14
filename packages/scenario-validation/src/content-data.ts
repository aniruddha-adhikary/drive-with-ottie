import { z } from 'zod';
import {
  CONTRACT_VERSION,
  type Rule,
  type SourceLocator,
  type SourceRef,
  type Term,
  assetId,
  ruleId,
  sha256,
  sourceId,
  termId,
} from '@ottie/contracts';
import officialSourcesJson from '@ottie/content/syllabus/official-sources.json';
import starterRulesJson from '@ottie/content/rules/starter-rules.json';
import starterTermsJson from '@ottie/content/terms/starter/starter-terms.json';

/**
 * Validated reader for the A3 starter content (content/**). The JSON is the canonical owner of the
 * source-backed rule and term records; this reader only brands and shape-checks it so validators can
 * cite real locators and unresolved facts. It never resolves a source conflict or promotes review
 * status: `reviewStatus` must be the literal 'development'.
 */

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

export interface StarterContent {
  readonly sources: readonly SourceRef[];
  readonly rules: readonly Rule[];
  readonly terms: readonly Term[];
}

export function parseStarterContent(input: {
  readonly sources: unknown;
  readonly rules: unknown;
  readonly terms: unknown;
}): StarterContent {
  return {
    sources: officialSourcesSchema.parse(input.sources).sources,
    rules: starterRulesSchema.parse(input.rules).rules,
    terms: starterTermsSchema.parse(input.terms).terms,
  };
}

let cached: StarterContent | null = null;

/** The committed A3 starter content, parsed once. Throws if the JSON no longer matches the contract shape. */
export function loadStarterContent(): StarterContent {
  cached ??= parseStarterContent({
    sources: officialSourcesJson,
    rules: starterRulesJson,
    terms: starterTermsJson,
  });
  return cached;
}
