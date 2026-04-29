const fileExtractionService = require('../services/fileExtractionService');
const geminiService = require('../services/geminiService');
const { markImportStart, markImportEnd } = require('../middleware/importRateLimit');
const Question = require('../models/Question');

// In-memory session store (replaces Redis cache)
const importSessions = new Map();

/**
 * POST /api/import/upload
 */
const uploadAndExtract = async (req, res) => {
    const userId = req.user?._id?.toString();

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

        const maxSize = parseInt(process.env.IMPORT_MAX_FILE_SIZE_MB || 10) * 1024 * 1024;
        if (req.file.size > maxSize) {
            return res.status(400).json({
                error: 'Your file exceeds the 10MB limit. Please compress or split the document.'
            });
        }

        const allowedMimes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        if (!allowedMimes.includes(req.file.mimetype)) {
            return res.status(400).json({
                error: 'Only PDF and DOCX files are supported. Please upload a valid file.'
            });
        }

        // ===== EXTRACT TEXT =====
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

        // ===== SCANNED PDF CHECK =====
        if (req.file.mimetype === 'application/pdf') {
            if (fileExtractionService.isScannedPDF(extractedText)) {
                return res.status(400).json({
                    error: 'This PDF appears to be scanned. Scanned documents are not supported yet. Please upload a typed PDF or DOCX.'
                });
            }
        }

        // ===== PRE-COUNT QUESTION BLOCKS =====
        const questionCount = fileExtractionService.countQuestionBlocks(extractedText);
        const maxQuestions = parseInt(process.env.IMPORT_MAX_QUESTIONS || 20);
        if (questionCount > maxQuestions) {
            return res.status(400).json({
                error: `More than ${maxQuestions} questions were detected. Please split into multiple uploads of ${maxQuestions} or fewer.`
            });
        }

        // ===== SET ACTIVE IMPORT =====
        markImportStart(userId);
        const jobId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // ===== CALL GEMINI =====
        let extractedQuestions = [];
        try {
            extractedQuestions = await geminiService.extractQuestions(extractedText);
        } catch (error) {
            console.error('Gemini extraction error:', error);
            markImportEnd(userId);

            if (error.message?.includes('timeout')) {
                return res.status(503).json({
                    error: 'The extraction is taking longer than expected. Please try again in a moment.'
                });
            } else if (error.message?.includes('JSON')) {
                return res.status(503).json({
                    error: 'Something went wrong during extraction. Please try again. If this persists, try reformatting your document.'
                });
            } else {
                return res.status(503).json({
                    error: 'An error occurred during extraction. Please try again.'
                });
            }
        }

        // ===== EMPTY RESPONSE CHECK =====
        if (!Array.isArray(extractedQuestions) || extractedQuestions.length === 0) {
            markImportEnd(userId);
            return res.status(400).json({
                error: 'No questions could be detected in your document. Please check the formatting and try again.'
            });
        }

        // ===== GUARDRAIL FLAGS =====
        const processedQuestions = geminiService.processQuestionsWithGuardrails(extractedQuestions);

        const validQuestions = processedQuestions.filter(q => q.status !== 'INVALID');
        if (validQuestions.length === 0) {
            markImportEnd(userId);
            return res.status(400).json({
                error: 'No valid questions were found after checking your document. Please review the formatting guide and try again.'
            });
        }

        // ===== STATS =====
        const stats = {
            total: processedQuestions.length,
            ready: processedQuestions.filter(q => q.status === 'READY').length,
            needsReview: processedQuestions.filter(q => q.status === 'NEEDS_REVIEW').length,
            invalid: processedQuestions.filter(q => q.status === 'INVALID').length
        };

        // ===== STORE SESSION IN MEMORY =====
        importSessions.set(jobId, {
            userId,
            questions: processedQuestions,
            stats,
            createdAt: new Date().toISOString()
        });

        // Auto-expire session after 1 hour
        setTimeout(() => importSessions.delete(jobId), 60 * 60 * 1000);

        // Mark import complete — user can start another one
        markImportEnd(userId);

        return res.json({
            jobId,
            questions: processedQuestions,
            stats,
            message: `${stats.total} questions extracted. ${stats.ready} are ready to submit.`
        });

    } catch (error) {
        console.error('Import upload error:', error);
        markImportEnd(userId);
        return res.status(500).json({
            error: 'An unexpected error occurred. Please try again.'
        });
    }
};

/**
 * GET /api/import/status/:jobId
 */
const getStatus = async (req, res) => {
    try {
        const { jobId } = req.params;
        const session = importSessions.get(jobId);

        if (!session) {
            return res.status(404).json({ error: 'Job not found or expired' });
        }

        return res.json(session);
    } catch (error) {
        console.error('Status check error:', error);
        return res.status(500).json({ error: 'Failed to check status' });
    }
};

/**
 * POST /api/import/submit
 */
const submitQuestions = async (req, res) => {
    const userId = req.user?._id?.toString();

    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { questions } = req.body;

        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'No questions provided' });
        }

        const readyQuestions = questions.filter(q => q.status === 'READY');
        if (readyQuestions.length === 0) {
            return res.status(400).json({ error: 'No valid questions to submit' });
        }

        const savedQuestions = [];
        let errorCount = 0;

        for (const geminiQ of readyQuestions) {
            try {
                const answers = [];

                for (const [key, text] of Object.entries(geminiQ.options || {})) {
                    if (text) {
                        answers.push({
                            text,
                            isCorrect: key === geminiQ.correct_answer
                        });
                    }
                }

                if (answers.length < 4) {
                    errorCount++;
                    continue;
                }

                const newQuestion = new Question({
                    title: geminiQ.question_text?.substring(0, 100) || 'Imported Question',
                    description: geminiQ.question_text,
                    answers,
                    tag: geminiQ.selected_tag || null,
                    program: req.user.programId || req.body.programId,
                    createdBy: req.user._id,
                    state: 'draft',
                    import_source: 'ai_import'
                });

                const saved = await newQuestion.save();
                savedQuestions.push({
                    _id: saved._id,
                    question_number: geminiQ.question_number,
                    title: saved.title
                });

            } catch (error) {
                console.error('Error saving individual question:', error);
                errorCount++;
            }
        }

        return res.json({
            success: true,
            saved: savedQuestions.length,
            skipped: errorCount,
            questions: savedQuestions,
            message: `${savedQuestions.length} questions imported successfully and saved to drafts.`
        });

    } catch (error) {
        console.error('Submit questions error:', error);
        return res.status(500).json({
            error: 'Failed to save questions. Please try again.'
        });
    }
};

module.exports = {
    uploadAndExtract,
    getStatus,
    submitQuestions
};