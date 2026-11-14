import LearnerExamResults from '../shared/LearnerExamResults.jsx';

// A student's Exam Results: the shared results page, with scores shown once they are released
export default function StudentExamResults() {
  return <LearnerExamResults audience="student" />;
}
