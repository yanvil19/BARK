import Questions from '../shared/Questions.jsx';

export default function ChairQuestions({ me, initialTab, badgeCounts }) {
  const programLabel = me?.program?.name || 'Your Program';
  return (
    <Questions
      me={me}
      role="program_chair"
      programId={me?.program?._id || me?.program}
      programLabel={programLabel}
      initialTab={initialTab}
      badgeCounts={badgeCounts}
    />
  );
}
