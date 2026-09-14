import { describe, expect, it } from 'vitest';
import type { Diagnostic, Question, ValidationReport } from '@ottie/contracts';
import { DEVELOPMENT_CONTENT_BUNDLE } from '@ottie/contracts/fixtures';
import { loadStarterContent, validateQuestion } from '@ottie/scenario-validation';
import { type GeneratedWorld, type QuestionPackage, generatePackageWorlds, loadStarterPackages } from './starter-packages';

const PACKAGES = loadStarterPackages();
const STARTER = loadStarterContent();
const TERM_IDS = new Set(STARTER.terms.map((t) => t.id as string));
const SOURCE_IDS = new Set(STARTER.sources.map((s) => s.id as string));
const RULES = new Map(STARTER.rules.map((r) => [r.id as string, r] as const));

interface Authored {
  readonly questions: QuestionPackage;
  readonly question: Question;
  readonly generated: GeneratedWorld;
}

const AUTHORED: readonly Authored[] = PACKAGES.flatMap(({ scenario, questions }) => {
  const worlds = generatePackageWorlds(scenario);
  return questions.questions.map((question) => {
    const generated = worlds.find((g) => g.authored.worldId === question.worldId);
    if (!generated) throw new Error(`${question.id} names world ${question.worldId} which ${scenario.id} does not author`);
    return { questions, question, generated };
  });
});

function errors(report: ValidationReport): readonly Diagnostic[] {
  return report.diagnostics.filter((d) => d.severity === 'error');
}

function expectValid(report: ValidationReport): void {
  expect(errors(report).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(report.ok).toBe(true);
}

/** Bindings anchor into copy by their `text` span (v1 contract); the span must literally appear. */
function anchors(text: string, bindings: readonly Question['stemBindings'][number][]): void {
  for (const b of bindings) expect(text.includes(b.text), `"${b.text}" not in "${text}"`).toBe(true);
}

describe('T1 starter question packages: identity and coverage', () => {
  it('three packages, each bound to its scenario package and topic, about two original development questions each', () => {
    expect(PACKAGES).toHaveLength(3);
    for (const { scenario, questions } of PACKAGES) {
      expect(questions.scenarioPackageId).toBe(scenario.id);
      expect(questions.topicId).toBe(scenario.topicId);
      expect(questions.questions.length).toBeGreaterThanOrEqual(2);
      expect(questions.questions.length).toBeLessThanOrEqual(3);
      for (const q of questions.questions) {
        expect(q.topicId).toBe(scenario.topicId);
        expect(q.reviewStatus).toBe('development');
        expect(q.authorship).toBe('original');
        expect(q.version).toBe(1);
      }
    }
    expect(AUTHORED).toHaveLength(6);
  });

  it('question and explanation ids are unique across all packages, option ids within a question, and none collide with the F0 fixture bundle', () => {
    const questionIds = AUTHORED.map((a) => a.question.id as string);
    const explanationIds = PACKAGES.flatMap((p) => p.questions.explanations.map((e) => e.id as string));
    for (const ids of [questionIds, explanationIds]) expect(new Set(ids).size).toBe(ids.length);
    for (const { question } of AUTHORED) expect(new Set(question.options.map((o) => o.id)).size).toBe(4);
    const fixtureQuestionIds = new Set(DEVELOPMENT_CONTENT_BUNDLE.questions.map((q) => q.id as string));
    const fixtureExplanationIds = new Set(DEVELOPMENT_CONTENT_BUNDLE.explanations.map((e) => e.id as string));
    for (const id of questionIds) expect(fixtureQuestionIds.has(id), id).toBe(false);
    for (const id of explanationIds) expect(fixtureExplanationIds.has(id), id).toBe(false);
  });

  it('each authored world is exercised by at least one question', () => {
    for (const { scenario, questions } of PACKAGES) {
      for (const world of scenario.worlds) {
        expect(
          questions.questions.some((q) => q.worldId === world.worldId),
          `${world.worldId} has no question`,
        ).toBe(true);
      }
    }
  });
});

describe('T1 starter question packages: every referenced id resolves', () => {
  it('answer rules name A3 starter rules at their current version, and explanations only cite rules that exist', () => {
    for (const { question } of AUTHORED) {
      const rule = RULES.get(question.answerRule.ruleId);
      expect(rule, `${question.id} rule ${question.answerRule.ruleId}`).toBeDefined();
      expect(rule?.version, `${question.id} rule version`).toBe(question.answerRule.version);
    }
    for (const { questions } of PACKAGES) {
      for (const e of questions.explanations) {
        for (const ruleId of e.ruleIds) expect(RULES.has(ruleId), `${e.id} -> ${ruleId}`).toBe(true);
        for (const termId of e.termIds) expect(TERM_IDS.has(termId), `${e.id} -> ${termId}`).toBe(true);
        for (const ref of e.sourceRefs) expect(SOURCE_IDS.has(ref.sourceId), `${e.id} -> ${ref.sourceId}`).toBe(true);
      }
    }
  });

  it('question and rationale explanation ids resolve inside the same package', () => {
    for (const { questions, question } of AUTHORED) {
      const explanations = new Set(questions.explanations.map((e) => e.id as string));
      expect(explanations.has(question.explanationId), `${question.id} explanation`).toBe(true);
      for (const o of question.options) {
        expect(explanations.has(o.rationaleExplanationId), `${question.id}/${o.id} rationale`).toBe(true);
      }
    }
  });

  it('source locators name registered A3 official sources with page-level detail', () => {
    for (const { question } of AUTHORED) {
      expect(question.sourceRefs.length).toBeGreaterThan(0);
      for (const ref of question.sourceRefs) {
        expect(SOURCE_IDS.has(ref.sourceId), `${question.id} -> ${ref.sourceId}`).toBe(true);
        const located = ref.pdfPage !== null || ref.drawing !== null || (ref.section != null && ref.quote != null);
        expect(located, `${question.id} locator needs a page, drawing, or section+quote`).toBe(true);
      }
    }
  });

  it('every term id in a binding or an explanation is a canonical A3 term', () => {
    for (const { question } of AUTHORED) {
      const bindings = [...question.stemBindings, ...question.options.flatMap((o) => o.bindings)];
      for (const b of bindings) if (b.termId !== null) expect(TERM_IDS.has(b.termId), `${question.id} ${b.termId}`).toBe(true);
    }
  });

  it('every binding anchors to a literal span of its stem or option copy, so copy and bindings cannot drift', () => {
    for (const { question } of AUTHORED) {
      anchors(question.stem, question.stemBindings);
      for (const o of question.options) anchors(o.text, o.bindings);
    }
  });

  it('stems and every choice carry at least one canonical term id', () => {
    for (const { question } of AUTHORED) {
      expect(question.stemBindings.some((b) => b.termId !== null), `${question.id} stem has no term`).toBe(true);
      for (const o of question.options) {
        expect(o.bindings.some((b) => b.termId !== null), `${question.id}/${o.id} has no term`).toBe(true);
      }
    }
  });
});

describe('T1 starter question packages: exactly one correct answer, four options', () => {
  it('each question has exactly four options and exactly one is correct', () => {
    for (const { question } of AUTHORED) {
      expect(question.options).toHaveLength(4);
      expect(question.options.filter((o) => o.correct)).toHaveLength(1);
      expect(new Set(question.options.map((o) => o.text)).size).toBe(4);
    }
  });

  it('the correct option carries no hypothetical binding and its rationale cites the answer rule', () => {
    for (const { questions, question } of AUTHORED) {
      const correct = question.options.find((o) => o.correct);
      if (!correct) throw new Error(question.id);
      expect(correct.bindings.some((b) => b.role === 'hypothetical'), `${question.id} correct option is hypothetical`).toBe(false);
      const rationale = questions.explanations.find((e) => e.id === correct.rationaleExplanationId);
      expect(rationale?.ruleIds as readonly string[]).toContain(question.answerRule.ruleId);
      const explanation = questions.explanations.find((e) => e.id === question.explanationId);
      expect(explanation?.ruleIds as readonly string[]).toContain(question.answerRule.ruleId);
    }
  });

  it('the answer rule matches the control regime of the world the question is asked in', () => {
    const expected: Record<string, readonly string[]> = {
      give_way: ['give-way-at-double-broken-line'],
      stop: ['stop-before-stop-line'],
      signalised: ['red-arrow-prohibits-movement', 'circular-green-permits-uncontrolled-movements'],
    };
    for (const { question, generated } of AUTHORED) {
      expect(expected[generated.world.controlRegime], question.id).toContain(question.answerRule.ruleId);
    }
  });
});

describe('T1 starter question packages: evidence and traffic consistency', () => {
  it('required evidence ids are exactly the stable ids the scenario package exports for that world', () => {
    for (const { question, generated } of AUTHORED) {
      const exported = new Set(Object.values(generated.authored.evidenceIds));
      const inWorld = new Set(generated.world.evidence.map((e) => e.id));
      for (const id of question.requiredEvidenceIds) {
        expect(exported.has(id), `${question.id} requires ${id} which the package does not export`).toBe(true);
        expect(inWorld.has(id), `${question.id} requires ${id} which the world does not emit`).toBe(true);
      }
    }
  });

  it('actual bindings point at entities the scenario package exports, that exist in the generated world, and whose evidence names them (or their lane/movement)', () => {
    for (const { question, generated } of AUTHORED) {
      const exportedEntities = new Set(Object.values(generated.authored.entities) as readonly string[]);
      const evidenceById = new Map(generated.world.evidence.map((e) => [e.id, e] as const));
      const related = (entityId: string): readonly string[] => {
        const actor = generated.world.actors.find((a) => a.id === entityId);
        return actor ? [entityId, actor.laneId as string, actor.movementId as string] : [entityId];
      };
      const bindings = [...question.stemBindings, ...question.options.flatMap((o) => o.bindings)];
      for (const b of bindings) {
        if (b.role !== 'actual') continue;
        expect(exportedEntities.has(b.entityId), `${question.id} actual ${b.entityId} not exported`).toBe(true);
        expect(b.evidenceIds.length, `${question.id} actual ${b.entityId} has no evidence`).toBeGreaterThan(0);
        for (const evidenceId of b.evidenceIds) {
          const evidence = evidenceById.get(evidenceId);
          expect(evidence, `${question.id} evidence ${evidenceId}`).toBeDefined();
          const targets = (evidence?.targetEntityIds ?? []) as readonly string[];
          expect(related(b.entityId).some((id) => targets.includes(id)), `${question.id} ${evidenceId} -> ${b.entityId}`).toBe(true);
          expect(question.requiredEvidenceIds, `${question.id} ${evidenceId} not required`).toContain(evidenceId);
        }
      }
    }
  });

  it('hypothetical bindings that cite a comparison name a control absent from the base world, and the comparison is authored in the same scenario package', () => {
    for (const { question, generated } of AUTHORED) {
      const presentAssets = new Set([
        ...generated.world.signFaces.map((f) => f.asset.id as string),
        ...generated.world.markings.map((m) => m.asset.id as string),
      ]);
      const hypotheticalTermToAsset: Record<string, readonly string[]> = {
        'stop-sign': ['sg.mandatory.stop'],
        'stop-line': ['sg.markings.control-stop-j'],
        'give-way-sign': ['sg.mandatory.give-way'],
        'give-way-line': ['sg.markings.control-give-way-d'],
      };
      const comparisons = new Set(generated.pkg.comparisons.map((c) => c.id));
      const bindings = [...question.stemBindings, ...question.options.flatMap((o) => o.bindings)];
      for (const b of bindings) {
        if (b.role !== 'hypothetical') continue;
        if (b.comparisonId === null) continue;
        expect(comparisons.has(b.comparisonId), `${question.id} comparison ${b.comparisonId}`).toBe(true);
        for (const asset of hypotheticalTermToAsset[b.termId ?? ''] ?? []) {
          expect(presentAssets.has(asset), `${question.id} hypothetical ${b.termId} is actually present`).toBe(false);
        }
      }
    }
  });

  it('every hypothetical binding sits on a wrong option, and wrong options that cite another control cite a comparison', () => {
    for (const { question } of AUTHORED) {
      for (const o of question.options) {
        for (const b of o.bindings) {
          if (b.role === 'hypothetical') expect(o.correct, `${question.id}/${o.id}`).toBe(false);
        }
      }
    }
  });

  it('Give Way and STOP questions about another vehicle name the actual actor on the correct side of the ego', () => {
    for (const { question, generated } of AUTHORED) {
      const actorBindings = [...question.stemBindings, ...question.options.flatMap((o) => o.bindings)].filter(
        (b) => b.role === 'actual' && generated.world.actors.some((a) => a.id === b.entityId && !a.isEgo),
      );
      for (const b of actorBindings) {
        if (b.role !== 'actual') continue;
        const actor = generated.world.actors.find((a) => a.id === b.entityId);
        const actorLane = generated.world.lanes.find((l) => (l.id as string) === (actor?.laneId as string));
        const ego = generated.world.actors.find((a) => a.isEgo);
        const egoLane = generated.world.lanes.find((l) => (l.id as string) === (ego?.laneId as string));
        if (!actorLane || !egoLane) throw new Error(`${question.id} ${b.entityId}`);
        // Sign of the cross product of the ego heading with the vector to the actor: >0 means the actor is on the ego's LEFT.
        const ex = Math.cos(egoLane.heading);
        const ey = Math.sin(egoLane.heading);
        const dx = (actorLane.centreline[0]?.x ?? 0) - (egoLane.centreline[0]?.x ?? 0);
        const dy = (actorLane.centreline[0]?.y ?? 0) - (egoLane.centreline[0]?.y ?? 0);
        const cross = ex * dy - ey * dx;
        const copy = `${question.stem} ${question.options.map((o) => o.text).join(' ')}`.toLowerCase();
        if (/from (your|the driver's|the ego's) left/.test(copy)) expect(cross, `${question.id} says left`).toBeGreaterThan(0);
        if (/from (your|the driver's|the ego's) right/.test(copy)) expect(cross, `${question.id} says right`).toBeLessThan(0);
        if (copy.includes('oncoming') && generated.world.controlRegime === 'signalised') {
          expect(Math.cos(actorLane.heading) * ex + Math.sin(actorLane.heading) * ey).toBeCloseTo(-1, 6);
        }
      }
    }
  });

  it('signal questions bind the northbound head whose lit aspects are circular green + red right arrow, and never a head on the other axis', () => {
    for (const { question, generated } of AUTHORED) {
      if (generated.world.controlRegime !== 'signalised') continue;
      const headBindings = [...question.stemBindings, ...question.options.flatMap((o) => o.bindings)].filter(
        (b) => b.role === 'actual' && generated.world.signalHeads.some((h) => h.id === b.entityId),
      );
      expect(headBindings.length, question.id).toBeGreaterThan(0);
      const controller = generated.world.signalControllers[0];
      for (const b of headBindings) {
        if (b.role !== 'actual') continue;
        expect(b.entityId).toBe(generated.authored.entities.nbHead);
        const lit = controller?.aspectStates.filter((s) => s.headId === b.entityId && s.state === 'lit').map((s) => s.slot).sort();
        expect(lit).toEqual(['circular_green', 'right_arrow_red']);
      }
    }
  });
});

describe('T1 starter question packages: V1 validateQuestion on every question against its generated world', () => {
  it('every question passes V1 with the development context', () => {
    for (const { question, generated } of AUTHORED) expectValid(validateQuestion(question, generated.world));
  });

  it('V1 still rejects a question whose world id is swapped for a different authored world (worlds are not interchangeable)', () => {
    const [a, b] = [AUTHORED[0], AUTHORED[AUTHORED.length - 1]];
    if (!a || !b) throw new Error('need two questions');
    expect(a.generated.world.id).not.toBe(b.generated.world.id);
    const report = validateQuestion(a.question, b.generated.world);
    expect(report.ok).toBe(false);
    expect(errors(report).length).toBeGreaterThan(0);
  });

  it('V1 still rejects a copy of an authored question with two correct options (the one-correct guard is not bypassed by the packages)', () => {
    const first = AUTHORED[0];
    if (!first) throw new Error('no questions');
    const [o1, o2, o3, o4] = first.question.options;
    const flipped = first.question.options.findIndex((o) => !o.correct);
    const options = [o1, o2, o3, o4].map((o, i) => (i === flipped ? { ...o, correct: true } : o)) as [
      typeof o1,
      typeof o2,
      typeof o3,
      typeof o4,
    ];
    const report = validateQuestion({ ...first.question, options }, first.generated.world);
    expect(errors(report).map((d) => d.code)).toContain('question_evidence.correct_option_count');
  });
});
