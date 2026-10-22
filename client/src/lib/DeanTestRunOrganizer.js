function randomSort() {
  return Math.random() - 0.5;
}

export function shuffleList(items = []) {
  return [...items].sort(randomSort);
}

export function shuffleQuestionsGroupAware(questions = []) {
  const slots = [];
  const groupMap = new Map();

  for (const q of questions) {
    const gid = q.groupId ? String(q.groupId) : null;
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

  return shuffleList(slots).flat();
}

export function getAnswerOptionLabel(index) {
  return `${String.fromCharCode(97 + index)}.`;
}

export function addAnswerOptionLabels(answers = []) {
  return answers.map((answer, index) => ({
    ...answer,
    optionLabel: getAnswerOptionLabel(index),
  }));
}

export function randomizeQuestionAnswers(question) {
  return {
    ...question,
    answers: addAnswerOptionLabels(shuffleList(question.answers || [])),
  };
}

export function organizeQuestionAnswers(question) {
  return {
    ...question,
    answers: addAnswerOptionLabels(question.answers || []),
  };
}

export function organizeExamQuestionsAndAnswers(questions = [], { randomize = false } = {}) {
  const orderedQuestions = randomize ? shuffleQuestionsGroupAware(questions) : [...questions];
  return orderedQuestions.map((question) => (
    randomize ? randomizeQuestionAnswers(question) : organizeQuestionAnswers(question)
  ));
}
