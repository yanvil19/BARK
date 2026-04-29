const BASE = 'http://localhost:5000';

/**
 * Upload a file for question import
 */
export const uploadDocumentForImport = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${BASE}/api/import/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('nu_board_token')}`,
        },
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
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('nu_board_token')}`,
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
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('nu_board_token')}`,
        }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Status check failed');
    }

    return response.json();
};