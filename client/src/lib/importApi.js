// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

/**
 * Upload a file for question import
 */
export const uploadDocumentForImport = async (file, tags = []) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tags', JSON.stringify(tags.map(t => ({ name: t.name }))));

    const response = await fetch(`${BASE}/api/import/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData
    });

    if (!response.ok) {
        const text = await response.text();
        try {
            const json = JSON.parse(text);
            throw new Error(json.error || 'Upload failed');
        } catch {
            throw new Error(text || 'Upload failed');
        }
    }

    return response.json();
};

/**
 * Submit extracted questions to draft
 */
export const submitImportedQuestions = async (questions, programId) => {
    const response = await fetch(`${BASE}/api/import/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ questions, programId })
    });

    if (!response.ok) {
        const text = await response.text();
        try {
            const json = JSON.parse(text);
            throw new Error(json.error || 'Submit failed');
        } catch {
            throw new Error(text || 'Submit failed');
        }
    }

    return response.json();
};

/**
 * Poll job status
 */
export const getImportJobStatus = async (jobId) => {
    const response = await fetch(`${BASE}/api/import/status/${jobId}`, {
        credentials: 'include',
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Status check failed');
    }

    return response.json();
};
