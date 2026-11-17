import type { CSSProperties } from 'react';

export interface CardLabel {
  /** The first space's name, or null when the item isn't filed. */
  name: string | null;
  /** That space's colour. */
  color: string | null;
  /** How many more spaces hold the item (“Reading +1”). */
  extra: number;
}

interface LabelStripProps {
  label: CardLabel;
  /** Right side: source, kind or time. */
  meta?: string;
}

/**
 * The label strip at the foot of every memory card (s05): the space's name on
 * the space's own colour, the source, kind or time on the right. An unfiled
 * item shows a grey “Unfiled” label that asks to be filed.
 */
const LabelStrip = ({ label, meta }: LabelStripProps) => (
  <div
    className={`mc-lb${label.name ? '' : ' is-unfiled'}`}
    style={label.color ? ({ '--c': label.color } as CSSProperties) : undefined}
  >
    <span translate={label.name ? 'no' : undefined}>
      {label.name ?? 'Unfiled'}
      {label.extra > 0 && ` +${label.extra}`}
    </span>
    {meta && <i translate="no">{meta}</i>}
  </div>
);

export default LabelStrip;
