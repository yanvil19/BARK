import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import QuestionsPage from './QuestionsPage.jsx';

const BASE = 'http://localhost:5000';

export default function DeanQuestions({ me }) {
  const [programs, setPrograms] = useState([]);
  const [selectedProgramId, setSelectedProgramId] = useState('');

  useEffect(() => {
    async function fetchPrograms() {
      try {
        // Fetch programs for the Dean's department
        const data = await apiAuth(`${BASE}/api/catalog/programs`);
        const deptId = me?.department?._id || me?.department;
        const deptPrograms = (data.programs || []).filter((p) => {
          const pDept = p.department?._id || p.department;
          return String(pDept) === String(deptId);
        });
        setPrograms(deptPrograms);
        setSelectedProgramId((prev) => {
          if (prev && deptPrograms.some((program) => String(program._id) === String(prev))) return prev;
          return deptPrograms[0]?._id || '';
        });
      } catch (err) {
        console.error('Failed to load programs:', err);
      }
    }
    if (me?.department) fetchPrograms();
  }, [me]);

  return (
    <QuestionsPage
      me={me}
      role="dean"
      programId={selectedProgramId}
      programs={programs}
      onProgramChange={setSelectedProgramId}
    />
  );
}
