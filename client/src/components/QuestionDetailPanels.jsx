import AuthImage from './AuthImage';
import AnswerImage from './AnswerImage';
import PassageImages from './PassageImages';
import { resolveImageUrl } from '../lib/authImageCache';
import '../styles/components/QuestionDetailPanels.css';

// Read-only view of one question, in stacked panels: the shared passage (for a
// question in a set), the question, its images, the answer choices and the
// rationalization. Answers need an optionLabel (see organizeQuestionAnswers).
// With onZoom each image is a button that opens the full image.
export default function QuestionDetailPanels({ question, passage = '', passageImages = [], onZoom }) {
  if (!question) return null;

  const images = (question.images || []).filter(Boolean).map(resolveImageUrl);
  const answers = question.answers || [];
  const hasPassage = Boolean(passage) || passageImages.length > 0;

  return (
    <div className="question-panels">
      {hasPassage && (
        <section className="question-panel question-panel--passage">
          <p className="question-panel-label">Shared Passage</p>
          {passage ? <p className="question-panel-text">{passage}</p> : null}
          <PassageImages images={passageImages} onZoom={onZoom} />
        </section>
      )}

      <section className="question-panel">
        <p className="question-panel-label">Question</p>
        <p className="question-panel-text">{question.description || 'No description provided.'}</p>
      </section>

      {images.length > 0 && (
        <section className="question-panel">
          <p className="question-panel-label">Images</p>
          <div className="question-panel-images">
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
        <ul className="question-panel-answers">
          {answers.map((answer, index) => (
            <li
              key={answer._id || `${answer.optionLabel}-${index}`}
              className={`question-panel-answer${answer.isCorrect ? ' is-correct' : ''}`}
            >
              <span className="question-panel-option">{answer.optionLabel}</span>
              <span className="question-panel-answer-text">
                {answer.text}
                <AnswerImage src={answer.image} alt={`Answer ${answer.optionLabel} image`} onZoom={onZoom} className="answer-image--block" />
              </span>
              {answer.isCorrect ? <strong className="question-panel-correct">Correct</strong> : null}
            </li>
          ))}
        </ul>
      </section>

      {question.rationalization && (
        <section className="question-panel">
          <p className="question-panel-label">Rationalization</p>
          <p className="question-panel-text">{question.rationalization}</p>
        </section>
      )}
    </div>
  );
}
