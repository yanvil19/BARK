const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_SYSTEM_PROMPT = `You are a document parser for a board exam question extraction system.
Your job is to extract multiple choice questions from the provided document text.

You must return ONLY a valid JSON array. Do not include any explanation,
markdown formatting, code fences, or text outside the JSON array.

Each question in the array must follow this exact structure:
{
  "question_number": <integer — the order the question appears in the document>,
  "question_text": <string — the question stem ONLY. Do NOT include the multiple choice options or the correct answer label here>,
  "question_title": <string — a 3 to 5 word summary of the question's core topic.
                    Do NOT copy the question verbatim. Write a short, descriptive title
                    e.g. "Cardiac Output Calculation", "OSI Model Layers", "Contract Law Offer".
                    Never exceed 5 words>,
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
  "has_image": <boolean — true if the question references a figure,
               diagram, or image. false if not>,
  "image_reference": <string — the figure label referenced
                     e.g. "Figure 1", "Fig. 2". null if has_image is false>,
  "suggested_tag": <string — your best guess at the subject or topic
                   of this question based on its content.
                   Return null if you cannot determine it>,
  "suggested_tag_confidence": <string — "high" if you are very confident the suggested_tag
                              matches an existing tag in the provided tag list.
                              "low" if uncertain or if no tag list was provided>,
  "confidence": <string — "high" if you are confident all fields are
                correct. "low" if any field is uncertain or ambiguous>
}

Rules you must strictly follow:
1. Only extract questions that are clearly multiple choice format.
2. If a question has fewer than 4 options or more than 5 options,
   still extract it but set confidence to "low".
3. If the document contains no questions, return an empty array: []
4. If question text is unclear or cut off, extract what you can
   and set confidence to "low".
5. Never invent or assume answer choices that are not in the document.
6. Never invent or assume a correct answer. Only mark it if it is
   clearly indicated in the document.
7. Preserve the exact wording of questions and options.
   Do not paraphrase or correct grammar.
8. If options are labeled 1/2/3/4 instead of A/B/C/D, map them to A/B/C/D.
9. If you find more than 20 questions, extract only the first 20.
10. For suggested_tag: if a tag list is provided at the top of the document text,
    you must only suggest tags from that list. Set suggested_tag_confidence to "high"
    only if you are confident the question clearly belongs to one of the provided tags.
    If no tag list is provided, suggest freely but set suggested_tag_confidence to "low".
11. EXCLUSION RULE: The "question_text" field must only contain the question itself. Do NOT include the options (A, B, C, D) or any text indicating the correct answer (e.g., "Answer: A") in this field. Those belong in the "options" and "correct_answer" fields respectively.`;

class GeminiService {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not set in environment variables');
        }
        this.client = new GoogleGenerativeAI(apiKey);
        this.model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
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
     * Calls Gemini API to extract questions from text.
     * Accepts an optional tags array to guide tag suggestion.
     * Includes retry logic for timeouts and malformed JSON
     */
    async extractQuestions(documentText, retryCount = 0, tags = []) {
        try {
            const cleanedText = this.preprocessText(documentText);
            const tagContext = this.buildTagContext(tags);
            const fullPrompt = tagContext + cleanedText;

            const response = await this.client.getGenerativeModel({ 
                model: this.model,
                systemInstruction: GEMINI_SYSTEM_PROMPT
            }).generateContent({
                contents: [{
                    role: 'user',
                    parts: [{
                        text: fullPrompt
                    }]
                }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0.1
                }
            });

            const rawJson = response.response.text();
            const questions = JSON.parse(rawJson);
            // Process questions

            if (!Array.isArray(questions)) {
                throw new Error('Response is not a JSON array');
            }

            return questions;
        } catch (error) {
            // Retry once for timeout or malformed JSON
            // In the catch block inside extractQuestions
            if (retryCount < 1) {
                if (
                    error.message?.includes('timeout') ||
                    error.message?.includes('Unexpected token') ||
                    error.status === 503 // Add this
                ) {
                    console.log(`Retrying Gemini extraction (attempt ${retryCount + 1})...`);
                    // Wait 3 seconds before retry on 503
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    return this.extractQuestions(documentText, retryCount + 1, tags);
                }
}
            // Re-throw after retry exhausted
            throw error;
        }
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
     * Process all extracted questions with guardrails
     */
    processQuestionsWithGuardrails(questions) {
        return questions.map(q => this.addGuardrailFlags(q));
    }
}

module.exports = new GeminiService();