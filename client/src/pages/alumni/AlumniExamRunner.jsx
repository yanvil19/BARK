import ExamAttemptRunner from '../../components/ExamAttemptRunner.jsx';

// An alumnus taking an exam: the shared attempt screen, for an attempt that may be timed and
// can be taken again
export default function AlumniExamRunner({ examId, onFinish, me }) {
  return <ExamAttemptRunner audience="alumni" examId={examId} onFinish={onFinish} me={me} />;
}
