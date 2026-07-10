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

export const deleteExamResult = async (examId) => {
  return await apiAuth(`${BASE}/${examId}`, {
    method: 'DELETE'
  });
};

export const getExamStudentResults = async (examId) => {
  return await apiAuth(`${BASE}/${examId}/students`);
};
