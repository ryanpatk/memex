/** Card heights for the placeholder grid: a believable mix of pictures and text cards. */
const HEIGHTS = [220, 132, 300, 168, 112, 260, 196, 140, 240, 120, 284, 176];

/**
 * The Library grid before anything has loaded (first sign-in on a device,
 * nothing cached): quiet card-shaped placeholders on the stream card
 * surface, in place of an empty state that would claim there's nothing here.
 */
const GridSkeleton = () => (
  <div className="memex-grid-skeleton" role="status" aria-busy="true" aria-label="Loading your Library…">
    {HEIGHTS.map((height, index) => (
      <span key={index} className="memex-grid-skeleton-card" style={{ height }} aria-hidden="true" />
    ))}
  </div>
);

export default GridSkeleton;
