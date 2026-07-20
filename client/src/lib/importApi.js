import { apiAuth, apiAuthUpload } from './api.js';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

/**
 * Upload a file for question import
 */
export const uploadDocumentForImport = async (file, tags = []) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tags', JSON.stringify(tags.map(t => ({ name: t.name }))));

    return apiAuthUpload(`${BASE}/api/import/upload`, formData);
};

/**
 * Submit extracted questions to draft
 */
export const submitImportedQuestions = async (questions, programId) => {
    return apiAuth(`${BASE}/api/import/submit`, {
        method: 'POST',
        body: { questions, programId }
    });
};

/**
 * Poll job status
 */
export const getImportJobStatus = async (jobId) => {
    return apiAuth(`${BASE}/api/import/status/${jobId}`);
};
