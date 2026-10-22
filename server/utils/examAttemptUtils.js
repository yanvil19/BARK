const MockBoardExam = require('../models/MockBoardExam');

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// [GROUPED QUESTIONS] Group-aware shuffle:
// Questions sharing a groupId travel as a single slot in the randomized order.
// Within the group, questions stay sorted by groupOrder.
function shuffleQuestionsGroupAware(questions) {
  const slots = [];
  const groupMap = new Map();

  for (const q of questions) {
    const gid = q.groupId ? String(q.groupId).trim() : null;
    if (!gid) {
      slots.push([q]);
    } else {
      if (!groupMap.has(gid)) groupMap.set(gid, []);
      groupMap.get(gid).push(q);
    }
  }

  for (const [, members] of groupMap) {
    members.sort((a, b) => (Number(a.groupOrder) || 0) - (Number(b.groupOrder) || 0));
    slots.push(members);
  }

  shuffleArray(slots);
  return slots.flat();
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
  shuffleQuestionsGroupAware,
  calculateScore,
};
