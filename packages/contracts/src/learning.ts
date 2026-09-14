import { type AttemptId, type EventId, type QuestionId, type RunId, type Seed, type TopicId, type WorldId } from './ids';
import { type CameraPresetName } from './world';

/* ------------------------------------------------------------------------------------------------
 * Clock and storage ports (device-local, injected; never read the system clock directly)
 * ---------------------------------------------------------------------------------------------- */

/** Epoch milliseconds. Branded only by name to keep it JSON-friendly. */
export type EpochMs = number;

export interface Clock {
  now(): EpochMs;
  /** IANA zone used for calendar boundaries (scenario logic uses World.conditions instead). */
  readonly timeZone: string;
}

/**
 * Key/value storage with string values. Implementations: browser localStorage/IndexedDB wrapper,
 * in-memory for tests. Values are JSON produced by the learning-state module (U2); consumers must
 * validate on read and treat unknown schema versions as untrusted.
 */
export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<readonly string[]>;
}

/* ------------------------------------------------------------------------------------------------
 * Attempt and run state
 * ---------------------------------------------------------------------------------------------- */

export type AttemptPhase = 'presented' | 'selected' | 'graded' | 'continued';

/** One question shown to the learner. Presentation state (camera, help) lives separately. */
export interface AttemptState {
  readonly id: AttemptId;
  readonly runId: RunId;
  readonly questionId: QuestionId;
  readonly questionVersion: number;
  readonly worldId: WorldId;
  readonly seed: Seed;
  readonly phase: AttemptPhase;
  readonly selectedOptionId: string | null;
  readonly gradedCorrect: boolean | null;
  readonly presentedAt: EpochMs;
  readonly gradedAt: EpochMs | null;
  /** Help/explainer opens are recorded, never penalised. */
  readonly helpOpens: number;
}

/**
 * Presentation-only state. Changing any of it must not change AttemptState, the World or the seed
 * (`state_invariance`).
 */
export interface PresentationState {
  readonly cameraPreset: CameraPresetName;
  readonly viewerEnlarged: boolean;
  readonly helpTermId: string | null;
  readonly comparisonId: string | null;
}

/**
 * An open-ended study run. No fixed lesson length, no timer by default, no punitive streak.
 * Progress is road covered (monotonic); leaving and returning resumes the same run.
 */
export interface RunState {
  readonly id: RunId;
  readonly startedAt: EpochMs;
  readonly lastActiveAt: EpochMs;
  readonly topicIds: readonly TopicId[];
  readonly currentAttemptId: AttemptId | null;
  readonly completedAttemptIds: readonly AttemptId[];
  /** Metres of road covered; increases only, never rolls back for missed days. */
  readonly roadCoveredM: number;
  readonly questionQueue: readonly QuestionId[];
  readonly ended: boolean;
}

export interface Preferences {
  readonly textScale: 1 | 1.25 | 1.5 | 2;
  readonly reducedMotion: boolean;
  readonly theme: 'light' | 'dark' | 'system';
  readonly longHaul: boolean;
  readonly sound: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = Object.freeze({
  textScale: 1,
  reducedMotion: false,
  theme: 'system',
  longHaul: false,
  sound: false,
});

/**
 * Idempotent learning events. `id` is the idempotency key: applying the same event twice is a
 * no-op. All reducers are pure `(state, event) => state`.
 */
export type LearningEvent =
  | { readonly type: 'run_started'; readonly id: EventId; readonly at: EpochMs; readonly runId: RunId; readonly topicIds: readonly TopicId[] }
  | { readonly type: 'attempt_presented'; readonly id: EventId; readonly at: EpochMs; readonly attempt: AttemptState }
  | { readonly type: 'option_selected'; readonly id: EventId; readonly at: EpochMs; readonly attemptId: AttemptId; readonly optionId: string }
  | { readonly type: 'attempt_graded'; readonly id: EventId; readonly at: EpochMs; readonly attemptId: AttemptId; readonly correct: boolean }
  | { readonly type: 'attempt_continued'; readonly id: EventId; readonly at: EpochMs; readonly attemptId: AttemptId; readonly roadDeltaM: number }
  | { readonly type: 'help_opened'; readonly id: EventId; readonly at: EpochMs; readonly attemptId: AttemptId; readonly termId: string }
  | { readonly type: 'run_paused'; readonly id: EventId; readonly at: EpochMs; readonly runId: RunId }
  | { readonly type: 'run_ended'; readonly id: EventId; readonly at: EpochMs; readonly runId: RunId }
  | { readonly type: 'preferences_changed'; readonly id: EventId; readonly at: EpochMs; readonly preferences: Preferences };

export interface LearningSnapshot {
  readonly schemaVersion: number;
  readonly runs: readonly RunState[];
  readonly attempts: readonly AttemptState[];
  readonly preferences: Preferences;
  readonly appliedEventIds: readonly EventId[];
}

/** Port implemented by packages/learning-state (U2). */
export interface LearningStore {
  load(): Promise<LearningSnapshot>;
  apply(event: LearningEvent): Promise<LearningSnapshot>;
  subscribe(listener: (snapshot: LearningSnapshot) => void): () => void;
}
