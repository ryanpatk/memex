import Sheet from './Sheet';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const ALT = IS_MAC ? '⌥' : 'Alt ';

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Go',
    rows: [
      [`${MOD}K`, 'Go anywhere'],
      ['/', 'Search cards'],
      ['J', 'Journal'],
      [`${ALT}1–9`, 'Open a pinned site'],
      ['↑↓', 'Move between rows'],
      ['Esc', 'Close, stop selecting'],
    ],
  },
  {
    title: 'Make',
    rows: [
      ['↵', 'Save, or open'],
      [`${MOD}↵`, 'Save as a note'],
      ['N', 'New task'],
      ['␣', 'Tick a task'],
    ],
  },
  {
    title: 'Pick',
    rows: [
      [`${MOD} click`, 'Add to selection'],
      ['⇧ click', 'Pick a range'],
      [`${MOD}A`, 'All on screen'],
      ['X', 'Pick a row'],
      ['⌫', 'Delete, with Undo'],
    ],
  },
  {
    title: 'Pins',
    rows: [
      ['⇧←→', 'Move the focused pin'],
      ['⌫', 'Unpin it, with Undo'],
      [`${ALT}↑↓`, 'Move a space in Edit spaces'],
    ],
  },
];

/** Keys (d34): four groups — Go, Make, Pick, Pins — of chunky 64px key caps. */
const ShortcutsSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Sheet open={open} onClose={onClose} title="Keys" width={1120}>
    <div className="mc-keys-grid">
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className="mc-h3">{group.title}</h3>
          <dl className="mc-keys-list">
            {group.rows.map(([key, what]) => (
              <div key={key} className="mc-keys-row">
                <dt>
                  <kbd className="mc-key" style={key.length > 2 ? { fontSize: 20 } : undefined}>
                    {key}
                  </kbd>
                </dt>
                <dd className="mc-body">{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  </Sheet>
);

export default ShortcutsSheet;
