import { apiAuth, apiAuthUpload } from './api.js';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

/**
 * Fetch current user's import limits and reset times
 */
export const getImportLimits = async () => {
    return apiAuth(`${BASE}/api/import/limits`);
};

/**
 * Uploads a file; its questions are counted and extracted in one request.
 * tags (the subjects) help the AI suggest a subject for each question.
 * The questions are reviewed in QuestionForm and saved through /api/questions.
 */
export const importQuestionsFromFile = async (file, tags = []) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tags', JSON.stringify(tags.map((t) => ({ name: t.name }))));
    return apiAuthUpload(`${BASE}/api/import/extract`, formData);
};
