function randomSort() {
  return Math.random() - 0.5;
}

export function shuffleList(items = []) {
  return [...items].sort(randomSort);
}

export function randomizeQuestionAnswers(question) {
  return {
    ...question,
    answers: shuffleList(question.answers || []),
  };
}

export function randomizeExamQuestionsAndAnswers(questions = []) {
  return shuffleList(questions).map(randomizeQuestionAnswers);
}
