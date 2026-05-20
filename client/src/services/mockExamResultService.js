import { apiAuth } from '../lib/api';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE_URL = `${import.meta.env.VITE_API_URL}/api/mock-exam-results`;

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
