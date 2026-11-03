const fileExtractionService = require('../services/fileExtractionService');
const geminiService = require('../services/geminiService');
const {
    getUserImportLimits,
    recordUserImport,
    importMaxQuestions,
    GeminiLimitError,
} = require('../services/importStateService');

// The import is one request: POST /api/import/extract reads the uploaded file and
// sends its text to Gemini once. Gemini counts the questions and, when there are
// no more than IMPORT_MAX_QUESTIONS, returns them in the same reply. The file
// text is never stored. The reviewed questions are saved through the normal
// question endpoints (POST /api/questions and /api/questions/group), never by
// this controller.

const ALLOWED_MIMES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

// A file whose own rough count (no AI) is over this is turned away before Gemini
// is asked: a quarter over the limit, and at least 5 over (50 for a limit of
// 40). The margin stops a rough count from turning away a file the AI would accept.
const roughCountCeiling = (maxQuestions) => maxQuestions + Math.max(5, Math.ceil(maxQuestions / 4));

// Subject names sent with the upload, used to suggest a subject. In the form
// data they are a JSON string: [{ "name": "Anatomy" }, ...]
function readTagNames(raw) {
    let tags = raw;
    if (typeof raw === 'string') {
        try {
            tags = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(tags)) return [];
    return tags
        .filter((tag) => typeof tag?.name === 'string' && tag.name.trim())
        .slice(0, 500)
        .map((tag) => ({ name: tag.name.trim() }));
}

function tooManyQuestionsMessage(count, max, { rough = false } = {}) {
    const amount = rough ? `about ${count}` : `${count}`;
    return `Upload failed. The document contains ${amount} questions (maximum allowed is ${max}). Please lessen the number of questions to ${max} or fewer.`;
}

function extractionErrorMessage(error) {
    const message = error?.message || '';
    if (/timeout|timed out/i.test(message)) {
        return 'The extraction is taking longer than expected. Please try again in a moment.';
    }
    if (message.includes('JSON')) {
        return 'Something went wrong during extraction. Please try again.';
    }
    return 'An error occurred during extraction. Please try again.';
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
 * POST /api/import/extract (multipart form: file, tags)
 * Reads the file, then counts and extracts its questions in one Gemini request.
 */
const importQuestions = async (req, res) => {
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

        if (req.file.mimetype === 'application/pdf' && fileExtractionService.isScannedPDF(extractedText)) {
            return res.status(400).json({
                error: 'This PDF appears to be scanned. Scanned documents are not supported yet. Please upload a typed PDF or DOCX.'
            });
        }

        const maxQuestions = importMaxQuestions();

        // A file that clearly has too many questions is turned away without asking
        // Gemini. No request was sent, so it does not use up one of the user's uploads.
        const roughCount = fileExtractionService.estimateQuestionCount(extractedText);
        if (roughCount > roughCountCeiling(maxQuestions)) {
            return res.status(400).json({
                error: tooManyQuestionsMessage(roughCount, maxQuestions, { rough: true }),
                limits: await getUserImportLimits(userId),
            });
        }

        let extraction;
        try {
            extraction = await geminiService.extractQuestions(
                extractedText,
                readTagNames(req.body?.tags),
                { maxQuestions }
            );
        } catch (error) {
            if (error instanceof GeminiLimitError) {
                return res.status(429).json({ error: error.message });
            }
            console.error('Gemini extraction error:', error.message, error.status, error);
            return res.status(503).json({ error: extractionErrorMessage(error) });
        }

        const { questionCount, questions } = extraction;

        if (questionCount > maxQuestions) {
            // Gemini was asked, so this counts as one of the user's uploads
            await recordUserImport(userId);
            return res.status(400).json({
                error: tooManyQuestionsMessage(questionCount, maxQuestions),
                limits: await getUserImportLimits(userId),
            });
        }

        if (questions.length === 0) {
            return res.status(400).json({
                error: 'No multiple choice questions could be detected in this document. Please check the formatting and try again.'
            });
        }

        // The document text lets the guardrails drop rationalizations the AI wrote itself
        const processedQuestions = geminiService.processQuestionsWithGuardrails(questions, extractedText);
        const validQuestions = processedQuestions.filter(q => q.status !== 'INVALID');
        if (validQuestions.length === 0) {
            return res.status(400).json({
                error: 'No valid questions were found after checking your document. Please review the formatting guide and try again.'
            });
        }

        await recordUserImport(userId);
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
            detectedCount: questionCount,
            message: `${stats.total} questions extracted. ${stats.ready} are ready to submit.`
        });

    } catch (error) {
        console.error('Import error:', error);
        return res.status(500).json({
            error: 'An unexpected error occurred during extraction. Please try again.'
        });
    }
};

module.exports = {
    getLimits,
    importQuestions,
};
