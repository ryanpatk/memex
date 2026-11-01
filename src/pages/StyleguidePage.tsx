import { useCallback, useEffect, useRef, useState } from 'react';
import CanvasColorPicker from '../components/CanvasColorPicker';
import DarkModeToggle from '../components/DarkModeToggle';
import LinkGridCard from '../components/LinkGridCard';
import NoteGridCard from '../components/NoteGridCard';
import LinkPreviewCard from '../components/stream/LinkPreviewCard';
import StreamRow from '../components/stream/StreamRow';
import TaskBand from '../components/stream/TaskBand';
import {
  ActionChip,
  EmptyState,
  FeedbackToast,
  FilterChip,
  FrostedStack,
  InlineCreateForm,
  MarkdownText,
} from '../components/ui';
import type { FeedbackToastPhase } from '../components/ui';
import type { LinkWithTag, NoteWithTags, Tag, TaskWithTags } from '@memex/core';
import { StickyNote } from 'lucide-react';
import Wordmark from '../components/ui/Wordmark';

const COLOR_TOKENS: { token: string; label: string }[] = [
  { token: '--bookmark-canvas-base', label: 'canvas (swatch)' },
  { token: '--color-1', label: 'color-1 (swatch accent)' },
  { token: '--cte-accent-text', label: 'on color-1' },
  { token: '--color-1-ink', label: 'accent text' },
  { token: '--neutral-1', label: 'neutral-1 surface' },
  { token: '--neutral-2', label: 'neutral-2 surface' },
  { token: '--neutral-3', label: 'neutral-3 muted' },
  { token: '--neutral-4', label: 'neutral-4 field edge' },
  { token: '--neutral-7', label: 'neutral-7 text muted' },
  { token: '--neutral-10', label: 'neutral-10 text' },
  { token: '--success', label: 'success' },
  { token: '--warning', label: 'warning' },
  { token: '--error', label: 'error' },
];

const demoTag = (id: string, name: string, color: string): Tag => ({
  id,
  user_id: 'demo',
  name,
  color,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const DEMO_TAGS = [
  demoTag('t1', 'research', '#c26a8a'),
  demoTag('t2', 'reading', '#7a8ac2'),
  demoTag('t3', 'tools', '#6aa28a'),
];

const demoLink = (
  id: string,
  url: string,
  title: string,
  tags: Tag[],
): LinkWithTag => ({
  id,
  project_id: 'demo',
  user_id: 'demo',
  url,
  title,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  order_index: 0,
  tags,
});

const DEMO_PREVIEW_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='420'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#b9d3ea'/><stop offset='1' stop-color='#e9c7d6'/></linearGradient></defs><rect width='640' height='420' fill='url(#g)'/><circle cx='470' cy='130' r='70' fill='#fff' fill-opacity='.55'/></svg>",
)}`;

const DEMO_LINKS: LinkWithTag[] = [
  demoLink(
    'l1',
    'https://en.wikipedia.org/wiki/Memex',
    'Memex — Wikipedia',
    DEMO_TAGS.slice(0, 2),
  ),
  demoLink('l2', 'https://worrydream.com/refs/Bush%20-%20As%20We%20May%20Think.pdf', 'As We May Think', []),
];

const DEMO_PREVIEW_LINK: LinkWithTag = {
  ...demoLink('l3', 'https://www.theatlantic.com/magazine/archive/1945/07/as-we-may-think/303881/', 'As We May Think — The Atlantic', []),
  preview_image_url: DEMO_PREVIEW_IMAGE,
};

const demoTask = (
  id: string,
  title: string,
  isDone: boolean,
  tags: Tag[],
  dueDate?: string,
): TaskWithTags => ({
  id,
  user_id: 'demo',
  title,
  is_done: isDone,
  due_date: dueDate,
  order_index: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  tags,
});

const DEMO_NOTE: NoteWithTags = {
  id: 'note1',
  user_id: 'demo',
  title: 'Reading notes — As We May Think',
  body: '# As We May Think\n\nBush imagines the **memex**: a desk that stores books, records, and communications — *an enlarged intimate supplement to memory*.\n\n- associative trails over indexes\n- `dry photography` for capture\n- links between items, not folders\n\n> Wholly new forms of encyclopedias will appear, ready made with a mesh of associative trails running through them.',
  order_index: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-07-30T09:00:00Z',
  tags: DEMO_TAGS.slice(0, 2),
};

const TOAST_VISIBLE_MS = 3400;

const Section = ({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) => (
  <section className="memex-styleguide-section">
    <header className="memex-styleguide-section-header">
      <h2 className="memex-styleguide-section-title">{title}</h2>
      {note && <p className="memex-styleguide-section-note">{note}</p>}
    </header>
    <FrostedStack className="memex-styleguide-card">{children}</FrostedStack>
  </section>
);

const StyleguidePage = () => {
  const [spaceSelected, setSpaceSelected] = useState(true);
  const [tagSelected, setTagSelected] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; phase: FeedbackToastPhase } | null>(
    null,
  );
  const [demoTasks, setDemoTasks] = useState<TaskWithTags[]>([
    demoTask('task1', 'Review the styleguide page', false, DEMO_TAGS.slice(0, 2), '2026-08-14'),
    demoTask('task2', 'Ship the tasks module', false, []),
    demoTask('task3', 'Extract the omnibar', true, DEMO_TAGS.slice(2)),
  ]);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const flashToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message: 'Applied “research” to 3 items.', phase: 'entering' });
    toastTimerRef.current = setTimeout(() => {
      setToast((current) => (current ? { ...current, phase: 'exiting' } : null));
      toastTimerRef.current = null;
      window.setTimeout(() => {
        setToast((current) => (current?.phase === 'exiting' ? null : current));
      }, 240);
    }, TOAST_VISIBLE_MS);
  }, []);

  useEffect(() => {
    document.title = 'Styleguide · memex';
    return () => {
      document.title = 'memex';
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const noop = useCallback(() => {}, []);

  return (
    <div className="memex-styleguide">
      <div className="memex-styleguide-inner">
        <header className="memex-styleguide-header">
          <div className="bookmark-toolbar-brand-shell">
            <Wordmark className="bookmark-toolbar-brand" />
          </div>
          <p className="memex-styleguide-kicker">styleguide</p>
        </header>

        <Section
          title="Theme"
          note="Everything below re-themes live from the canvas swatch and dark mode — interactive emphasis is the user's color, never a fixed product color."
        >
          <div className="memex-styleguide-theme-row">
            <CanvasColorPicker />
            <DarkModeToggle className="bookmark-account-menu-action" />
          </div>
        </Section>

        <Section title="Color tokens" note="Pastel Sky roles at their current computed values (src/styles/pastel-sky.css).">
          <div className="memex-styleguide-swatch-grid">
            {COLOR_TOKENS.map(({ token, label }) => (
              <div key={token} className="memex-styleguide-swatch">
                <span
                  className="memex-styleguide-swatch-chip"
                  style={{ background: `var(${token})` }}
                />
                <span className="memex-styleguide-swatch-label">{label}</span>
                <code className="memex-styleguide-swatch-token">{token}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography" note="Inter for every role; Pastel Sky size, line height, and tracking steps.">
          <div className="memex-styleguide-type-specimens">
            <p className="memex-styleguide-type-ui">
              <Wordmark className="bookmark-toolbar-brand" /> — wordmark: Nunito 900, −0.05em, Joyful Systems blue, white
              keyline, soft blue drop, split gloss
            </p>
            <p className="memex-styleguide-type-heading">Heading — M, medium</p>
            <p className="memex-styleguide-type-ui">UI text — S, medium (chips, rows, omnibar)</p>
            <p className="memex-styleguide-type-caption">Caption — XS, regular (counts, metadata)</p>
          </div>
        </Section>

        <Section
          title="Filter chips"
          note="Toggle treatment: transparent at rest; on, a chip stands up as a raised tile. Chips swell a little under the pointer. A dashed accent outline marks bulk-assign targets."
        >
          <div className="memex-styleguide-demo-row">
            <FilterChip
              variant="space"
              label="Job search"
              count={12}
              active={spaceSelected}
              onClick={() => setSpaceSelected((v) => !v)}
            />
            <FilterChip variant="space" label="Reading" count={4} onClick={noop} />
            <FilterChip variant="space" label="Bulk target" count={7} bulkTarget onClick={noop} />
            <FilterChip variant="space" label="Disabled" count={0} disabled />
          </div>
          <div className="memex-styleguide-demo-row">
            <FilterChip
              variant="tag"
              label="research"
              count={9}
              active={tagSelected}
              onClick={() => setTagSelected((v) => !v)}
            />
            <FilterChip variant="tag" label="tools" count={3} onClick={noop} />
            <FilterChip variant="tag" label="Bulk target" count={5} bulkTarget onClick={noop} />
            <FilterChip variant="tag" label="Untagged" count={2} onClick={noop} />
          </div>
        </Section>

        <Section
          title="Action chips"
          note="Button treatment: raised material that swells on hover and settles on press. Primary is the one glossy control, color-1 (from the canvas swatch) with a glow in its own colour."
        >
          <div className="memex-styleguide-demo-row">
            <ActionChip variant="primary">Select</ActionChip>
            <ActionChip variant="secondary">Settings</ActionChip>
            <ActionChip variant="accent">Accent</ActionChip>
            <ActionChip variant="secondary" disabled>
              Disabled
            </ActionChip>
          </div>
          <div className="memex-styleguide-demo-row">
            <button type="button" className="bookmark-selection-fab">
              Select (FAB)
            </button>
            <button type="button" className="bookmark-profile-new">
              New space
            </button>
            <button type="button" className="bookmark-tag-new">
              New tag
            </button>
          </div>
        </Section>

        <Section
          title="Inline create form"
          note="Rail-footer pattern for creating spaces and tags in place."
        >
          {showCreateForm ? (
            <InlineCreateForm
              placeholder="Space name"
              onSubmit={() => setShowCreateForm(false)}
              onCancel={() => setShowCreateForm(false)}
            />
          ) : (
            <button
              type="button"
              className="bookmark-profile-new"
              onClick={() => setShowCreateForm(true)}
            >
              New space
            </button>
          )}
        </Section>

        <Section
          title="Stream cards"
          note="Every grid item shares one surface (paper, not a control): neutral-1, lit top edge, hairline edge ring, hue-tinted elevation; hover lifts 2px to M, no scale; selection adds a color-1 ring, the selection tint, and a check. Links with a preview image are image-first (style set in Settings → Link cards); everything else renders through StreamCard."
        >
          <div className="memex-styleguide-cards">
            <LinkPreviewCard link={DEMO_PREVIEW_LINK} onActivate={noop} onImageError={noop} />
            <LinkGridCard link={DEMO_LINKS[0]} onActivate={noop} />
            <NoteGridCard note={DEMO_NOTE} onOpen={noop} onDelete={noop} />
            <LinkPreviewCard
              link={DEMO_PREVIEW_LINK}
              onActivate={noop}
              onImageError={noop}
              selectionMode
              isSelected
            />
            <LinkGridCard link={DEMO_LINKS[1]} onActivate={noop} selectionMode isSelected />
            <NoteGridCard note={DEMO_NOTE} onOpen={noop} selectionMode />
          </div>
        </Section>

        <Section
          title="Task band"
          note="Open tasks as a checklist above the grid, on the same card surface. Done tasks fold away beneath."
        >
          <TaskBand
            openTasks={demoTasks.filter((task) => !task.is_done)}
            doneTasks={demoTasks.filter((task) => task.is_done)}
            onToggleDone={(t) =>
              setDemoTasks((prev) =>
                prev.map((p) => (p.id === t.id ? { ...p, is_done: !p.is_done } : p)),
              )
            }
            onDelete={noop}
            onCreate={noop}
          />
        </Section>

        <Section
          title="List rows"
          note="The reading-list view (?view=list): icon · title / meta · thumbnail · hover actions."
        >
          <div className="memex-list">
            <StreamRow
              leading={<StickyNote aria-hidden="true" />}
              title={DEMO_NOTE.title ?? 'Untitled'}
              meta="Jul 30"
              onActivate={noop}
            />
            <StreamRow
              leading={<StickyNote aria-hidden="true" />}
              title="Selected row"
              meta="Jul 30"
              onActivate={noop}
              selectionMode
              isSelected
            />
          </div>
        </Section>

        <Section
          title="Markdown"
          note="Notes are stored as markdown source; this is the rendered reading view (GFM)."
        >
          <MarkdownText>{DEMO_NOTE.body}</MarkdownText>
        </Section>

        <Section title="Empty state">
          <EmptyState
            title="No links match the current filters"
            subtitle="Adjust search, tags, or space to broaden the results."
          />
        </Section>

        <Section title="Feedback toast" note="Bottom-right, optimistic, non-interactive.">
          <div className="memex-styleguide-demo-row">
            <ActionChip variant="primary" onClick={flashToast}>
              Flash toast
            </ActionChip>
          </div>
        </Section>

        <Section title="Modal" note="Native <dialog> with muted header/footer.">
          <div className="memex-styleguide-demo-row">
            <ActionChip variant="secondary" onClick={() => dialogRef.current?.showModal()}>
              Open modal
            </ActionChip>
          </div>
        </Section>
      </div>

      <dialog ref={dialogRef} className="app-modal" aria-labelledby="styleguide-modal-title">
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h2 id="styleguide-modal-title" className="app-modal-title">
              Modal title
            </h2>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close modal"
          >
            ×
          </button>
        </header>
        <div className="app-modal-body">
          <p className="app-modal-hint">
            Modal body content uses the same tokens as everything else — no separate modal
            styling vocabulary.
          </p>
        </div>
        <footer className="app-modal-footer">
          <div className="app-modal-footer-actions">
            <ActionChip variant="secondary" onClick={() => dialogRef.current?.close()}>
              Cancel
            </ActionChip>
            <ActionChip variant="primary" onClick={() => dialogRef.current?.close()}>
              Done
            </ActionChip>
          </div>
        </footer>
      </dialog>

      {toast !== null && <FeedbackToast message={toast.message} phase={toast.phase} />}
    </div>
  );
};

export default StyleguidePage;
