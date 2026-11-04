// Google resets the Gemini API's daily request quotas at midnight Pacific time,
// so the import's own daily counts use the same day.

const PACIFIC = 'America/Los_Angeles';

const dateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: PACIFIC,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const offsetPart = new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, timeZoneName: 'longOffset' });

// Minutes Pacific time is ahead of UTC at that moment (-480 in winter, -420 in summer)
function pacificOffsetMinutes(date) {
  const name = offsetPart.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || '';
  const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

// The moment the current Pacific calendar day started
function startOfPacificDay(now = new Date()) {
  const parts = Object.fromEntries(dateParts.formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  const midnightAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  // The offset a few hours before midnight is the one in force at midnight, also
  // on the days the clocks change (they change at 2 AM)
  return new Date(midnightAsUtc - pacificOffsetMinutes(new Date(midnightAsUtc)) * 60 * 1000);
}

// The next midnight Pacific time, when the daily quotas reset
function nextPacificMidnight(now = new Date()) {
  const todayStart = startOfPacificDay(now).getTime();
  // 26 hours on lands inside the next day, whether the day is 23, 24 or 25 hours long
  return startOfPacificDay(new Date(todayStart + 26 * 60 * 60 * 1000));
}

module.exports = { PACIFIC, startOfPacificDay, nextPacificMidnight };
