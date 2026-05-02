# Concurrency Handling Plan: Question Review Workflow

## Problem Statement
In the current system, both the **Dean** and **Program Chair** can access and evaluate questions simultaneously. This creates a race condition where both users might try to approve, return, or reject the same question at the same time, leading to inconsistent data or unexpected errors.

## Proposed Solution: "Reviewing" State & Soft Locking

The goal is to implement a mechanism that signals when a question is currently being evaluated by another authorized user.

### 1. New Question State: `reviewing`
We will add a new state to the `Question` model: `reviewing`.
- **Trigger**: Activated when a Program Chair or Dean clicks on a question to view its details/evaluation modal.
- **Visual Indicator**: Other users viewing the dashboard will see a badge or label (e.g., "Reviewing...") next to the question.

### 2. Schema Enhancements
To support this, the `Question` model should be updated with:
- `currentReviewer`: (ObjectId) The user who is currently viewing/evaluating the question.
- `reviewStartedAt`: (Date) Timestamp to help with auto-release of locks.

### 3. Implementation Workflow

#### A. Backend Changes
1.  **Update Model**: Add `reviewing` to the state enum and add `currentReviewer` / `reviewStartedAt` fields.
2.  **New Endpoint**: `PATCH /api/questions/:id/lock`
    - Checks if the question is already in `reviewing` state.
    - If not, sets state to `reviewing` and sets `currentReviewer`.
    - If yes, returns the current reviewer's name so the UI can show "Locked by [Name]".
3.  **New Endpoint**: `PATCH /api/questions/:id/unlock`
    - Reverts the state back to `pending_chair` (or its previous valid state).
    - Clears the `currentReviewer`.
4.  **Action Hook**: Ensure that any action (Approve/Reject/Return) automatically clears the lock and updates to the final state.

#### B. Frontend Changes (`QuestionApprovals.jsx`)
1.  **On Modal Open**: Call the `/lock` endpoint.
2.  **On Modal Close (Cancel/X)**: Call the `/unlock` endpoint.
3.  **Dashboard View**: 
    - Check the `state` of each question.
    - If `state === 'reviewing'`, display a "Locked" badge.
    - Disable the "Evaluate" button if the `currentReviewer` is not the current user.

### 4. Handling Edge Cases
- **Stale Locks**: If a user's browser crashes or they disconnect, the question might stay in `reviewing`.
    - *Solution*: A cron job or a periodic check on the server could revert `reviewing` status if `reviewStartedAt` is older than X minutes (e.g., 30 mins).
- **Simultaneous Click**: If two people click at the exact same millisecond.
    - *Solution*: Use MongoDB's atomic updates (e.g., `findOneAndUpdate` with a query that checks `state !== 'reviewing'`).

## Alternatives Considered
- **Optimistic Locking**: Using a `version` field. Easier to implement but doesn't provide visual feedback that someone else is *already* looking at it.
- **WebSockets (Socket.io)**: Real-time "User X is typing..." style feedback. Best for UX but adds complexity to the tech stack if not already present.

---
**Next Steps**:
1. Confirm the preferred state name (e.g., `reviewing`, `evaluating`, `locked`).
2. Decide on the timeout duration for stale locks.
3. Review implementation feasibility in `QuestionApprovals.jsx`.
