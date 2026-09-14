import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  type ContentBundle,
  type Term,
  type TermBinding,
  DEFAULT_PREFERENCES,
  termId,
} from '@ottie/contracts';
import {
  COMPARISON_GIVE_WAY_VS_STOP,
  DEVELOPMENT_ASSETS,
  DEVELOPMENT_ASSET_REGISTRY_HASH,
  DEVELOPMENT_CONTENT_BUNDLE,
  QUESTION_GIVE_WAY,
  TERM_GIVE_WAY_LINE,
  TERM_STOP_LINE,
} from '@ottie/contracts/fixtures';
import { createInMemoryResolver } from '@ottie/asset-registry';
import { ThemeScope } from '../theme/ThemeScope';
import { type HelpRequest } from '../lesson/types';
import { GlossaryExplainer, type GlossaryExplainerProps } from './GlossaryExplainer';
import { createStaticArtworkSource } from './artwork';

const bundle = DEVELOPMENT_CONTENT_BUNDLE;
const devAssets = createInMemoryResolver(
  DEVELOPMENT_ASSETS,
  'development',
  DEVELOPMENT_ASSET_REGISTRY_HASH,
);
const releaseAssets = createInMemoryResolver(
  DEVELOPMENT_ASSETS,
  'release',
  DEVELOPMENT_ASSET_REGISTRY_HASH,
);
const artwork = createStaticArtworkSource({
  'assets/sg/markings/source-vectors/control-give-way-d.svg': 'blob:give-way-d',
  'assets/sg/markings/source-vectors/control-stop-j.svg': 'blob:stop-j',
});

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`missing ${what}`);
  return value;
}

const ACTUAL_GIVE_WAY = must(
  QUESTION_GIVE_WAY.stemBindings.find((b) => b.termId === TERM_GIVE_WAY_LINE.id),
  'stem binding',
);
const HYPOTHETICAL_STOP = must(
  QUESTION_GIVE_WAY.options.flatMap((o) => o.bindings).find((b) => b.role === 'hypothetical'),
  'hypothetical binding',
);
const GLOSSARY_STOP: TermBinding = {
  role: 'glossary',
  text: 'stop line',
  termId: TERM_STOP_LINE.id,
};

function setup(request: HelpRequest | null, overrides: Partial<GlossaryExplainerProps> = {}) {
  const onClose = vi.fn();
  const onRequest = vi.fn<NonNullable<GlossaryExplainerProps['onRequest']>>();
  const props: GlossaryExplainerProps = {
    request,
    bundle,
    assets: devAssets,
    artwork,
    onClose,
    onRequest,
    ...overrides,
  };
  const view = render(
    <ThemeScope preferences={DEFAULT_PREFERENCES}>
      <button type="button" data-testid="opener">
        opener
      </button>
      <GlossaryExplainer {...props} />
    </ThemeScope>,
  );
  return { ...view, props, onClose, onRequest };
}

describe('GlossaryExplainer', () => {
  it('renders nothing while closed', () => {
    setup(null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows label, meaning, paragraphs, artwork, confusables and sources for an actual term', async () => {
    setup({ binding: ACTUAL_GIVE_WAY, origin: { kind: 'stem' } });
    const dialog = screen.getByRole('dialog', { name: TERM_GIVE_WAY_LINE.label });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('glossary-meaning')).toHaveTextContent(
      TERM_GIVE_WAY_LINE.shortDefinition,
    );
    const paragraphs = within(screen.getByTestId('glossary-paragraphs')).getAllByText(/./);
    expect(paragraphs).toHaveLength(TERM_GIVE_WAY_LINE.explainer.length);
    expect(screen.getByTestId('glossary-presence')).toHaveAttribute('data-presence', 'in_scene');
    expect(screen.getByTestId('glossary-dev-note')).toHaveTextContent(/not release material/);

    const figure = screen.getByTestId('glossary-artwork');
    expect(figure).toHaveAttribute('data-asset-id', 'sg.markings.control-give-way-d');
    expect(figure).toHaveAttribute('data-quarantined', 'true');
    const img = await within(figure).findByRole('img');
    expect(img).toHaveAttribute('src', 'blob:give-way-d');
    expect(figure).toHaveTextContent(/quarantined source extract/);

    expect(screen.getByTestId(`glossary-confusable-${TERM_STOP_LINE.id}`)).toHaveTextContent(
      TERM_STOP_LINE.label,
    );
    expect(
      within(screen.getByTestId('glossary-sources')).getAllByRole('listitem').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId('glossary-comparison')).toBeNull();
  });

  it('follows a confusable chip and comes back, without touching the outer world', async () => {
    const user = userEvent.setup();
    const { onClose, onRequest } = setup({ binding: ACTUAL_GIVE_WAY, origin: { kind: 'stem' } });
    await user.click(screen.getByTestId(`glossary-confusable-${TERM_STOP_LINE.id}`));
    expect(screen.getByRole('dialog', { name: TERM_STOP_LINE.label })).toBeInTheDocument();
    expect(screen.getByTestId('glossary-presence')).toHaveAttribute(
      'data-presence',
      'glossary_only',
    );
    expect(screen.getByTestId('glossary-artwork')).toHaveAttribute(
      'data-asset-id',
      'sg.markings.control-stop-j',
    );
    await user.click(screen.getByTestId('glossary-back'));
    expect(screen.getByRole('dialog', { name: TERM_GIVE_WAY_LINE.label })).toBeInTheDocument();
    expect(screen.queryByTestId('glossary-back')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(onRequest).not.toHaveBeenCalled();
  });

  it('marks hypothetical bindings as not in the scene and only emits an explicit comparison request', async () => {
    const user = userEvent.setup();
    const { onRequest } = setup({
      binding: HYPOTHETICAL_STOP,
      origin: { kind: 'option', optionId: 'b' },
    });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-binding-role', 'hypothetical');
    expect(screen.getByTestId('glossary-presence')).toHaveAttribute(
      'data-presence',
      'not_in_scene',
    );
    expect(screen.getByTestId('glossary-presence')).toHaveTextContent(
      /Nothing is added to the scene/,
    );
    const section = screen.getByTestId('glossary-comparison');
    expect(section).toHaveTextContent(COMPARISON_GIVE_WAY_VS_STOP.label);
    expect(screen.queryByTestId('glossary-replay')).toBeNull(); // replace_control, not replay_action
    await user.click(screen.getByTestId('glossary-compare'));
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onRequest).toHaveBeenCalledWith({
      kind: 'compare',
      comparison: COMPARISON_GIVE_WAY_VS_STOP,
      fromBinding: HYPOTHETICAL_STOP,
    });
    expect(COMPARISON_GIVE_WAY_VS_STOP.baseWorldId).toBe(QUESTION_GIVE_WAY.worldId);
  });

  it('offers Replay only for replay_action comparisons and hides buttons when no handler is wired', () => {
    const replay = {
      ...COMPARISON_GIVE_WAY_VS_STOP,
      id: 'cmp.replay',
      kind: 'replay_action' as const,
    };
    const custom: ContentBundle = { ...bundle, comparisons: [...bundle.comparisons, replay] };
    const { rerender, props } = setup(
      {
        binding: { ...HYPOTHETICAL_STOP, comparisonId: 'cmp.replay' },
        origin: { kind: 'option', optionId: 'b' },
      },
      { bundle: custom },
    );
    expect(screen.getByTestId('glossary-replay')).toBeInTheDocument();
    const withoutHandler: GlossaryExplainerProps = {
      request: props.request,
      bundle: props.bundle,
      assets: props.assets,
      artwork,
      onClose: props.onClose,
    };
    rerender(
      <ThemeScope preferences={DEFAULT_PREFERENCES}>
        <GlossaryExplainer {...withoutHandler} />
      </ThemeScope>,
    );
    expect(screen.queryByTestId('glossary-compare')).toBeNull();
    expect(screen.getByTestId('glossary-compare-unavailable')).toBeInTheDocument();
  });

  it('treats glossary-only bindings as word help with no comparison', () => {
    setup({ binding: GLOSSARY_STOP, origin: { kind: 'feedback' } });
    expect(screen.getByTestId('glossary-presence')).toHaveAttribute(
      'data-presence',
      'glossary_only',
    );
    expect(screen.queryByTestId('glossary-comparison')).toBeNull();
    expect(screen.getByTestId('glossary-meaning')).toHaveTextContent(
      TERM_STOP_LINE.shortDefinition,
    );
  });

  it('closes on Escape, the close button and the backdrop, restoring focus and scroll', async () => {
    const user = userEvent.setup();
    const { rerender, props, onClose } = setup(null);
    const opener = screen.getByTestId('opener');
    opener.focus();
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { value: 240, configurable: true, writable: true });
    const request: HelpRequest = { binding: ACTUAL_GIVE_WAY, origin: { kind: 'stem' } };
    rerender(
      <ThemeScope preferences={DEFAULT_PREFERENCES}>
        <button type="button" data-testid="opener">
          opener
        </button>
        <GlossaryExplainer {...props} request={request} />
      </ThemeScope>,
    );
    expect(screen.getByTestId('glossary-close')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('glossary-close'));
    expect(onClose).toHaveBeenCalledTimes(2);
    await user.click(screen.getByTestId('glossary-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);

    rerender(
      <ThemeScope preferences={DEFAULT_PREFERENCES}>
        <button type="button" data-testid="opener">
          opener
        </button>
        <GlossaryExplainer {...props} request={null} />
      </ThemeScope>,
    );
    expect(screen.getByTestId('opener')).toHaveFocus();
    expect(scrollSpy).toHaveBeenLastCalledWith(0, 240);
    scrollSpy.mockRestore();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
  });

  it('keeps Tab inside the sheet and swallows keys so they never reach the lesson', async () => {
    const user = userEvent.setup();
    const outerKeys = vi.fn();
    render(
      <div onKeyDown={outerKeys}>
        <GlossaryExplainer
          request={{ binding: ACTUAL_GIVE_WAY, origin: { kind: 'stem' } }}
          bundle={bundle}
          assets={devAssets}
          artwork={artwork}
          onClose={vi.fn()}
          onRequest={vi.fn()}
        />
      </div>,
    );
    const close = screen.getByTestId('glossary-close');
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    const chip = screen.getByTestId(`glossary-confusable-${TERM_STOP_LINE.id}`);
    expect(chip).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter} ');
    expect(outerKeys).not.toHaveBeenCalled();
  });

  it('renders explicit notices for a null term, a missing term, a malformed term and a malformed binding', () => {
    const unnamed: TermBinding =
      ACTUAL_GIVE_WAY.role === 'actual' ? { ...ACTUAL_GIVE_WAY, termId: null } : ACTUAL_GIVE_WAY;
    const { rerender, props } = setup({ binding: unnamed, origin: { kind: 'stem' } });
    expect(screen.getByRole('dialog', { name: ACTUAL_GIVE_WAY.text })).toBeInTheDocument();
    expect(screen.getByTestId('glossary-no-term')).toBeInTheDocument();
    expect(screen.queryByTestId('glossary-meaning')).toBeNull();

    const wrap = (request: HelpRequest, custom: ContentBundle = bundle) => (
      <ThemeScope preferences={DEFAULT_PREFERENCES}>
        <GlossaryExplainer {...props} bundle={custom} request={request} />
      </ThemeScope>
    );
    rerender(
      wrap({
        binding: { ...GLOSSARY_STOP, termId: termId('ghost') },
        origin: { kind: 'feedback' },
      }),
    );
    expect(screen.getByTestId('glossary-missing-term')).toHaveTextContent('ghost');

    const broken: Term = { ...TERM_STOP_LINE, label: '' };
    rerender(
      wrap(
        { binding: GLOSSARY_STOP, origin: { kind: 'feedback' } },
        { ...bundle, terms: [TERM_GIVE_WAY_LINE, broken] },
      ),
    );
    expect(screen.getByTestId('glossary-malformed-term')).toHaveTextContent('label is empty');
    expect(screen.getByRole('dialog', { name: GLOSSARY_STOP.text })).toBeInTheDocument();

    const junk = { role: 'sign', text: 'junk' } as unknown as TermBinding;
    rerender(wrap({ binding: junk, origin: { kind: 'stem' } }));
    expect(screen.getByTestId('glossary-malformed')).toHaveTextContent(/answer has not changed/);
    expect(screen.getByTestId('glossary-close')).toBeInTheDocument();
  });

  it('notes a missing confusable and a missing comparison', () => {
    const dangling: Term = { ...TERM_GIVE_WAY_LINE, confusableWith: [termId('ghost')] };
    setup(
      {
        binding: { ...HYPOTHETICAL_STOP, termId: dangling.id, comparisonId: 'cmp.ghost' },
        origin: { kind: 'option', optionId: 'b' },
      },
      { bundle: { ...bundle, terms: [dangling, TERM_STOP_LINE] } },
    );
    expect(screen.getByTestId('glossary-confusable-missing-ghost')).toBeInTheDocument();
    expect(screen.getByTestId('glossary-comparison-missing')).toBeInTheDocument();
  });

  it('never shows quarantined artwork through a release resolver and never invents a picture', async () => {
    const { rerender, props } = setup(
      { binding: ACTUAL_GIVE_WAY, origin: { kind: 'stem' } },
      { assets: releaseAssets },
    );
    expect(screen.queryByTestId('glossary-artwork')).toBeNull();
    expect(screen.getByTestId('glossary-artwork-unavailable')).toHaveTextContent(
      /not_release_ready/,
    );

    rerender(
      <ThemeScope preferences={DEFAULT_PREFERENCES}>
        <GlossaryExplainer {...props} assets={devAssets} artwork={createStaticArtworkSource({})} />
      </ThemeScope>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('glossary-artwork-unloadable')).toBeInTheDocument();
    });
    expect(screen.queryByRole('img')).toBeNull();

    const bare: Term = { ...TERM_GIVE_WAY_LINE, illustratedBy: [] };
    rerender(
      <ThemeScope preferences={DEFAULT_PREFERENCES}>
        <GlossaryExplainer {...props} bundle={{ ...bundle, terms: [bare, TERM_STOP_LINE] }} />
      </ThemeScope>,
    );
    expect(screen.queryByTestId('glossary-artwork')).toBeNull();
    expect(screen.queryByTestId('glossary-artwork-unavailable')).toBeNull();
  });

  it('scales with the learner text preference and never fixes heights', () => {
    const { container } = render(
      <ThemeScope preferences={{ ...DEFAULT_PREFERENCES, textScale: 2 }}>
        <GlossaryExplainer
          request={{ binding: ACTUAL_GIVE_WAY, origin: { kind: 'stem' } }}
          bundle={bundle}
          assets={devAssets}
          artwork={artwork}
          onClose={vi.fn()}
        />
      </ThemeScope>,
    );
    const scope = must(container.querySelector<HTMLElement>('.ottie-theme'), 'theme scope');
    expect(scope.style.getPropertyValue('--ottie-text-scale')).toBe('2');
    const sheet = screen.getByRole('dialog');
    expect(sheet.style.height).toBe('');
    expect(sheet.style.maxHeight).toBe('');
    for (const paragraph of within(screen.getByTestId('glossary-paragraphs')).getAllByText(/./)) {
      expect(paragraph.style.height).toBe('');
    }
    expect(screen.queryByRole('timer')).toBeNull();
  });
});
