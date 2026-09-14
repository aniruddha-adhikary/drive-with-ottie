import { type CameraPresetName } from '@ottie/contracts';
import { type RenderedEntity } from '@ottie/renderer-geometry';

/**
 * Learner-facing label for a linked detail inset. It names the enlarged entity and says where
 * its position on the road is shown, so an inset is never mistaken for a floating sign.
 */
export function linkedDetailLabel(entity: RenderedEntity, mainView: CameraPresetName): string {
  const what = describeEntity(entity);
  return `Detail of ${what} — enlarged as mounted; its position on the road is shown in the ${describeView(mainView)} view`;
}

export function describeEntity(entity: RenderedEntity): string {
  switch (entity.kind) {
    case 'sign_face':
      return `sign "${entity.id}"`;
    case 'signal_head':
      return `signal head "${entity.id}" (${String(entity.lenses.length)} lenses, ${entity.arrangement})`;
    case 'actor':
      return `${entity.isEgo ? 'your vehicle' : entity.category} "${entity.id}"`;
    case 'marking':
      return `${entity.role.replace(/_/g, ' ')} marking "${entity.id}"`;
    case 'support':
      return `${entity.family} "${entity.id}"`;
    case 'lane':
      return `lane "${entity.id}"`;
    case 'road':
      return `road "${entity.id}"`;
    case 'movement':
      return `movement "${entity.id}"`;
    case 'anchor':
      return `anchor "${entity.id}"`;
  }
}

export function describeView(name: CameraPresetName): string {
  switch (name) {
    case 'plan':
      return 'plan';
    case 'study_oblique':
      return 'oblique study';
    case 'approach_ego':
      return 'approach';
    case 'entity_detail':
      return 'detail';
  }
}
