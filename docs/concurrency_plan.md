# Concurrency Handling Plan: Question Review Workflow

## 1. Problem Statement
The Dean and Program Chair can simultaneously access the same question queue. Without intervention, they may waste effort evaluating the same question or overwrite each other's actions (Race Condition).

## 2. Solution: Three-Layer Defense

### Layer 1: Visual Badge (Passive)
Display a "Being Evaluated 🔍" label on the dashboard if another user is currently viewing the question details. This deters others from picking the same question.

### Layer 2: Soft Warning Modal (Active)
If a user clicks "Evaluate" on a question already being reviewed, a warning modal appears:
*"[User Name] has been reviewing this for X minutes. Proceeding may cause a conflict."*
The user can **Go Back** or **Evaluate Anyway**.

### Layer 3: Atomic Database Check (Safety Net)
When submitting an action (Approve/Return/Reject), use an atomic `findOneAndUpdate` to ensure the question is still in `pending_chair` state. If the state changed, the update fails and the user is notified.

---

## 3. Implementation Details

### A. Schema Changes (`models/Question.js`)
Add metadata fields to track the current reviewer without polluting the pipeline `state`.
```javascript
currentReviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
reviewStartedAt: { type: Date, default: null }
```

### B. Backend Endpoints (`questionController.js`)
- **`PATCH /api/questions/:id/lock`**: 
    - Atomically set `currentReviewer` and `reviewStartedAt`.
    - If already reviewed by someone else (not stale > 10m), return `423 Locked` with reviewer details.
- **`PATCH /api/questions/:id/unlock`**: 
    - Clear `currentReviewer` and `reviewStartedAt`.
- **Approval Actions**: 
    - Use `{ state: 'pending_chair' }` as the query filter.
    - Set `currentReviewer: null` and `reviewStartedAt: null` in the same `$set` operation.
    - Return `409 Conflict` if `nModified === 0`.

### C. Frontend Logic (`QuestionApprovals.jsx`)
- **Dashboard**: Use a 10-minute "Lazy Expiration" helper to show the "Being Evaluated" badge.
- **On Evaluate Click**:
    1. Call `/lock`. 
    2. If `200 OK`: Open evaluation sidebar.
    3. If `423 Locked`: Show **Warning Modal**. If they choose "Evaluate Anyway", open the sidebar.
- **On Sidebar Close**: Call `/unlock` if no action was taken.
- **On Action Submit**: Handle `409` errors by showing a "Already Reviewed" message and refreshing the list.

---

## 4. Why This Works
- **No Hard Locks**: No one is ever "locked out" of a question (crucial if a user leaves their tab open).
- **Data Integrity**: The atomic check at the end is the ultimate truth.
- **UX**: The warning modal forces a conscious decision, preventing wasted time.
