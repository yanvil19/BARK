import QuestionsPage from './QuestionsPage.jsx';

export default function ChairQuestions({ me }) {
  const programLabel = me?.program?.name || 'Your Program';
  return (
    <QuestionsPage
      me={me}
      role="program_chair"
      programId={me?.program?._id || me?.program}
      programLabel={programLabel}
    />
  );
}
