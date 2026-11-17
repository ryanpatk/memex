import { FolderInput, Trash2, X } from 'lucide-react';

interface CardsSelectionBarProps {
  count: number;
  /** Selected cards the filters hide right now. */
  hiddenCount: number;
  onMove: () => void;
  onDelete: () => void;
  onExit: () => void;
}

/**
 * The selection bar (d09): the count, Move to… (primary), Delete, and one ✕
 * (Esc still works). Floats bottom-centre while cards are selected.
 */
const CardsSelectionBar = ({ count, hiddenCount, onMove, onDelete, onExit }: CardsSelectionBarProps) => (
  <div className="mc-selbar" role="toolbar" aria-label="Selection">
    <p className="mc-selbar-count" aria-live="polite">
      <strong>{count}</strong> selected
      {hiddenCount > 0 && <span className="mc-lab"> · {hiddenCount} hidden by filters</span>}
    </p>
    <button type="button" className="mc-btn is-primary" onClick={onMove} disabled={count === 0}>
      <FolderInput aria-hidden="true" /> Move to…
    </button>
    <button type="button" className="mc-btn" onClick={onDelete} disabled={count === 0}>
      <Trash2 aria-hidden="true" /> Delete
    </button>
    <button type="button" className="mc-rb" onClick={onExit} aria-label="Stop selecting (Esc)">
      <X aria-hidden="true" />
    </button>
  </div>
);

export default CardsSelectionBar;
