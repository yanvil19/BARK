import { useMemo } from 'react';
import ImportReviewBubbles from './ImportReviewBubbles.jsx';
import QuestionDetailPanels from './QuestionDetailPanels.jsx';
import { organizeQuestionAnswers } from '../lib/DeanTestRunOrganizer.js';
import { groupQuestionsForDisplay } from '../lib/groupQuestionsForDisplay.js';

// Steps through many questions, such as a whole exam or everything under a subject, with the
// numbered bubbles above the question shown. Each set's questions stay together, so it gets one
// capsule, and its shared passage repeats above whichever of them is shown.
//
// renderAside goes in the bubbles' header bar and renderDetails below the question; both get the
// question shown. Keep questions stable between renders, since they are sorted and lettered here.
export default function QuestionStepper({
  questions,
  activeIdx,
  onSelectQuestion,
  onZoom,
  renderAside,
  renderDetails,
}) {
  const ordered = useMemo(() => (
    groupQuestionsForDisplay(questions.map((question) => organizeQuestionAnswers(question)))
      .flatMap((item) => (item.type === 'group' ? item.questions.map((member) => member.question) : [item.question]))
  ), [questions]);

  const currentIdx = Math.min(activeIdx, Math.max(ordered.length - 1, 0));
  const current = ordered[currentIdx];
  if (!current) return null;

  const firstInSet = current.groupId
    ? ordered.find((question) => question.groupId === current.groupId)
    : null;

  // No wrapper: these are direct children of the panel's content, which spaces and fades them in
  return (
    <>
      <ImportReviewBubbles
        questions={ordered}
        currentIdx={currentIdx}
        onSelectQuestion={onSelectQuestion}
        readOnly
        aside={renderAside?.(current)}
      />

      {/* Keyed so moving between questions fades the next one in */}
      <QuestionDetailPanels
        key={current._id}
        question={current}
        passage={(current.groupContext || firstInSet?.groupContext || '').trim()}
        passageImages={current.groupContextImages || firstInSet?.groupContextImages || []}
        onZoom={onZoom}
      />

      {renderDetails?.(current)}
    </>
  );
}
