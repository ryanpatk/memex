import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, GripVertical, MoreHorizontal, Pencil, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import { MC_MOTION, MC_RADIUS, MC_SPACE, MC_SPACE_COLORS, MC_TYPE } from '@memex/core';
import '../styles/cards/kitpage.css';
import { JOURNAL_PATH } from '../constants/modules';
import { useDarkMode } from '../hooks/useDarkMode';
import { setCardsFont, useCardsFont } from '../utils/cardsFont';
import MemoryCard, { AgentBadge } from '../components/cards/MemoryCard';
import LabelStrip, { type CardLabel } from '../components/cards/LabelStrip';
import SpacePill from '../components/cards/SpacePill';
import { EmptySlot, KeyCap, Swatch, Switch, ToggleGroup } from '../components/cards/Controls';
import Wordmark from '../components/ui/Wordmark';

/*
 * The Memory Cards kit (/styleguide): every component from the design
 * sheets s01–s14 (design/memory-cards/png/) plus s15 (pinned sites) and s16
 * (the sticky bar, drop tray and Edit spaces), built from the real kit
 * classes and components, in every state, in light, dark and Plex. All
 * content is made up. The classic catalog that lived here is in the tag
 * `classic-design-final`.
 * Hover, press and focus are frozen with `.kd-*` classes (kitpage.css) so
 * they sit side by side; everything here also responds to the real pointer.
 */

const C = Object.fromEntries(MC_SPACE_COLORS.map((c) => [c.key, c.value])) as Record<string, string>;
const SPACE_NAMES = ['Kitchen reno', 'Kyoto trip', 'Reading', 'Studio', 'Garden', 'Recipes', 'Bikes', 'Music'];
const label = (name: string | null, color: string | null, extra = 0): CardLabel => ({ name, color, extra });
const KITCHEN = label('Kitchen reno', C.coral);
const KYOTO = label('Kyoto trip', C.cyan);
const READING = label('Reading', C.gold);
const UNFILED = label(null, null);

const STATES = ['Default', 'Hover', 'Pressed', 'Focus', 'Loading', 'Error', 'Disabled'] as const;
type State = (typeof STATES)[number];
const stateClass = (state: State) =>
  state === 'Hover' ? ' kd-hov' : state === 'Pressed' ? ' kd-prs' : state === 'Focus' ? ' kd-foc' : state === 'Error' ? ' is-error' : '';
const stateProps = (state: State) => ({
  'aria-busy': state === 'Loading' ? true : undefined,
  disabled: state === 'Disabled' ? true : undefined,
});

const noop = () => {};

const Art = ({ g, h = 180 }: { g: number; h?: number }) => (
  <span className={`mc-kit-art mc-kit-g${g}`} style={{ height: h }} aria-hidden="true" />
);

const Section = ({ id, title, lede, children }: { id: string; title: string; lede: string; children: ReactNode }) => (
  <section className="mc-kit-section" id={id} aria-labelledby={`${id}-h`}>
    <header>
      <h2 className="mc-h1" id={`${id}-h`}>
        {title}
      </h2>
      <p className="mc-body">{lede}</p>
    </header>
    {children}
  </section>
);

/** Made-up sites for the Pinned sites section (s15). */
const SG_PINS = ['Calendar', 'Calm Technology', 'Ink & Switch', 'japan-guide', 'Mail', 'Weather', 'Old House'];

const Cell = ({ children, name }: { children: ReactNode; name: string }) => (
  <div className="mc-kit-cell">
    {children}
    <span className="mc-lab">{name}</span>
  </div>
);

const SECTIONS: [string, string][] = [
  ['s01', 'Tokens'],
  ['s02', 'Buttons'],
  ['s03', 'Space pills'],
  ['s04', 'Field'],
  ['s05', 'Cards'],
  ['s06', 'Card states'],
  ['s07', 'Menus and sheets'],
  ['s08', 'Toasts and empty'],
  ['s09', 'Rows'],
  ['s10', 'Inbox cards'],
  ['s11', 'Phone nav'],
  ['s12', 'Controls'],
  ['s13', 'Themes'],
  ['s14', 'Card write'],
  ['s15', 'Pinned sites'],
  ['s16', 'Spaces row'],
];

const StyleguidePage = () => {
  const { isDark, toggleDarkMode } = useDarkMode();
  const font = useCardsFont();
  const [demoSwitch, setDemoSwitch] = useState(true);
  const [demoTg, setDemoTg] = useState<'a' | 'b'>('a');
  const [demoSwatch, setDemoSwatch] = useState('green');
  const [demoTask, setDemoTask] = useState(false);

  useEffect(() => {
    document.title = 'Memory Cards kit · memex';
  }, []);

  return (
    <main className="mc-kit">
      <div className="mc-kit-top">
        <div>
          <Wordmark className="mc-auth-wm" />
          <h1 className="mc-hero">
            Memory Cards kit<sup>{SECTIONS.length}</sup>
          </h1>
        </div>
        <div className="mc-kit-switches">
          <Switch checked={isDark} onChange={toggleDarkMode} label="Dark mode" />
          <span className="mc-lab">Dark</span>
          <ToggleGroup
            label="Heading font"
            value={font}
            options={[
              { value: 'rounded', label: 'Rounded' },
              { value: 'plex', label: 'Plex' },
            ]}
            onChange={setCardsFont}
          />
          <Link to={JOURNAL_PATH} className="mc-btn is-small">
            Back to memex
          </Link>
        </div>
      </div>
      <nav aria-label="Sheets">
        <ul className="mc-kit-nav">
          {SECTIONS.map(([id, name]) => (
            <li key={id}>
              <a href={`#${id}`} className="mc-chip">
                <em>{id}</em>
                <span>{name}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* s01 */}
      <Section id="s01" title="Tokens" lede="One scale for web and phone (@memex/core MC_* mirrors cards/tokens.css). The font is one switch: Nunito + Inter by default, IBM Plex in Settings → Font.">
        <div className="mc-kit-grid" style={{ gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 64 }}>
          <div>
            <h3 className="mc-sec mc-kit-sec" style={{ marginTop: 0 }}>
              Type: hero is {(MC_TYPE.hero / MC_TYPE.body).toFixed(1)}× body
            </h3>
            <p className="mc-hero">
              Everything<sup>248</sup>
            </p>
            <p className="mc-lab" style={{ margin: '4px 0 12px' }}>
              hero {MC_TYPE.hero} (phone {MC_TYPE.heroPhone}), count as a superscript
            </p>
            <p className="mc-h1">
              Kitchen reno <span className="mc-lab">h1 {MC_TYPE.h1}</span>
            </p>
            <p className="mc-h2" style={{ marginTop: 12 }}>
              Save something <span className="mc-lab">h2 {MC_TYPE.h2}</span>
            </p>
            <p className="mc-h3" style={{ marginTop: 12 }}>
              Card title, every card <span className="mc-lab">h3 {MC_TYPE.h3}</span>
            </p>
            <p className="mc-body" style={{ marginTop: 12 }}>
              Body copy sits at {MC_TYPE.body}. <span className="mc-lab">body</span>
            </p>
            <p className="mc-lab" style={{ marginTop: 12 }}>
              Labels, meta, captions: the floor is {MC_TYPE.label}
            </p>
            <h3 className="mc-sec mc-kit-sec">Label strip and space colours (ink on every fill)</h3>
            <div className="mc-kit-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
              {MC_SPACE_COLORS.map((color, index) => (
                <div key={color.key} className="mc-kit-lbswatch">
                  <LabelStrip label={label(SPACE_NAMES[index], color.value)} />
                </div>
              ))}
            </div>
            <h3 className="mc-sec mc-kit-sec">Font switch</h3>
            <div className="mc-kit-row" style={{ gap: 48, alignItems: 'flex-end' }}>
              <div style={{ '--mc-font-display': "'Nunito', ui-rounded, sans-serif", '--mc-font-ui': "'Inter Variable', Inter, sans-serif" } as CSSProperties}>
                <p className="mc-h2" style={{ fontWeight: 900 }}>
                  Memory card
                </p>
                <p className="mc-lab">Nunito 900 + Inter</p>
              </div>
              <div className="mc-kit-plex">
                <p className="mc-h2">Memory card</p>
                <p className="mc-lab">IBM Plex Sans 700</p>
              </div>
            </div>
          </div>
          <div>
            <h3 className="mc-sec mc-kit-sec" style={{ marginTop: 0 }}>
              Spacing
            </h3>
            <div className="mc-kit-row" style={{ alignItems: 'flex-end', gap: 12 }}>
              {MC_SPACE.map((n) => (
                <Cell key={n} name={String(n)}>
                  <span style={{ width: n, height: n, background: 'var(--mc-pri)', borderRadius: 4, display: 'block' }} />
                </Cell>
              ))}
            </div>
            <h3 className="mc-sec mc-kit-sec">Radii (picture 16 sits concentric in card 28 at a 12 inset)</h3>
            <div className="mc-kit-row">
              {(
                [
                  [MC_RADIUS.chip, 'chip'],
                  [MC_RADIUS.picture, 'picture'],
                  [MC_RADIUS.card, 'card'],
                  [MC_RADIUS.sheet, 'sheet'],
                  [MC_RADIUS.pill, 'pill'],
                ] as const
              ).map(([r, n]) => (
                <Cell key={n} name={`${r === 999 ? 'pill' : r} ${n === 'pill' ? '' : n}`}>
                  <span style={{ width: 72, height: 72, borderRadius: Math.min(r, 36), background: 'var(--mc-paper)', boxShadow: 'var(--mc-sh1)', display: 'block' }} />
                </Cell>
              ))}
            </div>
            <h3 className="mc-sec mc-kit-sec">System colours</h3>
            <div className="mc-kit-row">
              {[
                ['--mc-pri', 'primary'],
                ['--mc-ok', 'done'],
                ['--mc-err', 'error'],
                ['--mc-orange', 'offline'],
                ['--mc-agent', 'agent'],
                ['--mc-ink', 'ink'],
                ['--mc-mut', 'muted'],
                ['--mc-well', 'well'],
              ].map(([v, n]) => (
                <Cell key={n} name={n}>
                  <span style={{ width: 56, height: 56, borderRadius: 18, background: `var(${v})`, boxShadow: 'var(--mc-sh1)', display: 'block' }} />
                </Cell>
              ))}
            </div>
            <h3 className="mc-sec mc-kit-sec">Targets</h3>
            <div className="mc-kit-row" style={{ alignItems: 'flex-end' }}>
              <Cell name="hit 44 (never smaller)">
                <span className="mc-rb is-small" aria-hidden="true">
                  <X />
                </span>
              </Cell>
              <Cell name="small 48">
                <span className="mc-btn is-small" aria-hidden="true">
                  Small
                </span>
              </Cell>
              <Cell name="control 60">
                <span className="mc-btn is-primary" aria-hidden="true">
                  Control
                </span>
              </Cell>
            </div>
            <h3 className="mc-sec mc-kit-sec">Motion</h3>
            <p className="mc-body">
              press {MC_MOTION.press}ms · base {MC_MOTION.base}ms · card write {MC_MOTION.write}ms · one easing <code translate="no">{MC_MOTION.ease}</code>. Reduced motion
              drops every move to a fade.
            </p>
          </div>
        </div>
      </Section>

      {/* s02 */}
      <Section id="s02" title="Buttons" lede="Four kinds, two sizes, seven states. Primary is molded: a darker lip at the bottom that flattens when pressed. Loading keeps the label beside a spinner.">
        {(
          [
            ['is-primary', 'Save'],
            ['', 'Move'],
            ['is-danger', 'Delete'],
            ['is-quiet', 'Not now'],
          ] as const
        ).map(([kind, text]) => (
          <div key={kind || 'secondary'} className="mc-kit-cols">
            {STATES.map((state) => (
              <Cell key={state} name={state}>
                <button type="button" className={`mc-btn ${kind}${stateClass(state)}`} {...stateProps(state)}>
                  {text}
                </button>
              </Cell>
            ))}
          </div>
        ))}
        <div className="mc-kit-cols">
          {STATES.map((state) => (
            <Cell key={state} name={`Small · ${state}`}>
              <button type="button" className={`mc-btn is-small is-primary${stateClass(state)}`} {...stateProps(state)}>
                Save
              </button>
            </Cell>
          ))}
        </div>
        <h3 className="mc-sec mc-kit-sec">Round icon buttons (56, small 44) and the count badge</h3>
        <div className="mc-kit-cols">
          {STATES.map((state) => (
            <Cell key={state} name={state}>
              <span className="mc-kit-row" style={{ gap: 12 }}>
                <button type="button" className={`mc-rb${stateClass(state)}`} aria-label="More" {...stateProps(state)}>
                  <MoreHorizontal aria-hidden="true" />
                </button>
                <button type="button" className={`mc-rb is-small${stateClass(state)}`} aria-label="Close" {...stateProps(state)}>
                  <X aria-hidden="true" />
                </button>
              </span>
            </Cell>
          ))}
        </div>
        <div className="mc-kit-row">
          <span className="mc-btn mc-inbox-btn" style={{ position: 'relative' }}>
            Inbox
            <span className="mc-badge">5</span>
          </span>
          <button type="button" className="mc-plus" aria-label="Save something">
            <Plus aria-hidden="true" />
          </button>
          <button type="button" className="mc-rb is-primary" aria-label="Add">
            <Plus aria-hidden="true" />
          </button>
          <button type="button" className="mc-btn is-primary is-wide" style={{ maxWidth: 420 }}>
            Full width
          </button>
        </div>
      </Section>

      {/* s03 */}
      <Section id="s03" title="Space pills" lede="A space is a coloured cartridge. Pills filter, file and take drops. The chosen one fills with its colour; New space is an empty slot.">
        <div className="mc-kit-cols">
          {STATES.map((state) => (
            <Cell key={state} name={state}>
              <span className={`mc-pill${stateClass(state)}${state === 'Loading' ? ' is-loading' : ''}`} style={{ '--c': C.coral } as CSSProperties} aria-disabled={state === 'Disabled' || undefined} >
                <span className="mc-pill-dot" />
                <span className="mc-pill-name">Kitchen reno</span>
              </span>
            </Cell>
          ))}
        </div>
        <div className="mc-kit-row" style={{ gap: 24 }}>
          <Cell name="All (on)">
            <SpacePill name="All" plain on onClick={noop} />
          </Cell>
          <Cell name="All (off)">
            <SpacePill name="All" plain onClick={noop} />
          </Cell>
          <Cell name="Selected">
            <SpacePill name="Kitchen reno" color={C.coral} selected onClick={noop} />
          </Cell>
          <Cell name="Drop target">
            <SpacePill name="Kyoto trip" color={C.cyan} target="over" onClick={noop} />
          </Cell>
          <Cell name="Add target">
            <SpacePill name="Reading" color={C.gold} target="idle" onClick={noop} />
          </Cell>
          <Cell name="Just added">
            <SpacePill name="Studio" color={C.blue} target="added" onClick={noop} />
          </Cell>
          <Cell name="Already in">
            <SpacePill name="Garden" color={C.green} target="all-in" onClick={noop} />
          </Cell>
          <Cell name="New space slot">
            <button type="button" className="mc-pill is-slot" aria-label="New space">
              <Plus aria-hidden="true" />
            </button>
          </Cell>
          <Cell name="Suggestion">
            <span className="mc-pill is-suggest" style={{ '--c': C.cyan } as CSSProperties}>
              <span className="mc-pill-dot" />
              File in Kyoto trip?
            </span>
          </Cell>
          <Cell name="Small 48 · xs 44">
            <span className="mc-kit-row" style={{ gap: 8 }}>
              <SpacePill name="Reading" color={C.gold} size="small" onClick={noop} />
              <SpacePill name="Bikes" color={C.orange} size="xs" onClick={noop} />
            </span>
          </Cell>
        </div>
      </Section>

      {/* s04 */}
      <Section id="s04" title="Save and search field" lede="One field. Typing searches as you go; Enter saves what you typed. A lone link saves a link card, [] a task, ⌘↵ a note, @ files it.">
        <div className="mc-kit-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
          {(
            [
              ['Default', '', ''],
              ['Hover', 'kd-hov', ''],
              ['Typing', 'kd-foc', 'lime plaster'],
              ['Link', 'kd-foc', 'https://example-design.com/lime-plaster'],
              ['Task', 'kd-foc', '[] Call the electrician @Kitchen reno'],
              ['Error', 'is-error', 'https://exa mple'],
              ['Disabled (signed out)', 'is-disabled', ''],
              ['Flat (in a sheet)', 'is-flat', ''],
            ] as const
          ).map(([name, cls, value]) => (
            <Cell key={name} name={name}>
              <div className={`mc-field ${cls}`} style={{ width: '100%' }}>
                <span className="mc-field-glyph" aria-hidden="true">
                  <Search />
                </span>
                <input readOnly aria-label={name} value={value} placeholder="Search or save a link, a thought…" disabled={cls === 'is-disabled'} />
                {name === 'Link' ? <span className="mc-kit-spin" aria-label="Loading preview" /> : <KeyCap>/</KeyCap>}
                <button type="button" className="mc-plus" aria-label="Save" disabled={cls === 'is-disabled'}>
                  <Plus aria-hidden="true" />
                </button>
              </div>
            </Cell>
          ))}
        </div>
        <h3 className="mc-sec mc-kit-sec">@ space picker and key caps</h3>
        <div className="mc-kit-row" style={{ alignItems: 'flex-start', gap: 40 }}>
          <div className="mc-menu mc-kit-static-menu" role="presentation">
            <div className="mc-mhd">File in…</div>
            {SPACE_NAMES.slice(0, 4).map((name, index) => (
              <div key={name} className={`mc-mi${index === 0 ? ' kd-hov' : ''}`}>
                <span className="mc-mi-icon">
                  <span className="mc-mi-dot" style={{ '--c': Object.values(C)[index] } as CSSProperties} />
                </span>
                <span>{name}</span>
                {index === 0 && <small>↵</small>}
              </div>
            ))}
          </div>
          <div className="mc-kit-row">
            <KeyCap>⌘K</KeyCap>
            <KeyCap>/</KeyCap>
            <KeyCap>Esc</KeyCap>
            <KeyCap big>⌘↵</KeyCap>
            <KeyCap big>N</KeyCap>
            <KeyCap big>?</KeyCap>
          </div>
        </div>
      </Section>

      {/* s05 */}
      <Section id="s05" title="Memory cards" lede="One body: a 28px card, a 16px inset picture, a 26px title and a label strip that names the space. Text-only cards wear their space's colour.">
        <div className="mc-kit-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          <Cell name="Link with picture">
            <MemoryCard kind="picture" title="Japanese joinery holds a house together without nails" label={READING} meta="youtube.com" top={<Art g={4} h={150} />} onActivate={noop} />
          </Cell>
          <Cell name="Picture save">
            <MemoryCard kind="picture" title="Warm oak shelving over a zellige backsplash" label={KITCHEN} meta="pinterest" top={<Art g={1} h={190} />} onActivate={noop} />
          </Cell>
          <Cell name="Link without picture">
            <MemoryCard
              kind="link"
              title="Calm Technology: tools that respect attention"
              label={READING}
              meta="calmtech.com"
              top={
                <span className="mc-card-fav" aria-hidden="true">
                  C
                </span>
              }
              onActivate={noop}
            />
          </Cell>
          <Cell name="Not in a space yet">
            <MemoryCard kind="picture" title="Reading lamp with a linen shade" label={UNFILED} meta="pinterest" top={<Art g={6} h={130} />} onActivate={noop} />
          </Cell>
          <Cell name="Note: tinted">
            <MemoryCard kind="note" title="Lime plaster, not paint, for the hallway. Ask about curing time." label={KITCHEN} meta="note" onActivate={noop} />
          </Cell>
          <Cell name="Jot: full colour">
            <MemoryCard kind="jot" title="Brass pulls, not black." label={KITCHEN} meta="8:14 AM" onActivate={noop} />
          </Cell>
          <Cell name="Task">
            <MemoryCard
              kind="task"
              title="Order three tile samples"
              label={KITCHEN}
              meta="task"
              done={demoTask}
              leading={
                <button type="button" role="checkbox" aria-checked={demoTask} className="mc-chk is-large" aria-label="Order three tile samples" onClick={() => setDemoTask((v) => !v)}>
                  <Check aria-hidden="true" />
                </button>
              }
              below={<span className="mc-due">Nov 18</span>}
            />
          </Cell>
          <Cell name="In two spaces">
            <MemoryCard kind="picture" title="How to plan a reading year" label={label('Reading', C.gold, 1)} meta="example-books.com" top={<Art g={5} h={110} />} onActivate={noop} />
          </Cell>
          <Cell name="Unfiled note">
            <MemoryCard kind="note" title="Ideas for the spring garden: peas, sweet peas, more peas." label={UNFILED} meta="note" onActivate={noop} />
          </Cell>
          <Cell name="Unfiled jot">
            <MemoryCard kind="jot" title="Call Dana back about the design exercise." label={UNFILED} meta="9:02 AM" onActivate={noop} />
          </Cell>
        </div>
      </Section>

      {/* s06 */}
      <Section id="s06" title="Card states" lede="Hover lifts 4px. Press settles. Selected rings in blue with a tick. Saving writes the card (s14).">
        <div className="mc-kit-grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))' }}>
          {(
            [
              ['Default', ''],
              ['Hover', 'kd-hov'],
              ['Pressed', 'kd-prs'],
              ['Focus', 'kd-foc'],
              ['Dragging', 'kd-drag'],
            ] as const
          ).map(([name, cls]) => (
            <Cell key={name} name={name}>
              <div className={`mc-kit-wrap-${cls || 'none'}`} style={{ width: '100%' }}>
                <StateCard cls={cls} />
              </div>
            </Cell>
          ))}
          <Cell name="Loading">
            <article className="mc-card is-picture is-loading" aria-busy="true" aria-label="Loading card">
              <span className="mc-card-pic" style={{ height: 150 }} />
              <div className="mc-card-body">
                <span className="mc-sk" style={{ height: 26, width: '85%' }} />
                <span className="mc-sk" style={{ height: 26, width: '55%', marginTop: 8 }} />
              </div>
              <div className="mc-lb" />
            </article>
          </Cell>
          <Cell name="Picture failed">
            <article className="mc-card is-picture kd-err" style={{ '--c': C.cyan } as CSSProperties}>
              <span style={{ position: 'relative', display: 'block' }}>
                <Art g={2} h={150} />
                <span className="mc-kit-errbadge">Picture didn’t load</span>
              </span>
              <div className="mc-card-body">
                <p className="mc-card-title">Arashiyama bamboo grove at 7am</p>
              </div>
              <LabelStrip label={KYOTO} meta="kyoto.travel" />
            </article>
          </Cell>
          <Cell name="Selected">
            <MemoryCard kind="picture" title="Arashiyama bamboo grove at 7am" label={KYOTO} meta="kyoto.travel" top={<Art g={3} h={150} />} selectionMode selected onActivate={noop} />
          </Cell>
          <Cell name="Selecting, not picked">
            <MemoryCard kind="picture" title="Arashiyama bamboo grove at 7am" label={KYOTO} meta="kyoto.travel" top={<Art g={3} h={150} />} selectionMode onActivate={noop} />
          </Cell>
          <Cell name="Just saved">
            <div className="mc-card is-note kd-write" style={{ '--c': C.coral } as CSSProperties}>
              <div className="mc-card-body">
                <p className="mc-card-title">Lime plaster for hallways</p>
              </div>
              <LabelStrip label={KITCHEN} />
            </div>
          </Cell>
          <Cell name="Pinned">
            <MemoryCard kind="picture" title="Rail timetable" label={KYOTO} meta="jr.example" pinned top={<Art g={2} h={120} />} onActivate={noop} />
          </Cell>
          <Cell name="Written by an agent">
            <MemoryCard kind="note" title="Ryokan shortlist: two near the river, one in the hills" label={KYOTO} meta="note" agent="Research agent" onActivate={noop} />
          </Cell>
        </div>
      </Section>

      {/* s07 */}
      <Section id="s07" title="••• menu and sheets" lede="Everything that isn't on screen lives in one ••• menu. Sheets hold one job each; the round ✕ hangs off the corner.">
        <div className="mc-kit-grid" style={{ gridTemplateColumns: '380px minmax(0,1fr) minmax(0,1fr)', gap: 40 }}>
          <div className="mc-menu mc-kit-static-menu" role="presentation">
            <div className="mc-mhd">This card</div>
            <div className="mc-mi">
              <span className="mc-mi-icon">
                <Pencil />
              </span>
              <span>Edit</span>
              <small>E</small>
            </div>
            <div className="mc-mi kd-hov">
              <span className="mc-mi-icon">
                <Plus />
              </span>
              <span>Move to… (hover)</span>
            </div>
            <div className="mc-mi kd-prs">
              <span className="mc-mi-icon">
                <Check />
              </span>
              <span>Pin to top (pressed)</span>
            </div>
            <div className="mc-mi kd-foc">
              <span className="mc-mi-icon">
                <Search />
              </span>
              <span>Refresh preview (focus)</span>
            </div>
            <div className="mc-mi">
              <span className="mc-mi-icon">
                <span className="mc-kit-spin" />
              </span>
              <span>Refreshing…</span>
            </div>
            <div className="mc-mi" aria-checked="true" role="menuitemcheckbox">
              <span className="mc-mi-icon">
                <Check />
              </span>
              <span>Cards</span>
              <small>✓</small>
            </div>
            <button type="button" className="mc-mi" disabled>
              <span className="mc-mi-icon">#</span>
              <span>Show tags (off)</span>
            </button>
            <hr className="mc-msep" />
            <div className="mc-mi is-danger">
              <span className="mc-mi-icon">
                <Trash2 />
              </span>
              <span>Delete</span>
              <small>⌫</small>
            </div>
          </div>
          <div className="mc-kit-static-sheet">
            <button type="button" className="mc-rb mc-sheet-x" aria-label="Close (demo)">
              <X aria-hidden="true" />
            </button>
            <h3 className="mc-h2">Delete this space?</h3>
            <p className="mc-body" style={{ color: 'var(--mc-mut)', marginTop: 12 }}>
              Its 38 cards stay in Everything. You can undo for 6 seconds.
            </p>
            <div className="mc-sheet-foot">
              <span />
              <div className="mc-sheet-foot-actions">
                <button type="button" className="mc-btn is-quiet">
                  Cancel
                </button>
                <button type="button" className="mc-btn is-danger">
                  Delete space
                </button>
              </div>
            </div>
          </div>
          <div className="mc-kit-static-sheet">
            <h3 className="mc-h2">Rename space</h3>
            <label className="mc-flab" htmlFor="kit-name">
              Name
            </label>
            <input id="kit-name" className="mc-inp kd-foc" defaultValue="Kitchen reno" />
            <label className="mc-flab" htmlFor="kit-name-2">
              Name (error)
            </label>
            <input id="kit-name-2" className="mc-inp" aria-invalid="true" defaultValue="" placeholder="Garden…" />
            <p className="mc-ferr">Give the space a name.</p>
            <div className="mc-sheet-foot">
              <span className="mc-keyhint">
                <KeyCap>↵</KeyCap> save
              </span>
              <button type="button" className="mc-btn is-primary" aria-busy="true">
                Saving
              </button>
            </div>
          </div>
        </div>
      </Section>

      {/* s08 */}
      <Section id="s08" title="Toasts, empty, loading and error" lede="Every change toasts, most with Undo. An empty state is an empty card slot and one action.">
        <div className="mc-kit-row" style={{ gap: 16, marginBottom: 40 }}>
          <div className="mc-toast" role="presentation">
            <span className="mc-toast-mark">
              <Check />
            </span>
            <span>Saved to Kitchen reno</span>
          </div>
          <div className="mc-toast" role="presentation">
            <span className="mc-toast-mark" style={{ '--c': C.coral } as CSSProperties}>
              <Check />
            </span>
            <span>Deleted 3 cards</span>
            <button type="button">Undo</button>
          </div>
          <div className="mc-toast is-error" role="presentation">
            <span className="mc-toast-mark">!</span>
            <span>Couldn’t save. Try again</span>
            <button type="button">Retry</button>
          </div>
          <div className="mc-toast is-offline" role="presentation">
            <span className="mc-toast-mark">!</span>
            <span>Offline: saves wait here</span>
          </div>
        </div>
        <div className="mc-kit-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          <EmptySlot color="var(--mc-pri)" glyph={<Plus />} title="Your first card goes here" body="Paste a link or write a thought." action={<button type="button" className="mc-btn is-primary">Save something</button>} />
          <EmptySlot glyph={<Search />} title="Nothing matches “zellige”" body="Try fewer words." action={<button type="button" className="mc-btn is-quiet">Clear</button>} />
          <EmptySlot color="var(--mc-err)" glyph={<span>!</span>} title="Couldn’t load your cards" body="Check your connection." action={<button type="button" className="mc-btn is-primary">Retry</button>} />
          <EmptySlot color="var(--mc-green)" glyph={<Check />} title="All filed" body="Nothing waiting in the Inbox." />
        </div>
      </Section>

      {/* s09 */}
      <Section id="s09" title="Rows" lede="Tasks, list rows, table rows and Journal bubbles. Rows lift on hover like cards, but never scale.">
        <div className="mc-kit-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(
              [
                ['Order three tile samples', '', 'Nov 18', ''],
                ['Call the electrician (hover)', 'kd-hov', 'Today', 'is-today'],
                ['Confirm the plasterer (focus)', 'kd-foc', '', ''],
                ['Renew passport photos', '', '2 days late', 'is-late'],
                ['Book the ryokan (selected)', 'is-selected', 'Fri', ''],
                ['Buy a rail pass', 'is-done', '', ''],
              ] as const
            ).map(([title, cls, due, dueCls]) => (
              <div key={title} className={`mc-trow ${cls}`}>
                <button type="button" role="checkbox" aria-checked={cls === 'is-done'} className="mc-chk" aria-label={title}>
                  <Check aria-hidden="true" />
                </button>
                <span className="mc-trow-title">{title}</span>
                {due && <span className={`mc-due ${dueCls}`}>{due}</span>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mc-kit-lrow">
              <Art g={4} />
              <span className="mc-kit-lrow-title">Japanese joinery holds a house together</span>
              <LabelStrip label={READING} />
            </div>
            <div className="mc-kit-tbl">
              <div className="mc-kit-tr is-head">
                <span>Title</span>
                <span>Space</span>
                <span>Source</span>
                <span>Saved</span>
              </div>
              <div className="mc-kit-tr">
                <span className="mc-kit-t1">
                  <Art g={1} />
                  Warm oak shelving
                </span>
                <LabelStrip label={KITCHEN} />
                <span>pinterest</span>
                <span>Mon</span>
              </div>
              <div className="mc-kit-tr">
                <span className="mc-kit-t1">
                  <Art g={3} />
                  Bamboo grove
                </span>
                <LabelStrip label={KYOTO} />
                <span>kyoto.travel</span>
                <span>Nov 9</span>
              </div>
            </div>
            <div>
              <div className="mc-kit-jrow">
                <p className="mc-kit-bub">
                  Sage green island, warm oak shelves.<small>8:02 AM</small>
                </p>
                <button type="button" className="mc-strip" style={{ '--c': C.coral } as CSSProperties}>
                  <b />
                  Kitchen reno
                </button>
              </div>
              <div className="mc-kit-jrow">
                <p className="mc-kit-bub">
                  Ask about the onsen ryokan near the river.<small>9:10 AM</small>
                </p>
                <button type="button" className="mc-strip is-suggest" style={{ '--c': C.cyan } as CSSProperties}>
                  <b />
                  File in Kyoto trip?
                </button>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* s10 */}
      <Section id="s10" title="Inbox cards" lede="Inbox cards are memory cards too. A proposal shows its change as a diff; a filing suggestion is one coloured pill.">
        <div className="mc-kit-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 32 }}>
          <article className="mc-card is-plain" style={{ cursor: 'default', '--c': C.cyan } as CSSProperties}>
            <div className="mc-card-body" style={{ padding: '20px 16px 24px' }}>
              <p className="mc-kit-row" style={{ gap: 12 }}>
                <AgentBadge name="Research agent" />
                <span className="mc-lab">wants to edit · 10 min</span>
              </p>
              <h3 className="mc-h3" style={{ margin: '16px 0' }}>
                Ryokan shortlist
              </h3>
              <p className="mc-diff">
                Two near the river, one in the hills <ins>with an onsen</ins>.
              </p>
              <p className="mc-lab" style={{ margin: '16px 0 24px' }}>
                Because you saved two onsen links this week.
              </p>
              <div className="mc-kit-row">
                <button type="button" className="mc-btn is-primary">
                  Approve
                </button>
                <button type="button" className="mc-btn is-quiet">
                  Reject
                </button>
              </div>
            </div>
            <LabelStrip label={KYOTO} meta="note" />
          </article>
          <article className="mc-card is-plain" style={{ cursor: 'default' }}>
            <div className="mc-card-body" style={{ padding: '20px 16px 24px' }}>
              <div className="mc-kit-row" style={{ flexWrap: 'nowrap', gap: 24 }}>
                <span style={{ width: 112, flex: 'none' }}>
                  <Art g={3} h={88} />
                </span>
                <div>
                  <h3 className="mc-h3">Moss garden at Saiho-ji</h3>
                  <p className="mc-lab">Mentions “Kyoto”</p>
                </div>
              </div>
              <div className="mc-kit-row" style={{ marginTop: 20 }}>
                <SpacePill name="File in Kyoto trip" color={C.cyan} selected onClick={noop} />
                <button type="button" className="mc-btn is-quiet">
                  Not now
                </button>
              </div>
            </div>
            <LabelStrip label={UNFILED} meta="pinterest" />
          </article>
        </div>
      </Section>

      {/* s11 */}
      <Section id="s11" title="Phone nav" lede="Journal, Cards, a centre +, Spaces, Inbox. The active tab fills its icon. (The iPhone app draws its own; this is the reference.)">
        <div className="mc-kit-phone" aria-hidden="true">
          <div className="mc-kit-tabs">
            <span className="mc-kit-tab">
              <i />
              Journal
            </span>
            <span className="mc-kit-tab is-on">
              <i />
              Cards
            </span>
            <span className="mc-plus">
              <Plus />
            </span>
            <span className="mc-kit-tab">
              <i />
              Spaces
            </span>
            <span className="mc-kit-tab">
              <i />
              Inbox
              <span className="mc-badge">5</span>
            </span>
          </div>
        </div>
      </Section>

      {/* s12 */}
      <Section id="s12" title="Controls: every state" lede="Switches, checkboxes, swatches, toggle groups, inputs and menu items. “n/a” marks a state the control can't be in. The top row of each works.">
        <div className="mc-kit-table" role="table" aria-label="Controls in every state">
          <span />
          {['Default', 'Hover', 'Pressed', 'Focus', 'Loading', 'Error', 'Disabled', 'On / selected'].map((s) => (
            <span key={s} className="mc-kit-lbl">
              {s}
            </span>
          ))}

          <span className="mc-kit-rowhead">Switch</span>
          <Switch checked={false} onChange={noop} label="Default" />
          <button type="button" role="switch" aria-checked="false" className="mc-switch kd-hov" aria-label="Hover" />
          <button type="button" role="switch" aria-checked="false" className="mc-switch kd-prs" aria-label="Pressed" />
          <button type="button" role="switch" aria-checked="false" className="mc-switch kd-foc" aria-label="Focus" />
          <button type="button" role="switch" aria-checked="false" aria-busy="true" className="mc-switch kd-load" aria-label="Loading" />
          <button type="button" role="switch" aria-checked="false" className="mc-switch kd-err" aria-label="Error" />
          <Switch checked={false} onChange={noop} label="Disabled" disabled />
          <Switch checked={demoSwitch} onChange={setDemoSwitch} label="Try it" />

          <span className="mc-kit-rowhead">Checkbox</span>
          {['', 'kd-hov', 'kd-prs', 'kd-foc', 'load', 'kd-err', 'dis', 'on'].map((cls) => (
            <button
              key={cls || 'def'}
              type="button"
              role="checkbox"
              aria-checked={cls === 'on'}
              aria-busy={cls === 'load' || undefined}
              disabled={cls === 'dis'}
              className={`mc-chk ${cls}`}
              aria-label={`Checkbox ${cls || 'default'}`}
            >
              {cls === 'load' ? <span className="mc-kit-spin" /> : <Check aria-hidden="true" />}
            </button>
          ))}

          <span className="mc-kit-rowhead">Swatch</span>
          <span className="mc-sw" style={{ '--c': C.green } as CSSProperties} />
          <span className="mc-sw kd-hov" style={{ '--c': C.green } as CSSProperties} />
          <span className="mc-sw kd-prs" style={{ '--c': C.green } as CSSProperties} />
          <span className="mc-sw kd-foc" style={{ '--c': C.green } as CSSProperties} />
          <span className="mc-kit-na">n/a</span>
          <span className="mc-kit-na">n/a</span>
          <span className="mc-sw" style={{ '--c': C.green, opacity: 0.38, filter: 'saturate(.4)' } as CSSProperties} />
          <span role="radiogroup" aria-label="Try a swatch" className="mc-kit-row" style={{ gap: 8 }}>
            {['green', 'coral'].map((key) => (
              <Swatch key={key} small color={C[key]} label={key} checked={demoSwatch === key} onSelect={() => setDemoSwatch(key)} />
            ))}
          </span>

          <span className="mc-kit-rowhead">Toggle group</span>
          {['', 'kd-hov', 'kd-prs', 'kd-foc'].map((cls) => (
            <span key={cls || 'def'} className="mc-tg" aria-hidden="true">
              <button type="button" tabIndex={-1} className={cls}>
                A
              </button>
              <button type="button" tabIndex={-1}>
                B
              </button>
            </span>
          ))}
          <span className="mc-kit-na">n/a</span>
          <span className="mc-kit-na">n/a</span>
          <span className="mc-tg" style={{ opacity: 0.38 }} aria-hidden="true">
            <button type="button" tabIndex={-1} disabled>
              A
            </button>
            <button type="button" tabIndex={-1} disabled>
              B
            </button>
          </span>
          <ToggleGroup
            label="Try it"
            value={demoTg}
            options={[
              { value: 'a', label: 'A' },
              { value: 'b', label: 'B' },
            ]}
            onChange={setDemoTg}
          />

          <span className="mc-kit-rowhead">Input</span>
          <input className="mc-inp" placeholder="Name…" aria-label="Default" />
          <input className="mc-inp kd-hov" placeholder="Name…" aria-label="Hover" />
          <input className="mc-inp kd-foc" defaultValue="Ga" aria-label="Pressed" />
          <input className="mc-inp kd-foc" placeholder="Name…" aria-label="Focus" />
          <span className="mc-inp" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            Garden <span className="mc-kit-spin" />
          </span>
          <input className="mc-inp" aria-invalid="true" defaultValue="Garden" aria-label="Error" />
          <input className="mc-inp" disabled placeholder="Name…" aria-label="Disabled" />
          <input className="mc-inp" defaultValue="Garden" aria-label="Filled" />

          <span className="mc-kit-rowhead">Menu item</span>
          {['', 'kd-hov', 'kd-prs', 'kd-foc'].map((cls) => (
            <span key={cls || 'def'} className={`mc-mi ${cls}`}>
              <span className="mc-mi-icon">
                <Pencil />
              </span>
              Edit
            </span>
          ))}
          <span className="mc-mi">
            <span className="mc-mi-icon">
              <span className="mc-kit-spin" />
            </span>
            Saving
          </span>
          <span className="mc-kit-na">n/a</span>
          <span className="mc-mi" style={{ opacity: 0.4 }}>
            <span className="mc-mi-icon">
              <Pencil />
            </span>
            Edit
          </span>
          <span className="mc-mi" aria-checked="true" role="menuitemcheckbox">
            <span className="mc-mi-icon">
              <Pencil />
            </span>
            Edit<small>✓</small>
          </span>
        </div>
      </Section>

      {/* s13 */}
      <Section id="s13" title="Light, dark and Plex" lede="Label strips keep dark ink in dark mode, like a printed sticker. Notes tint from their space, so they never turn muddy.">
        <div className="mc-kit-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
          {(
            [
              ['mc-kit-light', 'Light'],
              ['mc-kit-dark', 'Dark'],
              ['mc-kit-light mc-kit-plex', 'Plex'],
            ] as const
          ).map(([cls, name]) => (
            <div key={name} className={`mc-kit-theme ${cls}`}>
              <h3 className="mc-h2">{name}</h3>
              <div className="mc-kit-row" style={{ gap: 8 }}>
                <SpacePill name="All" plain on size="small" onClick={noop} />
                <SpacePill name="Kitchen reno" color={C.coral} selected size="small" onClick={noop} />
                <SpacePill name="Kyoto" color={C.cyan} size="small" onClick={noop} />
              </div>
              <MemoryCard kind="note" title="Lime plaster, not paint, for the hallway." label={KITCHEN} meta="note" onActivate={noop} />
              <MemoryCard kind="picture" title="Bamboo grove at 7am" label={KYOTO} meta="kyoto.travel" top={<Art g={3} h={100} />} onActivate={noop} />
              <div className="mc-kit-row">
                <button type="button" className="mc-btn is-primary is-small">
                  Save
                </button>
                <button type="button" className="mc-btn is-small">
                  Move
                </button>
                <Switch checked onChange={noop} label={`${name} switch`} />
                <button type="button" role="checkbox" aria-checked="true" className="mc-chk" aria-label={`${name} checkbox`}>
                  <Check aria-hidden="true" />
                </button>
              </div>
              <div className="mc-trow">
                <button type="button" role="checkbox" aria-checked="false" className="mc-chk" aria-label="Call the electrician">
                  <Check aria-hidden="true" />
                </button>
                <span className="mc-trow-title">Call the electrician</span>
                <span className="mc-due is-today">Today</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* s14 */}
      <Section
        id="s14"
        title="The card-write moment"
        lede={`Saving reads as writing a memory card: ${MC_MOTION.write}ms in all; with reduced motion it is one fade. A soft click plays only when Sounds is on.`}
      >
        <div className="mc-kit-frames">
          <Cell name="0 ms · Enter">
            <div className="mc-field" style={{ width: '100%', height: 64, paddingLeft: 20 }}>
              <input readOnly aria-label="Typed" value="Lime plaster for hallways" />
              <button type="button" className="mc-plus kd-prs" aria-label="Save">
                <Plus aria-hidden="true" />
              </button>
            </div>
          </Cell>
          <Cell name="60 ms · blank card drops in">
            <div className="mc-card is-note mc-kit-frame-blank mc-kit-frame-drop" style={{ '--c': C.coral } as CSSProperties}>
              <div className="mc-card-body">
                <p className="mc-card-title">Lime plaster for hallways</p>
              </div>
              <LabelStrip label={KITCHEN} />
            </div>
          </Cell>
          <Cell name="120 ms · label stamps in">
            <div className="mc-card is-note" style={{ '--c': C.coral } as CSSProperties}>
              <div className="mc-card-body">
                <p className="mc-card-title">Lime plaster for hallways</p>
              </div>
              <div style={{ animation: `mc-stamp ${MC_MOTION.base}ms ${MC_MOTION.ease} both` }}>
                <LabelStrip label={KITCHEN} />
              </div>
            </div>
          </Cell>
          <Cell name={`${MC_MOTION.write} ms · settled, ✓ Saved`}>
            <div className="mc-card is-note kd-write" style={{ '--c': C.coral } as CSSProperties}>
              <div className="mc-card-body">
                <p className="mc-card-title">Lime plaster for hallways</p>
              </div>
              <LabelStrip label={KITCHEN} />
            </div>
          </Cell>
          <Cell name="then · toast">
            <div className="mc-toast" role="presentation" style={{ fontSize: 18 }}>
              <span className="mc-toast-mark" style={{ '--c': C.coral } as CSSProperties}>
                <Check />
              </span>
              <span>Saved</span>
              <button type="button">Open</button>
            </div>
          </Cell>
        </div>
      </Section>

      {/* s15 */}
      <Section
        id="s15"
        title="Pinned sites"
        lede="One gold pin button beside the Inbox opens the launcher: every pin, in your order. Inside a space it shows that space's pins. ⌥1–9 opens them; drag to reorder; drop a link card on the button to pin it."
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48, alignItems: 'flex-start' }}>
          <Cell name="The Pinned button">
            <button type="button" className="mc-rb mc-pins-btn" aria-label="Pinned, 7 sites">
              <Pin aria-hidden="true" />
            </button>
          </Cell>
          <Cell name="Open">
            <button type="button" className="mc-rb mc-pins-btn" aria-label="Pinned, 7 sites" aria-expanded="true">
              <Pin aria-hidden="true" />
            </button>
          </Cell>
          <Cell name="A link card is dragged">
            <button type="button" className="mc-rb mc-pins-btn is-drop-ready" aria-label="Pinned: drop to pin">
              <Pin aria-hidden="true" />
            </button>
          </Cell>
          <Cell name="Over it: drop to pin">
            <button type="button" className="mc-rb mc-pins-btn is-drop-ready is-drop-over" aria-label="Pinned: drop to pin">
              <Pin aria-hidden="true" />
            </button>
          </Cell>
          <Cell name="The launcher">
            <div className="mc-launcher" style={{ position: 'static', maxHeight: 'none', width: 432 }}>
              <div className="mc-launch-head">
                <h3 className="mc-launch-title">Pinned</h3>
                <span className="mc-keyhint">
                  <kbd className="mc-kb">⌥</kbd>
                  <kbd className="mc-kb">1–7</kbd>
                </span>
              </div>
              <ul className="mc-launch-grid">
                {SG_PINS.slice(0, 6).map((p) => (
                  <li key={p} className="mc-launch-tile">
                    <button type="button" className="mc-launch-site" style={{ width: '100%', border: 0, background: 'none' }}>
                      <span className="mc-rb is-large" aria-hidden="true">
                        <span className="mc-pin-letter" style={{ width: 30, height: 30 }}>
                          {p.slice(0, 1)}
                        </span>
                      </span>
                      <span className="mc-launch-name">{p}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mc-launch-foot">
                <p className="mc-launch-hint">Drag to reorder.</p>
                <button type="button" className="mc-btn is-quiet is-small">
                  Edit pins…
                </button>
              </div>
            </div>
          </Cell>
          <Cell name="Nothing pinned in a space yet">
            <div className="mc-launcher" style={{ position: 'static', maxHeight: 'none', width: 432 }}>
              <div className="mc-launch-head">
                <h3 className="mc-launch-title">Pinned in Kitchen reno</h3>
              </div>
              <p className="mc-launch-empty">Nothing pinned in Kitchen reno yet. Pin a save from its card’s ••• or drop a card on the pin button.</p>
            </div>
          </Cell>
        </div>
      </Section>
      {/* s16 */}
      <Section
        id="s16"
        title="Spaces row: sticky bar, drop tray, Edit spaces"
        lede="Scrolled past the pills, one slim bar sticks: back to top, the spaces that fit, More, Pinned. Dragging a card opens a tray of every space. Edit spaces orders them and hides any from the row."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 48, alignItems: 'stretch' }}>
          <Cell name="The sticky bar (Cards, a space board, Tasks)">
            <div className="mc-stick is-shown" style={{ position: 'relative', height: 84, margin: 0, width: '100%' }}>
              <div className="mc-stick-bar" style={{ position: 'absolute', borderRadius: 20, padding: '0 24px' }}>
                <button type="button" className="mc-stick-top" aria-label="Back to the top of Everything">
                  <span className="mc-stick-top-disc" aria-hidden="true">
                    <ArrowUp />
                  </span>
                  <span className="mc-stick-top-name">Everything</span>
                  <sup aria-hidden="true">41</sup>
                </button>
                <span className="mc-stick-sep" aria-hidden="true" />
                <div className="mc-stick-pills">
                  <div className="mc-pills is-compact">
                    <SpacePill name="All" plain on size="small" />
                    <SpacePill name="Kitchen reno" color={C.coral} size="small" />
                    <SpacePill name="Kyoto trip" color={C.cyan} size="small" />
                    <SpacePill name="Reading" color={C.blue} size="small" />
                    <button type="button" className="mc-pill is-plain is-small">
                      <MoreHorizontal aria-hidden="true" width={22} height={22} /> More
                    </button>
                  </div>
                </div>
                <button type="button" className="mc-rb mc-pins-btn" aria-label="Pinned, 7 sites">
                  <Pin aria-hidden="true" />
                </button>
              </div>
            </div>
          </Cell>
          <Cell name="The drop tray (while a card moves)">
            <div className="mc-tray" style={{ position: 'static', maxHeight: 'none', borderRadius: 40 }}>
              <div className="mc-tray-head">
                <h3 className="mc-tray-title">Drop on a space</h3>
                <span className="mc-tray-hint">Esc, or drop anywhere else, to cancel</span>
              </div>
              <div className="mc-tray-pills">
                <SpacePill name="Kitchen reno" color={C.coral} target="idle" />
                <SpacePill name="Kyoto trip" color={C.cyan} target="over" />
                <SpacePill name="Reading" color={C.blue} target="idle" />
                <SpacePill name="Garden" color={C.green} target="idle" />
                <button type="button" className="mc-pill is-slot mc-tray-new">
                  <Plus aria-hidden="true" /> New space
                </button>
                <button type="button" className="mc-pill mc-tray-pin">
                  <span className="mc-tray-pin-disc" aria-hidden="true">
                    <Pin />
                  </span>
                  Pin
                </button>
              </div>
            </div>
          </Cell>
          <Cell name="Edit spaces (More → Edit spaces…, or Settings)">
            <ol className="mc-es-list" style={{ maxWidth: 680 }} aria-label="Spaces in order">
              {[
                ['Kitchen reno', C.coral, false],
                ['Kyoto trip', C.cyan, false],
                ['Reading', C.blue, true],
              ].map(([name, color, hidden], index) => (
                <li key={String(name)} className={`mc-es-row${hidden ? ' is-hidden' : ''}`}>
                  <button type="button" className="mc-es-grip" aria-label={`${name}, place ${index + 1}`}>
                    <GripVertical aria-hidden="true" />
                  </button>
                  <span className="mc-es-dot" style={{ '--c': color } as CSSProperties} aria-hidden="true" />
                  <span className="mc-es-name">{String(name)}</span>
                  {hidden && <span className="mc-es-tag">Hidden</span>}
                  <span className="mc-es-moves" style={{ opacity: index === 1 ? 1 : undefined }}>
                    <button type="button" className="mc-rb is-small" aria-label={`Move ${name} up`}>
                      <ArrowUp aria-hidden="true" />
                    </button>
                    <button type="button" className="mc-rb is-small" aria-label={`Move ${name} down`}>
                      <ArrowDown aria-hidden="true" />
                    </button>
                  </span>
                  <span className="mc-es-show">
                    <span className="mc-es-show-label" aria-hidden="true">
                      In the row
                    </span>
                    <Switch checked={!hidden} onChange={noop} label={`Show ${name} in the pill row`} />
                  </span>
                </li>
              ))}
              <li className="mc-es-line" aria-hidden="true">
                <span>In More at this window width</span>
              </li>
            </ol>
          </Cell>
        </div>
      </Section>
    </main>
  );
};

const StateCard = ({ cls }: { cls: string }) => (
  <article className={`mc-card is-picture ${cls}`} style={{ '--c': C.cyan } as CSSProperties} tabIndex={-1}>
    <Art g={3} h={150} />
    <div className="mc-card-body">
      <p className="mc-card-title">Arashiyama bamboo grove at 7am</p>
    </div>
    <LabelStrip label={KYOTO} meta="kyoto.travel" />
  </article>
);

export default StyleguidePage;
