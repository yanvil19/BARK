const pdfParse = require('pdf-parse');
const { extractDocxImportText } = require('./docxImportText');

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
     * Extracts text from a DOCX buffer, keeping bold/italic/underline as <b>/<i>/<u>,
     * Word equations as $LaTeX$ and pictures as [IMAGE] (see docxImportText.js)
     */
    async extractTextFromDOCX(buffer) {
        try {
            return await extractDocxImportText(buffer);
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
     * A rough question count made without the AI: the number of lines that
     * start an "A" option ("A.", "A)" or "(A)"), which every multiple choice
     * question has once. Options numbered 1-4 are not counted, so this can be
     * lower than the real count but rarely higher. Used only to turn away a file
     * that clearly has too many questions before Gemini is asked.
     */
    estimateQuestionCount(text) {
        return String(text || '')
            .split('\n')
            .filter((line) => /^\s*(?:\(A\)|A[.)])\s+\S/.test(line.replace(/<\/?[biu]>/g, '')))
            .length;
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
