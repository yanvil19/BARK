const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

class FileExtractionService {
    /**
     * Extracts text from a PDF buffer
     */
    async extractTextFromPDF(buffer) {
        try {
            const data = await pdfParse(buffer);
            return data.text || '';
        } catch (error) {
            throw new Error(`PDF parsing failed: ${error.message}`);
        }
    }

    /**
     * Extracts text and images from a DOCX buffer
     */
    async extractTextFromDOCX(buffer) {
        try {
            const result = await mammoth.extractRawText({ buffer });
            return result.value || '';
        } catch (error) {
            throw new Error(`DOCX parsing failed: ${error.message}`);
        }
    }

    /**
     * Detects if a PDF is scanned (no extractable text)
     */
    isScannedPDF(text) {
        // If text is empty or under 50 characters, it's likely a scanned PDF
        return !text || text.trim().length < 50;
    }

    /**
     * Counts approximate question blocks in text
     * Uses heuristics: looks for numbered lines followed by question markers
     */
    countQuestionBlocks(text) {
        // Simple heuristic: count lines that start with numbers followed by period or parenthesis
        // e.g., "1.", "2)", "1.", "Question 1", etc.
        const questionPattern = /^(?:\d+[\.\)]\s|Question\s+\d+|Q\d+\.)/gim;
        const matches = text.match(questionPattern) || [];
        return matches.length;
    }

    /**
     * Main extraction method - handles both PDF and DOCX
     */
    async extractFromFile(buffer, mimeType) {
        let text = '';

        if (mimeType === 'application/pdf') {
            text = await this.extractTextFromPDF(buffer);
        } else if (
            mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) {
            text = await this.extractTextFromDOCX(buffer);
        } else {
            throw new Error('Unsupported file type');
        }

        return text;
    }
}

module.exports = new FileExtractionService();
