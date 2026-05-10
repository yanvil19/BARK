import { apiAuth } from '../lib/api';

const BASE_URL = 'http://localhost:5000/api/mock-exam-results';

export const listExamsWithStatus = async () => {
  return await apiAuth(`${BASE_URL}/list`);
};

export const getExamResult = async (examId) => {
  return await apiAuth(`${BASE_URL}/${examId}`);
};

export const computeExamResult = async (examId, passingThreshold = 70) => {
  return await apiAuth(`${BASE_URL}/${examId}/compute`, {
    method: 'POST',
    body: { passingThreshold }
  });
};

export const deleteExamResult = async (examId) => {
  return await apiAuth(`${BASE_URL}/${examId}`, {
    method: 'DELETE'
  });
};
