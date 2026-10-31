import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import AuthImage from './AuthImage';
import ImportReviewBubbles from './ImportReviewBubbles';
import QuestionDetailPanels from './QuestionDetailPanels';
import { stripHtml } from './SafeHtml';
import { organizeQuestionAnswers } from '../lib/DeanTestRunOrganizer';
import { groupQuestionsForDisplay } from '../lib/groupQuestionsForDisplay';
import '../styles/components/ResultQuestionList.css';

function toOneLine(text) {
  return stripHtml(String(text || '')).replace(/\s+/g, ' ').trim();
}

function getQuestionKey(question) {
  return String(question.questionId || question._id);
}

// The questions of an exam result as cards, in the look of the Exam Details
// questions: a card per question and a card per question set (its header opens
// it, numbered bubbles switch between its questions), one card open at a time.
// Each question needs its exam questionNumber, description, answers and set fields.
// renderMeta(question) adds chips after the question number, renderSetMeta(questions)
// adds chips to a set's header, and getPanelProps(question) passes the result props
// of QuestionDetailPanels (selectedAnswerId, answerCounts).
export default function ResultQuestionList({ questions, renderMeta, renderSetMeta, getPanelProps }) {
  const [openKey, setOpenKey] = useState(null);
  const [activeGroupIdx, setActiveGroupIdx] = useState({});
  const [zoomedImage, setZoomedImage] = useState(null);

  const items = useMemo(
    () => groupQuestionsForDisplay((questions || []).map(organizeQuestionAnswers)),
    [questions]
  );

  useEffect(() => {
    if (!zoomedImage) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') setZoomedImage(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [zoomedImage]);

  const toggle = (key) => setOpenKey((prev) => (prev === key ? null : key));

  function renderMetaRow(question, number, children) {
    return (
      <span className="rql-meta-row">
        <span className="rql-number">Question {number}</span>
        {renderMeta?.(question)}
        {children}
      </span>
    );
  }

  function renderQuestion({ question, questionNumber }) {
    const key = `question:${getQuestionKey(question)}`;
    const isOpen = openKey === key;

    return (
      <article key={key} className="rql-card">
        <button type="button" className="rql-toggle" onClick={() => toggle(key)} aria-expanded={isOpen}>
          {renderMetaRow(
            question,
            question.questionNumber || questionNumber,
            <span className={`rql-expand-icon${isOpen ? ' is-open' : ''}`} aria-hidden="true">▾</span>
          )}
          {!isOpen && (
            <span className="rql-headline">{toOneLine(question.description) || 'No description provided.'}</span>
          )}
        </button>

        {isOpen && (
          <QuestionDetailPanels question={question} onZoom={setZoomedImage} {...getPanelProps?.(question)} />
        )}
      </article>
    );
  }

  function renderQuestionSet({ groupId, setNumber, questions: members }) {
    const key = `group:${groupId}`;
    const isOpen = openKey === key;
    const activeIdx = Math.min(activeGroupIdx[groupId] || 0, members.length - 1);
    const { question: activeQuestion, questionNumber: activeNumber } = members[activeIdx];
    const firstQuestion = members[0].question;
    const firstNumber = firstQuestion.questionNumber || members[0].questionNumber;
    const lastMember = members[members.length - 1];
    const lastNumber = lastMember.question.questionNumber || lastMember.questionNumber;
    // The set's shared passage, repeated above whichever question is shown
    const passage = (activeQuestion.groupContext || firstQuestion.groupContext || '').trim();
    const passageImages = activeQuestion.groupContextImages || firstQuestion.groupContextImages || [];

    return (
      <section key={key} className={`rql-set${isOpen ? ' is-open' : ''}`}>
        <button type="button" className="rql-set-header" onClick={() => toggle(key)} aria-expanded={isOpen}>
          <span className="rql-set-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="4" y="5" width="16" height="5" rx="1.5" />
              <rect x="4" y="14" width="16" height="5" rx="1.5" />
              <path d="M8 7.5h8M8 16.5h8" />
            </svg>
          </span>
          <span className="rql-number">
            {members.length > 1 ? `Questions ${firstNumber}–${lastNumber}` : `Question ${firstNumber}`}
          </span>
          <span className="rql-set-title">{toOneLine(firstQuestion.groupContext) || `Question Set ${setNumber}`}</span>
          <span className="rql-set-badge">
            {members.length} {members.length === 1 ? 'question' : 'questions'}
          </span>
          {renderSetMeta?.(members.map((member) => member.question))}
          <span className={`rql-expand-icon${isOpen ? ' is-open' : ''}`} aria-hidden="true">▾</span>
        </button>

        {isOpen && (
          <div className="rql-set-body">
            {members.length > 1 && (
              <ImportReviewBubbles
                questions={members.map((member) => member.question)}
                currentIdx={activeIdx}
                onSelectQuestion={(idx) => setActiveGroupIdx((prev) => ({ ...prev, [groupId]: idx }))}
                readOnly
              />
            )}

            <article key={getQuestionKey(activeQuestion)} className="rql-card is-grouped">
              {renderMetaRow(activeQuestion, activeQuestion.questionNumber || activeNumber)}
              <QuestionDetailPanels
                question={activeQuestion}
                passage={passage}
                passageImages={passageImages}
                onZoom={setZoomedImage}
                {...getPanelProps?.(activeQuestion)}
              />
            </article>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="rql-list">
      {items.map((item) => (item.type === 'group' ? renderQuestionSet(item) : renderQuestion(item)))}

      {zoomedImage && createPortal(
        <div
          className="rql-image-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setZoomedImage(null)}
        >
          <div className="rql-image-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="rql-image-close"
              onClick={() => setZoomedImage(null)}
              aria-label="Close image preview"
            >
              Close
            </button>
            <AuthImage src={zoomedImage} alt="Preview" className="rql-image-full" />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
