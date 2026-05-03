# Implementation Plan: Student Exam System

## 1. Goal Description

The goal is to implement the student exam-taking experience in the BARK platform. This involves allowing students to view published mock board exams for their program, start an exam, answer questions, submit their attempt, and view a submission confirmation. The system will securely track attempts and ensure a realistic, randomized exam environment without revealing results prematurely.

## 2. Constraints & Design Decisions

1.  **Hidden Results:** As requested, scores and correct answers **will NOT be revealed** to the student after submission. The results page will only act as a submission confirmation.
2.  **Limited Information:** During the exam, students will only see the exam title, description, instructions, questions, and randomized options.
3.  **Randomization & State Persistence:** As Claude noted, frontend-only randomization breaks if a student refreshes the page (questions/options would shuffle again, losing context of their saved answers). Therefore, **randomization will happen on the backend exactly once** when the `StudentExamAttempt` is created. The backend will shuffle the questions and options, strip out the `isCorrect` flag, and save this specific shuffled order in the attempt document. The frontend will strictly render the order provided by the backend.
4.  **Exam Availability Window:** Students can only start the exam if the current time is on or after the `examDate`. The `examDate` acts as the release date. The exam must also have a `status` of 'published' and match their program.
5.  **Attempt Limit:** We will restrict students to **one attempt** per mock board exam to simulate actual board conditions.
6.  **Disconnection & Resume Logic (Auto-save):** We will save progress to the backend periodically (e.g., every 1-2 minutes). If a student gets disconnected, closes the tab, or refreshes, they can return to the dashboard and click "Resume Exam". The backend will load their existing `in_progress` attempt and previously selected answers. 
    *   *Crucial Timer Rule:* The timer runs continuously on the backend based on `startTime + duration`. If they disconnect and return *after* their time has expired, the exam will be automatically submitted upon their return.
7.  **Timer expiration:** The frontend will automatically trigger the "Submit" action when the timer reaches zero. The backend will validate the timestamp on submission to prevent tampering.

## 3. Proposed Changes

---

### A. Database Models

#### [NEW] `server/models/StudentExamAttempt.js`
Create a new schema to track a student's attempt.
-   `student`: ObjectId (User)
-   `exam`: ObjectId (MockBoardExam)
-   `startTime`: Date
-   `endTime`: Date (null until submitted)
-   `status`: Enum `['in_progress', 'submitted', 'abandoned']`
-   `answers`: Map of Question ID to Answer ID (e.g., `{ 'q1_id': 'ans1_id' }`)
-   `randomizedQuestions`: Array representing the exact shuffled order for this student:
    *   `[{ question: ObjectId, answers: [ObjectId] }]`
-   `score`: Number (overall score, e.g. 50, calculated upon submission)
-   `subjectScores`: Array of objects to track performance per subject tag:
    *   `[{ tag: ObjectId(Tag), correct: Number, total: Number }]`
    *   *(Note: Both overall score and subject breakdown are kept hidden from the student, but saved for future Dean/Chair analytics).*

---

### B. Backend Controllers & Routes

#### [NEW] `server/controllers/studentExamController.js`
1.  **`getAvailableExams`**: List published, unexpired exams for the student's program.
2.  **`startExam`**: Check for an existing `in_progress` attempt. If none exists, create a new `StudentExamAttempt`. **Crucial:** Generate a randomized order of questions and answers, save it to `randomizedQuestions`, and strip `isCorrect` from the payload before returning it. If an attempt exists, return the previously saved `randomizedQuestions`.
3.  **`saveProgress`**: Update the `answers` map in the `StudentExamAttempt` document.
4.  **`submitExam`**: Finalize the attempt. Iterate through the student's answers, look up the correct answers and their corresponding subject tags, and calculate both the overall `score` and the `subjectScores` breakdown. Save these along with `status: 'submitted'` and `endTime`.

#### [NEW] `server/routes/studentExamRoutes.js`
Define endpoints for the above controller functions, protected and restricted to the `student` role. Register this router in `server.js`.

---

### C. Frontend Components

#### [MODIFY] `client/src/pages/Dashboard/StudentDashboard.jsx`
-   Fetch and display available exams.
-   Show past attempts (status only, no scores).
-   Add a "Take Exam" button.

#### [NEW] `client/src/pages/StudentExamRunner.jsx`
-   Secure exam environment.
-   Fetch exam via `startExam`.
-   Render questions strictly in the order provided by the backend (do not use frontend randomizers here).
-   Implement a strict countdown timer based on duration and `startTime`.
-   Auto-save functionality.
-   Final submission logic.

#### [NEW] `client/src/pages/StudentExamResult.jsx`
-   A simple success page confirming that the exam attempt has been recorded. It will intentionally **not** display the score.

#### [MODIFY] `client/src/App.jsx`
-   Add routes for `StudentExamRunner` and `StudentExamResult`.

## 4. Verification Plan

### Manual Verification
1.  **Student Login & Dashboard:** Verify the student sees only unexpired, published exams for their program.
2.  **Start Exam & Security:** Click "Start". Verify the payload in the network tab does **not** contain `isCorrect` flags. Verify questions and answers are randomized.
3.  **Answer & Save:** Answer questions. Refresh the page to simulate leaving. Verify answers and timer state are preserved via backend validation.
4.  **Submit Exam:** Submit the exam. Verify redirection to the success page and confirm **no score is shown**.
5.  **Attempt Limits:** Attempt to take the same exam again and verify the system blocks it.
