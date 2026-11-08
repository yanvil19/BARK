const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
    GeminiLimitError,
    noModelAvailableError,
    reserveGeminiCall,
    recordGeminiOutcome,
    setModelCooldown,
    importMaxQuestions,
} = require('./importStateService');
const { getGeminiModels } = require('../config/geminiModels');
const { nextPacificMidnight } = require('../utils/pacificTime');
const {
    OVERVIEW_INSTRUCTION,
    OVERVIEW_SCHEMA,
    buildOverviewPrompt,
    checkOverviewContent,
} = require('./examOverviewContent');

const MINUTE_MS = 60 * 1000;
// An overview request that takes longer is given up and tried again
const EXAM_OVERVIEW_TIMEOUT_MS = 60 * 1000;

// ── Choosing a model ────────────────────────────────────────────────────────
// Requests go to the models in config/geminiModels.js in order. A model that is
// out of quota (Google answers 429) or missing (404) gets a cooldown and the next
// model is tried. A passing problem (timeout, 5xx, a reply that is not valid
// JSON) is retried once on the same model, then the next model is tried. Any
// other error (bad request, bad API key, blocked content) would fail on every
// model, so it is returned at once.

const MISSING_MODEL_COOLDOWN_MS = 60 * MINUTE_MS;
const DEFAULT_QUOTA_COOLDOWN_MS = MINUTE_MS;
const MIN_QUOTA_COOLDOWN_MS = 5 * 1000;
const MAX_QUOTA_COOLDOWN_MS = 15 * MINUTE_MS;

function isQuotaError(error) {
    return error?.status === 429 || /RESOURCE_EXHAUSTED/.test(error?.message || '');
}

function isMissingModel(error) {
    return error?.status === 404;
}

function isPassingError(error) {
    return (
        [500, 502, 503, 504].includes(error?.status) ||
        error instanceof SyntaxError ||
        /timeout|timed out|Unexpected token|not the expected JSON|fetch failed/i.test(error?.message || '')
    );
}

// "31s" or "1.5s" → milliseconds
function parseRetryDelay(value) {
    const match = String(value || '').match(/^(\d+(?:\.\d+)?)s$/);
    return match ? Math.ceil(parseFloat(match[1]) * 1000) : null;
}

// How long to skip a model after Google turned a request away. A 429 carries the
// quota that was hit (QuotaFailure) and how long to wait (RetryInfo). For a daily
// quota the wait Google gives can be far too short, so the model waits for the
// daily reset instead.
function cooldownFor(error, now = Date.now()) {
    if (isMissingModel(error)) {
        return {
            reason: 'unavailable',
            until: new Date(now + MISSING_MODEL_COOLDOWN_MS),
            message: 'Google says this model does not exist or is not available to this API key. It is tried again after an hour.',
        };
    }

    const details = Array.isArray(error?.errorDetails) ? error.errorDetails : [];
    const typeOf = (detail) => String(detail?.['@type'] || '');
    const quotaIds = details
        .filter((detail) => typeOf(detail).endsWith('QuotaFailure'))
        .flatMap((detail) => detail.violations || [])
        .map((violation) => String(violation?.quotaId || ''));

    if (quotaIds.some((id) => /PerDay/i.test(id))) {
        return { reason: 'day', until: nextPacificMidnight(now), message: "Google's daily limit for this model was reached." };
    }

    const retryDelay = parseRetryDelay(details.find((detail) => typeOf(detail).endsWith('RetryInfo'))?.retryDelay);
    const wait = Math.min(Math.max(retryDelay ?? DEFAULT_QUOTA_COOLDOWN_MS, MIN_QUOTA_COOLDOWN_MS), MAX_QUOTA_COOLDOWN_MS);
    return { reason: 'minute', until: new Date(now + wait), message: "Google's per-minute limit for this model was reached." };
}

// One request does the whole import: the model counts the questions and, when
// there are no more than maxQuestions, extracts them in the same reply.
const extractionPrompt = (maxQuestions) => `You are a document parser for a board exam question extraction system.
Your job is to count and extract the multiple choice questions in the provided document text.

You must return ONLY a valid JSON object. Do not include any explanation,
markdown formatting, code fences, or text outside the JSON object.

The object must have this exact structure:
{
  "question_count": <integer — the number of multiple choice questions in the document (rule 19)>,
  "questions": <array — the extracted questions in document order. An empty array [] when question_count is more than ${maxQuestions}>
}

Each question in the "questions" array must follow this exact structure:
{
  "question_number": <integer — the order the question appears in the document>,
  "question_text": <string — the question stem ONLY. Do NOT include the multiple choice options or the correct answer label here>,
  "options": {
    "A": <string — option A text>,
    "B": <string — option B text>,
    "C": <string — option C text>,
    "D": <string — option D text>,
    "E": <string — option E text if present, otherwise null>
  },
  "correct_answer": <string — must be "A", "B", "C", "D", or "E".
                    If the correct answer is indicated by bold, asterisk,
                    underline, checked box, or any other marker, extract it.
                    If no correct answer can be identified, return null>,
  "rationalization": <string — the explanation the document itself gives for this question's answer,
                     copied exactly: the text after the question's "Rationalization:" (or "Explanation:") label,
                     or the explanation written for this question in an answer key.
                     Never write, finish, shorten or improve one yourself.
                     Return an empty string "" when the document gives no explanation>,
  "has_image": <boolean — true if the question references a figure,
               diagram, or image. false if not>,
  "image_reference": <string — the figure label referenced
                     e.g. "Figure 1", "Fig. 2". null if has_image is false>,
  "image_required": <boolean — true if the question references an image, diagram, figure, chart, or any visual element that cannot be extracted as text and MUST be uploaded by the professor. false if not>,
  "image_note": <string — brief description of what the image appears to be (e.g. "Question references a diagram showing a cardiac cycle"). null if image_required is false>,
  "suggested_tag": <string — your best guess at the subject or topic
                   of this question based on its content.
                   Return null if you cannot determine it>,
  "suggested_tag_confidence": <string — "high" if you are very confident the suggested_tag
                              matches an existing tag in the provided tag list.
                              "low" if uncertain or if no tag list was provided>,
  "confidence": <string — "high" if you are confident all fields are
                correct. "low" if any field is uncertain or ambiguous>,
  "set_id": <integer or null — questions that share one passage, case or scenario
            get the same set number (1, 2, 3 …, in document order).
            null for a standalone question>,
  "shared_passage": <string or null — for a question in a set, the full shared passage
                    exactly as written, the same text on every question of that set.
                    null for a standalone question>
}

Rules you must strictly follow:
1. Only extract questions that are clearly multiple choice format.
2. If a question has fewer than 4 options or more than 5 options,
   still extract it but set confidence to "low".
3. If the document contains no questions, return {"question_count": 0, "questions": []}
4. If question text is unclear or cut off, extract what you can
   and set confidence to "low".
5. Never invent or assume answer choices that are not in the document.
6. Never invent or assume a correct answer. Only mark it if it is
   clearly indicated in the document: by a marker on the option, an "Answer:" line,
   or an answer key (a list of answers, often at the end of the document).
7. Preserve the exact wording of questions and options.
   Do not paraphrase or correct grammar.
8. If options are labeled 1/2/3/4 instead of A/B/C/D, map them to A/B/C/D.
9. Extract all multiple choice questions found in the document, unless there are too many (rule 19).
10. For suggested_tag: if a tag list is provided at the top of the document text,
    you must only suggest tags from that list. Set suggested_tag_confidence to "high"
    only if you are confident the question clearly belongs to one of the provided tags.
    If no tag list is provided, suggest freely but set suggested_tag_confidence to "low".
11. EXCLUSION RULE: The "question_text" field must only contain the question stem itself. Do NOT include the options (A, B, C, D) or any text indicating the correct answer (e.g., "Answer: A") in this field. Those belong in the "options" and "correct_answer" fields respectively.
12. RATIONALIZATION RULE: The "rationalization" field only holds an explanation that is written in the document.
    - Take it from the question's "Rationalization:" or "Explanation:" text, or from the explanation given for this question in an answer key.
    - Copy it exactly, keeping its <b>, <i>, <u> tags and $…$ math. Do not summarize, extend, complete, correct or reword it.
    - An answer key that only gives the letter (for example "1. B") has no rationalization.
    - If the document gives no explanation for a question, set rationalization to an empty string "". Never write one yourself, even when you know why the answer is correct.
    - A missing rationalization is normal and does not make confidence "low".
13. IMAGE DETECTION: For "image_required" and "image_note":
    - Set image_required to true if the question explicitly references: "Figure [X]", "Diagram", "Chart", "Graph", "Image", "Picture", "Illustration", "See above/below", "See attached", or similar visual references that cannot be extracted as text.
    - Set image_required to false if the question does not reference any visual elements.
    - If image_required is true, provide a brief description in image_note of what the image should contain (e.g., "Figure 1: Cardiac cycle diagram", "ECG waveform showing P-QRS-T waves").
    - If image_required is false, set image_note to null.
    - The marker [IMAGE] means a picture was embedded at that spot in the document. A question, option or passage containing [IMAGE] needs image_required true (for a shared passage, on every question of the set). Remove the [IMAGE] marker from all text fields.
14. FORMATTING: The document text marks bold, italic and underlined words with <b>…</b>, <i>…</i> and <u>…</u> tags.
    - Copy these tags into question_text, options, shared_passage and rationalization exactly where they appear in the document.
    - Do not add any other HTML tags, and never use Markdown (no **, __ or #).
    - If bold, underline or similar formatting is used only to mark the correct answer, set correct_answer from it and remove those tags from that option's text.
15. MATH: Equations are written as LaTeX between $ signs, e.g. $x^{2}+3x-4=0$.
    - Copy every $…$ equation exactly, character for character, into the field where it appears. Never change, simplify or "fix" the LaTeX, and never drop the $ signs.
    - Math written with \\( … \\), \\[ … \\] or $$ … $$ should be copied as $…$.
    - Outside $…$ everything is plain text. Copy symbols there exactly as the Unicode characters in the document (≠, −, ×, ÷, ±, θ, π, °, ², √ and so on). Never write a LaTeX command (anything starting with a backslash, such as \\text, \\theta or \\textminus) outside $…$.
16. QUESTION SETS: Several questions can share one passage, case or scenario.
    - Questions between "SET START" and "SET END" form one set; the text after "Passage:" (or the text before the first question of the set) is the shared passage.
    - Also treat phrasing like "Questions 4–6 refer to the following…" or "Use the case below to answer the next three questions" as a set.
    - Give every question of a set the same set_id and the same shared_passage. Do not repeat the passage inside question_text.
    - A set needs at least 2 questions. If only one question uses a passage, set set_id and shared_passage to null and put the passage at the start of question_text instead.
    - Do not include the "SET START", "SET END" or "Passage:" labels in any field.
17. TEMPLATE LABELS: Documents made from the import template use these labels:
    - "Question 1." (or "1.") starts a question; "A." to "E." are the options.
    - "Answer: B" gives the correct answer.
    - "Rationalization:" gives the explanation. Copy it exactly (keeping its tags and $…$ math). A question without a "Rationalization:" line gets rationalization "" (rule 12).
    - "Subject:" names the subject; use it as suggested_tag (rule 10 still applies). A "Subject:" line inside a set applies to every question of that set.
    - Never include these labels themselves in any field.
18. Ignore any section titled "HOW TO USE THIS TEMPLATE" — it is help text, not questions.
19. QUESTION LIMIT: A file may hold at most ${maxQuestions} questions.
    - First count the multiple choice questions. Each question of a set counts as one; a shared passage, a heading, an instruction, an option or an answer key line is not a question.
    - If there are more than ${maxQuestions}, return {"question_count": <that number>, "questions": []} and extract nothing.
    - Otherwise extract every question, and question_count must equal the number of questions you return.`;

// The reply is { question_count, questions }. A bare array is read as the
// questions. The count is never lower than the number of questions returned.
function readExtraction(data) {
    const questions = Array.isArray(data) ? data : data?.questions;
    if (!Array.isArray(questions)) {
        throw new Error('Response is not the expected JSON object');
    }
    const reported = Number.parseInt(data?.question_count, 10);
    return {
        questionCount: Math.max(Number.isFinite(reported) ? reported : 0, questions.length),
        questions: questions.filter((question) => question && typeof question === 'object'),
    };
}

// LaTeX commands that start with "n", so "\neq" inside math is not read as a newline + "eq".
const LATEX_N_COMMANDS = new Set([
    'ne', 'neq', 'neg', 'nu', 'nabla', 'ni', 'not', 'notin', 'nmid', 'nleq', 'ngeq', 'nless', 'ngtr',
    'nsubset', 'nsupset', 'nsubseteq', 'nsupseteq', 'nexists', 'nparallel', 'natural', 'nearrow',
    'nwarrow', 'nsim', 'ncong', 'nrightarrow', 'nleftarrow', 'nRightarrow', 'nLeftarrow',
    'nleftrightarrow', 'nLeftrightarrow', 'nvdash', 'nprec', 'nsucc', 'newline', 'nolimits',
]);
const isAsciiLetter = (ch) => !!ch && /[A-Za-z]/.test(ch);

/**
 * Gemini often writes LaTeX into its JSON without escaping the backslashes
 * ("$\sqrt{2}$" instead of "$\\sqrt{2}$"). JSON.parse then either rejects the whole
 * response (\s, \i and \R are not JSON escapes) or quietly turns \frac, \times and
 * \neq into a form feed, a tab and a newline. This doubles every backslash in a
 * string value that is LaTeX rather than a JSON escape. Correctly escaped JSON
 * comes out unchanged.
 */
function escapeLatexBackslashes(raw) {
    let out = '';
    let inString = false;
    let inMath = false;

    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (!inString) {
            if (ch === '"') { inString = true; inMath = false; }
            out += ch;
            continue;
        }
        if (ch === '"') { inString = false; out += ch; continue; }
        if (ch === '$') {
            if (raw[i + 1] === '$') { out += '$'; i++; }
            out += '$';
            inMath = !inMath;
            continue;
        }
        if (ch !== '\\') { out += ch; continue; }

        const next = raw[i + 1];
        let afterBackslash; // the character that follows the backslash in the decoded text
        if (next === '\\') {
            out += '\\\\';
            i++;
            afterBackslash = raw[i + 1];
        } else {
            const word = (raw.slice(i + 1).match(/^[A-Za-z]+/) || [''])[0];
            const isJsonEscape =
                next === '"' || next === '/' ||
                (next === 'u' && /^[0-9a-fA-F]{4}/.test(raw.slice(i + 2, i + 6))) ||
                // \b and \f before a letter are \beta, \frac…; \t, \r, \n before a letter inside math are \times, \right, \neq…
                (next === 'b' || next === 'f'
                    ? !isAsciiLetter(raw[i + 2])
                    : (next === 't' || next === 'r')
                        ? !(inMath && isAsciiLetter(raw[i + 2]))
                        : next === 'n' && !(inMath && LATEX_N_COMMANDS.has(word)));
            if (isJsonEscape) {
                out += ch + next;
                i++;
                continue;
            }
            out += '\\\\';
            afterBackslash = next;
        }

        // \$ is a literal dollar sign; \( \[ and \) \] open and close math.
        if (afterBackslash === '$') { out += '$'; i++; }
        else if (afterBackslash === '(' || afterBackslash === '[') inMath = true;
        else if (afterBackslash === ')' || afterBackslash === ']') inMath = false;
    }
    return out;
}

/**
 * Letters and digits only, in lower case, with tags, [IMAGE] markers, spacing,
 * punctuation and math delimiters removed. Used to tell whether a piece of text
 * appears in the document even when the AI changed its spacing or formatting.
 */
function toComparableText(text) {
    return String(text || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\[IMAGE\]/gi, ' ')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '');
}

const RATIONALIZATION_REMOVED_MESSAGE =
    'The AI returned a rationalization that is not in your document, so it was left blank. Add one yourself if you want.';

class GeminiService {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not set in environment variables');
        }
        this.client = new GoogleGenerativeAI(apiKey);
    }

    /**
     * Runs `run(modelName)` on the first model that can take it (see "Choosing a
     * model" above). Every request is counted toward its model's limits.
     * Throws GeminiLimitError when no model can take the request.
     */
    async callWithFallback(task, run, { retryDelayMs = 2000 } = {}) {
        const limitReasons = [];
        let passingError = null;

        for (const model of getGeminiModels()) {
            for (let attempt = 1; attempt <= 2; attempt += 1) {
                let usageId;
                try {
                    usageId = await reserveGeminiCall(model);
                } catch (error) {
                    if (!(error instanceof GeminiLimitError)) throw error;
                    limitReasons.push(error.reason);
                    break; // this model is at its limit or cooling down
                }

                try {
                    const result = await run(model.name);
                    await recordGeminiOutcome(usageId, 'success');
                    return result;
                } catch (error) {
                    if (isQuotaError(error) || isMissingModel(error)) {
                        await recordGeminiOutcome(usageId, isQuotaError(error) ? 'rate_limited' : 'failed');
                        const cooldown = cooldownFor(error);
                        await setModelCooldown(model.name, cooldown);
                        console.warn(`Gemini ${task}: ${model.name} is skipped until ${cooldown.until.toISOString()} (${cooldown.reason}).`);
                        limitReasons.push(cooldown.reason === 'minute' ? 'minute' : 'day');
                        break;
                    }

                    await recordGeminiOutcome(usageId, 'failed');
                    if (!isPassingError(error)) throw error;
                    passingError = error;
                    if (attempt === 1) {
                        console.log(`Retrying Gemini ${task} on ${model.name}...`);
                        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                    }
                }
            }
        }

        // Every model failed. When one frees up within a minute, "try again in a
        // minute" is the useful answer; otherwise report the last real error, or
        // that no model has room until tomorrow.
        if (passingError && !limitReasons.includes('minute')) throw passingError;
        throw noModelAvailableError(limitReasons);
    }

    /**
     * Parses a JSON response from the model, keeping LaTeX backslashes intact.
     */
    parseModelJson(raw) {
        return JSON.parse(escapeLatexBackslashes(raw));
    }

    /**
     * Preprocesses extracted text to clean up noise
     */
    preprocessText(text) {
        // Remove repeated page headers/footers and excessive blank lines
        let cleaned = text
            // Collapse 3+ blank lines to 1
            .replace(/\n\n\n+/g, '\n\n')
            // Remove standalone page numbers
            .replace(/^\s*Page \d+\s*$/gm, '')
            // Remove common headers/footers (simple heuristic)
            .replace(/^\s*(Header|Footer|---)\s*$/gm, '');

        return cleaned.trim();
    }

    /**
     * Builds a tag context prefix to prepend to the document text.
     * This tells Gemini which tags are available to pick from.
     */
    buildTagContext(tags = []) {
        if (!tags || tags.length === 0) return '';

        const tagNames = tags.map(t => t.name).join(', ');
        return `[AVAILABLE TAGS — you must only suggest tags from this list]: ${tagNames}\n\n`;
    }

    /**
     * Counts and extracts the questions in one Gemini request. tags (subject
     * names) guide the suggested subject. Returns { questionCount, questions };
     * questions is empty when questionCount is over maxQuestions.
     */
    async extractQuestions(documentText, tags = [], { maxQuestions = importMaxQuestions() } = {}) {
        const cleanedText = this.preprocessText(documentText);
        const fullPrompt = this.buildTagContext(tags) + cleanedText;
        const systemInstruction = extractionPrompt(maxQuestions);

        return this.callWithFallback('extraction', async (modelName) => {
            const response = await this.client.getGenerativeModel({
                model: modelName,
                systemInstruction
            }).generateContent({
                contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    // The model copies what the document says; it should not be creative
                    temperature: 0
                }
            });

            return readExtraction(this.parseModelJson(response.response.text()));
        }, { retryDelayMs: 3000 });
    }

    /**
     * Writes the words of an exam's AI overview from its figures (services/
     * examOverviewFacts.js). The answer is checked against the figures before it is
     * returned (services/examOverviewContent.js); one that cannot be used is tried
     * again like any passing error. Returns { model, content }.
     */
    async writeExamOverview(facts) {
        const prompt = buildOverviewPrompt(facts);

        return this.callWithFallback('exam overview', async (modelName) => {
            const response = await this.client.getGenerativeModel(
                { model: modelName, systemInstruction: OVERVIEW_INSTRUCTION },
                { timeout: EXAM_OVERVIEW_TIMEOUT_MS }
            ).generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: OVERVIEW_SCHEMA,
                    // Some freedom in the wording, none in the facts
                    temperature: 0.3
                }
            });

            const content = checkOverviewContent(this.parseModelJson(response.response.text()), facts);
            return { model: modelName, content };
        }, { retryDelayMs: 2000 });
    }

    addGuardrailFlags(question) {
        const flags = [];
        let blockerCount = 0;

        // 1. Missing text check (Critical extraction failure)
        if (!question.question_text || question.question_text.trim() === '') {
            flags.push({
                severity: 'BLOCKER',
                message: 'Question text could not be extracted.'
            });
            blockerCount++;
        }

        // 2. Image reference check (Human action needed)
        if (question.has_image) {
            flags.push({
                severity: 'WARNING',
                message: 'This question references an image that could not be automatically linked. Please upload it manually.'
            });
        }

        // 3. AI confidence check
        if (question.confidence === 'low') {
            flags.push({
                severity: 'WARNING',
                message: 'AI was not confident about this extraction. Please review carefully.'
            });
        }

        // 4. A rationalization the AI wrote itself was removed (see keepDocumentRationalization)
        if (question.rationalization_removed) {
            flags.push({
                severity: 'WARNING',
                message: RATIONALIZATION_REMOVED_MESSAGE
            });
        }

        // Compute status
        let status = 'READY';
        if (blockerCount > 0) {
            status = 'INVALID';
        } else if (flags.length > 0) {
            status = 'NEEDS_REVIEW';
        }

        return {
            ...question,
            flags,
            status
        };
    }

    /**
     * Makes the AI's question sets consistent: every question of a set gets the
     * set's passage, and a "set" with a single question becomes a standalone
     * question with the passage at the start of its text (a set needs 2+).
     */
    normalizeQuestionSets(questions) {
        const setIdOf = (q) => (
            q.set_id === null || q.set_id === undefined || String(q.set_id).trim() === ''
                ? null
                : String(q.set_id).trim()
        );

        const memberCounts = new Map();
        const passages = new Map();
        for (const q of questions) {
            const id = setIdOf(q);
            if (!id) continue;
            memberCounts.set(id, (memberCounts.get(id) || 0) + 1);
            const passage = typeof q.shared_passage === 'string' ? q.shared_passage.trim() : '';
            if (passage && !passages.has(id)) passages.set(id, passage);
        }

        return questions.map((q) => {
            const id = setIdOf(q);
            if (!id) return { ...q, set_id: null, shared_passage: null };

            const passage = passages.get(id) || '';
            if (memberCounts.get(id) < 2) {
                const text = q.question_text || '';
                return {
                    ...q,
                    set_id: null,
                    shared_passage: null,
                    question_text: passage ? `${passage}\n\n${text}` : text,
                };
            }

            return { ...q, set_id: id, shared_passage: passage || null };
        });
    }

    /**
     * A rationalization may only be one the document gives. One that cannot be
     * found in the document text was written by the AI, so it is removed and the
     * question is flagged. Without the document text nothing is checked.
     */
    keepDocumentRationalization(question, comparableDocument) {
        const rationalization = typeof question.rationalization === 'string' ? question.rationalization.trim() : '';
        if (!rationalization) return { ...question, rationalization: '' };
        if (comparableDocument === null) return { ...question, rationalization };

        const comparable = toComparableText(rationalization);
        if (!comparable || comparableDocument.includes(comparable)) {
            return { ...question, rationalization };
        }
        return { ...question, rationalization: '', rationalization_removed: true };
    }

    /**
     * Process all extracted questions with guardrails. documentText is the text
     * the questions were extracted from.
     */
    processQuestionsWithGuardrails(questions, documentText = null) {
        const comparableDocument = typeof documentText === 'string' ? toComparableText(documentText) : null;
        return this.normalizeQuestionSets(questions)
            .map(q => this.keepDocumentRationalization(q, comparableDocument))
            .map(q => this.addGuardrailFlags(q));
    }
}

module.exports = new GeminiService();
module.exports.toComparableText = toComparableText;
module.exports.cooldownFor = cooldownFor;
