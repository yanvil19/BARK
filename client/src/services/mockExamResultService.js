import { apiAuth } from '../lib/api';

const BASE = '/api/mock-exam-results';

export const listExamsWithStatus = async () => {
  return await apiAuth(`${BASE}/list`);
};

export const getExamResult = async (examId) => {
  return await apiAuth(`${BASE}/${examId}`);
};

export const computeExamResult = async (examId, passingThreshold = 70) => {
  return await apiAuth(`${BASE}/${examId}/compute`, {
    method: 'POST',
    body: { passingThreshold }
  });
};

export const getExamStudentResults = async (examId) => {
  return await apiAuth(`${BASE}/${examId}/students`);
};

// The AI overview of an exam's results: its versions, how many generations are left, and the
// overview asked for (the latest unless version is given)
export const getExamAiOverview = async (examId, version = null) => {
  const query = version ? `?version=${encodeURIComponent(version)}` : '';
  return await apiAuth(`${BASE}/${examId}/ai-overview${query}`);
};

// Generates a new version of the AI overview, using one of the exam's generations
export const generateExamAiOverview = async (examId) => {
  return await apiAuth(`${BASE}/${examId}/ai-overview`, { method: 'POST', body: {} });
};
