const mongoose = require('mongoose');
const { encryptText } = require('../services/encryptionService');

// An answer choice counts as filled when it has text or an image.
function isFilledAnswer(answer) {
  return Boolean(answer?.text?.trim() || answer?.image);
}

// Cleans answer choices sent by the client: keeps only the known fields and
// drops rows with neither text nor an image, so empty choices are never stored.
function normalizeAnswersInput(answers) {
  if (!Array.isArray(answers)) return [];

  return answers
    .map((answer) => {
      const normalized = {
        text: typeof answer?.text === 'string' ? answer.text.trim() : '',
        isCorrect: Boolean(answer?.isCorrect),
        image: typeof answer?.image === 'string' && answer.image.trim() ? answer.image.trim() : null,
      };
      if (answer?._id && mongoose.isValidObjectId(answer._id)) normalized._id = answer._id;
      return normalized;
    })
    .filter(isFilledAnswer);
}

function encryptAnswers(answers) {
  return answers.map((answer) => ({ ...answer, text: encryptText(answer.text) }));
}

function countAnswerImages(answers = []) {
  return answers.filter((answer) => answer?.image).length;
}

// Board exam rules for answer choices, checked on submission. Expects decrypted,
// filled answers. Returns an error message, or null when the choices are valid.
function getAnswerSubmissionError(answers = []) {
  const missingTextIndex = answers.findIndex((answer) => !answer.text?.trim());
  if (missingTextIndex !== -1) {
    return `Answer ${missingTextIndex + 1} needs text. Answer images are optional, but every choice must have text.`;
  }

  if (answers.length < 4 || answers.length > 5) {
    return 'Questions must have exactly 4 or 5 filled options for board exams';
  }

  const correctCount = answers.filter((answer) => answer.isCorrect).length;
  if (correctCount === 0) return 'No correct answer selected';
  if (correctCount > 1) return 'Multiple correct answers selected';

  const texts = answers.map((answer) => answer.text.trim().toLowerCase());
  if (new Set(texts).size < texts.length) return 'Duplicate answer choices detected';

  return null;
}

module.exports = {
  isFilledAnswer,
  normalizeAnswersInput,
  encryptAnswers,
  countAnswerImages,
  getAnswerSubmissionError,
};
