# Exam Window Refactor Plan
# For: Gemini / AI Code Assistant
# Project: BARK — Board Exam Mock Reviewer

---

## What This Plan Is For

This is a focused refactor task only. We are changing how the exam window
is stored and computed across the backend and frontend. Nothing else changes.

---

## Current Setup — To Be Replaced

The exam model currently stores:
- `examDate`: Date — start of the exam window
- `duration`: Number (minutes) — how long the exam runs

The student timer currently computes:
```
studentEndTime = attempt.startTime + duration
```

This is wrong and will be replaced entirely.

---

## New Behavior — To Be Implemented

The exam has a fixed start and a fixed end. All students hard-stop at endDateTime
regardless of when they started.

```
startDateTime: May 4, 2026 @ 9:00 AM  ← Dean sets this
endDateTime:   May 4, 2026 @ 12:00 PM ← Dean sets this

Student starts at 9:00 AM  → gets 180 minutes remaining
Student starts at 10:00 AM → gets 120 minutes remaining
Student starts at 11:45 AM → gets 15 minutes remaining
```

Student timer rule — always compute on the fly:
```
remainingTimeSeconds = endDateTime - now()
```

Never use duration to compute a student's remaining time.

---

## Change 1 — MockBoardExam Model

Remove:
```javascript
examDate: Date,
duration: Number
```

Add:
```javascript
startDateTime: {
    type: Date,
    required: true
},
endDateTime: {
    type: Date,
    required: true,
    validate: {
        validator: function(value) {
            return value > this.startDateTime;
        },
        message: 'endDateTime must be after startDateTime'
    }
}
```

Add a virtual for display only — do not store this in the database:
```javascript
MockBoardExamSchema.virtual('durationMinutes').get(function() {
    if (!this.startDateTime || !this.endDateTime) return null;
    return Math.round((this.endDateTime - this.startDateTime) / 60000);
});
```

---

## Change 2 — Exam Controller

On create and update:
- Accept `startDateTime` and `endDateTime` from request body
- Validate `endDateTime` is after `startDateTime`
- Validate `startDateTime` is in the future on create
- Remove all references to `examDate` and `duration`

Student availability check — replace existing check with:
```javascript
const now = new Date();

if (now < exam.startDateTime) {
    return res.status(403).json({
        error: 'This exam has not started yet.',
        startsAt: exam.startDateTime
    });
}

if (now >= exam.endDateTime) {
    return res.status(403).json({
        error: 'This exam window has already closed.'
    });
}
```

---

## Change 3 — Student Exam Controller

In startExam — replace duration timer with remaining time:
```javascript
const now = new Date();
const remainingTimeSeconds = Math.floor((exam.endDateTime - now) / 1000);

return res.json({
    remainingTimeSeconds,
    endDateTime: exam.endDateTime,
    // ... rest of response unchanged
});
```

In submitExam — replace duration validation with endDateTime validation:
```javascript
const now = new Date();
const GRACE_PERIOD_MS = 30000; // 30 seconds for network delay

if (now > new Date(exam.endDateTime.getTime() + GRACE_PERIOD_MS)) {
    attempt.lateSubmission = true;
}
// Always accept — never hard reject due to timing
```

In autoSubmitIfExpired — use endDateTime as the endTime:
```javascript
attempt.endTime = exam.endDateTime; // NOT now()
attempt.autoSubmitted = true;
```

---

## Change 4 — StudentExamAttempt Model

Add two fields only:
```javascript
autoSubmitted: {
    type: Boolean,
    default: false
},
lateSubmission: {
    type: Boolean,
    default: false
}
```

---

## Change 5 — Frontend Exam Runner

Timer initialization — use remainingTimeSeconds and endDateTime from backend:
```javascript
const { remainingTimeSeconds, endDateTime } = await startExam(examId);
setExamEndDateTime(new Date(endDateTime));
```

Timer countdown — drive by endDateTime minus now(), not a simple decrement:
```javascript
useEffect(() => {
    const interval = setInterval(() => {
        const remaining = Math.floor((examEndDateTime - new Date()) / 1000);
        if (remaining <= 0) {
            clearInterval(interval);
            handleAutoSubmit();
            return;
        }
        setTimeRemaining(remaining);
    }, 1000);
    return () => clearInterval(interval);
}, [examEndDateTime]);
```

On resume — timer picks up from endDateTime - now(), never resets to full duration.

---

## Change 6 — Frontend Exam Creation Form (Dean)

Remove:
- examDate date/time picker
- duration number input (minutes)

Add:
- startDateTime — date and time picker, label: "Exam Start"
- endDateTime — date and time picker, label: "Exam End"
- Read-only computed display: "Duration: X hours Y minutes"
  (computed from endDateTime - startDateTime, for Dean reference only)

Form validation:
- endDateTime must be after startDateTime — show inline error
- startDateTime must be in the future — show inline error

---

## Field Changes Summary

### MockBoardExam:
| Action | Field | Type |
|---|---|---|
| REMOVE | examDate | Date |
| REMOVE | duration | Number |
| ADD | startDateTime | Date, required |
| ADD | endDateTime | Date, required |
| ADD virtual | durationMinutes | Computed only, not stored |

### StudentExamAttempt:
| Action | Field | Type |
|---|---|---|
| ADD | autoSubmitted | Boolean, default false |
| ADD | lateSubmission | Boolean, default false |

---

## Hard Rules

1. NEVER use duration to compute a student's remaining time — always use endDateTime - now()
2. NEVER hard reject a submission due to timing — set lateSubmission: true instead
3. NEVER reset timer to full duration on resume — always recompute from endDateTime - now()
4. ALWAYS use exam.endDateTime as endTime on auto-submitted attempts — not now()
5. Frontend timer must recalculate from endDateTime - now() every second — not decrement a stored value

---

## What Must Not Change

Everything else in the codebase stays untouched. This refactor only affects:
- How the exam window is stored (model fields)
- How availability is checked (controller)
- How remaining time is computed (student exam controller + frontend timer)
- How the Dean sets the exam window (creation form)

Do not touch question selection, publishing flow, scoring, result release,
void window logic, randomization, or any other feature.
