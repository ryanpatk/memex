const HEIGHTS = [
  [360, 180, 300],
  [200, 340, 220],
];

/** Loading (d39): placeholder cards on the 3-column grid, each ending in a grey label. */
const CardsSkeleton = () => (
  <div className="mc-skeleton" role="status" aria-label="Loading your cards…">
    {HEIGHTS[0].map((first, column) => (
      <div key={column} className="mc-skeleton-col">
        {[first, HEIGHTS[1][column]].map((height, index) => (
          <div key={index} className="mc-card is-loading" aria-hidden="true" style={{ height }}>
            {index === 0 && column !== 1 && <span className="mc-card-pic" style={{ height: height - 160 }} />}
            <div className="mc-card-body">
              <span className="mc-sk" style={{ height: 22, width: '80%' }} />
              <span className="mc-sk" style={{ height: 22, width: '55%', marginTop: 10 }} />
            </div>
            <div className="mc-lb" />
          </div>
        ))}
      </div>
    ))}
  </div>
);

export default CardsSkeleton;
