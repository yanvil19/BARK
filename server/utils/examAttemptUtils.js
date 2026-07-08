const MockBoardExam = require('../models/MockBoardExam');

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function calculateScore(attempt, exam) {
  const populatedExam = await MockBoardExam.findById(exam._id).populate({
    path: 'questions',
    populate: { path: 'tag' },
  });

  let totalScore = 0;
  const subjectStats = {};

  populatedExam.questions.forEach((q) => {
    const tagId = q.tag._id.toString();
    if (!subjectStats[tagId]) {
      subjectStats[tagId] = { tag: q.tag._id, correct: 0, total: 0 };
    }
    subjectStats[tagId].total += 1;

    const correctAns = q.answers.find((a) => a.isCorrect);
    const attemptAnsId = attempt.answers.get(q._id.toString());

    if (correctAns && attemptAnsId && String(attemptAnsId) === String(correctAns._id)) {
      totalScore += 1;
      subjectStats[tagId].correct += 1;
    }
  });

  attempt.score = totalScore;
  attempt.subjectScores = Object.values(subjectStats);
}

module.exports = {
  shuffleArray,
  calculateScore,
};
