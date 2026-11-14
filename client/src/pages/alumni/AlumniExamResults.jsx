import LearnerExamResults from '../shared/LearnerExamResults.jsx';

// An alumni's Exam Results: the shared results page, with every attempt and its answers.
// examId opens that exam's result on arrival.
export default function AlumniExamResults({ examId }) {
  return <LearnerExamResults audience="alumni" initialExamId={examId} />;
}
