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

```
server/config/geminiModels.js
```
-> Reads the Gemini models for the AI import from the environment, in the order they are tried: `GEMINI_MODEL_1`, `GEMINI_MODEL_2`, … (numbers set the order, gaps allowed, no maximum), each with optional `_RPM` / `_RPD` limits that default to `GEMINI_RPM_LIMIT` / `GEMINI_RPD_LIMIT` (8 / 200). A limit of 0 turns a model off. With no numbered models, `GEMINI_MODEL` is the only model. An empty name, a limit that is not a whole number or a model listed twice throws `GeminiConfigError`; `server.js` checks this at startup and stops.

---

### Controllers

```
server/controllers/authController.js
```
-> Handles all authentication flows: user login with escalating lockout protection, password reset via OTP, bulk and individual registration, credential changes, and email/ID validation helpers. `updateBoardExamCountdown` saves (or clears, with `targetAt: null`) the board exam countdown a student or alumni sets on their dashboard; the date must be in the future.
-> Manages bulk registration batch sessions in memory and streams progress updates to the client via SSE.
-> `listUsers` (`GET /api/auth/users`) keeps deans to their department and chairs to their program: a dean's `program` filter only narrows inside the department, and a chair's query can't change the scope; only the super admin can pick any department or program. It pages by default (`page`, `limit` up to 100). With `all=true` it returns every matching user at once, newest first, with only the fields a list page shows (no password, reset codes or other private fields); Student Registration loads its list this way.
-> `getUserActivity` (`GET /api/auth/users/:id/activity`), scoped like unlock, gives one student's or alumnus's `lastLoginAt`, `lastActiveAt`, `sessionMs` (from that sign-in to their last heartbeat), `online` (a heartbeat in the last 5 minutes, the system metrics' window) and `lastExam` (their latest attempt: exam name, status, start and end, attempt number). `loginUser` sets `lastLoginAt` on every successful sign-in.

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
-> Runs the AI question import in one request. `importQuestions` checks the file and reads its text, turns away a file whose rough count (no AI) is well over `IMPORT_MAX_QUESTIONS` (default 40) without asking Gemini or using up an upload, then asks Gemini once to count and extract the questions. A file over the limit is turned away and counts as an upload. Otherwise the guardrails run (they remove any rationalization that is not in the document) and the questions are returned for review. The file text is not stored. `getLimits` returns the user's import limits and the question limit. Reviewed questions are saved through the normal question endpoints, not here.

```
server/controllers/mockBoardExamController.js
```
-> Handles mock board exam lifecycle: create, publish, archive, and delete exams; enforces schedule conflict checks; sends email announcements on publish; and exposes filtered exam lists for faculty, students, and alumni. Records `publishedBy` / `publishedAt` whenever an exam goes from draft to published (on create or update).

```
server/controllers/mockExamResultController.js
```
-> Computes, stores, and retrieves mock exam results; aggregates per-subject scores; generates individual and aggregate reports from student and alumni attempt data. Its exam list includes each exam's subject names, for the Exam Results subject filter and card pills.

```
server/controllers/questionController.js
```
-> CRUD for exam questions with AES encryption of text and image fields; handles approval workflow (pending → approved/returned/rejected), reviewer edits that keep a question in review, last-edited tracking for real content changes, and integrates with Cloudflare R2 for image storage and deletion.

```
server/controllers/sseController.js
```
-> Registers faculty clients on the Server-Sent Events (SSE) stream so they receive real-time system-update warnings from the settings manager.

```
server/controllers/statsController.js
```
-> Returns aggregate summary statistics (user counts, question counts, exam counts, audit log entries) used on dashboards and the public landing page.
-> `getExamActivityLogs` (`GET /api/stats/program-chair/exam-logs[?examId=]`, chairs) lists the program's published, ongoing and finished exams, and with `examId` that exam's takers: status (in progress, submitted, or missed when it was auto-submitted with nothing done), school ID, answered count, time taken, alumni attempt number, and their events (started, progress milestones, window focus lost, submitted), plus whether the exam is live.

```
server/controllers/systemMetricsController.js
```
-> Super-admin System Metrics endpoint (`GET /api/stats/system-metrics?range=1h|24h|7d`): request traffic, 429 counts, response times and CPU use, users active in the last 5 minutes / 24 hours, server and database health, 14-day exam-attempt and audit-log counts, and the AI import's Gemini models (`ai`: each model's usage against its limits, status, cooldown and the next daily reset, plus totals across the models: capacity per minute and per day, used, left today and imports left, from `getGeminiModelsStatus`).

```
server/controllers/studentExamController.js
```
-> Manages the full student exam attempt lifecycle: start, save progress, submit, auto-submit on time expiry, and retrieve individual attempt results with shuffled questions. The available-exams list includes `publishedAt` and `publishedByName` (falling back to the creator and creation time for exams published before publish tracking) for the dashboard announcements.

```
server/controllers/alumniExamController.js
```
-> Mirrors the student exam controller for alumni users: start/submit unlimited attempts, retrieve per-attempt results, and expose alumni-specific attempt history and aggregate reporting. Its available-exams list carries the same `publishedAt` / `publishedByName` fields as the student one.

```
server/controllers/tagController.js
```
-> CRUD for subject tags (topics) scoped to accessible programs; resolves program access based on the requesting user's role (professor, program_chair, dean). A subject used by any question can't be deleted; deleting one also takes it off the exams that list it.

---

### Routes

```
server/routes/authRoutes.js
```
-> Mounts auth endpoints: login, logout, OTP request/verify, registration management, bulk-register SSE stream, and credential update routes, plus `PATCH /me/board-exam-countdown` for students and alumni `PATCH /users/:id/unlock`, which clears a login lockout (super admin for anyone; dean and program chair for students and alumni in their department or program), and `GET /users/:id/activity` with the same scope.

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
-> Mounts the AI import endpoints: `GET /limits` and `POST /extract` (file upload, with the subjects as a JSON `tags` field), guarded by the per-user import limit, the shared Gemini request limit, the one-import-at-a-time lock and file validation.

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
-> Mounts question CRUD routes and approval workflow routes, scoped by role (professor submits, chair/dean approves or edits in review through the `review-edit` routes).

```
server/routes/sseRoutes.js
```
-> Mounts the SSE subscription endpoint (`/api/sse/faculty`) for real-time settings-update broadcast.

```
server/routes/statsRoutes.js
```
-> Mounts the public summary stats endpoint used on the landing page and dashboards, plus the super-admin `/system-metrics` endpoint.

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
-> Mongoose schema for all user types (super_admin, dean, program_chair, professor, student, alumni) with hashed passwords, lockout fields, `lastLoginAt` (the last successful sign-in) and `last_active_at` (the last heartbeat), OTP fields, email/ID fields, role-based department/program references, and the learner's `boardExamCountdown` (`label`, `targetAt`).

```
server/models/MockBoardExam.js
```
-> Mongoose schema for mock board exams: title, program, questions array, status lifecycle (draft → published → ongoing → finished/archived), schedule, target audience (student/alumni), attempt counters, and who last published it and when (`publishedBy`, `publishedAt`).

```
server/models/Question.js
```
-> Mongoose schema for exam questions with encrypted text and answer fields, image references (Cloudflare R2 keys), tag/program associations, approval status workflow fields, and who last edited the content and when (`lastEditedBy`, `lastEditedAt`).

```
server/models/StudentExamAttempt.js
```
-> Mongoose schema for a student's single exam attempt: selected answers map, per-subject scores, total score, start/submit timestamps, and a shuffled question order snapshot.

```
server/models/AlumniExamAttempt.js
```
-> Mongoose schema for an alumni exam attempt; mirrors StudentExamAttempt but allows unlimited attempts per exam with an incrementing `attemptNumber` field.

```
server/models/RequestMetric.js
```
-> One document per minute while the server runs: request count, 4xx/5xx/429 counts, total and slowest response time, a latency histogram, CPU time used against CPU time available, and the request counters per route pattern. A TTL index deletes minutes older than 7 days.

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
-> Mongoose schema that records administrative actions (user creation, approval, deletion, settings changes) with actor, action type, target type/ID, and metadata. Creating or editing a question group is logged as `question_group_created` / `question_group_updated`, with the first question as the target and the `groupId` in the details.

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

```
server/models/ImportUsage.js
```
-> One document per finished import (`import`, per user) and per Gemini request (`gemini_call`, retries included, with its `model` and `outcome`: pending, success, rate_limited or failed). The per-user limits and each model's limits are counted from these. A TTL index deletes them after 25 hours.

```
server/models/GeminiCooldown.js
```
-> One document per Gemini model that Google turned away, with the reason and when the model may be used again: `minute` (the wait Google asked for), `day` (the next midnight Pacific time) or `unavailable` (the model does not exist for the API key; tried again after an hour). A TTL index deletes it once it has ended.

```
server/models/ImportLock.js
```
-> One lock per user while an import request is running, so a user runs one import at a time. A lock that is never released expires after 5 minutes and can then be taken over.

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
server/services/requestMetrics.js
```
-> Express middleware that times every API request and groups it by route pattern (never raw URLs, query strings or bodies), adds the totals to `RequestMetric` every 30 seconds, measures event loop delay and CPU use (against the container's CPU limit when there is one), and builds the time series, percentiles and per-endpoint table for the metrics page. Skips `/`, `/health`, CORS preflights and SSE streams.

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
-> Extracts plain text (and images from DOCX) from uploaded PDF and DOCX file buffers using `pdf-parse` and `mammoth`. `estimateQuestionCount` gives a rough question count without the AI (lines that start an "A" option), used to turn away a file that clearly has too many questions.

```
server/services/geminiService.js
```
-> Calls the Google Gemini API once per import (`extractQuestions`): the prompt has the model count the multiple-choice questions and, when there are no more than the limit, return them as JSON for review in the same reply (`{ question_count, questions }`). `callWithFallback` sends each request to the first model in `config/geminiModels.js` that can take it. A model that answers 429 (out of quota) or 404 gets a cooldown (`cooldownFor` reads Google's QuotaFailure and RetryInfo; a daily quota waits for midnight Pacific time) and the next model is tried. A timeout, 5xx or reply that is not valid JSON is retried once on the same model, then the next model is tried; any other error is returned at once. Every request, retries included, first takes a place under its model's limits (`reserveGeminiCall`). The extract prompt copies a rationalization only when the document or its answer key gives one and never writes one. `processQuestionsWithGuardrails` also removes any rationalization that is not in the document text and flags that question for review.

```
server/services/importStateService.js
```
-> Import state kept in MongoDB, so it holds across restarts and server instances: the most questions a file may hold (`importMaxQuestions`, `IMPORT_MAX_QUESTIONS`, default 40), each user's hourly and daily import count (`IMPORT_USER_HOURLY_LIMIT` / `IMPORT_USER_DAILY_LIMIT`, default 8 / 20), each Gemini model's per-minute and daily limits (the daily count runs from midnight Pacific time, like Google's) and cooldowns, each model's status for System Metrics (`getGeminiModelsStatus`), and the one-import-per-user lock.

---

### Middleware

```
server/middleware/authMiddleware.js
```
-> JWT authentication middleware (`protect`): verifies the Bearer token or cookie, attaches the user to `req.user`, and rejects deactivated accounts; also exports role-guard helpers.

```
server/middleware/loginIpRateLimit.js
```
-> Per-IP limit on the login endpoint against password spraying. Over a 15-minute window an IP may fail 50 times, plus once more for every different account that signed in successfully from it, so a computer lab full of students sharing one network address can absorb typos while an attacker with no working password still stops at 50. Separately, at most 300 login requests per IP can be in progress at once; each frees its place when its response is sent. `loginUser` reports results through `recordFailedLogin` / `recordSuccessfulLogin(req, userId)`.

```
server/middleware/forgotPasswordRateLimit.js
```
-> Limits for `POST /api/auth/forgot-password`: 3 requests per email address and 50 per IP per 15 minutes, so students sharing a lab network can each ask for a reset code.

```
server/middleware/importRateLimit.js
```
-> Limits for the import routes: `userImportLimiter` (each user's hourly and daily import limit), `geminiLimiter` (turns a request away when the shared Gemini limit is already used up) and `concurrentImportLimiter` (one import at a time per user; the lock is released when the response ends). The counts and the lock are kept in MongoDB by `importStateService`.

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

```
server/utils/questionHtml.js
```
-> `cleanQuestionHtml` keeps only the markup the rich-text editor makes (the same list `SafeHtml` allows, equations included) in question text, answer choices, rationalizations and shared passages. HTML with nothing visible left, such as empty paragraphs, becomes `''`.

```
server/utils/pacificTime.js
```
-> `startOfPacificDay` and `nextPacificMidnight`: the Gemini API resets daily quotas at midnight Pacific time, so the import's daily counts and cooldowns use the same day, also on the days the clocks change.

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
-> Jest global setup that configures `mongodb-memory-server`, mocks the email service to prevent real sends during tests, and seeds the database before each test suite. It passes Node's `os` module to Mongoose as a runtime adapter, because the MongoDB driver loads it with a dynamic `import()` that fails under Jest.

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
server/tests/myQuestionsList.test.js
```
-> Tests for the list My Questions loads: every question and whole sets, only the user's own, who last edited, and reading feedback leaving the date alone.

```
server/tests/questionReviewEdit.test.js
```
-> Tests for a chair or dean editing a submitted question: it stays in review, who may edit, set edits, locks and last-edited tracking.

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
-> Tests super-admin user management: list, activate/deactivate, delete users, and role-based filtering; the Student Registration list's scope and `all=true`; and the activity endpoint (sign-in time recorded at login, visit length, online, last exam, scope).

```
server/tests/systemMetrics.test.js
```
-> Tests the System Metrics endpoint: super-admin-only access, range validation, route-pattern recording (no raw IDs or query strings), skipped health checks, per-minute upserts, 429 counts, CPU readings, active-user and audit-log counts, and the latency percentile estimate.

```
server/tests/geminiModels.test.js
```
-> Tests the Gemini model list and fallback: reading the numbered models and their limits (and the startup errors), midnight Pacific time across the clock changes, how long a model is skipped after a per-minute quota, a daily quota or a missing model, falling back to the next model (skipping one in cooldown or at this server's limit, retrying a passing error once, not falling back for a bad request), the messages when no model has room, and the models on the System Metrics page.

```
server/tests/loginRateLimit.test.js
```
-> Tests the per-IP login limit: 200 people on one network signing in at once, blocking after too many wrong passwords, the cap on unsuccessful attempts, and that per-account lockout still applies.

```
server/tests/importFlow.test.js
```
-> Tests the AI import with Gemini mocked: counting and extracting in one request (the limit in the prompt, the subjects sent with the text), a rationalization from the document kept and one the AI wrote removed, files over the question limit turned away (by the AI's count, by the questions returned, and by the rough count without asking Gemini), a file with no questions, the rough count itself, the removed endpoints (including the old count step), every Gemini request counted (retries included), the per-user and shared limits, and the one-import-at-a-time lock.

```
server/tests/questionRules.test.js
```
-> Tests question rules: submitting single questions and groups without a rationalization, image flags from an import kept and editable, question HTML cleaned on the server, the group audit log entry, and subject checks when a question's subject changes.

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
-> Mounts the React root: wraps `<App />` in `<React.StrictMode>` and attaches it to `#root` in `index.html`. Also turns off MathLive's sound effects, whose files are not shipped with the app.

```
client/src/App.jsx
```
-> Top-level application component: manages auth state, current route, and SSE subscription for system update warnings; renders `Navbar`, the active page, and global modals. Holds the shared exam handlers (`startStudentExam`, `startAlumniExam`, `viewAlumniResults`) used by the available-exams pages and the learner dashboard.

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
-> Role dispatcher that renders the correct dashboard component (SuperAdmin, Dean, ProgramChair, Professor) based on `me.role`; students and alumni both get `shared/LearnerDashboard.jsx` with `audience` set to their role and the exam take/result handlers from `App.jsx`.

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
-> User management panel for super admins: list all users, activate/deactivate accounts, unlock accounts locked after too many wrong passwords, delete users, and filter by role.

```
client/src/pages/superadmin/SAdminSettings.jsx
```
-> Settings panel for configuring global app settings (email cooldown, password cooldown, max image uploads) with a pending-update countdown UI driven by SSE.

```
client/src/pages/superadmin/SAdminMetrics.jsx
```
-> System Metrics page for super admins: live tiles (active users, live connections, uptime, database response), request charts by outcome (including 429 "blocked" requests), response time and server CPU with a 1h/24h/7d range filter, an endpoints table, 14-day activity charts, and server health. An AI question import section shows the Gemini model in use, requests today against the daily total of all models (with a meter), about how many imports are left today (one request each), a countdown to the daily reset, and a table of the models in fallback order with each one's status, a live countdown to when it can be used again, meters for its per-minute and daily limits, and an All models total row. Every chart can switch to a table view; refreshes every 30 seconds, and as soon as a short cooldown ends.

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
-> The Logs page for program chairs, with the list and panel layout of Approve Questions (shared `ca-` styles). Exams can be filtered by status (Published, Ongoing, Finished), audience and name, and sorted Newest or Oldest by start date. The panel shows how the takers are doing (started, in progress, submitted, missed, window focus lost), then the takers as rows that can be filtered, searched and sorted (latest start, name, most focus lost); opening one shows their numbers and activity, oldest first, with a button back to the list. A live exam reloads every 25 seconds while open, and Refresh reloads it at once. The panel opens with `PanelHeader` and `usePanelLayout`.

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
client/src/pages/student/StudentAvailableExams.jsx
```
-> Lists all currently available (published/ongoing) mock board exams for the student's program.

```
client/src/pages/student/StudentExamRunner.jsx
```
-> Timed exam-taking interface for students: renders shuffled questions, tracks answers, auto-saves progress, and submits on timeout. Questions are navigated with `QuestionNavBubbles`.

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
client/src/pages/alumni/AlumniAvailableExams.jsx
```
-> Lists all published alumni-targeted mock board exams available for the alumni's program.

```
client/src/pages/alumni/AlumniExamRunner.jsx
```
-> Timed exam-taking interface for alumni: mirrors the student runner but allows repeated attempts without restriction. Questions are navigated with `QuestionNavBubbles`.

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
-> "My Questions" page used by professors, chairs, and deans: question cards with status capsules and a legend beside a preview panel, sharing the Approve Questions layout and animations; submit, edit and delete from the panel, create/edit via `QuestionForm`, and AI-assisted import from PDF/DOCX with live review. The panel opens with `PanelHeader` and `usePanelLayout`: it can be widened over the list (the columns glide) or go full screen.

```
client/src/pages/shared/ApproveQuestions.jsx
```
-> Question approval queue for deans and program chairs: review submitted questions, edit them in place, approve, return for revision, or reject; shows who last edited a question and when; includes a "Used in Exam" filter. The panel opens with `PanelHeader` and `usePanelLayout`: it can be widened over the list (the columns glide) or go full screen. The bulk arrows sit before the full-screen and close buttons.

```
client/src/pages/shared/ManageSubject.jsx
```
-> Subject page for deans and chairs, with the list and panel layout of Approve Questions (shared `ca-` styles). A dean picks a program first. A card shows the subject's name with its question and exam counts. A Questions and Exams toggle sits beside the subject's name in the panel: Questions steps through all its submitted questions with `QuestionStepper`, showing each one's status, professor, submitted date and last edit; Exams lists the exams that use it. Subjects are added and renamed in a window, and deleted from the panel, which is blocked while questions use them. It loads every question and exam once (`/api/questions/approvals`, `/api/mock-board-exams`) and works out each subject's share itself, so drafts aren't included. The panel opens with `PanelHeader` and `usePanelLayout`: it can be widened over the list (the columns glide) or go full screen.

```
client/src/pages/shared/StudentRegister.jsx
```
-> Student Registration page for deans and chairs, with the list and panel layout of Approve Questions (shared `ca-` styles). It loads every student and alumni account once (`/api/auth/users?all=true`) and filters, counts, sorts and pages them in the browser, like the other list pages, so tabs, search and pages show at once: All, Students, Alumni and Locked tabs, search, program (deans) and Newest or Oldest. A card shows the name, type and lock markers, program (deans), ID, email and registered date. The panel's Activity section loads `/api/auth/users/:id/activity` when an account opens: Last Sign-in, Time Signed In in hours and minutes, and Last Exam Answered with its status pill; accounts that haven't signed in since sign-in times were recorded say "Not recorded yet". Then their details. A locked account gets an action bar saying until when, with Unlock Sign-in. "+ Register Accounts" opens `BulkRegister`, and the list reloads when a batch finishes. The panel opens with `PanelHeader` and `usePanelLayout`. `App.jsx` imports it after the other pages, so it doesn't move their shared stylesheets earlier in the CSS bundle.

```
client/src/pages/shared/BulkRegister.jsx
```
-> The "Register Accounts" window opened from Student Registration: the account type (students or alumni), the program (deans pick one of their department's; a chair's is their own), and a row per person (full name, email, Student or Alumni ID as YYYY-XXXXXX). Rows are checked before sending, and only the fields at fault are marked; the server's own row errors are mapped back to their rows. The rows are kept in `localStorage` (`draft_bulk_registration`) until sent. After sending it polls the batch, then shows how it went: registered, skipped, email not sent and not created, with the names under each. Closing it while it runs is fine: a toast says how it went and the page's list reloads.

```
client/src/pages/shared/LearnerDashboard.jsx
```
-> Dashboard shared by students and alumni (`audience` prop picks the endpoints, ID field and routes). Sections: a hero (greeting, initials, open-exam count, program, school, batch taken from the ID's year prefix, ID, links to available exams and results); Overview / Performance / Subjects / Today stat cards (Today is a live date and time); a score progress line chart (last 10 scored attempts with a labelled dashed passing mark); a distance-to-passing ring (average vs. the latest exam's passing mark) beside a "Do this next" card naming the subject with the most missed items; "New exams for you" (featured exam + up to 3 more, newest published first, "New" tag for exams published in the last 3 days, open/closing soon/upcoming/completed chips, attempts allowed, Take or Retake for alumni); subject accuracy (table always shown, bar chart in the full view; green at or above the latest passing mark, amber up to 10 points under, red below); and recent exam activity (last 5 attempts, release countdown for unreleased student results). A sidebar holds the board exam countdown (a date and exam name the learner sets, saved through `PATCH /api/auth/me/board-exam-countdown`), the exam calendar (a month grid with a dot per open/closing/upcoming/completed exam and the selected day's exams, with a jump to the next exam when the day is empty), and announcements ("<publisher> published <exam> · starts <time>", newest first). The calendar and announcements are built from the available-exams list, so they need no extra request. Students' unreleased attempts are shown as pending and left out of every score.

```
client/src/pages/shared/BoardExams.jsx
```
-> Board exam page for deans and chairs, with the list and panel layout of Approve Questions (shared `ca-` styles) and a calendar view. Exams can be filtered by status, program, subject, audience and search text, and sorted Newest or Oldest. A card shows the exam's name, its question count, audience and status markers, program (deans only), first subject + "+N", and start date. A Questions and Details toggle sits beside the exam name in the panel. Questions steps through the whole exam with `QuestionStepper`, loading the questions when an exam is opened. Details shows the exam's information (program, audience, creator, created date, start, end, duration, passing threshold, question count, submissions or attempts, status, results release, subjects, description, instructions). The actions depend on the status: Publish, Edit, Test Run, Schedule or Reschedule Results, Create Copy, Archive, End Exam Early and Delete. The panel opens with `PanelHeader` and `usePanelLayout`: it can be widened over the list (the columns glide) or go full screen.

```
client/src/pages/shared/CreateExams.jsx
```
-> Mock board exam creation and editing for deans and chairs: assemble question sets, set schedules, publish, and view conflict warnings.

```
client/src/pages/shared/BoardExamPreview.jsx
```
-> Read-only preview of a mock board exam's questions and answers, navigated with `QuestionNavBubbles`.

```
client/src/pages/shared/BoardExamTestRun.jsx
```
-> Interactive test-run mode for faculty to walk through an exam as if taking it, without recording an attempt. Questions are navigated with `QuestionNavBubbles`.

```
client/src/pages/shared/ExamRunner.jsx
```
-> Faculty exam viewer opened from Board Exams in `details`, `preview`, or `testRun` mode.

```
client/src/pages/shared/ExamResults.jsx
```
-> Exam results page for deans and chairs, with the list and panel layout of Approve Questions (shared `ca-` styles). Exams can be filtered by result state (Ready, To compute, Pending), program (deans), subject, audience and search text, and sorted Newest or Oldest by exam date. A card shows the exam's name, its question count, audience and result-state markers, program (deans only), first subject + "+N", and start date. Once an exam has results, an Overall, Questions and Individual toggle sits beside its name in the panel: Overall has the summary, score distribution, scores by topic (a topic opens its questions) and the exam's details; Questions steps through the exam with `QuestionStepper` and each answer's count; Individual is `IndividualReportView`. Without results, the panel says why and shows the details, with Compute Results when a student exam has ended. Once an exam has results, Download Excel saves them: students get one row each (score, status, and a column per subject), alumni get their attempts. The panel opens with `PanelHeader` and `usePanelLayout`: it can be widened over the list (the columns glide) or go full screen, covering the navbar and footer. Program chairs only see their own program's exams.

```
client/src/pages/shared/IndividualReportView.jsx
```
-> The Individual view of the Exam Results panel: everyone eligible for the exam as rows split by lines, filtered by whether they took it, searched and sorted. Opening a row shows that person in the same panel: score, attempts (alumni), scores by topic and their answers through `QuestionStepper`.

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
-> Rich question editor form supporting text fields, multiple answer options, correct-answer selection, image uploads to R2, an optional rationalization, AI import review mode, and a reviewer mode (`reviewEdit`) with one Save Changes button that keeps the question in review. New questions are saved one at a time (a set as one group): each leaves the form and its draft as soon as it is saved, so retrying after a failure does not create duplicates.

```
client/src/components/QuestionFilters.jsx
```
-> Filter bar with search, subject, program (deans only) and sort, used by My Questions, Approve Questions, Board Exams, Exam Results, Logs and Student Registration. The subject filter shows only when `onSubjectChange` is given. A page can add its own filters before the sort (`extraFilters`) and controls at the end of the row (children).

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
-> Date and time picker used for the exam schedule (Create Exams, `range` mode: start and end in one modal) and results release (Board Exams, single moment). Opens a modal with a month calendar that shows the program's scheduled exams as status dots, the chosen day's exams, and time inputs. In range mode the Starts/Ends cards pick which date the calendar sets, moving the start keeps the duration, and the days between are shaded. Overlapping exams are highlighted and warned about but never block Apply; a past start or an end before the start do. Without a `role` it loads no exams and hides the day panel (used for the learner board exam countdown).

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
-> `QuestionNavBubbles` in a bordered section with the progress in a header bar ("N of M questions ready" while editing, "Question X of N" read-only). Used by the question form (import review and grouped questions), the read-only question set views (My Questions, Approve Questions, Create Exams, exam results) and `QuestionStepper`. While editing, a question with no flags counts as ready. `aside` adds something to the right of the header bar.

```
client/src/components/QuestionMarkers.jsx
```
-> The small round markers on list cards and the legend that explains them, shared by Approve Questions, My Questions, Board Exams, Manage Subjects and Exam Results. Also the pills that spell a question's or an exam's status out, and the exam statuses' labels and icons (`EXAM_STATUSES`).

```
client/src/components/PanelHeader.jsx
```
-> The header of a list page's side panel: a `[<]` / `[>]` tab centred on the panel's left border that widens or narrows the panel, then the title, buttons beside it that switch what the panel shows (none when `views` is empty), then `children` (Approve Questions' bulk arrows) and the full-screen and close buttons on the right, framed 32px buttons (`ca-panel-btn`). The tab hides while full screen. Used by all seven list-and-panel pages, with `usePanelLayout`.

```
client/src/components/QuestionStepper.jsx
```
-> Steps through many questions one at a time: `ImportReviewBubbles` above `QuestionDetailPanels`, keeping each set together under one capsule and repeating its passage. `renderAside` adds to the bubbles' header bar, `renderDetails` goes below the question, and `getPanelProps` passes the result props of `QuestionDetailPanels`. Used by Board Exams for a whole exam, Manage Subjects for a whole subject and Exam Results for an exam's or a person's answers.

```
client/src/components/TopicScoreRows.jsx
```
-> An exam result's score per topic as rows split by lines: name, "N/M correct", a bar with a tick at the passing threshold, and the percentage. With `onSelect` each row is a button. Used by the Exam Results Overall and Individual views.

```
client/src/components/QuestionNavBubbles.jsx
```
-> The one question navigator, with the alumni exam runner's look: a circle per standalone question and one capsule per question set (neighbouring questions with the same `groupId`, or `getSetKey`), filling from the left by the share of done questions. The current question is navy with a yellow number; a flagged question has a red number and a count badge. `getStatus(question, index)` returns `{ done, flags }`. Used by the student and alumni exam runners, the exam preview and test run, and `ImportReviewBubbles`.

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
-> API functions for the question import: get the user's limits, and upload a file (with the subjects) whose questions are counted and extracted in one request. Reviewed questions are saved through the regular question endpoints.

```
client/src/lib/loginLock.js
```
-> Helpers for the login lockout shown on the user lists: whether an account is locked, the "Locked until …" label, and the call to `PATCH /api/auth/users/:id/unlock`.

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
client/src/hooks/usePanelLayout.js
```
-> Custom React hook for the side panel of the list-and-panel pages (Approve Questions, My Questions, Board Exams, Manage Subjects, Exam Results, Logs, Student Registration). It keeps whether the panel is widened over the list and whether it is full screen. The expand button, and opening or closing an item while the panel is set wide, turn on `is-gliding` so the columns glide; it comes off when the glide ends (or after 400ms where nothing glides, such as with reduced motion), so the page can scroll the open card back into view. Full screen zooms in from the panel's place and back out to it (the panel's edges move, so its text keeps its size), unless reduced motion is on; the full-screen button passes its click so the hook knows which panel to zoom. Escape leaves full screen the same way unless a window, image or menu is open above it, and full screen ends at once when the panel closes.

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
client/src/utils/dateFormat.js
```
-> How the question pages write dates and times (`formatDate`, `formatTime`, `formatDateTime`).

```
client/src/utils/statusLabels.js
```
-> Maps internal exam and question status strings (e.g. `pending_review`, `returned_for_revision`) to human-readable display labels used throughout the UI.

---

### Styles

```
client/src/styles/global.css
```
-> Global CSS variables, resets, and base typography/color tokens applied across the entire application, including the `*` rule that gives every element (buttons and inputs too) the body font. Owns page spacing: `--page-gutter` (32px, 16px on phones) and `--page-end-space`, applied by the `.page-shell` class that every page root carries. `.page-content` itself has no padding.

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
-> Styles for the page title/subtitle header block used at the top of content pages. As a direct child of `.page-shell` it spans the full page width, and its side padding uses `--page-gutter` so the title lines up with the page content.

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
-> Styles for the bordered section and header bar around `QuestionNavBubbles`.

```
client/src/styles/components/QuestionNavBubbles.css
```
-> Styles for `QuestionNavBubbles` (`qnb-*`): standalone circles, the question-set capsule with its progress fill (it wraps inside itself when too long for the row), the active, done and flagged states, and the flag badge.

```
client/src/styles/components/TopicScoreRows.css
```
-> Styles for `TopicScoreRows` (`tsr-*`): the rows split by lines, the bar with its green, amber or red fill and threshold tick, and the bar on a line of its own on small phones.

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
-> What the board exam page adds to the shared `ca-` layout: the size of the List and Calendar toggle, the exam details, and the publish conflict message.

```
client/src/styles/shared/LearnerDashboard.css
```
-> Styles for the learner dashboard (`ld-` prefix): a navy hero that runs edge to edge like the page header (its side padding matches the page gutter), navy featured-exam card, stat cards (only the navy Overview card has the yellow bottom border), headed cards matching the question UI section header, the CSS passing ring, status chips/pills and the "New" tag, the subject accuracy table, and the sidebar countdown (`.ld-countdown*` plus its form), exam calendar (`.ld-cal-*`) and announcements (`.ld-news*`). The page has no page header, so it sets its own top padding. At 1200px the sidebar drops below the main column (countdown and announcements side by side, calendar full width); stat cards go to two columns at 1100px; other sections stack at 900 / 720 / 560px.

```
client/src/styles/shared/BulkRegister.css
```
-> What the "Register Accounts" window adds (`br-` classes): the rows of people (stacked on phones), the spinner while it registers, and the result lists. Its sections, inputs and small buttons come from `QuestionForm.css`, and its numbers from the shared `ca-stats`.

```
client/src/styles/shared/MyQuestions.css
```
-> Styles for the My Questions page (`qp-*` classes): header buttons, import modal, and panel buttons. Its list and panel use `QuestionApprovals.css`. Approve Questions, Manage Subjects and the question form also use its `.qp-modal-*` window parts.

```
client/src/styles/shared/CreateExams.css
```
-> Styles for the exam creation/editing page (deans and chairs).

```
client/src/styles/shared/ExamResults.css
```
-> What the exam results page adds to the shared `ca-` layout (`er-` classes): the result-state markers, the summary notes, the score distribution chart and the attempts list. Its numbers, pills and people rows are the shared "Panel parts" in `QuestionApprovals.css`.

```
client/src/styles/shared/StudentRegister.css
```
-> What Student Registration adds to the shared `ca-` layout (`sm-` classes): the header buttons, the red lock marker, the card's email, the panel's last exam row, and the locked account's action bar.

```
client/src/styles/shared/MockBoardExamPreview.css
```
-> Styles for the exam preview page: question list, answer options, and print-friendly layout. `.mbep-nav-bar` is only the card around `QuestionNavBubbles`.

```
client/src/styles/shared/QuestionApprovals.css
```
-> Styles for the list, markers, status pills, side panel and its header toggle, the full-screen panel (`is-fullscreen`, whose side margins are measured from the panel's own width so they grow with the zoom), the header's framed buttons (`ca-panel-btn`), the panel width (`--ca-panel-width`, registered with `@property` so `is-gliding` can animate it when the expand button is pressed or an item opens or closes) and the edge tab (`ca-sidebar-width-btn`; the panel doesn't clip, so its first and last parts round their own corners), fit-to-screen layout and animations (`ca-*` classes), shared by Approve Questions, My Questions, Board Exams, Manage Subjects, Exam Results, Logs and Student Registration; also the "Panel parts" (`ca-hint`, `ca-tone-pill`, `ca-stats`, `ca-btn--plain`, and the people rows `ca-people-*` / `ca-person-*`), the audience marker, the exam status colours (`--exam-status-*`), `ca-page--stepper` for panels using `QuestionStepper`, the approve/return/reject buttons and bulk toolbar.

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
-> What the Manage Subjects page adds to the shared `ca-` layout: the dean's program picker, the exam count marker, the list of exams using a subject, and the add and edit window. Other pages also rely on its `.qp-btn-add`, `.error-text` and `.qp-warning-text`.

```
client/src/styles/dean/DeanDashboard.css
```
-> Dean-specific dashboard styles layered on top of `AdminFacultyDashboard.css`.

```
client/src/styles/programchair/PCLogs.css
```
-> What Logs adds to the shared `ca-` layout (`el-` classes): the audience filter, the summary notes with the Live dot, and a taker's activity list with its icons.

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
client/src/styles/superadmin/SAdminMetrics.css
```
-> Styles for the System Metrics page: stat tiles, chart cards with the chart/table switch, legends, the endpoints table, the AI models table (status dots, usage meters whose fill turns amber from 80% and red when full) and the server facts grid.

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
-> Node.js project manifest for the React/Vite frontend: lists dependencies (React, date-fns, Chart.js, etc.) and build/dev/preview scripts.

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
docs/DESIGN.md
```
-> Design guide for the signed-in app: colours, type, layout, shared components, question UI rules, motion, accessibility, CSS conventions and known gaps.

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
