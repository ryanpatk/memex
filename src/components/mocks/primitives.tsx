import { useState, type ReactNode } from 'react';
import { getHostname, type LinkWithTag } from '@memex/core';

/* Shared building blocks for the /mocks page and its rounds (styles: mocks.css). */

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export const Fav = ({ link, size = 'm' }: { link: LinkWithTag; size?: 's' | 'm' | 'l' }) => {
  const [failed, setFailed] = useState(false);
  const host = getHostname(link.url);
  return (
    <span className={`mk-fav mk-fav--${size}`}>
      {link.favicon_url && !failed ? (
        <img src={link.favicon_url} alt="" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{host.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
};

export const Thumb = ({ src, className }: { src?: string; className?: string }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <div className={`mk-thumb ${className ?? ''}`}>
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </div>
  );
};

interface ArtboardProps {
  id: string;
  title: string;
  summary: string;
  pros: string[];
  cons: string[];
  children: ReactNode;
  height?: number;
  /** Set false when the composition is anchored to the bottom edge (a composer), so the canvas fade doesn't cover it. */
  fade?: boolean;
  /** The option the current round recommends; gets a “Recommended” badge. */
  recommended?: boolean;
}

/** Options already picked in earlier rounds; their artboards get a “Chosen” badge. */
const CHOSEN = new Set(['1A', '1C', '2C', '3C', '4A', '5A', '6A', '7C', '9A', '10B', '11D', '12B', '13B', '14B', '15A', '16A']);

export const Artboard = ({ id, title, summary, pros, cons, children, height, fade = true, recommended }: ArtboardProps) => (
  <article
    className={`mk-artboard ${CHOSEN.has(id) ? 'is-chosen' : ''} ${recommended ? 'is-recommended' : ''}`}
    id={`mock-${id}`}
  >
    <header className="mk-artboard-head">
      <span className="mk-artboard-id">
        {id}
        {CHOSEN.has(id) && <span className="mk-chosen">Chosen</span>}
        {recommended && <span className="mk-chosen mk-recommended">Recommended</span>}
      </span>
      <div className="mk-artboard-copy">
        <h3 className="mk-artboard-title">{title}</h3>
        <p className="mk-artboard-summary">{summary}</p>
      </div>
      <dl className="mk-tradeoffs">
        <div>
          <dt>Good for</dt>
          {pros.map((p) => (
            <dd key={p}>{p}</dd>
          ))}
        </div>
        <div>
          <dt>Costs</dt>
          {cons.map((c) => (
            <dd key={c}>{c}</dd>
          ))}
        </div>
      </dl>
    </header>
    <div className={`mk-canvas${fade ? '' : ' is-unfaded'}`} style={height ? { height } : undefined}>
      {children}
    </div>
  </article>
);

export const Section = ({ n, title, question, children }: { n: number; title: string; question: string; children: ReactNode }) => (
  <section className="mk-section" id={`decision-${n}`}>
    <header className="mk-section-head">
      <span className="mk-section-n">{n}</span>
      <div>
        <h2 className="mk-section-title">{title}</h2>
        <p className="mk-section-question">{question}</p>
      </div>
    </header>
    <div className="mk-section-boards">{children}</div>
  </section>
);
