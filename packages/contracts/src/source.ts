import { type Millimetres } from './units';
import { type Sha256, type SourceId } from './ids';

/**
 * Official source document. Mirrors `Source` in tools/asset_extraction/contract.py and adds the
 * fields docs/SCENARIO-SYSTEM.md §3 requires (edition, effective dates, verified/unresolved facts).
 * The hash is the SHA-256 of the original downloaded bytes unless `hashScope` says otherwise.
 */
export interface SourceRef {
  readonly id: SourceId;
  readonly url: string;
  readonly publisher: string;
  /** e.g. "Updated 2 January 2026" for the Traffic Police handbook. */
  readonly edition: string | null;
  /** SDRE collection revision letter, e.g. "I". */
  readonly collectionRevision: string | null;
  /** ISO date the document was published, when printed on it. */
  readonly publishedOn: string | null;
  /** ISO date the document became effective, when known. */
  readonly effectiveFrom: string | null;
  /** ISO date the file was retrieved (YYYY-MM-DD). */
  readonly retrievedAt: string;
  readonly sha256: Sha256;
  readonly hashScope: string;
  readonly pageCount: number | null;
  /** Facts a reviewer has checked against this source; free text with locators. */
  readonly verifiedFacts: readonly string[];
  /** Fields that the source does not settle; never silently resolved by code. */
  readonly unresolved: readonly string[];
}

/**
 * Location inside a source document. Mirrors `Locator` in contract.py. Bounding boxes are in
 * unrotated PDF points (top-left origin, x right, y down) exactly as recorded by extraction.
 */
export interface SourceLocator {
  readonly sourceId: SourceId;
  /** 1-based physical PDF page index. */
  readonly pdfPage: number | null;
  /** Page label printed on the page, e.g. "15-1" or "46". */
  readonly printedPage: string | null;
  /** Drawing number such as "LTA/SDRE14/15/TFM1". */
  readonly drawing: string | null;
  readonly drawingRevision: string | null;
  readonly bboxPdfPoints: readonly [number, number, number, number] | null;
  readonly bboxDisplayPdfPoints?: readonly [number, number, number, number] | null;
  /** Section / rule reference for non-paginated sources, e.g. "Rule 11(1)(b)". */
  readonly section?: string | null;
  /** Verbatim quote supporting a claim (kept short). */
  readonly quote?: string | null;
}

export type MeasurementMethod =
  | 'printed_dimension_label'
  | 'pdf_vector_measurement'
  | 'pixel_measurement'
  | 'statutory_text'
  | 'unknown';

/**
 * A dimension with endpoints and provenance. Source millimetres stay millimetres here; World
 * geometry converts with `mmToMetres` at import and records the conversion in provenance.
 */
export interface Measurement {
  readonly name: string;
  readonly valueMm: Millimetres | null;
  /** Statutory/spec bounds when the source gives a range instead of an actual value. */
  readonly minimumMm?: Millimetres | null;
  readonly maximumMm?: Millimetres | null;
  readonly endpoints: string;
  readonly method: MeasurementMethod;
  readonly locator: SourceLocator;
  readonly notes?: readonly string[];
}

/** Extraction review status, verbatim from contract.py `Review.status`. */
export type ExtractionReviewStatus =
  | 'extracted_reference'
  | 'cleaned_unverified'
  | 'verified_geometry'
  | 'blocked'
  | 'approved';

/** Runtime asset lifecycle proposed in docs/SCENARIO-SYSTEM.md §3. */
export type RuntimeAssetState = 'draft' | 'source_checked' | 'content_reviewed' | 'retired';

/**
 * Review and rights state carried by every asset. `releaseReady` is copied from the extraction
 * manifest and is currently false for all 339 assets; nothing in this repository may set it true.
 */
export interface ReviewState {
  readonly extractionStatus: ExtractionReviewStatus;
  readonly runtimeState: RuntimeAssetState;
  readonly warnings: readonly string[];
  readonly contentApproved: boolean;
  readonly reuseApproved: boolean;
  readonly approvalEvidence: readonly string[];
  readonly licenseStatus: string;
  readonly releaseReady: boolean;
}
