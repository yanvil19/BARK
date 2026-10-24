export function groupQuestionsForDisplay(questions = []) {
  const orderedItems = [];
  const groupsById = new Map();

  questions.forEach((question) => {
    if (!question?.groupId) {
      orderedItems.push({ type: 'question', question });
      return;
    }

    const groupId = String(question.groupId);
    let group = groupsById.get(groupId);
    if (!group) {
      group = { type: 'group', groupId, setNumber: groupsById.size + 1, questions: [] };
      groupsById.set(groupId, group);
      orderedItems.push(group);
    }
    group.questions.push(question);
  });

  let questionNumber = 0;
  orderedItems.forEach((item) => {
    if (item.type === 'question') {
      item.questionNumber = ++questionNumber;
      return;
    }

    item.questions.sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));
    item.questions = item.questions.map((question) => ({
      question,
      questionNumber: ++questionNumber,
    }));
  });

  return orderedItems;
}

export function getQuestionSetPart(question) {
  return Number.isInteger(question?.groupOrder) ? question.groupOrder + 1 : null;
}
