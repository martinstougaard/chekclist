/**
 * stat: { done, base, pct } fra finish() i lib/progress.js
 * tone: 'total' | 'test' | 'prod'
 */
export default function ProgressBar({ label, stat, tone = 'total', size = 'md' }) {
  const complete = stat.total > 0 && stat.pct === 100;
  return (
    <div className={`pbar pbar-${size} pbar-${tone}${complete ? ' pbar-complete' : ''}`}>
      <div className="pbar-head">
        <span className="pbar-label">{label}</span>
        <span className="pbar-value">
          {stat.total === 0 ? 'Ingen opgaver' : `${stat.pct}%`}
          {stat.total > 0 && size !== 'sm' && (
            <span className="pbar-count">
              {' '}
              ({stat.done}/{stat.base})
            </span>
          )}
        </span>
      </div>
      <div
        className="pbar-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={stat.pct}
      >
        <div className="pbar-fill" style={{ width: `${stat.pct}%` }} />
      </div>
    </div>
  );
}
