function randomSort() {
  return Math.random() - 0.5;
}

export function shuffleList(items = []) {
  return [...items].sort(randomSort);
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
  const orderedQuestions = randomize ? shuffleList(questions) : [...questions];
  return orderedQuestions.map((question) => (
    randomize ? randomizeQuestionAnswers(question) : organizeQuestionAnswers(question)
  ));
}
