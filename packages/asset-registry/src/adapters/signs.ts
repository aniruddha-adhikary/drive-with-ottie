import { type AssetRole, type ExtractionAsset, type ExtractionFamily, type SignRole } from '@ottie/contracts';

export type SignFamily = Exclude<ExtractionFamily, 'markings' | 'assemblies'>;

export function isSignFamily(family: ExtractionFamily): family is SignFamily {
  return family !== 'markings' && family !== 'assemblies';
}

const FAMILY_ROLE: Readonly<Record<SignFamily, SignRole>> = {
  mandatory: 'mandatory_sign',
  prohibitory: 'prohibitory_sign',
  warning: 'warning_sign',
  informatory: 'informatory_sign',
};

/**
 * `traffic_rule.action` values written by the mandatory extraction (from the Traffic Police
 * handbook text). They are the only source-backed way to tell STOP and Give Way apart from the
 * other mandatory faces; anything else keeps the family role.
 */
const MANDATORY_ACTION_ROLE: Readonly<Record<string, SignRole>> = {
  stop_before_line: 'stop_sign',
  slow_down_and_stop_if_necessary: 'give_way_sign',
};

export function signRoleFor(family: SignFamily, asset: ExtractionAsset): AssetRole {
  if (family === 'mandatory') {
    const rule: unknown = asset.traffic_rule;
    if (rule !== null && typeof rule === 'object' && 'action' in rule && typeof rule.action === 'string') {
      const specific = MANDATORY_ACTION_ROLE[rule.action];
      if (specific) return specific;
    }
  }
  return FAMILY_ROLE[family];
}
