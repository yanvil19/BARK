// What Gemini is asked to write for an exam's AI overview, the shape it must answer in, and the
// checks on what it wrote. The figures come from services/examOverviewFacts.js; Gemini writes
// only the words. Every number in its words must be one of the figures, a question or topic it
// names must exist, and a question may only be flagged for something its answers show. What
// fails a check is left out; an answer with no usable summary is retried (geminiService).
const { SchemaType } = require('@google/generative-ai');

const TONES = ['good', 'watch', 'problem'];
const FLAGS = ['check_key', 'shared_mistake', 'often_skipped', 'may_be_unclear', 'too_hard', 'too_easy'];

const MAX_FINDINGS = 5;
const MAX_QUESTIONS_TO_REVIEW = 6;
const MAX_NEXT_STEPS = 5;

const OVERVIEW_INSTRUCTION = `You write a short overview of a mock board exam's results for the dean and program chairs of a university program.
They read it on the exam's results page, next to charts and tables the system draws from the same facts, so your job is the words: what the results mean and what to do next.

You get the facts as JSON. Rules you must follow:
1. Use only the facts. Every number you write must appear in the facts exactly as given (you may leave out the % sign, and write "points" after a change). Never calculate, estimate or round a number yourself: the changes between exams are already given (previous.averageChange, previous.passRateChange, topics[].change).
2. You do not know what any question says, only its topic and how it was answered. Never guess what a question is about. Call a question "Q" and its number (Q27), and an answer by its letter (answer c).
3. Write plain sentences. No Markdown, no HTML, no emoji, no headings, no bullet characters. Be brief, specific and calm. Do not praise or blame anyone. Do not mention AI, JSON or these rules.
4. Scores are percentages. exam.threshold is the passing score. summary.nearMiss counts takers within 5 points under it (groups.nearMiss.from to groups.nearMiss.to).
5. summary.missed (student exams): students who did not take the exam get a 0% attempt, and those count among the takers, the average and the pass rate, as on the results page. When missed is more than 0, say so where it matters. summary.notTaken counts everyone who did not take it.
6. Alumni exams (exam.audience "alumni"): each alumni's highest-scoring attempt counts. retakes.retakers took it more than once, and retakes.improved of them raised their score.
7. When summary.takers is under 10, say the results may not be representative, and be careful with conclusions about single questions.
8. questions[].signals are what the system found in each question's answers:
   - check_key: a wrong answer was chosen more often than the keyed answer, so the key may be wrong
   - shared_mistake: one wrong answer drew many takers
   - often_skipped: many takers left it blank
   - may_be_unclear: the upper group (strongest takers) got it right less often than the lower group (weakest takers)
   - too_hard: few got it right
   - too_easy: nearly everyone got it right
   questions[].topWrong is the most-picked wrong answer. upper and lower are the shares of the upper and lower groups who got it right.
   In questionsToReview, only flag a question with one of its own signals. Choose the questions that matter most, check_key first.
9. previous is the program's latest earlier exam for the same audience, and trend lists up to five exams, oldest first, this one last. When previous is null, do not compare with an earlier exam. When trend is empty, progressNote is "".
10. exam.resultsRelease, when given, is the date the takers will see their results; a possible answer key problem should be checked before then.

Write these fields:
- summary: 2 or 3 sentences on how the exam went and the one or two things that matter most.
- findings: 3 to 5 points. tone is "good" (going well), "watch" (worth keeping an eye on) or "problem" (needs action). title is 2 to 4 words. text is 1 or 2 sentences. questions lists the question numbers the point is about and topics the exact topic names (empty lists when none).
- topicsNote: 1 or 2 sentences on the topics: the strongest and weakest, and the changes since the previous exam when given.
- questionsToReview: up to 6 questions, each with one of its signals as flag and a one-sentence reason built from its figures.
- progressNote: 1 or 2 sentences on the trend, or "" when there is no trend.
- supportNote: 1 or 2 sentences on who needs support: the near-miss takers and their weakest topics, those below 50%, and those who did not take it.
- nextSteps: 3 to 5 short, concrete actions for the dean and program chairs, most important first.`;

const OVERVIEW_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    findings: {
      type: SchemaType.ARRAY,
      maxItems: MAX_FINDINGS,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          tone: { type: SchemaType.STRING, format: 'enum', enum: TONES },
          title: { type: SchemaType.STRING },
          text: { type: SchemaType.STRING },
          questions: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER } },
          topics: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ['tone', 'title', 'text', 'questions', 'topics'],
      },
    },
    topicsNote: { type: SchemaType.STRING },
    questionsToReview: {
      type: SchemaType.ARRAY,
      maxItems: MAX_QUESTIONS_TO_REVIEW,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          question: { type: SchemaType.INTEGER },
          flag: { type: SchemaType.STRING, format: 'enum', enum: FLAGS },
          reason: { type: SchemaType.STRING },
        },
        required: ['question', 'flag', 'reason'],
      },
    },
    progressNote: { type: SchemaType.STRING },
    supportNote: { type: SchemaType.STRING },
    nextSteps: { type: SchemaType.ARRAY, maxItems: MAX_NEXT_STEPS, items: { type: SchemaType.STRING } },
  },
  required: ['summary', 'findings', 'topicsNote', 'questionsToReview', 'progressNote', 'supportNote', 'nextSteps'],
};

// The facts as Gemini reads them
function buildOverviewPrompt(facts) {
  return `Facts:\n${JSON.stringify(facts)}`;
}

// ── Checking what Gemini wrote ──────────────────────────────────────────────

// An answer Gemini gave that cannot be used. The message matches geminiService's passing
// errors, so the request is tried again, then on the next model.
function unusable(reason) {
  return new Error(`Response is not the expected JSON object: ${reason}`);
}

// Plain text only: tags, Markdown marks and runs of spaces are removed, and long text is cut at
// a word
function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  let text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > maxLength) {
    text = text.slice(0, maxLength).replace(/\s+\S*$/, '').replace(/[,;:]$/, '');
    if (!/[.!?]$/.test(text)) text += '.';
  }
  return text;
}

const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g;

function numberKey(value) {
  return String(Math.round(value * 10) / 10);
}

// Every number the words may use: each figure in the facts (as given, without its sign, and
// rounded), the numbers inside their text (names and dates), and small counts up to 10, which
// are used as words ("3 of the 6 topics")
function collectAllowedNumbers(facts) {
  const allowed = new Set();
  const add = (value) => {
    if (!Number.isFinite(value)) return;
    [value, Math.abs(value), Math.round(value), Math.round(Math.abs(value))].forEach((v) => allowed.add(numberKey(v)));
  };
  const walk = (value) => {
    if (typeof value === 'number') add(value);
    else if (typeof value === 'string') (value.match(NUMBER_PATTERN) || []).forEach((n) => add(parseFloat(n.replace(/,/g, ''))));
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(facts);
  for (let n = 0; n <= 10; n += 1) add(n);
  return allowed;
}

function usesOnlyAllowedNumbers(text, allowed) {
  return (text.match(NUMBER_PATTERN) || []).every((n) => allowed.has(numberKey(parseFloat(n.replace(/,/g, '')))));
}

// The sentences of a text whose numbers are all allowed
function keepCheckedSentences(text, allowed) {
  const sentences = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [];
  return sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && usesOnlyAllowedNumbers(sentence, allowed))
    .join(' ');
}

/**
 * Checks Gemini's answer against the facts and returns the overview content to keep:
 * { summary, findings, topicsNote, questionsToReview, progressNote, supportNote, nextSteps }.
 * Throws (so the request is retried) when the answer is not an object or has no usable summary.
 */
function checkOverviewContent(raw, facts) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw unusable('not an object');

  const allowed = collectAllowedNumbers(facts);
  const questionsByNumber = new Map((facts.questions || []).map((question) => [question.number, question]));
  const topicNames = new Map((facts.topics || []).map((topic) => [String(topic.name).toLowerCase(), topic.name]));

  const summary = keepCheckedSentences(cleanText(raw.summary, 700), allowed);
  if (!summary) throw unusable('no usable summary');

  const findings = (Array.isArray(raw.findings) ? raw.findings : [])
    .map((finding) => ({
      tone: TONES.includes(finding?.tone) ? finding.tone : null,
      title: cleanText(finding?.title, 60),
      text: cleanText(finding?.text, 420),
      questions: [...new Set((Array.isArray(finding?.questions) ? finding.questions : [])
        .map(Number)
        .filter((number) => questionsByNumber.has(number)))],
      topics: [...new Set((Array.isArray(finding?.topics) ? finding.topics : [])
        .map((name) => topicNames.get(String(name).toLowerCase()))
        .filter(Boolean))],
    }))
    .filter((finding) => finding.tone && finding.title && finding.text
      && usesOnlyAllowedNumbers(`${finding.title} ${finding.text}`, allowed))
    .slice(0, MAX_FINDINGS);

  // A question flagged for something its answers do not show takes its own first signal
  // instead, or is left out when it has none
  const seen = new Set();
  const questionsToReview = (Array.isArray(raw.questionsToReview) ? raw.questionsToReview : [])
    .map((entry) => {
      const number = Number(entry?.question);
      const question = questionsByNumber.get(number);
      if (!question || seen.has(number) || question.signals.length === 0) return null;
      seen.add(number);
      const flag = question.signals.includes(entry.flag) ? entry.flag : question.signals[0];
      const reason = cleanText(entry.reason, 320);
      return { question: number, flag, reason: usesOnlyAllowedNumbers(reason, allowed) ? reason : '' };
    })
    .filter(Boolean)
    .slice(0, MAX_QUESTIONS_TO_REVIEW);

  const nextSteps = (Array.isArray(raw.nextSteps) ? raw.nextSteps : [])
    .map((step) => cleanText(step, 300))
    .filter((step) => step && usesOnlyAllowedNumbers(step, allowed))
    .slice(0, MAX_NEXT_STEPS);

  return {
    summary,
    findings,
    topicsNote: keepCheckedSentences(cleanText(raw.topicsNote, 500), allowed),
    questionsToReview,
    progressNote: facts.trend?.length ? keepCheckedSentences(cleanText(raw.progressNote, 500), allowed) : '',
    supportNote: keepCheckedSentences(cleanText(raw.supportNote, 500), allowed),
    nextSteps,
  };
}

module.exports = {
  OVERVIEW_INSTRUCTION,
  OVERVIEW_SCHEMA,
  FLAGS,
  TONES,
  buildOverviewPrompt,
  checkOverviewContent,
};
