import QuestionsPage from '../shared/CreateQuestions.jsx';

export default function ProfessorQuestions({ me }) {
  const programLabel = me?.program?.name || 'Your Program';
  return (
    <QuestionsPage
      me={me}
      role="professor"
      programId={me?.program?._id || me?.program}
      programLabel={programLabel}
    />
  );
}
