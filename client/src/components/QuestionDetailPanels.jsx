import AuthImage from './AuthImage';
import AnswerImage from './AnswerImage';
import PassageImages from './PassageImages';
import SafeHtml from './SafeHtml';
import { resolveImageUrl } from '../lib/authImageCache';
import '../styles/components/QuestionDetailPanels.css';

// Read-only view of one question, in stacked panels: the shared passage (for a
// question in a set), the question, its images, the answer choices and the
// rationalization. Answers need an optionLabel (see organizeQuestionAnswers).
// Each section is bordered, with its title in a header bar. With onZoom each
// image is a button that opens the full image.
//
// For results: selectedAnswerId marks the answer a person picked (null when they
// left it blank), tinted red when it is wrong. answerCounts ({ [answerId]: count })
// with unansweredCount shows how many takers picked each answer.
export default function QuestionDetailPanels({
  question,
  passage = '',
  passageImages = [],
  onZoom,
  selectedAnswerId,
  answerCounts,
  unansweredCount = 0,
}) {
  if (!question) return null;

  const images = (question.images || []).filter(Boolean).map(resolveImageUrl);
  const answers = question.answers || [];
  const hasPassage = Boolean(passage) || passageImages.length > 0;
  const showsSelection = selectedAnswerId !== undefined;
  const selectedId = selectedAnswerId == null ? '' : String(selectedAnswerId);
  const totalTakers = answerCounts
    ? answers.reduce((sum, answer) => sum + (answerCounts[String(answer._id)] || 0), 0) + unansweredCount
    : 0;
  const renderCount = (count) => (
    <span className="question-panel-count" title={`${count} of ${totalTakers} takers`}>
      {count} of {totalTakers}
    </span>
  );

  return (
    <div className="question-panels">
      {hasPassage && (
        <section className="question-panel">
          <p className="question-panel-label">Shared Passage</p>
          <div className="question-panel-body">
            {passage ? <SafeHtml tag="div" className="question-panel-text" html={passage} /> : null}
            <PassageImages images={passageImages} onZoom={onZoom} />
          </div>
        </section>
      )}

      <section className="question-panel">
        <p className="question-panel-label">Question</p>
        <div className="question-panel-body">
          <SafeHtml tag="div" className="question-panel-text" html={question.description} fallback="No description provided." />
        </div>
      </section>

      {images.length > 0 && (
        <section className="question-panel">
          <p className="question-panel-label">Images</p>
          <div className="question-panel-body question-panel-images">
            {images.map((image, index) => {
              const thumbnail = (
                <AuthImage className="question-panel-image" src={image} alt={`Question image ${index + 1}`} />
              );

              if (!onZoom) {
                return <span key={index} className="question-panel-image-link">{thumbnail}</span>;
              }

              return (
                <button
                  key={index}
                  type="button"
                  className="question-panel-image-link"
                  title="View image"
                  aria-label={`View question image ${index + 1}`}
                  onClick={() => onZoom(image)}
                >
                  {thumbnail}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="question-panel">
        <p className="question-panel-label">Answers</p>
        <div className="question-panel-body question-panel-body--answers">
          <ul className="question-panel-answers">
            {answers.map((answer, index) => {
              const isSelected = Boolean(selectedId) && String(answer._id ?? '') === selectedId;
              const isWrongPick = isSelected && !answer.isCorrect;
              const count = answerCounts ? (answerCounts[String(answer._id)] || 0) : null;

              return (
                <li
                  key={answer._id || `${answer.optionLabel}-${index}`}
                  className={`question-panel-answer${answer.isCorrect ? ' is-correct' : ''}${isWrongPick ? ' is-wrong' : ''}`}
                >
                  <span className="question-panel-option">{answer.optionLabel}</span>
                  <span className="question-panel-answer-text">
                    <SafeHtml html={answer.text} />
                    <AnswerImage src={answer.image} alt={`Answer ${answer.optionLabel} image`} onZoom={onZoom} className="answer-image--block" />
                  </span>
                  {(isSelected || answer.isCorrect || count !== null) && (
                    <span className="question-panel-answer-tags">
                      {isSelected ? <strong className="question-panel-selected">Selected</strong> : null}
                      {answer.isCorrect ? <strong className="question-panel-correct">Correct</strong> : null}
                      {count !== null ? renderCount(count) : null}
                    </span>
                  )}
                </li>
              );
            })}
            {((showsSelection && !selectedId) || (answerCounts && unansweredCount > 0)) && (
              <li className="question-panel-answer is-blank">
                <span className="question-panel-option" aria-hidden="true">–</span>
                <span className="question-panel-answer-text">No answer submitted</span>
                {answerCounts ? <span className="question-panel-answer-tags">{renderCount(unansweredCount)}</span> : null}
              </li>
            )}
          </ul>
        </div>
      </section>

      {question.rationalization && (
        <section className="question-panel">
          <p className="question-panel-label">Rationalization</p>
          <div className="question-panel-body">
            <SafeHtml tag="div" className="question-panel-text" html={question.rationalization} />
          </div>
        </section>
      )}
    </div>
  );
}
