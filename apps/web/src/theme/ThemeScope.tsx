import { type ReactNode } from 'react';
import { DEFAULT_PREFERENCES, type Preferences } from '@ottie/contracts';
import { themeCssVariables } from './tokens';
import './theme.css';

interface Props {
  readonly preferences?: Pick<Preferences, 'textScale' | 'reducedMotion' | 'theme'>;
  readonly children: ReactNode;
}

/**
 * Applies the brand tokens, type scale and learner text scale to a subtree. Preferences are read
 * only; changing them is a presentation change and never touches attempt state.
 */
export function ThemeScope({ preferences = DEFAULT_PREFERENCES, children }: Props): React.JSX.Element {
  return (
    <div
      className="ottie-theme"
      data-theme={preferences.theme}
      data-reduced-motion={preferences.reducedMotion ? 'true' : 'false'}
      data-text-scale={String(preferences.textScale)}
      style={themeCssVariables(preferences)}
    >
      {children}
    </div>
  );
}
