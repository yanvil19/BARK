// The Gemini models the AI question import uses, in the order they are tried.
// When one is out of quota, the next one is used.
//
//   GEMINI_MODEL_1=gemini-3.6-flash
//   GEMINI_MODEL_1_RPM=10    optional: requests per minute this server may send
//   GEMINI_MODEL_1_RPD=250   optional: requests per day (Google resets these at
//                            midnight Pacific time)
//   GEMINI_MODEL_2=gemini-3.5-flash-lite
//   ...
//
// The numbers set the order. They need not be consecutive and there is no
// maximum. A model without its own limits uses GEMINI_RPM_LIMIT and
// GEMINI_RPD_LIMIT (default 8 and 200); a limit of 0 turns the model off. With no
// numbered models, GEMINI_MODEL (default gemini-2.5-flash) is the only model.
//
// The environment is read on every call, so a changed value applies right away.
// server.js reads it once at startup, so a mistake stops the server there.

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_RPM = 8;
const DEFAULT_RPD = 200;
const MODEL_KEY = /^GEMINI_MODEL_(\d+)$/;

class GeminiConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeminiConfigError';
  }
}

function readLimit(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    throw new GeminiConfigError(`${name} must be a whole number (0 or more), but it is "${raw}".`);
  }
  return Number(text);
}

// Returns [{ position, name, rpm, rpd }] in the order the models are tried
function getGeminiModels(env = process.env) {
  const defaultRpm = readLimit(env, 'GEMINI_RPM_LIMIT', DEFAULT_RPM);
  const defaultRpd = readLimit(env, 'GEMINI_RPD_LIMIT', DEFAULT_RPD);

  const numbered = Object.keys(env)
    .map((key) => key.match(MODEL_KEY))
    .filter(Boolean)
    .map((match) => ({ key: match[0], position: Number(match[1]) }))
    .sort((a, b) => a.position - b.position);

  if (numbered.length === 0) {
    const name = String(env.GEMINI_MODEL || '').trim() || DEFAULT_MODEL;
    return [{ position: 1, name, rpm: defaultRpm, rpd: defaultRpd }];
  }

  const seen = new Map();
  return numbered.map(({ key, position }) => {
    const name = String(env[key]).trim();
    if (!name) {
      throw new GeminiConfigError(`${key} is empty. Set a model name, or delete or comment out the line.`);
    }
    if (seen.has(name)) {
      throw new GeminiConfigError(`${name} is set twice, as ${seen.get(name)} and ${key}. List each model once.`);
    }
    seen.set(name, key);
    return {
      position,
      name,
      rpm: readLimit(env, `${key}_RPM`, defaultRpm),
      rpd: readLimit(env, `${key}_RPD`, defaultRpd),
    };
  });
}

module.exports = { getGeminiModels, GeminiConfigError };
