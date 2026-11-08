import '../styles/components/TopicScoreRows.css';

// Above the threshold, near it (within 70% of it) or below: green, amber or red
function getTone(score, threshold) {
  if (score >= threshold) return 'good';
  if (score >= threshold * 0.7) return 'warn';
  return 'bad';
}

// An exam result's score per topic, as rows split by lines: the name and "N/M correct", a bar with
// a tick at the passing threshold, and the percentage. The tick and the number tell where a topic
// stands, so the bar's color is never the only cue. With onSelect(topic, event) each row is a
// button. topics are { key, name, correct, total, percentage }.
export default function TopicScoreRows({ topics, threshold, onSelect, selectLabel }) {
  return (
    <ul className="tsr-list">
      {topics.map((topic) => {
        const percentage = Math.min(100, Math.max(0, topic.percentage || 0));
        const content = (
          <>
            <span className="tsr-text">
              <span className="tsr-name">{topic.name}</span>
              <span className="tsr-meta">{topic.correct}/{topic.total} correct</span>
            </span>
            <span className="tsr-bar" aria-hidden="true">
              <span className={`tsr-fill tsr-fill--${getTone(percentage, threshold)}`} style={{ width: `${percentage}%` }} />
              <span className="tsr-threshold" style={{ left: `${Math.min(100, Math.max(0, threshold))}%` }} />
            </span>
            <span className="tsr-pct">{topic.percentage}%</span>
            {onSelect && <span className="tsr-chevron" aria-hidden="true">›</span>}
          </>
        );

        return (
          <li key={topic.key} className="tsr-item">
            {onSelect ? (
              <button
                type="button"
                className="tsr-row"
                onClick={(event) => onSelect(topic, event)}
                aria-label={selectLabel ? `${selectLabel(topic)}: ${topic.percentage}%, ${topic.correct} of ${topic.total} correct` : undefined}
              >
                {content}
              </button>
            ) : (
              <div className="tsr-row">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
