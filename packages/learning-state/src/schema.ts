import { z } from 'zod';
import { LEARNING_STATE_SCHEMA_VERSION, type EpochMs } from '@ottie/contracts';

const idSchema = z.string().min(1);
const preferencesSchema = z
  .object({
    textScale: z.union([z.literal(1), z.literal(1.25), z.literal(1.5), z.literal(2)]),
    reducedMotion: z.boolean(),
    theme: z.enum(['light', 'dark', 'system']),
    longHaul: z.boolean(),
    sound: z.boolean(),
  })
  .strict();
const attemptSchema = z
  .object({
    id: idSchema,
    runId: idSchema,
    questionId: idSchema,
    questionVersion: z.number().int(),
    worldId: idSchema,
    seed: idSchema,
    phase: z.enum(['presented', 'selected', 'graded', 'continued']),
    selectedOptionId: idSchema.nullable(),
    gradedCorrect: z.boolean().nullable(),
    presentedAt: z.number(),
    gradedAt: z.number().nullable(),
    helpOpens: z.number().int().nonnegative(),
  })
  .strict();
const runSchema = z
  .object({
    id: idSchema,
    startedAt: z.number(),
    lastActiveAt: z.number(),
    topicIds: z.array(idSchema),
    currentAttemptId: idSchema.nullable(),
    completedAttemptIds: z.array(idSchema),
    roadCoveredM: z.number().nonnegative(),
    questionQueue: z.array(idSchema),
    ended: z.boolean(),
  })
  .strict();

export const learningSnapshotSchema = z
  .object({
    schemaVersion: z.number().int(),
    runs: z.array(runSchema),
    attempts: z.array(attemptSchema),
    preferences: preferencesSchema,
    appliedEventIds: z.array(idSchema),
  })
  .strict();

export const persistedPayloadSchema = z
  .object({
    schemaVersion: z.number().int(),
    savedAt: z.number(),
    snapshot: z.unknown(),
  })
  .strict();

export type LoadReport =
  | { readonly status: 'empty' }
  | { readonly status: 'ok'; readonly savedAt: EpochMs }
  | { readonly status: 'corrupted'; readonly detail: string; readonly quarantinedKey: string }
  | { readonly status: 'version_mismatch'; readonly found: number; readonly expected: number; readonly quarantinedKey: string };

export { LEARNING_STATE_SCHEMA_VERSION };
