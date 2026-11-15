import Questions from '../shared/Questions.jsx';

export default function ProfessorQuestions({ me, badgeCounts }) {
  const programLabel = me?.program?.name || 'Your Program';
  return (
    <Questions
      me={me}
      role="professor"
      programId={me?.program?._id || me?.program}
      programLabel={programLabel}
      badgeCounts={badgeCounts}
    />
  );
}
