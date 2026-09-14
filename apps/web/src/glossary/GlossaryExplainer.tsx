import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type AssetResolver, type ContentBundle, type Term, type TermId } from '@ottie/contracts';
import { type HelpRequest } from '../lesson/types';
import { chooseArtwork, createViteArtworkSource } from './artwork';
import { describeLocator, explainerModel, isTermBinding } from './lookup';
import {
  type ArtworkChoice,
  type ArtworkSource,
  type BindingPresence,
  type ExplainerModel,
  type GlossaryRequest,
} from './types';
import './glossary.css';

export interface GlossaryExplainerProps {
  /** The active help request from the lesson shell, or null when the sheet is closed. */
  readonly request: HelpRequest | null;
  readonly bundle: ContentBundle;
  /** Development or release resolver supplied by the host; null hides all artwork. */
  readonly assets: AssetResolver | null;
  readonly artwork?: ArtworkSource;
  readonly onClose: () => void;
  /** Explicit comparison / replay requests. Not wired = buttons are not shown. */
  readonly onRequest?: (request: GlossaryRequest) => void;
}

interface Snapshot {
  readonly focus: HTMLElement | null;
  readonly scrollX: number;
  readonly scrollY: number;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

let defaultArtworkSource: ArtworkSource | null = null;
function artworkSource(explicit: ArtworkSource | undefined): ArtworkSource {
  if (explicit) return explicit;
  defaultArtworkSource ??= createViteArtworkSource();
  return defaultArtworkSource;
}

function presenceCopy(presence: BindingPresence): {
  readonly label: string;
  readonly detail: string;
} {
  switch (presence.kind) {
    case 'in_scene':
      return {
        label: 'In this scene',
        detail: 'This control is part of the road in front of you.',
      };
    case 'not_in_scene':
      return {
        label: 'Not in this scene',
        detail:
          'This answer mentions a control that is not on this road. Nothing is added to the scene — you can ask to see a comparison instead.',
      };
    case 'glossary_only':
      return {
        label: 'Word help',
        detail: 'A general meaning. It does not say whether this control is in the current scene.',
      };
  }
}

/**
 * Bottom-sheet explainer for one term. Purely presentational over the ContentBundle: it never reads
 * or writes attempt, camera, seed or traffic state, and the only things it emits are `onClose` and
 * explicit comparison/replay requests for the host to honour or ignore.
 */
export function GlossaryExplainer(props: GlossaryExplainerProps): React.JSX.Element | null {
  const { request, bundle, assets, onClose, onRequest } = props;
  const open = request !== null;
  const binding = request && isTermBinding(request.binding) ? request.binding : null;
  const malformedBinding = request !== null && binding === null;

  // Which term is shown, keyed by the request so a new help request always starts at its own term.
  const requestKey = request
    ? binding
      ? `${binding.role}|${binding.text}|${binding.termId ?? ''}|${request.origin.kind}`
      : `malformed|${request.origin.kind}`
    : '';
  const [nav, setNav] = useState<{
    readonly key: string;
    readonly termId: TermId | null;
    readonly trail: readonly TermId[];
  }>({ key: '', termId: null, trail: [] });
  const termId: TermId | null = nav.key === requestKey ? nav.termId : (binding?.termId ?? null);
  const trail: readonly TermId[] = nav.key === requestKey ? nav.trail : [];
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const snapshot = useRef<Snapshot | null>(null);
  const headingId = useId();
  const descriptionId = useId();

  // Focus/scroll capture on open, restoration on close. The capture happens synchronously so the
  // element that opened help is recorded before focus moves into the sheet.
  useLayoutEffect(() => {
    if (open) {
      if (!snapshot.current) {
        const active = document.activeElement;
        snapshot.current = {
          focus: active instanceof HTMLElement ? active : null,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        };
      }
      closeRef.current?.focus({ preventScroll: true });
      return;
    }
    const saved = snapshot.current;
    snapshot.current = null;
    if (!saved) return;
    if (saved.focus?.isConnected) saved.focus.focus({ preventScroll: true });
    window.scrollTo(saved.scrollX, saved.scrollY);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  if (!request) return null;

  const model: ExplainerModel | null = binding ? explainerModel(bundle, binding, termId) : null;
  const term = model?.lookup?.kind === 'found' ? model.lookup.term : null;

  const trapTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !sheetRef.current) return;
    const items = focusables(sheetRef.current);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const followConfusable = (next: Term) => {
    setNav({
      key: requestKey,
      termId: next.id,
      trail: termId === null ? trail : [...trail, termId],
    });
  };
  const goBack = () => {
    const previous = trail[trail.length - 1];
    if (previous === undefined) return;
    setNav({ key: requestKey, termId: previous, trail: trail.slice(0, -1) });
  };
  const comparison = model?.comparison ?? null;

  const title = model?.title ?? 'Help';
  const meaning = term?.shortDefinition ?? null;

  return (
    <div
      className="ottie-glossary"
      data-testid="glossary-explainer"
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        // Nothing typed inside the sheet may reach the choice list or primary action.
        event.stopPropagation();
        trapTab(event);
      }}
    >
      <div
        className="ottie-glossary__backdrop"
        data-testid="glossary-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className="ottie-glossary__sheet ottie-theme"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={meaning ? descriptionId : undefined}
        data-term-id={termId ?? undefined}
        data-binding-role={binding?.role ?? 'malformed'}
      >
        <header className="ottie-glossary__header">
          {trail.length > 0 ? (
            <button
              type="button"
              className="ottie-btn ottie-btn--quiet ottie-glossary__back"
              onClick={goBack}
              data-testid="glossary-back"
            >
              ‹ Back
            </button>
          ) : null}
          <h2 id={headingId} className="ottie-glossary__title">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="ottie-btn ottie-btn--quiet ottie-glossary__close"
            onClick={onClose}
            aria-label="Close help"
            data-testid="glossary-close"
          >
            ✕
          </button>
        </header>

        <p className="ottie-glossary__dev-note" data-testid="glossary-dev-note">
          Development content — not reviewed, not release material.
        </p>

        {malformedBinding ? (
          <p className="ottie-glossary__problem" role="status" data-testid="glossary-malformed">
            This help link is not set up correctly, so there is nothing to show yet. Your answer has
            not changed.
          </p>
        ) : null}

        {model ? <Presence presence={model.presence} /> : null}

        {model?.lookup === null && binding ? (
          <p className="ottie-glossary__problem" role="status" data-testid="glossary-no-term">
            “{binding.text}” has no glossary entry yet.
          </p>
        ) : null}
        {model?.lookup?.kind === 'missing' ? (
          <p className="ottie-glossary__problem" role="status" data-testid="glossary-missing-term">
            The glossary entry “{model.lookup.termId}” is missing from this content pack.
          </p>
        ) : null}
        {model?.lookup?.kind === 'malformed' ? (
          <p
            className="ottie-glossary__problem"
            role="status"
            data-testid="glossary-malformed-term"
          >
            The glossary entry “{model.lookup.termId}” is incomplete (
            {model.lookup.problems.join(', ')}), so it is not shown.
          </p>
        ) : null}

        {term && model ? (
          <>
            <Artwork term={term} assets={assets} source={artworkSource(props.artwork)} />
            <p
              id={descriptionId}
              className="ottie-glossary__meaning"
              data-testid="glossary-meaning"
            >
              {term.shortDefinition}
            </p>
            {term.explainer.length > 0 ? (
              <div className="ottie-glossary__paragraphs" data-testid="glossary-paragraphs">
                {term.explainer.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            ) : null}

            {comparison || model.comparisonMissing ? (
              <section
                className="ottie-glossary__section"
                aria-labelledby={`${headingId}-compare`}
                data-testid="glossary-comparison"
              >
                <h3 id={`${headingId}-compare`} className="ottie-glossary__subtitle">
                  See the difference
                </h3>
                {comparison ? (
                  <>
                    <p>{comparison.label}</p>
                    {onRequest && binding ? (
                      <div className="ottie-glossary__actions">
                        <button
                          type="button"
                          className="ottie-btn ottie-btn--quiet"
                          data-testid="glossary-compare"
                          onClick={() => {
                            onRequest({ kind: 'compare', comparison, fromBinding: binding });
                          }}
                        >
                          Show comparison
                        </button>
                        {comparison.kind === 'replay_action' ? (
                          <button
                            type="button"
                            className="ottie-btn ottie-btn--quiet"
                            data-testid="glossary-replay"
                            onClick={() => {
                              onRequest({ kind: 'replay', comparison, fromBinding: binding });
                            }}
                          >
                            Replay
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <p
                        className="ottie-glossary__muted"
                        data-testid="glossary-compare-unavailable"
                      >
                        Comparison scenes are not available in this view.
                      </p>
                    )}
                  </>
                ) : (
                  <p
                    className="ottie-glossary__problem"
                    role="status"
                    data-testid="glossary-comparison-missing"
                  >
                    The comparison for this answer is not in this content pack yet.
                  </p>
                )}
              </section>
            ) : null}

            {model.lookup?.kind === 'found' &&
            (model.lookup.confusables.length > 0 ||
              model.lookup.unresolvedConfusables.length > 0) ? (
              <section
                className="ottie-glossary__section"
                aria-labelledby={`${headingId}-confusable`}
                data-testid="glossary-confusables"
              >
                <h3 id={`${headingId}-confusable`} className="ottie-glossary__subtitle">
                  Often confused with
                </h3>
                <ul className="ottie-glossary__chips">
                  {model.lookup.confusables.map((sibling) => (
                    <li key={sibling.id}>
                      <button
                        type="button"
                        className="ottie-btn ottie-btn--quiet ottie-glossary__chip"
                        data-testid={`glossary-confusable-${sibling.id}`}
                        onClick={() => {
                          followConfusable(sibling);
                        }}
                      >
                        {sibling.label}
                      </button>
                    </li>
                  ))}
                  {model.lookup.unresolvedConfusables.map((id) => (
                    <li
                      key={id}
                      className="ottie-glossary__chip ottie-glossary__chip--unresolved"
                      data-testid={`glossary-confusable-missing-${id}`}
                    >
                      {id} (missing)
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {model.sources.length > 0 ? (
              <section
                className="ottie-glossary__section ottie-glossary__sources"
                aria-labelledby={`${headingId}-sources`}
                data-testid="glossary-sources"
              >
                <h3 id={`${headingId}-sources`} className="ottie-glossary__subtitle">
                  Sources
                </h3>
                <ul>
                  {model.sources.map((locator, index) => (
                    <li key={index}>{describeLocator(locator)}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Presence({ presence }: { readonly presence: BindingPresence }): React.JSX.Element {
  const copy = presenceCopy(presence);
  return (
    <p
      className={`ottie-glossary__presence ottie-glossary__presence--${presence.kind}`}
      data-testid="glossary-presence"
      data-presence={presence.kind}
    >
      <strong>{copy.label}.</strong> {copy.detail}
    </p>
  );
}

type ArtworkUrl =
  { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly url: string | null };

interface ArtworkProps {
  readonly term: Term;
  readonly assets: AssetResolver | null;
  readonly source: ArtworkSource;
}

function Artwork({ term, assets, source }: ArtworkProps): React.JSX.Element | null {
  const choice: ArtworkChoice = useMemo(() => chooseArtwork(term, assets), [term, assets]);
  const file = choice.kind === 'file' ? choice.file : null;
  const [loaded, setLoaded] = useState<{
    readonly path: string;
    readonly url: string | null;
  } | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    void source.urlFor(file).then((resolved) => {
      if (!cancelled) setLoaded({ path: file.path, url: resolved });
    });
    return () => {
      cancelled = true;
    };
  }, [file, source]);
  const url: ArtworkUrl =
    file && loaded?.path === file.path ? { kind: 'ready', url: loaded.url } : { kind: 'loading' };

  if (choice.kind === 'none') return null;
  if (choice.kind === 'unresolved') {
    return (
      <p className="ottie-glossary__muted" data-testid="glossary-artwork-unavailable">
        No approved picture is available for this term ({choice.reason}).
      </p>
    );
  }
  return (
    <figure
      className="ottie-glossary__figure"
      data-testid="glossary-artwork"
      data-asset-id={choice.asset.id}
      data-quarantined={String(choice.quarantined)}
    >
      {url.kind === 'loading' ? (
        <div className="ottie-glossary__figure-placeholder" aria-hidden="true" />
      ) : url.url === null ? (
        <p className="ottie-glossary__muted" data-testid="glossary-artwork-unloadable">
          The picture file {choice.file.path} is not available in this build.
        </p>
      ) : (
        <img
          className="ottie-glossary__image"
          src={url.url}
          alt={`${choice.asset.name} — source drawing`}
        />
      )}
      <figcaption className="ottie-glossary__caption">
        {choice.asset.name}
        {choice.quarantined ? (
          <span className="ottie-glossary__quarantine">
            {' '}
            · quarantined source extract, not release artwork
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
