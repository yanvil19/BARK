# NU-BOARD File Reference

> Auto-generated project file map. Each entry lists the file path and a brief description of its purpose.

---

## ====== SERVER FILES =======

### Entry Points

```
server/server.js
```
-> Bootstraps the Express app, connects to MongoDB, and starts scheduled cron jobs (exam expiry, etc.).

```
server/app.js
```
-> Creates and configures the Express app instance, sets up CORS, cookie parser, and mounts all API route middleware.

---

### Config

```
server/config/db.js
```
-> Establishes the Mongoose connection to MongoDB Atlas using the `MONGO_URI` env variable, with optional custom DNS server support for `mongodb+srv://` URIs.

---

### Controllers

```
server/controllers/authController.js
```
-> Handles all authentication flows: user login with escalating lockout protection, password reset via OTP, bulk and individual registration, credential changes, and email/ID validation helpers.
-> Manages bulk registration batch sessions in memory and streams progress updates to the client via SSE.

```
server/controllers/adminSettingsController.js
```
-> Manages application-wide settings (email cooldown, password cooldown, max upload images) including a pending-update countdown flow before settings take effect.
-> Exposes a public endpoint that returns non-sensitive settings (e.g. `maxUploadImages`) to faculty roles.

```
server/controllers/catalogController.js
```
-> Manages the department and program catalog: create, read, update, soft-delete departments and programs, with audit logging on all admin mutations.

```
server/controllers/importController.js
```
-> Orchestrates the AI-assisted question import pipeline: validates file type, extracts text/images, calls Gemini to count and parse questions, stores sessions in memory, and allows final submission to the question bank.

```
server/controllers/mockBoardExamController.js
```
-> Handles mock board exam lifecycle: create, publish, archive, and delete exams; enforces schedule conflict checks; sends email announcements on publish; and exposes filtered exam lists for faculty, students, and alumni.

```
server/controllers/mockExamResultController.js
```
-> Computes, stores, and retrieves mock exam results; aggregates per-subject scores; generates individual and aggregate reports from student and alumni attempt data.

```
server/controllers/questionController.js
```
-> CRUD for exam questions with AES encryption of text and image fields; handles approval workflow (pending → approved/returned/rejected) and integrates with Cloudflare R2 for image storage and deletion.

```
server/controllers/sseController.js
```
-> Registers faculty clients on the Server-Sent Events (SSE) stream so they receive real-time system-update warnings from the settings manager.

```
server/controllers/statsController.js
```
-> Returns aggregate summary statistics (user counts, question counts, exam counts, audit log entries) used on dashboards and the public landing page.

```
server/controllers/studentExamController.js
```
-> Manages the full student exam attempt lifecycle: start, save progress, submit, auto-submit on time expiry, and retrieve individual attempt results with shuffled questions.

```
server/controllers/alumniExamController.js
```
-> Mirrors the student exam controller for alumni users: start/submit unlimited attempts, retrieve per-attempt results, and expose alumni-specific attempt history and aggregate reporting.

```
server/controllers/tagController.js
```
-> CRUD for subject tags (topics) scoped to accessible programs; resolves program access based on the requesting user's role (professor, program_chair, dean).

---

### Routes

```
server/routes/authRoutes.js
```
-> Mounts auth endpoints: login, logout, OTP request/verify, registration management, bulk-register SSE stream, and credential update routes.

```
server/routes/adminCatalogRoutes.js
```
-> Mounts super-admin-protected CRUD endpoints for departments and programs.

```
server/routes/adminSettingsRoutes.js
```
-> Mounts super-admin settings endpoints (get, update, pending update, cancel) and the public settings endpoint for faculty.

```
server/routes/alumniExamRoutes.js
```
-> Mounts alumni-only exam routes: available exams, start/submit attempt, attempt history, and individual result retrieval.

```
server/routes/calendarRoutes.js
```
-> Mounts calendar endpoints that return scheduled exam data for the calendar view, filtered by program and date range.

```
server/routes/catalogRoutes.js
```
-> Mounts public/authenticated read endpoints for departments and programs (used in registration dropdowns and filtering).

```
server/routes/importRoutes.js
```
-> Mounts the AI import pipeline endpoints: upload, validate/count, extract questions, and submit—guarded by import-specific rate limiting and file validation middleware.

```
server/routes/mockBoardExamRoutes.js
```
-> Mounts routes for board exam management (faculty) and public exam listing (students/alumni), including test-run and preview endpoints.

```
server/routes/mockExamResultRoutes.js
```
-> Mounts routes to compute, retrieve, and delete stored mock exam results and individual reports.

```
server/routes/questionRoutes.js
```
-> Mounts question CRUD routes and approval workflow routes, scoped by role (professor submits, chair/dean approves).

```
server/routes/sseRoutes.js
```
-> Mounts the SSE subscription endpoint (`/api/sse/faculty`) for real-time settings-update broadcast.

```
server/routes/statsRoutes.js
```
-> Mounts the public summary stats endpoint used on the landing page and dashboards.

```
server/routes/studentExamRoutes.js
```
-> Mounts student exam routes: available exams, start/save/submit attempt, and individual result retrieval.

```
server/routes/tagRoutes.js
```
-> Mounts subject tag CRUD routes accessible to faculty roles within their program/department scope.

---

### Models

```
server/models/User.js
```
-> Mongoose schema for all user types (super_admin, dean, program_chair, professor, student, alumni) with hashed passwords, lockout fields, OTP fields, email/ID fields, and role-based department/program references.

```
server/models/MockBoardExam.js
```
-> Mongoose schema for mock board exams: title, program, questions array, status lifecycle (draft → published → ongoing → finished/archived), schedule, target audience (student/alumni), and attempt counters.

```
server/models/Question.js
```
-> Mongoose schema for exam questions with encrypted text and answer fields, image references (Cloudflare R2 keys), tag/program associations, and approval status workflow fields.

```
server/models/StudentExamAttempt.js
```
-> Mongoose schema for a student's single exam attempt: selected answers map, per-subject scores, total score, start/submit timestamps, and a shuffled question order snapshot.

```
server/models/AlumniExamAttempt.js
```
-> Mongoose schema for an alumni exam attempt; mirrors StudentExamAttempt but allows unlimited attempts per exam with an incrementing `attemptNumber` field.

```
server/models/MockExamResult.js
```
-> Mongoose schema for computed/aggregated exam results stored after a faculty member triggers result computation for a finished exam.

```
server/models/AppSettings.js
```
-> Mongoose singleton schema for global application settings (email cooldown, password cooldown, max upload images) with a static `getSingleton()` helper.

```
server/models/AuditLog.js
```
-> Mongoose schema that records administrative actions (user creation, approval, deletion, settings changes) with actor, action type, target type/ID, and metadata.

```
server/models/Department.js
```
-> Mongoose schema for academic departments with name, code, and soft-delete (`isActive`) fields.

```
server/models/Program.js
```
-> Mongoose schema for academic programs linked to a department, with name, code, and `isActive` fields.

```
server/models/RegistrationRequest.js
```
-> Mongoose schema for pending registration requests submitted by students/alumni/faculty, storing personal info, chosen role, and approval status.

```
server/models/PendingSettingUpdate.js
```
-> Mongoose schema that holds a queued settings change with a countdown expiry before it is automatically applied, supporting the pending-update workflow.

```
server/models/Tag.js
```
-> Mongoose schema for subject/topic tags linked to a program, used to categorize exam questions by subject area.

---

### Services

```
server/services/encryptionService.js
```
-> Provides AES-128-GCM encryption/decryption for question text fields and AES-256-GCM for image buffers, with helpers to bulk-decrypt an exam's full question set.

```
server/services/examAnnouncementEmailService.js
```
-> Sends batch email announcements to all eligible users in a program (faculty + students or alumni) when a mock board exam is published.

```
server/services/examExpiryJob.js
```
-> Cron job that runs periodically to transition published exams to `ongoing` when their start time is reached and auto-submit any timed-out student attempts.

```
server/services/examScheduleConflictService.js
```
-> Checks whether a new exam's scheduled window overlaps with any existing draft/published/ongoing student exam in the same program, returning conflicting exam details.

```
server/services/calendarService.js
```
-> Queries and formats mock board exam schedule data for display in the calendar view, supporting program filtering and date-range windowing.

```
server/services/settingsManager.js
```
-> Singleton service that manages SSE connections for faculty clients, handles the countdown timer for pending settings updates, and broadcasts system-update events in real time.

```
server/services/fileExtractionService.js
```
-> Extracts plain text (and images from DOCX) from uploaded PDF and DOCX file buffers using `pdf-parse` and `mammoth`.

```
server/services/geminiService.js
```
-> Calls the Google Gemini API to count multiple-choice questions in extracted document text and to parse/structure those questions into a JSON array for import review.

---

### Middleware

```
server/middleware/authMiddleware.js
```
-> JWT authentication middleware (`protect`): verifies the Bearer token or cookie, attaches the user to `req.user`, and rejects deactivated accounts; also exports role-guard helpers.

```
server/middleware/loginIpRateLimit.js
```
-> IP-based rate limiter (25 attempts / 15 min) applied to the login endpoint to defend against credential-stuffing attacks.

```
server/middleware/importRateLimit.js
```
-> Per-user sliding-window rate limiter for the question import endpoint, enforcing configurable hourly and daily upload limits tracked in memory.

```
server/middleware/importValidation.js
```
-> Multer middleware configured for in-memory storage, restricting uploads to PDF and DOCX mime types only.

```
server/middleware/rateLimit.js
```
-> Lightweight in-memory IP + path rate limiter used as a general-purpose fallback for routes not covered by the dedicated limiters.

---

### Utils

```
server/utils/emailService.js
```
-> Thin wrapper around the Brevo (Sendinblue) transactional email API: accepts a recipient, subject, and HTML body, and returns a success/failure result object.

```
server/utils/auditLogger.js
```
-> Convenience function `logAudit` that persists an admin action record to the `AuditLog` collection with actor ID, action type, target, and extra metadata.

```
server/utils/idFormats.js
```
-> Validates student and alumni ID strings against the `YYYY-XXXXXX` format pattern using regex; exported as `validateStudentId` / `validateAlumniId`.

```
server/utils/examAttemptUtils.js
```
-> Shared helpers for exam attempt processing: Fisher-Yates shuffle for randomizing question/answer order and score calculation with per-subject breakdown.

---

### Emails / Templates

```
server/emails/templates/welcomeCredentialsTemplate.js
```
-> Generates the HTML email body sent to newly registered users containing their temporary login credentials and a link to the platform.

```
server/emails/templates/passwordResetTemplate.js
```
-> Generates the HTML email body for password-reset OTP delivery.

```
server/emails/templates/examAnnouncementTemplate.js
```
-> Generates the HTML email body used when notifying program members that a new exam has been published.

```
server/emails/templates/examPublishedTemplate.js
```
-> Generates an alternate HTML email template variant for exam publication notifications (used for specific audience targeting).

---

### Scripts

```
server/scripts/seedSuperAdmin.js
```
-> One-time CLI script that creates the initial super-admin user in the database from `--email`, `--password`, and `--name` CLI arguments.

```
server/scripts/fixUserIdIndexes.js
```
-> One-time migration script that rebuilds MongoDB unique indexes on user ID fields to allow multiple `null` values (i.e., staff/admin accounts without student IDs).

```
server/scripts/migrateAlumniRole.js
```
-> Idempotent migration script that updates approved alumni registration records from the legacy `role='student'` + `userType='alumni'` shape to the corrected `role='alumni'` schema.

---

### Tests

```
server/tests/setup.js
```
-> Jest global setup that configures `mongodb-memory-server`, mocks the email service to prevent real sends during tests, and seeds the database before each test suite.

```
server/tests/helpers.js
```
-> Shared test utilities: functions to register and log in users of each role, create departments/programs/tags, and assert common HTTP response shapes.

```
server/tests/auth.test.js
```
-> Integration tests covering login, OTP password reset, lockout escalation, registration request submission, and credential change flows.

```
server/tests/adminCatalog.test.js
```
-> Tests for department and program CRUD endpoints, including role-based access restrictions.

```
server/tests/adminProtection.test.js
```
-> Tests that verify admin-only endpoints reject non-super-admin users with 401/403 responses.

```
server/tests/adminSettings.test.js
```
-> Tests for the settings pending-update lifecycle, including countdown start, cancel, and SSE broadcast behaviour.

```
server/tests/alumniExam.test.js
```
-> Tests for alumni exam creation, publishing without schedule, unlimited attempt submission, result retrieval, and audience separation from student exams.

```
server/tests/calendar.test.js
```
-> Tests the calendar endpoint for returning scheduled exam data within a given date range and program filter.

```
server/tests/catalog.test.js
```
-> Tests public and authenticated catalog endpoints for departments and programs.

```
server/tests/health.test.js
```
-> Smoke test that checks the API health endpoint returns a 200 response.

```
server/tests/mockBoardExam.test.js
```
-> Tests for mock board exam creation, publishing, schedule conflict detection, listing (faculty/public), and exam status transitions.

```
server/tests/mockExamResults.test.js
```
-> Tests for result computation, individual report generation, and result deletion on finished exams.

```
server/tests/questionCRUD.test.js
```
-> Tests the full question CRUD and approval workflow: create by professor, review by chair, approve/return/reject by dean, and encryption round-trip verification.

```
server/tests/questions.test.js
```
-> Additional question listing and filtering tests across different role permissions.

```
server/tests/registrations.test.js
```
-> Tests bulk and individual registration request flows, approval, rejection, and the SSE streaming progress endpoint.

```
server/tests/studentExam.test.js
```
-> Tests the student exam attempt lifecycle: start, save progress, submit, time-expiry auto-submit, and result retrieval.

```
server/tests/tags.test.js
```
-> Tests subject tag CRUD scoped to accessible programs for each faculty role.

```
server/tests/userManagement.test.js
```
-> Tests super-admin user management: list, activate/deactivate, delete users, and role-based filtering.

---

### Config Files

```
server/jest.config.js
```
-> Jest configuration: sets the test environment to `node`, enables `mongodb-memory-server` via `@shelf/jest-mongodb`, sets a 30-second test timeout, and enables verbose output.

```
server/package.json
```
-> Node.js project manifest: declares dependencies, scripts (`start`, `dev`, `test`, `seed`, `migrate`), and engine requirements for the Express API server.

---

## ====== CLIENT FILES =======

### Entry Points

```
client/index.html
```
-> Root HTML shell for the Vite/React SPA; references `src/main.jsx` as the module entry point and sets the page title and favicon.

```
client/src/main.jsx
```
-> Mounts the React root: wraps `<App />` in `<React.StrictMode>` and attaches it to `#root` in `index.html`.

```
client/src/App.jsx
```
-> Top-level application component: manages auth state, current route, and SSE subscription for system update warnings; renders `Navbar`, the active page, and global modals.

---

### Pages — General

```
client/src/pages/LandingPage.jsx
```
-> Public marketing/landing page with scroll-reveal animations, summary stats, and a login call-to-action for unauthenticated visitors.

```
client/src/pages/Login.jsx
```
-> Login form page with OTP-based password reset flow, session-expired message handling, and redirect after successful authentication.

```
client/src/pages/Dashboard.jsx
```
-> Role dispatcher that renders the correct dashboard component (SuperAdmin, Dean, ProgramChair, Professor, Student, Alumni) based on `me.role`.

```
client/src/pages/UserAccount.jsx
```
-> Displays the current user's profile summary (name, role, ID, program) as a simple read-only account info page.

```
client/src/pages/Credits.jsx
```
-> Static credits page listing the development team members.

---

### Pages — Super Admin

```
client/src/pages/superadmin/SAdminDashboard.jsx
```
-> Super-admin dashboard showing system-wide statistics (user counts, question counts, exam counts) and quick-action navigation links.

```
client/src/pages/superadmin/SAdminSchoolsPrograms.jsx
```
-> UI for managing the academic catalog: create/edit/deactivate departments and programs.

```
client/src/pages/superadmin/SAdminUsers.jsx
```
-> User management panel for super admins: list all users, activate/deactivate accounts, delete users, and filter by role.

```
client/src/pages/superadmin/SAdminSettings.jsx
```
-> Settings panel for configuring global app settings (email cooldown, password cooldown, max image uploads) with a pending-update countdown UI driven by SSE.

---

### Pages — Dean

```
client/src/pages/dean/DeanDashboard.jsx
```
-> Dean dashboard with program-level stats and navigation shortcuts for question approvals, exam management, and reports.

```
client/src/pages/dean/DeanMyQuestions.jsx
```
-> Thin wrapper around `shared/MyQuestions.jsx`: loads the dean's department programs and passes a program picker.

> Other dean pages (approvals, subjects, registration, exams, results) live in `pages/shared/`.

---

### Pages — Program Chair

```
client/src/pages/programchair/PCDashboard.jsx
```
-> Program chair dashboard with program-level stats and shortcuts for question approvals, exam creation, and audit logs.

```
client/src/pages/programchair/PCMyQuestions.jsx
```
-> Thin wrapper around `shared/MyQuestions.jsx`: passes the chair's own program as a fixed scope.

```
client/src/pages/programchair/PCLogs.jsx
```
-> Audit log / activity log viewer for program chairs showing admin actions within their scope.

> Other program chair pages (approvals, subjects, registration, exams, results) live in `pages/shared/`.

---

### Pages — Professor

```
client/src/pages/prof/ProfDashboard.jsx
```
-> Professor dashboard showing their personal question submission stats and quick links.

```
client/src/pages/prof/ProfMyQuestions.jsx
```
-> Thin wrapper around `shared/MyQuestions.jsx` for the professor's own program.

---

### Pages — Student

```
client/src/pages/student/StudentDashboard.jsx
```
-> Student dashboard showing upcoming/available exams and a summary of past attempts.

```
client/src/pages/student/StudentAvailableExams.jsx
```
-> Lists all currently available (published/ongoing) mock board exams for the student's program.

```
client/src/pages/student/StudentExamRunner.jsx
```
-> Timed exam-taking interface for students: renders shuffled questions, tracks answers, auto-saves progress, and submits on timeout.

```
client/src/pages/student/StudentExamResult.jsx
```
-> Shows the result of a single student exam attempt with per-subject score breakdown and pass/fail status.

```
client/src/pages/student/StudentExamResults.jsx
```
-> Lists all of a student's past exam attempts with date, score, and a link to each individual result.

---

### Pages — Alumni

```
client/src/pages/alumni/AlumniDashboard.jsx
```
-> Alumni dashboard showing available exams and a summary of past attempts across unlimited retakes.

```
client/src/pages/alumni/AlumniAvailableExams.jsx
```
-> Lists all published alumni-targeted mock board exams available for the alumni's program.

```
client/src/pages/alumni/AlumniExamRunner.jsx
```
-> Timed exam-taking interface for alumni: mirrors the student runner but allows repeated attempts without restriction.

```
client/src/pages/alumni/AlumniExamResult.jsx
```
-> Shows the result of a single alumni exam attempt with per-subject breakdown.

```
client/src/pages/alumni/AlumniExamResults.jsx
```
-> Lists all of an alumni's past exam attempts with attempt number, date, score, and link to each result.

---

### Pages — Shared

> Pages used by more than one faculty role (dean, program chair, professor). Role-specific behavior is handled inside each page via `me.role`.

```
client/src/pages/shared/MyQuestions.jsx
```
-> "My Questions" page used by professors, chairs, and deans: question list with status capsules, create/edit/view via `QuestionForm`, and AI-assisted import from PDF/DOCX with live review.

```
client/src/pages/shared/ApproveQuestions.jsx
```
-> Question approval queue for deans and program chairs: review submitted questions, approve, return for revision, or reject; includes a "Used in Exam" filter.

```
client/src/pages/shared/ManageSubject.jsx
```
-> Subject (tag) CRUD page for creating, editing, and deactivating subject tags within a program (deans and chairs).

```
client/src/pages/shared/StudentRegister.jsx
```
-> Student Registration page for deans and chairs; wraps `BulkRegister` with a role-aware subtitle (department vs. program).

```
client/src/pages/shared/BulkRegister.jsx
```
-> Bulk registration form allowing authorized faculty to upload or manually enter a list of users for batch account creation.

```
client/src/pages/shared/BoardExams.jsx
```
-> Board exam listing page for deans and chairs to view exams filtered by program, status, audience, and subject.

```
client/src/pages/shared/CreateExams.jsx
```
-> Mock board exam creation and editing for deans and chairs: assemble question sets, set schedules, publish, and view conflict warnings.

```
client/src/pages/shared/BoardExamPreview.jsx
```
-> Read-only preview of a mock board exam's questions and answers.

```
client/src/pages/shared/BoardExamTestRun.jsx
```
-> Interactive test-run mode for faculty to walk through an exam as if taking it, without recording an attempt.

```
client/src/pages/shared/ExamRunner.jsx
```
-> Faculty exam viewer opened from Board Exams in `details`, `preview`, or `testRun` mode.

```
client/src/pages/shared/ExamResults.jsx
```
-> Exam result overview: trigger result computation, view pass/fail breakdowns, and open individual reports. Program chairs only see their own program's exams.

```
client/src/pages/shared/IndividualReportView.jsx
```
-> Detailed per-student result report showing per-subject scores and answer breakdown.

---

### Components

```
client/src/components/Navbar.jsx
```
-> Top navigation bar with role-based menu items, profile dropdown trigger, and badge counters for pending approvals or notifications.

```
client/src/components/Modal.jsx
```
-> Reusable accessible modal dialog with portal rendering, Escape-key close, focus-trap, and configurable size variants.

```
client/src/components/ConfirmationModal.jsx
```
-> Specialized modal for destructive-action confirmations with a confirm and cancel button pair.

```
client/src/components/FeedbackModal.jsx
```
-> Informational/feedback modal with configurable tone (info, success, error) and a dismiss button for user-facing status messages.

```
client/src/components/ProfileModal.jsx
```
-> Dropdown profile panel rendered from the Navbar showing the current user's name, role, ID, and links to change credentials or log out.

```
client/src/components/ChangeCredentialsModal.jsx
```
-> Modal form for changing email or password with cooldown enforcement, old-credential verification, and success feedback.

```
client/src/components/QuestionForm.jsx
```
-> Rich question editor form supporting text fields, multiple answer options, correct-answer selection, image uploads to R2, and AI import review mode.

```
client/src/components/QuestionFilters.jsx
```
-> Filter bar component for the question list: filters by subject tag, approval status, and search text.

```
client/src/components/CapsuleFilters.jsx
```
-> Reusable row of pill-shaped filter buttons with optional count badges (`options`, `value`, `onChange`); used for the status filters on Approve Questions, My Questions, Board Exams, and the student/alumni Available Exams pages.

```
client/src/components/SearchBar.jsx
```
-> Reusable debounced text input component for filtering lists by a search query string.

```
client/src/components/DropdownSelect.jsx
```
-> Accessible custom dropdown/select component with keyboard navigation and optional placeholder support.

```
client/src/components/DateTimePicker.jsx
```
-> Date and time picker used for the exam schedule (Create Exams, `range` mode: start and end in one modal) and results release (Board Exams, single moment). Opens a modal with a month calendar that shows the program's scheduled exams as status dots, the chosen day's exams, and time inputs. In range mode the Starts/Ends cards pick which date the calendar sets, moving the start keeps the duration, and the days between are shaded. Overlapping exams are highlighted and warned about but never block Apply; a past start or an end before the start do.

```
client/src/components/TimeInput.jsx
```
-> 12-hour time input with one box per digit plus an AM/PM toggle (`[1][2] : [3][0] [AM]`). Clicking a box selects that digit, typing replaces it and moves to the next box, and arrow keys move between boxes or step the value. It only accepts valid times. Used by `DateTimePicker`.

```
client/src/components/CalendarIcons.jsx
```
-> Line icons shared by the exam calendar and the date & time picker (student, alumni, arrows, calendar).

```
client/src/components/ExamCalendar.jsx
```
-> Exam calendar used on Board Exams (dean, program chair) and the Program Chair dashboard: loads the month's exams per role, applies the page's status/search filters, flags overlapping schedules, renders them with `ExamMonthGrid`, and opens the click-to-detail modal.

```
client/src/components/ExamMonthGrid.jsx
```
-> Custom month grid for the exam calendar: today badge, month navigation, status-colored exam chips with student/alumni icons, and a "N more" day list. Rendered by `ExamCalendar`.

```
client/src/components/Pagination.jsx
```
-> Reusable pagination control bar with page number buttons, previous/next navigation, and total item count display.

```
client/src/components/PageHeader.jsx
```
-> Consistent page title and subtitle header component used across all content pages.

```
client/src/components/Toast.jsx
```
-> Toast notification system (context + hook `useToast`) for displaying transient success, error, or info messages at the bottom of the screen.

```
client/src/components/AuthImage.jsx
```
-> Displays a decrypted exam question image fetched from the server's secure image endpoint (handles AES-encrypted image blobs).

```
client/src/components/ImportReviewBubbles.jsx
```
-> Bubble-navigation grid for the AI import review step: shows a numbered bubble per question, color-coded by readiness/flags, matching the student exam runner style.

```
client/src/components/SystemUpdateWarning.jsx
```
-> SSE-powered banner that appears when a pending settings update countdown is active, warning faculty of an imminent system change.

```
client/src/components/Footer.jsx
```
-> Simple site footer with branding, copyright year, and optional navigation links.

```
client/src/components/PrivacyNotice.jsx
```
-> Privacy notice/consent banner displayed to unauthenticated users on the landing page or login screen.

---

### Lib

```
client/src/lib/api.js
```
-> Central API client with `api` and `apiAuth` fetch wrappers: automatically attaches the auth token from localStorage, handles JSON serialization, and throws on non-2xx responses.

```
client/src/lib/importApi.js
```
-> API functions specifically for the question import pipeline: upload document, validate/count, extract questions, and submit to the question bank.

```
client/src/lib/DeanTestRunOrganizer.js
```
-> Utility functions for the exam test-run mode: shuffle questions/answers, add option labels (a., b., c., d.), and organize question data for display.

```
client/src/lib/idFormats.js
```
-> Client-side mirror of the server's ID format config: exports validation regex pattern, placeholder, and error message for student/alumni ID fields.

---

### Services

```
client/src/services/mockExamResultService.js
```
-> API service module for exam result operations: list exams with status, fetch a single result, trigger result computation with a passing threshold, and delete a result.

---

### Hooks

```
client/src/hooks/useLocalStorage.js
```
-> Custom React hook that syncs a state value to `localStorage` with an optional write debounce delay, used to persist draft data across page reloads.

```
client/src/hooks/useCalendarExams.js
```
-> Custom React hook that loads the exams scheduled in a calendar month from the calendar endpoint for the user's role (dean, program chair, or learner). Used by `ExamCalendar` and `DateTimePicker`.

---

### Utils

```
client/src/utils/calendarUtils.js
```
-> Helper functions for the exam calendar and date & time picker: the visible month range, which exams fall on a day, exam time-range and date formatting, and schedule-conflict flags.

```
client/src/utils/statusLabels.js
```
-> Maps internal exam and question status strings (e.g. `pending_review`, `returned_for_revision`) to human-readable display labels used throughout the UI.

---

### Styles

```
client/src/styles/global.css
```
-> Global CSS variables, resets, and base typography/color tokens applied across the entire application.

```
client/src/styles/LandingPage.css
```
-> Styles for the public landing page layout, hero section, stats cards, and scroll-reveal animations.

```
client/src/styles/Login.css
```
-> Styles for the login form page including the split-panel layout with the school image and branding.

```
client/src/styles/Credits.css
```
-> Styles for the credits page card layout.

```
client/src/styles/components/Navbar.css
```
-> Styles for the top navigation bar, mobile hamburger menu, and badge indicators.

```
client/src/styles/components/Modal.css
```
-> Styles for modal backdrop, dialog sizing variants, header, body, and close button.

```
client/src/styles/components/ChangeCredentialsModal.css
```
-> Styles for the credential-change modal form layout and cooldown warning display.

```
client/src/styles/components/ProfileModal.css
```
-> Styles for the profile dropdown panel layout, user info rows, and action buttons.

```
client/src/styles/components/QuestionForm.css
```
-> Styles for the question editor form: answer option rows, image upload zone, and import review mode layout.

```
client/src/styles/components/QuestionFilters.css
```
-> Styles for the question filter bar with tag chips and status dropdown.

```
client/src/styles/components/CapsuleFilters.css
```
-> Styles for `CapsuleFilters`: outlined pills (label then yellow count badge), solid navy active state; modeled on the Board Exams status filters.

```
client/src/styles/components/SearchBar.css
```
-> Styles for the search input component with icon and clear button.

```
client/src/styles/components/DropdownSelect.css
```
-> Styles for the custom dropdown component: trigger button, option list, and selected-state highlight.

```
client/src/styles/components/DateTimePicker.css
```
-> Styles for the date & time picker: trigger field, calendar with exam dots and range shading, Starts/Ends cards with time inputs, day exam list, and overlap warnings.

```
client/src/styles/components/TimeInput.css
```
-> Styles for the per-digit time input: digit boxes (the focused one is filled navy), the colon, and the AM/PM toggle.

```
client/src/styles/components/ExamCalendar.css
```
-> Styles for the exam details modal opened from the calendar.

```
client/src/styles/components/ExamMonthGrid.css
```
-> Styles for the custom exam month grid: header, legend, day boxes, status-colored chips, and the day list modal.

```
client/src/styles/components/Pagination.css
```
-> Styles for the pagination bar and active/disabled page button states.

```
client/src/styles/components/PageHeader.css
```
-> Styles for the page title/subtitle header block used at the top of content pages.

```
client/src/styles/components/Toast.css
```
-> Styles for the toast notification container, entry/exit animations, and tone-based color variants.

```
client/src/styles/components/Footer.css
```
-> Styles for the site footer layout and branding text.

```
client/src/styles/components/ImportReviewBubbles.css
```
-> Styles for the import review bubble navigation grid matching the exam-runner bubble style.

```
client/src/styles/components/PrivacyNotice.css
```
-> Styles for the privacy consent banner layout and accept button.

```
client/src/styles/shared/AdminFacultyDashboard.css
```
-> Shared dashboard styles (stat cards, quick-action grids) reused across super-admin, dean, and program-chair dashboards.

```
client/src/styles/shared/AvailableExams.css
```
-> Shared styles for the available-exams list (exam cards, status badges, countdown timers).

```
client/src/styles/shared/BoardExams.css
```
-> Styles for the board exam faculty listing page with status filters and exam card grid.

```
client/src/styles/shared/BulkRegister.css
```
-> Styles for the bulk registration page: file upload zone, user list table, and progress indicator.

```
client/src/styles/shared/MyQuestions.css
```
-> Styles for the My Questions page (`qp-*` classes): question list, import modal, and action toolbar.

```
client/src/styles/shared/CreateExams.css
```
-> Styles for the exam creation/editing page (deans and chairs).

```
client/src/styles/shared/ExamResults.css
```
-> Styles for the exam results overview and report navigation (deans and chairs).

```
client/src/styles/shared/StudentRegister.css
```
-> Styles for the Student Registration page (deans and chairs).

```
client/src/styles/shared/MockBoardExamPreview.css
```
-> Styles for the exam preview page: question list, answer options, and print-friendly layout.

```
client/src/styles/shared/QuestionApprovals.css
```
-> Styles for the question approval queue: status badge chips, comment thread, and approve/return/reject button row.

```
client/src/styles/shared/StudentExamResult.css
```
-> Styles for the individual exam result page: score circle, per-subject table, and pass/fail banner.

```
client/src/styles/shared/StudentExamResults.css
```
-> Styles for the exam history list: attempt rows, score display, and date formatting.

```
client/src/styles/shared/SubjectTags.css
```
-> Styles for the subject tag management page: tag chips, edit inline form, and deactivate toggle.

```
client/src/styles/dean/DeanDashboard.css
```
-> Dean-specific dashboard styles layered on top of `AdminFacultyDashboard.css`.

```
client/src/styles/programchair/PCLogs.css
```
-> Styles for the audit log viewer page: log entry rows, action type badges, and timestamp display.

```
client/src/styles/student/StudentDashboard.css
```
-> Styles for the student dashboard: upcoming exam card, attempt history summary, and welcome banner.

```
client/src/styles/alumni/AlumniDashboard.css
```
-> Styles for the alumni dashboard layout and available-exam cards.

```
client/src/styles/alumni/AlumniAvailableExams.css
```
-> Styles for the alumni available exams list page.

```
client/src/styles/alumni/AlumniExamResults.css
```
-> Styles for the alumni exam results history list with attempt-number column.

```
client/src/styles/superadmin/SAdminCatalog.css
```
-> Styles for the schools/programs catalog management page.

```
client/src/styles/superadmin/SAdminSchoolsPrograms.css
```
-> Styles for the schools and programs listing and create/edit form panels.

```
client/src/styles/superadmin/SAdminSettings.css
```
-> Styles for the admin settings page including the countdown warning card.

```
client/src/styles/superadmin/SAdminUsers.css
```
-> Styles for the user management table, role filter chips, and action button row.

---

### Assets

```
client/src/assets/barklogo.png
```
-> NU BARK application logo image used in the Navbar and email templates.

```
client/src/assets/henrysyhall.jpg
```
-> Photo of Henry Sy Hall (NU campus building) used as the decorative background on the login page.

```
client/src/assets/npc-seal.png
```
-> NPC (National Privacy Commission) seal image displayed in the privacy notice component.

---

### Config

```
client/vite.config.js
```
-> Vite build configuration: sets up the React plugin, defines the dev server proxy for the backend API, and configures the PWA manifest and service worker via `vite-plugin-pwa`.

```
client/package.json
```
-> Node.js project manifest for the React/Vite frontend: lists dependencies (React, date-fns, react-datepicker, etc.) and build/dev/preview scripts.

---

## ====== ROOT / WORKSPACE FILES =======

```
package.json
```
-> Root workspace package.json with convenience scripts to run or build both `client` and `server` concurrently.

```
README.md
```
-> Project overview, setup instructions, environment variable reference, and contribution guidelines.

```
.gitignore
```
-> Git ignore rules excluding `node_modules`, `.env` files, `dist/`, and other non-tracked build artifacts.

```
.github/workflows/ci.yaml
```
-> GitHub Actions CI workflow that installs dependencies and runs the Jest test suite on every push or pull request.

---

## ====== DOCS FILES =======

```
docs/concurrency_plan.md
```
-> Design document outlining the plan for handling concurrent exam attempts and preventing race conditions in score submission.

```
docs/student_exam_plan.md
```
-> Design document describing the planned student exam attempt flow, timing logic, and auto-submit behaviour.

```
docs/SuperAdminDashboard.md
```
-> Feature specification and UI notes for the super-admin dashboard page.

```
docs/file-reference.md
```
-> This file — a comprehensive map of all project files and their purposes.
