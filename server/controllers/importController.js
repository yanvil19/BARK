const fileExtractionService = require('../services/fileExtractionService');
const geminiService = require('../services/geminiService');
const {
    saveImportSession,
    getImportSession,
    deleteImportSession,
    getUserImportLimits,
    recordUserImport,
    GeminiLimitError,
} = require('../services/importStateService');

// The import has two steps, each its own request:
//   1. validate-count: read the file, count its questions, keep the text in an import session
//   2. extract: turn the session's text into questions for the review form
// The reviewed questions are saved through the normal question endpoints
// (POST /api/questions and /api/questions/group), never by this controller.

const ALLOWED_MIMES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

// Subject names sent with the extract request, used to suggest a subject
function readTagNames(tags) {
    if (!Array.isArray(tags)) return [];
    return tags
        .filter((tag) => typeof tag?.name === 'string' && tag.name.trim())
        .slice(0, 500)
        .map((tag) => ({ name: tag.name.trim() }));
}

/**
 * GET /api/import/limits
 */
const getLimits = async (req, res) => {
    try {
        const limits = await getUserImportLimits(req.user?._id);
        return res.json({ limits });
    } catch (error) {
        console.error('Get limits error:', error);
        return res.status(500).json({ error: 'Failed to retrieve upload limits' });
    }
};

/**
 * POST /api/import/validate-count
 * Step 1: Extracts text, runs AI question counting, verifies <= 20 questions, and returns token + questionCount
 */
const validateAndCount = async (req, res) => {
    const userId = req.user?._id;

    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const allowedRoles = ['professor', 'program_chair', 'dean'];
        if (!allowedRoles.includes(req.user.role?.toLowerCase())) {
            return res.status(403).json({
                error: 'Only Professors, Chairs, and Deans can import questions.'
            });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const maxSize = parseInt(process.env.IMPORT_MAX_FILE_SIZE_MB || 10, 10) * 1024 * 1024;
        if (req.file.size > maxSize) {
            return res.status(400).json({
                error: 'Your file exceeds the 10MB limit. Please compress or split the document.'
            });
        }

        if (!ALLOWED_MIMES.includes(req.file.mimetype)) {
            return res.status(400).json({
                error: 'Only PDF and DOCX files are supported. Please upload a valid file.'
            });
        }

        // Extract text
        let extractedText = '';
        try {
            extractedText = await fileExtractionService.extractFromFile(
                req.file.buffer,
                req.file.mimetype
            );
        } catch (error) {
            console.error('File extraction error:', error);
            return res.status(400).json({
                error: 'Your file could not be read. It may be corrupted. Please try re-saving and uploading again.'
            });
        }

        // Scanned PDF check
        if (req.file.mimetype === 'application/pdf') {
            if (fileExtractionService.isScannedPDF(extractedText)) {
                return res.status(400).json({
                    error: 'This PDF appears to be scanned. Scanned documents are not supported yet. Please upload a typed PDF or DOCX.'
                });
            }
        }

        // AI Question Counting
        const maxQuestions = parseInt(process.env.IMPORT_MAX_QUESTIONS || 20, 10);
        let questionCount = 0;
        try {
            const countResult = await geminiService.countQuestions(extractedText);
            questionCount = countResult.question_count || 0;
        } catch (error) {
            if (error instanceof GeminiLimitError) {
                return res.status(429).json({ error: error.message });
            }
            console.error('Gemini question count error:', error.message, error.status, error);
            return res.status(503).json({
                error: 'An error occurred while analyzing the document. Please try again.'
            });
        }

        if (questionCount > maxQuestions) {
            // Count this as a used upload attempt even though it's rejected
            await recordUserImport(userId);
            return res.status(400).json({
                error: `Upload failed. The document contains ${questionCount} questions (maximum allowed is ${maxQuestions}). Please lessen the number of questions to ${maxQuestions} or fewer.`,
                limits: await getUserImportLimits(userId),
            });
        }

        if (questionCount === 0) {
            return res.status(400).json({
                error: 'No multiple choice questions could be detected in this document. Please check the formatting and try again.'
            });
        }

        // Kept for 10 minutes, for the extract step
        const token = await saveImportSession({ userId, text: extractedText, questionCount });

        return res.json({
            token,
            questionCount,
        });

    } catch (error) {
        console.error('Validate and count error:', error);
        return res.status(500).json({
            error: 'An unexpected error occurred. Please try again.'
        });
    }
};

/**
 * POST /api/import/extract
 * Step 2: Full question extraction from a pre-counted session token
 */
const extractFromSession = async (req, res) => {
    const userId = req.user?._id;

    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { token } = req.body || {};
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'Session token is required' });
        }

        const session = await getImportSession(token, userId);
        if (!session) {
            return res.status(404).json({ error: 'Session expired or not found. Please upload again.' });
        }

        const { text: extractedText, questionCount } = session;
        const tags = readTagNames(req.body.tags);

        let extractedQuestions = [];
        try {
            extractedQuestions = await geminiService.extractQuestions(extractedText, 0, tags);
        } catch (error) {
            if (error instanceof GeminiLimitError) {
                return res.status(429).json({ error: error.message });
            }
            console.error('Gemini extraction error:', error.message, error.status, error);

            if (error.message?.includes('timeout')) {
                return res.status(503).json({
                    error: 'The extraction is taking longer than expected. Please try again in a moment.'
                });
            } else if (error.message?.includes('JSON')) {
                return res.status(503).json({
                    error: 'Something went wrong during extraction. Please try again.'
                });
            } else {
                return res.status(503).json({
                    error: 'An error occurred during extraction. Please try again.'
                });
            }
        }

        if (!Array.isArray(extractedQuestions) || extractedQuestions.length === 0) {
            return res.status(400).json({
                error: 'No questions could be detected in your document. Please check the formatting and try again.'
            });
        }

        // The document text lets the guardrails drop rationalizations the AI wrote itself
        const processedQuestions = geminiService.processQuestionsWithGuardrails(extractedQuestions, extractedText);
        const validQuestions = processedQuestions.filter(q => q.status !== 'INVALID');
        if (validQuestions.length === 0) {
            return res.status(400).json({
                error: 'No valid questions were found after checking your document. Please review the formatting guide and try again.'
            });
        }

        // Record successful upload in rate-limit counter
        await recordUserImport(userId);
        await deleteImportSession(token);
        const updatedLimits = await getUserImportLimits(userId);

        const stats = {
            total: processedQuestions.length,
            ready: processedQuestions.filter(q => q.status === 'READY').length,
            needsReview: processedQuestions.filter(q => q.status === 'NEEDS_REVIEW').length,
            invalid: processedQuestions.filter(q => q.status === 'INVALID').length
        };

        return res.json({
            questions: processedQuestions,
            stats,
            limits: updatedLimits,
            detectedCount: questionCount || processedQuestions.length,
            message: `${stats.total} questions extracted. ${stats.ready} are ready to submit.`
        });

    } catch (error) {
        console.error('Extract from session error:', error);
        return res.status(500).json({
            error: 'An unexpected error occurred during extraction. Please try again.'
        });
    }
};

module.exports = {
    getLimits,
    validateAndCount,
    extractFromSession,
};
