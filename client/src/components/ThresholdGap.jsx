// How far a score is from the passing threshold, told by an arrow and words, not color alone.
// Its styles (er-gap) are in styles/shared/ExamResults.css.
export default function ThresholdGap({ score, threshold }) {
  const gap = score - threshold;
  if (gap === 0) return <span className="ca-stat-sub er-gap is-above">Right at the threshold</span>;

  const isAbove = gap > 0;
  return (
    <span className={`ca-stat-sub er-gap ${isAbove ? 'is-above' : 'is-below'}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d={isAbove ? 'M6 2 11 10H1z' : 'M6 10 1 2h10z'} fill="currentColor" />
      </svg>
      {Math.abs(gap)} {Math.abs(gap) === 1 ? 'pt' : 'pts'} {isAbove ? 'above' : 'below'} the threshold
    </span>
  );
}
