import { type ComparisonRequest, type ContentBundle, type Explanation, type Question, type Rule, type Term, type Topic } from '../content';
import { assetId, explanationId, questionId, ruleId, termId, topicId } from '../ids';
import { GIVE_WAY_IDS } from './give-way-t-junction';
import { SIGNAL_IDS } from './signalised-junction-right-arrow';
import {
  LOC_RMS2_D,
  LOC_RMS2_J,
  LOC_RULE11_PAIRED_ARROWS,
  LOC_RULE11_RED_ARROW_PROHIBITS,
  LOC_RULE11_VERTICAL_ORDER,
  LOC_TP_GIVE_WAY_STOP_MEANING,
  LOC_TP_SIGNAL_GREEN_RIGHT_RED,
} from './sources';
import { STOP_IDS } from './stop-development-access';

/**
 * DEVELOPMENT content: original wording written for this repository (nothing copied from any
 * third-party question bank). Terms, rules and explanations cite the official sources by locator.
 * Everything here has `reviewStatus: 'development'`; T1/A2 own reviewed content.
 */

export const TERM_GIVE_WAY_LINE: Term = {
  id: termId('give-way-line'),
  label: 'Give Way line',
  shortDefinition: 'Two rows of short broken white lines across your lane where you must give way.',
  explainer: [
    'The double broken rows mark where your lane meets a road that has priority.',
    'Slow down. Stop if you need to. Move on only when it is safe and you will not make anyone on the major road slow or swerve.',
  ],
  confusableWith: [termId('stop-line')],
  illustratedBy: [{ id: assetId('sg.markings.control-give-way-d'), version: 1 }],
  sourceRefs: [LOC_RMS2_D, LOC_TP_GIVE_WAY_STOP_MEANING],
  reviewStatus: 'development',
};

export const TERM_STOP_LINE: Term = {
  id: termId('stop-line'),
  label: 'Stop line',
  shortDefinition: 'One solid white line across your lane where you must come to a complete stop.',
  explainer: [
    'A single solid transverse line with a STOP sign means stop every time, even if the road looks empty.',
    'Stop with the front of your vehicle behind the line, then give way to traffic from the right and left.',
  ],
  confusableWith: [termId('give-way-line')],
  illustratedBy: [{ id: assetId('sg.markings.control-stop-j'), version: 1 }],
  sourceRefs: [LOC_RMS2_J, LOC_TP_GIVE_WAY_STOP_MEANING],
  reviewStatus: 'development',
};

export const TERM_RED_ARROW: Term = {
  id: termId('red-arrow-signal'),
  label: 'Red arrow',
  shortDefinition: 'A red arrow prohibits the movement it points to, even when a circular green is lit.',
  explainer: [
    'Arrow lights speak only to the movement they point along. A red right arrow means: do not turn right.',
    'The circular green next to it still lets other movements go. The two lights are independent.',
  ],
  confusableWith: [termId('circular-green-signal')],
  illustratedBy: [{ id: assetId('sg.assemblies.signal-through-green-right-red'), version: 1 }],
  sourceRefs: [LOC_RULE11_RED_ARROW_PROHIBITS, LOC_TP_SIGNAL_GREEN_RIGHT_RED],
  reviewStatus: 'development',
};

export const TERM_CIRCULAR_GREEN: Term = {
  id: termId('circular-green-signal'),
  label: 'Circular green',
  shortDefinition: 'A round green light: you may proceed in any direction that is not separately controlled by an arrow.',
  explainer: [
    'Round lights apply to every movement from the lane unless an arrow light takes over for one direction.',
    'Still give way to pedestrians already crossing and to any movement protected by a green arrow.',
  ],
  confusableWith: [termId('red-arrow-signal')],
  illustratedBy: [{ id: assetId('sg.assemblies.signal-through-green-right-red'), version: 1 }],
  sourceRefs: [LOC_RULE11_VERTICAL_ORDER, LOC_RULE11_PAIRED_ARROWS],
  reviewStatus: 'development',
};

export const RULE_GIVE_WAY: Rule = {
  id: ruleId('give-way-at-double-broken-line'),
  version: 1,
  summary: 'At a Give Way line, slow down, stop if necessary, and give way to traffic on the major road.',
  predicate: 'ego.lane has give_way_line AND exists conflicting protected movement with actor ⇒ ego must yield',
  sourceRefs: [LOC_TP_GIVE_WAY_STOP_MEANING],
  unresolved: [],
};

export const RULE_STOP: Rule = {
  id: ruleId('stop-before-stop-line'),
  version: 1,
  summary: 'At a STOP sign, stop before the white line, then give way to traffic from the right and left.',
  predicate: 'ego.lane has stop_line AND stop_sign ⇒ ego.front must be upstream of the line before proceeding',
  sourceRefs: [LOC_TP_GIVE_WAY_STOP_MEANING],
  unresolved: [],
};

export const RULE_RED_ARROW: Rule = {
  id: ruleId('red-arrow-prohibits-movement'),
  version: 1,
  summary: 'A lit red arrow prohibits proceeding beyond the stop line in that direction, regardless of the circular aspect.',
  predicate: 'aspect(shape=arrow_right, colour=red).lit AND aspect.controls(movement) ⇒ permission(movement) = stop',
  sourceRefs: [LOC_RULE11_RED_ARROW_PROHIBITS],
  unresolved: ['Rule 11 capture ends partway through the green-arrow paragraph; the red-arrow paragraph is complete.'],
};

export const EXPLANATION_GIVE_WAY: Explanation = {
  id: explanationId('give-way.correct'),
  ruleIds: [RULE_GIVE_WAY.id],
  paragraphs: [
    'Your lane ends at a Give Way line: two rows of broken white lines. The bus on the major road has priority.',
    'Slow down and be ready to stop. Turn left only when the bus has passed or is far enough that it will not need to slow down.',
  ],
  termIds: [TERM_GIVE_WAY_LINE.id],
  sourceRefs: [LOC_TP_GIVE_WAY_STOP_MEANING],
};

export const EXPLANATION_GIVE_WAY_NOT_STOP: Explanation = {
  id: explanationId('give-way.not-a-stop'),
  ruleIds: [RULE_GIVE_WAY.id, RULE_STOP.id],
  paragraphs: [
    'A Give Way line does not require a full stop every time. That is the single solid stop line with a STOP sign, shown in the comparison scene.',
  ],
  termIds: [TERM_GIVE_WAY_LINE.id, TERM_STOP_LINE.id],
  sourceRefs: [LOC_TP_GIVE_WAY_STOP_MEANING],
};

export const EXPLANATION_GIVE_WAY_NO_PRIORITY: Explanation = {
  id: explanationId('give-way.no-priority'),
  ruleIds: [RULE_GIVE_WAY.id],
  paragraphs: ['Traffic on the major road does not give way to you. The line is on your lane, so the duty to give way is yours.'],
  termIds: [TERM_GIVE_WAY_LINE.id],
  sourceRefs: [LOC_TP_GIVE_WAY_STOP_MEANING],
};

export const EXPLANATION_STOP: Explanation = {
  id: explanationId('stop.correct'),
  ruleIds: [RULE_STOP.id],
  paragraphs: [
    'The STOP sign and the single solid line require a complete stop with your front behind the line.',
    'After stopping, give way to traffic from the right and left, then go when it is safe.',
  ],
  termIds: [TERM_STOP_LINE.id],
  sourceRefs: [LOC_TP_GIVE_WAY_STOP_MEANING],
};

export const EXPLANATION_STOP_NOT_GIVE_WAY: Explanation = {
  id: explanationId('stop.not-a-give-way'),
  ruleIds: [RULE_STOP.id, RULE_GIVE_WAY.id],
  paragraphs: ['Slowing and rolling through is what a Give Way line allows. A stop line means stop every time, even when it looks clear.'],
  termIds: [TERM_STOP_LINE.id, TERM_GIVE_WAY_LINE.id],
  sourceRefs: [LOC_TP_GIVE_WAY_STOP_MEANING],
};

export const EXPLANATION_STOP_FRONT_BEHIND_LINE: Explanation = {
  id: explanationId('stop.front-behind-line'),
  ruleIds: [RULE_STOP.id],
  paragraphs: ['The front of your car must stay behind the line. Stopping over the line is not a stop at the line.'],
  termIds: [TERM_STOP_LINE.id],
  sourceRefs: [LOC_TP_GIVE_WAY_STOP_MEANING],
};

export const EXPLANATION_RED_ARROW: Explanation = {
  id: explanationId('signal.red-arrow-correct'),
  ruleIds: [RULE_RED_ARROW.id],
  paragraphs: [
    'The red right arrow is lit. It prohibits the right turn even though the circular green lets straight and left traffic go.',
    'Wait behind the stop line until the right arrow changes.',
  ],
  termIds: [TERM_RED_ARROW.id, TERM_CIRCULAR_GREEN.id],
  sourceRefs: [LOC_RULE11_RED_ARROW_PROHIBITS, LOC_TP_SIGNAL_GREEN_RIGHT_RED],
};

export const EXPLANATION_CIRCULAR_GREEN_LIMITED: Explanation = {
  id: explanationId('signal.circular-green-does-not-override'),
  ruleIds: [RULE_RED_ARROW.id],
  paragraphs: ['A circular green does not override an arrow. Where an arrow is lit for a movement, the arrow decides that movement.'],
  termIds: [TERM_CIRCULAR_GREEN.id, TERM_RED_ARROW.id],
  sourceRefs: [LOC_RULE11_PAIRED_ARROWS, LOC_RULE11_RED_ARROW_PROHIBITS],
};

export const COMPARISON_GIVE_WAY_VS_STOP: ComparisonRequest = {
  id: 'cmp.give-way-vs-stop',
  baseWorldId: GIVE_WAY_IDS.world,
  kind: 'replace_control',
  delta: { replaceMarking: { id: GIVE_WAY_IDS.entities.giveWayLine, withAssetId: 'sg.markings.control-stop-j', role: 'stop_line' }, replaceSignFace: { id: GIVE_WAY_IDS.entities.giveWaySign, withAssetId: 'sg.mandatory.stop' } },
  label: 'Same junction with a STOP control instead',
  explanationId: EXPLANATION_GIVE_WAY_NOT_STOP.id,
};

export const COMPARISON_STOP_VS_GIVE_WAY: ComparisonRequest = {
  id: 'cmp.stop-vs-give-way',
  baseWorldId: STOP_IDS.world,
  kind: 'replace_control',
  delta: { replaceMarking: { id: STOP_IDS.entities.stopLine, withAssetId: 'sg.markings.control-give-way-d', role: 'give_way_line' }, replaceSignFace: { id: STOP_IDS.entities.stopSign, withAssetId: 'sg.mandatory.give-way' } },
  label: 'Same access with a Give Way control instead',
  explanationId: EXPLANATION_STOP_NOT_GIVE_WAY.id,
};

export const COMPARISON_GREEN_ARROW: ComparisonRequest = {
  id: 'cmp.right-arrow-green',
  baseWorldId: SIGNAL_IDS.world,
  kind: 'change_signal_state',
  delta: { aspectStates: [{ headId: SIGNAL_IDS.entities.nbHead, slot: 'right_arrow_red', state: 'dark' }, { headId: SIGNAL_IDS.entities.nbHead, slot: 'right_arrow_green', state: 'lit' }] },
  label: 'Same junction when the right arrow turns green',
  explanationId: EXPLANATION_RED_ARROW.id,
};

export const QUESTION_GIVE_WAY: Question = {
  id: questionId('dev.give-way.approach-with-bus'),
  version: 1,
  topicId: topicId('junction-priority'),
  worldId: GIVE_WAY_IDS.world,
  stem: 'You are driving the car and want to turn left at the double broken lines. A bus is coming along the major road from your right. What must you do?',
  stemBindings: [
    { role: 'actual', text: 'the car', termId: null, entityId: GIVE_WAY_IDS.entities.ego, evidenceIds: [GIVE_WAY_IDS.evidence.egoLane] },
    { role: 'actual', text: 'double broken lines', termId: TERM_GIVE_WAY_LINE.id, entityId: GIVE_WAY_IDS.entities.giveWayLine, evidenceIds: [GIVE_WAY_IDS.evidence.giveWayLine] },
    { role: 'actual', text: 'bus', termId: null, entityId: GIVE_WAY_IDS.entities.bus, evidenceIds: [GIVE_WAY_IDS.evidence.majorBus] },
  ],
  options: [
    {
      id: 'a',
      text: 'Slow down, stop if necessary, and let the bus pass before turning.',
      bindings: [{ role: 'actual', text: 'the bus', termId: null, entityId: GIVE_WAY_IDS.entities.bus, evidenceIds: [GIVE_WAY_IDS.evidence.majorBus, GIVE_WAY_IDS.evidence.priority] }],
      correct: true,
      rationaleExplanationId: EXPLANATION_GIVE_WAY.id,
    },
    {
      id: 'b',
      text: 'Come to a complete stop at the lines every time, as at a stop line.',
      bindings: [{ role: 'hypothetical', text: 'a stop line', termId: TERM_STOP_LINE.id, comparisonId: COMPARISON_GIVE_WAY_VS_STOP.id }],
      correct: false,
      rationaleExplanationId: EXPLANATION_GIVE_WAY_NOT_STOP.id,
    },
    {
      id: 'c',
      text: 'Keep going: the bus must give way to you because you are turning left.',
      bindings: [{ role: 'actual', text: 'the bus', termId: null, entityId: GIVE_WAY_IDS.entities.bus, evidenceIds: [GIVE_WAY_IDS.evidence.majorBus] }],
      correct: false,
      rationaleExplanationId: EXPLANATION_GIVE_WAY_NO_PRIORITY.id,
    },
    {
      id: 'd',
      text: 'Speed up so you can turn before the bus reaches the junction.',
      bindings: [],
      correct: false,
      rationaleExplanationId: EXPLANATION_GIVE_WAY_NO_PRIORITY.id,
    },
  ],
  requiredEvidenceIds: [GIVE_WAY_IDS.evidence.giveWayLine, GIVE_WAY_IDS.evidence.majorBus, GIVE_WAY_IDS.evidence.egoLane],
  answerRule: { ruleId: RULE_GIVE_WAY.id, version: 1 },
  explanationId: EXPLANATION_GIVE_WAY.id,
  sourceRefs: [LOC_TP_GIVE_WAY_STOP_MEANING],
  reviewStatus: 'development',
  authorship: 'original',
};

export const QUESTION_STOP: Question = {
  id: questionId('dev.stop.access-with-crossing-car'),
  version: 1,
  topicId: topicId('junction-priority'),
  worldId: STOP_IDS.world,
  stem: 'You are driving the car leaving the access road. There is a STOP sign and a single solid white line. What must you do?',
  stemBindings: [
    { role: 'actual', text: 'the car', termId: null, entityId: STOP_IDS.entities.ego, evidenceIds: [STOP_IDS.evidence.egoFrontBeforeLine] },
    { role: 'actual', text: 'STOP sign', termId: null, entityId: STOP_IDS.entities.stopSign, evidenceIds: [STOP_IDS.evidence.stopSign] },
    { role: 'actual', text: 'single solid white line', termId: TERM_STOP_LINE.id, entityId: STOP_IDS.entities.stopLine, evidenceIds: [STOP_IDS.evidence.stopLine] },
  ],
  options: [
    {
      id: 'a',
      text: 'Stop with the front of the car behind the line, then give way to traffic from the right and left.',
      bindings: [{ role: 'actual', text: 'the line', termId: TERM_STOP_LINE.id, entityId: STOP_IDS.entities.stopLine, evidenceIds: [STOP_IDS.evidence.stopLine, STOP_IDS.evidence.egoFrontBeforeLine] }],
      correct: true,
      rationaleExplanationId: EXPLANATION_STOP.id,
    },
    {
      id: 'b',
      text: 'Slow down and continue without stopping if the road looks clear, as at a Give Way line.',
      bindings: [{ role: 'hypothetical', text: 'a Give Way line', termId: TERM_GIVE_WAY_LINE.id, comparisonId: COMPARISON_STOP_VS_GIVE_WAY.id }],
      correct: false,
      rationaleExplanationId: EXPLANATION_STOP_NOT_GIVE_WAY.id,
    },
    {
      id: 'c',
      text: 'Stop only if another vehicle is already at the junction.',
      bindings: [{ role: 'actual', text: 'another vehicle', termId: null, entityId: STOP_IDS.entities.crossingCar, evidenceIds: [STOP_IDS.evidence.crossingCar] }],
      correct: false,
      rationaleExplanationId: EXPLANATION_STOP.id,
    },
    {
      id: 'd',
      text: 'Stop with the front of the car over the line so you can see the local road better.',
      bindings: [{ role: 'actual', text: 'the line', termId: TERM_STOP_LINE.id, entityId: STOP_IDS.entities.stopLine, evidenceIds: [STOP_IDS.evidence.egoFrontBeforeLine] }],
      correct: false,
      rationaleExplanationId: EXPLANATION_STOP_FRONT_BEHIND_LINE.id,
    },
  ],
  requiredEvidenceIds: [STOP_IDS.evidence.stopSign, STOP_IDS.evidence.stopLine, STOP_IDS.evidence.egoFrontBeforeLine],
  answerRule: { ruleId: RULE_STOP.id, version: 1 },
  explanationId: EXPLANATION_STOP.id,
  sourceRefs: [LOC_TP_GIVE_WAY_STOP_MEANING],
  reviewStatus: 'development',
  authorship: 'original',
};

export const QUESTION_RED_RIGHT_ARROW: Question = {
  id: questionId('dev.signal.green-with-red-right-arrow'),
  version: 1,
  topicId: topicId('traffic-signals'),
  worldId: SIGNAL_IDS.world,
  stem: 'You are driving the car and want to turn right. The round green light is lit and the red right-turn arrow is lit. What should you do?',
  stemBindings: [
    { role: 'actual', text: 'the car', termId: null, entityId: SIGNAL_IDS.entities.ego, evidenceIds: [SIGNAL_IDS.evidence.egoLaneAndIntent] },
    { role: 'actual', text: 'round green light', termId: TERM_CIRCULAR_GREEN.id, entityId: SIGNAL_IDS.entities.nbHead, evidenceIds: [SIGNAL_IDS.evidence.nbHeadState] },
    { role: 'actual', text: 'red right-turn arrow', termId: TERM_RED_ARROW.id, entityId: SIGNAL_IDS.entities.nbHead, evidenceIds: [SIGNAL_IDS.evidence.nbHeadState] },
  ],
  options: [
    {
      id: 'a',
      text: 'Wait behind the stop line: the red arrow prohibits the right turn even though the round green is lit.',
      bindings: [{ role: 'actual', text: 'the stop line', termId: TERM_STOP_LINE.id, entityId: SIGNAL_IDS.entities.nbStopLine, evidenceIds: [SIGNAL_IDS.evidence.nbStopLine] }],
      correct: true,
      rationaleExplanationId: EXPLANATION_RED_ARROW.id,
    },
    {
      id: 'b',
      text: 'Turn right carefully: the round green allows every movement from your lane.',
      bindings: [{ role: 'actual', text: 'the round green', termId: TERM_CIRCULAR_GREEN.id, entityId: SIGNAL_IDS.entities.nbHead, evidenceIds: [SIGNAL_IDS.evidence.nbHeadState] }],
      correct: false,
      rationaleExplanationId: EXPLANATION_CIRCULAR_GREEN_LIMITED.id,
    },
    {
      id: 'c',
      text: 'Turn right once the oncoming car has passed, as you would on a round green alone.',
      bindings: [{ role: 'actual', text: 'the oncoming car', termId: null, entityId: SIGNAL_IDS.entities.oncoming, evidenceIds: [SIGNAL_IDS.evidence.oncoming] }],
      correct: false,
      rationaleExplanationId: EXPLANATION_CIRCULAR_GREEN_LIMITED.id,
    },
    {
      id: 'd',
      text: 'Go straight instead and turn around later; you may never turn right at this junction.',
      bindings: [{ role: 'hypothetical', text: 'never turn right', termId: TERM_RED_ARROW.id, comparisonId: COMPARISON_GREEN_ARROW.id }],
      correct: false,
      rationaleExplanationId: EXPLANATION_RED_ARROW.id,
    },
  ],
  requiredEvidenceIds: [SIGNAL_IDS.evidence.nbHeadState, SIGNAL_IDS.evidence.nbStopLine, SIGNAL_IDS.evidence.egoLaneAndIntent],
  answerRule: { ruleId: RULE_RED_ARROW.id, version: 1 },
  explanationId: EXPLANATION_RED_ARROW.id,
  sourceRefs: [LOC_RULE11_RED_ARROW_PROHIBITS, LOC_TP_SIGNAL_GREEN_RIGHT_RED],
  reviewStatus: 'development',
  authorship: 'original',
};

export const TOPIC_JUNCTION_PRIORITY: Topic = {
  id: topicId('junction-priority'),
  label: 'Who goes first at junctions',
  description: 'Give Way and STOP controls at minor and access roads.',
  questionIds: [QUESTION_GIVE_WAY.id, QUESTION_STOP.id],
  termIds: [TERM_GIVE_WAY_LINE.id, TERM_STOP_LINE.id],
};

export const TOPIC_TRAFFIC_SIGNALS: Topic = {
  id: topicId('traffic-signals'),
  label: 'Reading traffic lights',
  description: 'Circular and arrow aspects and what each one controls.',
  questionIds: [QUESTION_RED_RIGHT_ARROW.id],
  termIds: [TERM_CIRCULAR_GREEN.id, TERM_RED_ARROW.id],
};

export const DEVELOPMENT_CONTENT_BUNDLE: ContentBundle = {
  id: 'dev.f0-reference',
  version: 1,
  topics: [TOPIC_JUNCTION_PRIORITY, TOPIC_TRAFFIC_SIGNALS],
  questions: [QUESTION_GIVE_WAY, QUESTION_STOP, QUESTION_RED_RIGHT_ARROW],
  terms: [TERM_GIVE_WAY_LINE, TERM_STOP_LINE, TERM_RED_ARROW, TERM_CIRCULAR_GREEN],
  rules: [RULE_GIVE_WAY, RULE_STOP, RULE_RED_ARROW],
  explanations: [
    EXPLANATION_GIVE_WAY,
    EXPLANATION_GIVE_WAY_NOT_STOP,
    EXPLANATION_GIVE_WAY_NO_PRIORITY,
    EXPLANATION_STOP,
    EXPLANATION_STOP_NOT_GIVE_WAY,
    EXPLANATION_STOP_FRONT_BEHIND_LINE,
    EXPLANATION_RED_ARROW,
    EXPLANATION_CIRCULAR_GREEN_LIMITED,
  ],
  comparisons: [COMPARISON_GIVE_WAY_VS_STOP, COMPARISON_STOP_VS_GIVE_WAY, COMPARISON_GREEN_ARROW],
  worldIds: [GIVE_WAY_IDS.world, STOP_IDS.world, SIGNAL_IDS.world],
  reviewStatus: 'development',
};
