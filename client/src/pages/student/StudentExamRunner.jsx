import ExamAttemptRunner from '../../components/ExamAttemptRunner.jsx';

// A student taking an exam: the shared attempt screen, which warns about and records leaving
// the exam window, and closes when the exam's time ends
export default function StudentExamRunner({ examId, onFinish, me }) {
  return <ExamAttemptRunner audience="student" examId={examId} onFinish={onFinish} me={me} />;
}
