import { describe, expect, it } from 'vitest';
import {
  type AssetDefinition,
  type Question,
  anchorId,
  assetId,
  metres,
  seed,
  sha256,
} from '@ottie/contracts';
import {
  ASSET_GIVE_WAY_FACE,
  DEVELOPMENT_ASSETS,
  DEVELOPMENT_ASSET_REGISTRY_HASH,
  DEVELOPMENT_WORLDS,
  GIVE_WAY_IDS,
  GIVE_WAY_T_JUNCTION,
  INVALID_WORLD_MUTATIONS,
  PRESENTATION_ONLY_CAMERA_MOVE,
  QUESTION_GIVE_WAY,
  QUESTION_MUTATIONS,
  QUESTION_RED_RIGHT_ARROW,
  QUESTION_STOP,
  SIGNAL_IDS,
  SIGNAL_SLOTS,
  SIGNALISED_JUNCTION_RIGHT_ARROW,
  STOP_DEVELOPMENT_ACCESS,
  STOP_IDS,
  TERM_STOP_LINE,
} from '@ottie/contracts/fixtures';
import { createInMemoryResolver } from '@ottie/asset-registry';
import informatoryManifest from '@ottie/sg-assets/informatory/manifest.json';
import {
  REQUIRED_WORLD_VALIDATORS,
  SEMANTIC_VALIDATORS,
  missingValidators,
  validatePresentationChange,
  validateQuestion,
  validateWorld,
} from '@ottie/scenario-validation';
import { codes, errors, expectError, expectValid, mutate, warnings } from './helpers';

const QUESTIONS_BY_WORLD = new Map([
  [GIVE_WAY_T_JUNCTION.id, [QUESTION_GIVE_WAY]],
  [STOP_DEVELOPMENT_ACCESS.id, [QUESTION_STOP]],
  [SIGNALISED_JUNCTION_RIGHT_ARROW.id, [QUESTION_RED_RIGHT_ARROW]],
]);

describe('validator wiring', () => {
  it('runs every one of the ten semantic families plus the structural base for a world', () => {
    expect(SEMANTIC_VALIDATORS.map((v) => v.name).sort()).toEqual(
      [...REQUIRED_WORLD_VALIDATORS].sort(),
    );
    expect(REQUIRED_WORLD_VALIDATORS).toHaveLength(10);
    for (const world of DEVELOPMENT_WORLDS) {
      const report = validateWorld(world);
      expect(missingValidators(report)).toEqual([]);
      expect(report.validatorsRun).toContain('structural_integrity');
    }
  });
});

describe('development fixtures under explicit quarantine', () => {
  it.each(DEVELOPMENT_WORLDS.map((w) => [w.id, w] as const))(
    '%s is semantically valid',
    (_id, world) => {
      expectValid(validateWorld(world));
    },
  );

  it('keeps the schematic stand-ins visible as blocked-source warnings, never silently accepted', () => {
    for (const world of DEVELOPMENT_WORLDS) {
      const blocked = warnings(validateWorld(world)).filter(
        (d) => d.code === 'source_applicability.blocked_source_record_in_development',
      );
      expect(blocked.length).toBeGreaterThan(0);
      for (const d of blocked) expect(String(d.data?.assetId)).toMatch(/^sg\.dev\./);
    }
  });

  it('keeps the base of every catalogued mutation valid, so each failure below is caused by the mutation alone', () => {
    for (const m of INVALID_WORLD_MUTATIONS) expectValid(validateWorld(m.base));
  });
});

describe('learner-release resolution', () => {
  it.each(DEVELOPMENT_WORLDS.map((w) => [w.id, w] as const))(
    '%s is rejected: development fixture, unapproved assets',
    (_id, world) => {
      const report = validateWorld(world, { target: 'learner_release' });
      expectError(report, 'source_applicability.development_fixture_in_release');
      const unresolved = errors(report).filter(
        (d) => d.code === 'source_applicability.asset_unresolved',
      );
      expect(unresolved.length).toBeGreaterThan(0);
      expect(unresolved.some((d) => d.message.includes('not_release_ready'))).toBe(true);
      expect(unresolved.some((d) => d.message.includes('blocked'))).toBe(true);
    },
  );

  it('refuses a learner-release validation that is handed a development resolver', () => {
    const report = validateWorld(GIVE_WAY_T_JUNCTION, {
      target: 'learner_release',
      assets: createInMemoryResolver(
        DEVELOPMENT_ASSETS,
        'development',
        DEVELOPMENT_ASSET_REGISTRY_HASH,
      ),
    });
    expectError(report, 'source_applicability.release_requires_release_resolver');
  });

  it('rejects a world that uses quarantined assets without declaring it', () => {
    const undeclared = mutate(GIVE_WAY_T_JUNCTION, (d) => {
      d.provenance = { ...d.provenance, usesQuarantinedAssets: false };
    });
    expectError(validateWorld(undeclared), 'source_applicability.quarantine_not_declared');
  });
});

describe('catalogued world mutations (F0 fixtures/mutations.ts)', () => {
  it.each(INVALID_WORLD_MUTATIONS.map((m) => [m.id, m] as const))(
    '%s fails with its expected diagnostic',
    (_id, m) => {
      const mutated = m.apply();
      expect(mutated).not.toEqual(m.base);
      const report = validateWorld(mutated);
      const found = expectError(report, m.expectedCode);
      expect(found.validator).toBe(m.expectedValidator);
    },
  );

  it('accepts the presentation-only camera move and still forbids any semantic change', () => {
    const moved = PRESENTATION_ONLY_CAMERA_MOVE.apply();
    expectValid(validatePresentationChange(PRESENTATION_ONLY_CAMERA_MOVE.base, moved));
    expectValid(validateWorld(moved));

    const busNudged = mutate(GIVE_WAY_T_JUNCTION, (d) => {
      d.actors = d.actors.map((a) =>
        a.id === GIVE_WAY_IDS.entities.bus ? { ...a, speedKmh: a.speedKmh + 1 } : a,
      );
    });
    const changed = expectError(
      validatePresentationChange(GIVE_WAY_T_JUNCTION, busNudged),
      'state_invariance.non_presentation_field_changed',
    );
    expect(changed.entityIds).toContain(GIVE_WAY_IDS.entities.bus);

    const reseeded = mutate(GIVE_WAY_T_JUNCTION, (d) => {
      d.provenance = { ...d.provenance, key: { ...d.provenance.key, seed: seed('another-seed') } };
    });
    expectError(
      validatePresentationChange(GIVE_WAY_T_JUNCTION, reseeded),
      'state_invariance.seed_changed',
    );
  });

  it('rejects a thawed world and a tampered canonical hash', () => {
    const thawed = structuredClone(GIVE_WAY_T_JUNCTION);
    expectError(validateWorld(thawed), 'state_invariance.world_not_frozen');
    const tampered = mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (d) => {
      d.provenance = { ...d.provenance, canonicalHash: sha256('0'.repeat(64)) };
    });
    expectError(validateWorld(tampered), 'state_invariance.canonical_hash_mismatch');
  });
});

describe('V1 destructive mutations beyond the F0 catalogue', () => {
  it('Give Way post removed: the face floats and the control is no longer mounted', () => {
    const world = mutate(GIVE_WAY_T_JUNCTION, (d) => {
      d.supports = d.supports.filter((s) => s.id !== GIVE_WAY_IDS.entities.giveWayPost);
    });
    expectError(validateWorld(world), 'mount_integrity.floating_face');
  });

  it('Give Way sign removed while the line stays: missing required control, not a warning', () => {
    const world = mutate(GIVE_WAY_T_JUNCTION, (d) => {
      d.signFaces = [];
      d.evidence = d.evidence.filter((e) => e.id !== GIVE_WAY_IDS.evidence.giveWaySign);
      d.evidence = d.evidence.map((e) => ({
        ...e,
        coVisibleWith: e.coVisibleWith.filter((c) => c !== GIVE_WAY_IDS.evidence.giveWaySign),
      }));
      d.cameraPresets = d.cameraPresets.map((c) => ({
        ...c,
        evidenceIds: c.evidenceIds.filter((e) => e !== GIVE_WAY_IDS.evidence.giveWaySign),
      }));
    });
    const report = validateWorld(world);
    expectError(report, 'control_completeness.missing_required_control');
    expectError(report, 'control_completeness.missing_sign_for_give_way_line');
  });

  it('Give Way line painted on the wrong (priority) lane: the line role does not fit the anchor', () => {
    const world = mutate(GIVE_WAY_T_JUNCTION, (d) => {
      d.markings = d.markings.map((m) =>
        m.id === GIVE_WAY_IDS.entities.giveWayLine
          ? { ...m, applicableLaneIds: [GIVE_WAY_IDS.lanes.majorEastbound] }
          : m,
      );
    });
    const report = validateWorld(world);
    expect(
      codes(errors(report)).some(
        (c) => c.startsWith('marking_context.') || c.startsWith('control_completeness.'),
      ),
    ).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('Stop line marked as a Give Way line: the semantic role wins over the asset that happens to be placed', () => {
    const world = mutate(STOP_DEVELOPMENT_ACCESS, (d) => {
      d.markings = d.markings.map((m) =>
        m.id === STOP_IDS.entities.stopLine ? { ...m, role: 'give_way_line' as const } : m,
      );
    });
    const report = validateWorld(world);
    expectError(report, 'marking_context.role_asset_mismatch');
    expectError(report, 'control_completeness.marking_role_mismatch');
  });

  it('southbound signal head omitted: its stop line holds a lane no signal governs', () => {
    const world = mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (d) => {
      d.signalHeads = d.signalHeads.filter((h) => h.id !== SIGNAL_IDS.entities.sbHead);
      d.signalControllers = d.signalControllers.map((c) => ({
        ...c,
        aspectStates: c.aspectStates.filter((s) => s.headId !== SIGNAL_IDS.entities.sbHead),
        movementPermissions: c.movementPermissions.map((p) => ({
          ...p,
          governedByAspects: p.governedByAspects.filter(
            (g) => g.headId !== SIGNAL_IDS.entities.sbHead,
          ),
        })),
      }));
    });
    const report = validateWorld(world);
    expectError(report, 'control_completeness.movement_without_governing_signal');
  });

  it('crossing bound without a crossing marking is an omitted control', () => {
    const world = mutate(STOP_DEVELOPMENT_ACCESS, (d) => {
      const control = d.anchors.find((a) => a.id === STOP_IDS.anchors.controlLine);
      if (control?.kind !== 'control_line') throw new Error('fixture control line missing');
      d.anchors = [
        ...d.anchors,
        {
          id: anchorId('access.crossing-bound'),
          kind: 'crossing_bound',
          polyline: control.polyline,
          crossesLaneIds: control.controlsLaneIds,
        },
      ];
    });
    expectError(validateWorld(world), 'control_completeness.missing_crossing');
  });

  it('mirrored lens columns: circular slots carrying arrows and arrow slots carrying discs are a layout mismatch even with the same housing', () => {
    const world = mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (d) => {
      d.signalHeads = d.signalHeads.map((h) =>
        h.id === SIGNAL_IDS.entities.nbHead
          ? {
              ...h,
              aspects: h.aspects.map((a) => ({
                ...a,
                shape: a.shape === 'circular' ? ('arrow_right' as const) : ('circular' as const),
              })),
            }
          : h,
      );
    });
    const report = validateWorld(world);
    const mismatches = errors(report).filter(
      (d) => d.code === 'signal_movements.aspect_layout_mismatch',
    );
    expect(mismatches.length).toBeGreaterThanOrEqual(6);
    expect(mismatches.every((d) => d.data?.kind === 'shape_mismatch')).toBe(true);
    expectError(report, 'signal_movements.arrow_shape_movement_mismatch');
  });

  it('inverted lens order in the assembly itself (green above red) is rejected from the asset, not the artwork', () => {
    const upsideDown: AssetDefinition[] = DEVELOPMENT_ASSETS.map((asset) => {
      if (
        asset.id !== SIGNALISED_JUNCTION_RIGHT_ARROW.signalHeads[0]?.asset.id ||
        asset.geometry.kind !== 'signal_head'
      )
        return asset;
      const rows = asset.geometry.head.aspects.map((s) => s.row);
      const max = Math.max(...rows);
      return {
        ...asset,
        geometry: {
          ...asset.geometry,
          head: {
            ...asset.geometry.head,
            aspects: asset.geometry.head.aspects.map((s) => ({ ...s, row: max - s.row })),
          },
        },
      };
    });
    const report = validateWorld(SIGNALISED_JUNCTION_RIGHT_ARROW, {
      assets: createInMemoryResolver(upsideDown, 'development', DEVELOPMENT_ASSET_REGISTRY_HASH),
    });
    expectError(report, 'signal_movements.lens_order_invalid');
  });

  it('circular green never overrides a lit red arrow: the permission must stay stop', () => {
    const report = validateWorld(
      mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (d) => {
        d.signalControllers = d.signalControllers.map((c) => ({
          ...c,
          movementPermissions: c.movementPermissions.map((p) =>
            p.movementId === SIGNAL_IDS.movements.nbRight
              ? { ...p, permission: 'proceed_protected' as const }
              : p,
          ),
        }));
      }),
    );
    const found = expectError(report, 'signal_movements.permission_contradicts_lit_red_arrow');
    expect(found.entityIds).toContain(SIGNAL_IDS.movements.nbRight);
  });

  it('dark right arrow: the circular aspect governs the right turn, and a dark arrow cannot be cited as governing', () => {
    const darkArrow = mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (d) => {
      d.signalControllers = d.signalControllers.map((c) => ({
        ...c,
        aspectStates: c.aspectStates.map((s) =>
          s.slot === SIGNAL_SLOTS.rightArrowRed ? { ...s, state: 'dark' as const } : s,
        ),
        movementPermissions: c.movementPermissions.map((p) =>
          p.movementId === SIGNAL_IDS.movements.nbRight ||
          p.movementId === SIGNAL_IDS.movements.sbRight
            ? {
                ...p,
                permission: 'proceed_permissive' as const,
                governedByAspects: [
                  {
                    headId: p.governedByAspects[0]?.headId ?? SIGNAL_IDS.entities.nbHead,
                    slot: SIGNAL_SLOTS.circularGreen,
                  },
                ],
              }
            : p,
        ),
      }));
    });
    expectValid(validateWorld(darkArrow));

    const stillCitingDark = mutate(darkArrow, (d) => {
      d.signalControllers = d.signalControllers.map((c) => ({
        ...c,
        movementPermissions: c.movementPermissions.map((p) =>
          p.movementId === SIGNAL_IDS.movements.nbRight
            ? {
                ...p,
                permission: 'stop' as const,
                governedByAspects: [
                  { headId: SIGNAL_IDS.entities.nbHead, slot: SIGNAL_SLOTS.rightArrowRed },
                ],
              }
            : p,
        ),
      }));
    });
    expectError(validateWorld(stillCitingDark), 'signal_movements.permission_contradicts_aspects');
  });

  it('a permission citing an aspect that governs a different movement is unbound even though the aspect exists', () => {
    const report = validateWorld(
      mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (d) => {
        d.signalControllers = d.signalControllers.map((c) => ({
          ...c,
          movementPermissions: c.movementPermissions.map((p) =>
            p.movementId === SIGNAL_IDS.movements.nbStraight
              ? {
                  ...p,
                  governedByAspects: [
                    { headId: SIGNAL_IDS.entities.sbHead, slot: SIGNAL_SLOTS.circularGreen },
                  ],
                }
              : p,
          ),
        }));
      }),
    );
    expectError(report, 'signal_movements.governing_aspect_not_bound');
  });

  it('green B is for buses only: a car acting on the B-governed movement from a mixed lane is rejected', () => {
    const report = validateWorld(
      mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (d) => {
        d.signalHeads = d.signalHeads.map((h) =>
          h.id === SIGNAL_IDS.entities.nbHead
            ? {
                ...h,
                aspects: h.aspects.map((a) =>
                  a.slot === SIGNAL_SLOTS.rightArrowGreen
                    ? { ...a, shape: 'letter_b' as const }
                    : a,
                ),
              }
            : h,
        );
      }),
    );
    expectError(report, 'signal_movements.b_aspect_lane_not_bus_only');
    const grant = expectError(report, 'signal_movements.b_aspect_grants_non_bus');
    expect(grant.entityIds).toContain(SIGNAL_IDS.entities.ego);
  });

  it('a Give Way sign that faces the priority road is not readable from its approach', () => {
    const report = validateWorld(
      mutate(GIVE_WAY_T_JUNCTION, (d) => {
        d.signFaces = d.signFaces.map((f) =>
          f.id === GIVE_WAY_IDS.entities.giveWaySign
            ? { ...f, frontNormal: { x: 1, y: 0, z: 0 } }
            : f,
        );
      }),
    );
    expectError(report, 'approach_facing.face_away_from_approach');
  });

  it('a sign face mounted upside down is rejected', () => {
    const report = validateWorld(
      mutate(GIVE_WAY_T_JUNCTION, (d) => {
        d.signFaces = d.signFaces.map((f) =>
          f.id === GIVE_WAY_IDS.entities.giveWaySign ? { ...f, up: { x: 0, y: 0, z: -1 } } : f,
        );
      }),
    );
    expectError(report, 'mount_integrity.inverted_asset');
  });

  it('a lane whose heading contradicts its centreline, and a right-hand placed lane, are topology errors', () => {
    const reversed = mutate(GIVE_WAY_T_JUNCTION, (d) => {
      d.lanes = d.lanes.map((l) =>
        l.id === GIVE_WAY_IDS.lanes.minorNorthbound
          ? { ...l, heading: (l.heading + Math.PI) as typeof l.heading }
          : l,
      );
    });
    expectError(validateWorld(reversed), 'lane_topology.heading_centreline_mismatch');

    const swapped = mutate(GIVE_WAY_T_JUNCTION, (d) => {
      const eb = d.lanes.find((l) => l.id === GIVE_WAY_IDS.lanes.majorEastbound);
      const wb = d.lanes.find((l) => l.id === GIVE_WAY_IDS.lanes.majorWestbound);
      if (!eb || !wb) throw new Error('fixture lanes missing');
      d.lanes = d.lanes.map((l) =>
        l.id === eb.id
          ? { ...l, centreline: wb.centreline.slice().reverse() }
          : l.id === wb.id
            ? { ...l, centreline: eb.centreline.slice().reverse() }
            : l,
      );
    });
    expectError(validateWorld(swapped), 'lane_topology.left_traffic_placement');
  });

  it('a movement whose path leaves a lane it does not start on is disconnected (tolerance = half the lane width)', () => {
    const report = validateWorld(
      mutate(GIVE_WAY_T_JUNCTION, (d) => {
        d.movements = d.movements.map((m) =>
          m.id === GIVE_WAY_IDS.movements.minorLeft
            ? { ...m, path: m.path.map((p, i) => (i === 0 ? { ...p, x: metres(p.x + 3) } : p)) }
            : m,
        );
      }),
    );
    expectError(report, 'lane_topology.movement_disconnected');
  });
});

describe('source applicability against real extraction records', () => {
  const busLaneRecord = informatoryManifest.assets.find(
    (a) => a.id === 'sg.informatory.bus-lane-full-day-source-hours',
  );

  it('the full-day bus-lane hours board carries an unresolved source conflict in its manifest', () => {
    expect(busLaneRecord?.review.status).toBe('blocked');
    expect(busLaneRecord?.review.warnings.some((w) => w.startsWith('CONFLICT:'))).toBe(true);
  });

  it('stale bus-lane hours: a face carrying the recorded TFI1-vs-handbook conflict is an error in development AND learner release', () => {
    if (!busLaneRecord) throw new Error('manifest record missing');
    const staleBoard: AssetDefinition = {
      ...ASSET_GIVE_WAY_FACE,
      id: assetId(busLaneRecord.id),
      name: busLaneRecord.name,
      role: 'informatory_sign',
      allowedContexts: {
        controlRegimes: ['give_way', 'stop', 'signalised', 'uncontrolled', 'zebra_crossing'],
        roadClasses: ['minor_access', 'local', 'development_access', 'major'],
      },
      review: {
        ...ASSET_GIVE_WAY_FACE.review,
        extractionStatus: 'blocked',
        warnings: busLaneRecord.review.warnings,
      },
    };
    const world = mutate(GIVE_WAY_T_JUNCTION, (d) => {
      d.signFaces = d.signFaces.map((f) =>
        f.id === GIVE_WAY_IDS.entities.giveWaySign
          ? { ...f, asset: { id: staleBoard.id, version: staleBoard.version } }
          : f,
      );
    });
    const development = validateWorld(world, {
      assets: createInMemoryResolver(
        [...DEVELOPMENT_ASSETS, staleBoard],
        'development',
        DEVELOPMENT_ASSET_REGISTRY_HASH,
      ),
    });
    const conflict = expectError(development, 'source_applicability.source_conflict_unresolved');
    expect(conflict.message).toMatch(/07:30-20:00/);
    expect(conflict.message).toMatch(/07:30-23:00/);
    expectError(development, 'control_completeness.missing_required_control');

    const release = validateWorld(world, {
      target: 'learner_release',
      assets: createInMemoryResolver(
        [...DEVELOPMENT_ASSETS, staleBoard],
        'release',
        DEVELOPMENT_ASSET_REGISTRY_HASH,
      ),
    });
    expect(
      errors(release).some(
        (d) =>
          d.code === 'source_applicability.asset_unresolved' &&
          d.entityIds.includes(GIVE_WAY_IDS.entities.giveWaySign),
      ),
    ).toBe(true);
  });

  it('a Give Way face placed in a signalised world is outside its allowed regimes', () => {
    const report = validateWorld(
      mutate(SIGNALISED_JUNCTION_RIGHT_ARROW, (d) => {
        const gw = GIVE_WAY_T_JUNCTION.signFaces[0];
        const pole = d.supports[0];
        if (!gw || !pole) throw new Error('fixture parts missing');
        d.signFaces = [
          {
            ...gw,
            attachment: { ...gw.attachment, supportId: pole.id },
            applicableLaneIds: [SIGNAL_IDS.lanes.nsNorthbound],
            intendedApproach: {
              laneIds: [SIGNAL_IDS.lanes.nsNorthbound],
              heading: gw.intendedApproach.heading,
            },
            linkedControlLineIds: [],
          },
        ];
      }),
    );
    expectError(report, 'source_applicability.regime_not_allowed');
  });
});

describe('questions against their worlds', () => {
  it('Give Way and STOP starter questions validate; the A3 rule version drift stays a visible warning', () => {
    for (const [worldId, questions] of QUESTIONS_BY_WORLD) {
      const world = DEVELOPMENT_WORLDS.find((w) => w.id === worldId);
      if (!world) throw new Error('fixture world missing');
      for (const question of questions) {
        if (question.id === QUESTION_RED_RIGHT_ARROW.id) continue;
        const report = validateQuestion(question, world);
        expectValid(report);
        expect(codes(warnings(report))).toContain('question_evidence.answer_rule_version_mismatch');
      }
    }
  });

  it('F0 finding for T1/I1: the signal question binds a term that IS in the world as hypothetical (option d)', () => {
    const report = validateQuestion(QUESTION_RED_RIGHT_ARROW, SIGNALISED_JUNCTION_RIGHT_ARROW);
    const found = expectError(report, 'question_evidence.hypothetical_present_in_world');
    expect(found.message).toMatch(/option d/);
    expect(codes(errors(report))).toEqual(['question_evidence.hypothetical_present_in_world']);
  });

  it.each(QUESTION_MUTATIONS.map((m) => [m.id, m] as const))(
    '%s fails with its expected diagnostic',
    (_id, m) => {
      const report = validateQuestion(m.apply(), m.world);
      const found = expectError(report, m.expectedCode);
      expect(found.validator).toBe(m.expectedValidator);
    },
  );

  it('an actual binding whose term is illustrated by a different asset than the entity uses is a term mismatch', () => {
    const question: Question = {
      ...QUESTION_GIVE_WAY,
      stemBindings: QUESTION_GIVE_WAY.stemBindings.map((b) =>
        b.role === 'actual' && b.entityId === GIVE_WAY_IDS.entities.giveWayLine
          ? { ...b, termId: TERM_STOP_LINE.id }
          : b,
      ),
    };
    expectError(
      validateQuestion(question, GIVE_WAY_T_JUNCTION),
      'question_evidence.actual_binding_term_mismatch',
    );
  });

  it('a question whose answer rule is unknown to the source-backed content is rejected', () => {
    const question: Question = {
      ...QUESTION_STOP,
      answerRule: { ruleId: 'no-such-rule' as typeof QUESTION_STOP.answerRule.ruleId, version: 1 },
    };
    expectError(
      validateQuestion(question, STOP_DEVELOPMENT_ACCESS),
      'question_evidence.answer_rule_unknown',
    );
  });

  it('the correct option may not rest on a hypothetical binding', () => {
    const [a, b, c, d] = QUESTION_STOP.options;
    const question: Question = {
      ...QUESTION_STOP,
      options: [
        {
          ...a,
          bindings: [
            ...a.bindings,
            {
              role: 'hypothetical',
              text: 'a zebra crossing',
              termId: null,
              comparisonId: 'cmp.none',
            },
          ],
        },
        b,
        c,
        d,
      ],
    };
    expectError(
      validateQuestion(question, STOP_DEVELOPMENT_ACCESS),
      'question_evidence.correct_option_hypothetical',
    );
  });

  it('ego stopped beyond the STOP line contradicts the before-line evidence the question relies on', () => {
    const world = mutate(STOP_DEVELOPMENT_ACCESS, (d) => {
      d.actors = d.actors.map((a) =>
        a.id === STOP_IDS.entities.ego
          ? {
              ...a,
              progressM: metres(a.progressM + 4),
              pose: {
                ...a.pose,
                position: { ...a.pose.position, x: metres(a.pose.position.x + 4) },
              },
            }
          : a,
      );
    });
    const report = validateWorld(world);
    expect(report.ok).toBe(false);
    expect(
      codes(errors(report)).some(
        (c) =>
          c === 'question_evidence.relative_position_contradicted' ||
          c.startsWith('lane_topology.actor_'),
      ),
    ).toBe(true);
  });
});
