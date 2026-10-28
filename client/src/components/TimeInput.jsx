import { Fragment, useRef, useState } from 'react';
import '../styles/components/TimeInput.css';

// Boxes in order: hour tens, hour ones, minute tens, minute ones, then the AM/PM toggle
const DIGIT_LABELS = ['Hour, first digit', 'Hour, second digit', 'Minute, first digit', 'Minute, second digit'];
const PERIOD_INDEX = 4;

function splitTime(value) {
  const [rawHours, rawMinutes] = String(value || '00:00').split(':').map(Number);
  const hours = Number.isFinite(rawHours) ? rawHours : 0;
  const minutes = Number.isFinite(rawMinutes) ? rawMinutes : 0;
  return {
    digits: [...String(hours % 12 || 12).padStart(2, '0'), ...String(minutes).padStart(2, '0')],
    isPm: hours >= 12,
  };
}

function joinTime(digits, isPm) {
  const hours = (Number(digits[0] + digits[1]) % 12) + (isPm ? 12 : 0);
  return `${String(hours).padStart(2, '0')}:${digits[2]}${digits[3]}`;
}

// Places a typed digit while keeping the time valid (hours 01–12, minutes 00–59).
// Returns the new digits and the box to move to, or null when the digit cannot go there.
function placeDigit(digits, index, digit) {
  const [h1, h2, m1, m2] = digits;
  const n = Number(digit);

  if (index === 0) {
    // "5" in the hour's first box means 05
    if (n > 1) return { digits: ['0', digit, m1, m2], focus: 2 };
    let nextH2 = h2;
    if (n === 0 && h2 === '0') nextH2 = '1';
    if (n === 1 && Number(h2) > 2) nextH2 = '0';
    return { digits: [digit, nextH2, m1, m2], focus: 1 };
  }
  if (index === 1) {
    if (h1 === '1' ? n > 2 : n === 0) return null;
    return { digits: [h1, digit, m1, m2], focus: 2 };
  }
  if (index === 2) {
    // "7" in the minute's first box means 07
    if (n > 5) return { digits: [h1, h2, '0', digit], focus: PERIOD_INDEX };
    return { digits: [h1, h2, digit, m2], focus: 3 };
  }
  return { digits: [h1, h2, m1, digit], focus: PERIOD_INDEX };
}

// Arrow up/down: hour boxes step the hour, minute boxes step by 10 or by 1
function stepDigits(digits, index, delta) {
  if (index < 2) {
    const hour = ((Number(digits[0] + digits[1]) - 1 + delta + 12) % 12) + 1;
    return [...String(hour).padStart(2, '0'), digits[2], digits[3]];
  }
  const minutes = (Number(digits[2] + digits[3]) + delta * (index === 2 ? 10 : 1) + 60) % 60;
  return [digits[0], digits[1], ...String(minutes).padStart(2, '0')];
}

/**
 * 12-hour time input with one box per digit: [1][2] : [3][0] [AM].
 * Clicking a box selects that digit, typing replaces it and moves on, arrows move or step.
 *
 * - value: "HH:mm" in 24-hour time
 * - onChange(nextValue): called with "HH:mm"; the value is always a valid time
 * - onFocus: called whenever any box in the group gets focus
 */
export default function TimeInput({ value, onChange, onFocus, ariaLabel = 'Time', className = '' }) {
  const boxRefs = useRef([]);
  // Only one box is in the tab order; arrows move between the rest
  const [tabIndex, setTabIndex] = useState(0);
  const { digits, isPm } = splitTime(value);

  function focusBox(index) {
    boxRefs.current[index]?.focus();
  }

  function commit(nextDigits, nextIsPm = isPm) {
    onChange(joinTime(nextDigits, nextIsPm));
  }

  function typeDigit(index, digit) {
    const placed = placeDigit(digits, index, digit);
    if (!placed) return;
    commit(placed.digits);
    focusBox(placed.focus);
  }

  function handleKeyDown(index, event) {
    const { key } = event;
    if (index < PERIOD_INDEX && /^\d$/.test(key)) {
      event.preventDefault();
      typeDigit(index, key);
    } else if (key === 'ArrowLeft' || key === 'Backspace') {
      event.preventDefault();
      focusBox(Math.max(0, index - 1));
    } else if (key === 'ArrowRight') {
      event.preventDefault();
      focusBox(Math.min(PERIOD_INDEX, index + 1));
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault();
      if (index === PERIOD_INDEX) commit(digits, !isPm);
      else commit(stepDigits(digits, index, key === 'ArrowUp' ? 1 : -1));
    } else if (index === PERIOD_INDEX && /^[ap]$/i.test(key)) {
      event.preventDefault();
      commit(digits, key.toLowerCase() === 'p');
    }
  }

  // Fallback for keyboards that do not report the key pressed (mostly on phones)
  function handleChange(index, event) {
    const typed = event.target.value.replace(/\D/g, '');
    const digit = typed.length > 1 && typed[0] === digits[index] ? typed[typed.length - 1] : typed[0];
    if (digit) typeDigit(index, digit);
  }

  function setRef(index) {
    return (node) => {
      boxRefs.current[index] = node;
    };
  }

  return (
    <div className={`time-input ${className}`.trim()} role="group" aria-label={ariaLabel} onFocus={onFocus}>
      {digits.map((digit, index) => (
        <Fragment key={DIGIT_LABELS[index]}>
          {index === 2 ? <span className="time-input-sep" aria-hidden="true">:</span> : null}
          <input
            ref={setRef(index)}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className="time-input-digit"
            value={digit}
            tabIndex={tabIndex === index ? 0 : -1}
            aria-label={DIGIT_LABELS[index]}
            onFocus={(event) => {
              setTabIndex(index);
              event.target.select();
            }}
            onClick={(event) => event.target.select()}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onChange={(event) => handleChange(index, event)}
          />
        </Fragment>
      ))}
      <button
        ref={setRef(PERIOD_INDEX)}
        type="button"
        className="time-input-period"
        tabIndex={tabIndex === PERIOD_INDEX ? 0 : -1}
        title="Switch AM/PM"
        onFocus={() => setTabIndex(PERIOD_INDEX)}
        onKeyDown={(event) => handleKeyDown(PERIOD_INDEX, event)}
        onClick={() => commit(digits, !isPm)}
      >
        {isPm ? 'PM' : 'AM'}
      </button>
    </div>
  );
}
