# BARK Design Guide

How BARK's signed-in screens should look and behave. Use it when building or changing a page.

- **Tokens** live in `client/src/styles/global.css`.
- **Shared pieces** live in `client/src/components`, with their styles in `client/src/styles/components`.
- The landing page and login (`LandingPage.css`, `Login.css`) have their own look and are not covered here.

If this guide and the code disagree, fix whichever is wrong and keep the two in step. Places where the code doesn't yet follow the guide are listed under [Known gaps](#known-gaps).

## Principles

1. **Reuse first.** If a shared component does the job, use it. If it nearly does, extend it instead of styling a one-off.
2. **Navy and yellow are the brand; other colours mean status.** Green, red, amber and violet always say something about state.
3. **Keep it flat.** Go no deeper than card → section. Split rows with lines rather than nesting boxes.
4. **One look per job.** A question, a filter or a delete button looks the same on every page.
5. **Keep motion quiet.** It's short and small, and it never shifts the layout.

## Colour

Use the token when one exists. Add a new colour only if nothing below fits.

### Brand

| Token | Value | Use |
| --- | --- | --- |
| `--primary-bg` | `#35408E` | Navbar, table heads, titles, active states, primary buttons |
| `--accent-yellow` | `#FAD227` | Line under the navbar and table heads, count badges, text on active navy |
| `--content-bg` | `#E9EAF3` | Page background |
| `--text-light` | `#F8F9FA` | Text in the navbar |

On navy, use white (9.23:1) or yellow (6.29:1). Yellow is an accent, so keep it to short labels, numbers and active states.

### Surfaces and lines

| Value | Use |
| --- | --- |
| `#FFFFFF` | Cards, sections, controls |
| `#F9FAFF` | Page header, section header bars, row hover |
| `#F5F7FF` | Selected card |
| `#EEF2FF` | Soft tint, such as an answer's letter circle |
| `--card-border` `#D8DEF2` | Card border |
| `rgba(53, 64, 142, 0.15)` | Section borders, lines inside a card |
| `rgba(53, 64, 142, 0.08)` | Lines between answer rows |
| `#EDF0F5` | Lines between table rows |

### Text

Ratios are against white. Small text needs at least 4.5:1.

| Value | Ratio | Use |
| --- | --- | --- |
| `--control-text` `#1F2947` | 14.32 | Text in controls |
| `#2B3552` | 12.11 | Table cells |
| `#35408E` | 9.23 | Titles, section headers |
| `#4A5268` | 7.78 | Question and body text |
| `--control-icon` `#5A63A8` | 5.55 | Icons, legend labels |
| `#5966AC` | 5.36 | Capsule labels |
| `#6B7280` | 4.83 | Small secondary text that must be read |
| `--control-muted` `#8B92BC` | 3.03 | Placeholders and decorative text only |

`#8B92BC` is too faint for information someone needs to read. In new work, use `#6B7280` or darker for that.

### Status

A status keeps its colour everywhere. Markers use the text, background and border columns. `Table` uses a dot with the listed `ui-table-status--` tone, though no page uses it at the moment.

| Status | Text | Background | Border | Table tone |
| --- | --- | --- | --- | --- |
| Draft | `#475569` | `#F8FAFC` | `#CBD5E1` | `hollow` |
| Pending | `#B45309` | `#FFFBEB` | `#FCD34D` | `amber` |
| Returned | `#B91C1C` | `#FEF2F2` | `#FCA5A5` | `orange` |
| Approved | `#15803D` | `#F0FDF4` | `#86EFAC` | `green` |
| Rejected | `#BE123C` | `#FFF1F2` | `#FDA4AF` | `red` |
| Restored | `#7E22CE` | `#FAF5FF` | `#E9D5FF` | `violet` |
| Used in exam | `#1D4ED8` | `#EFF6FF` | `#93C5FD` | |

Exams have their own set, used by exam markers and status pills and by the exam calendar. They're the `--exam-status-` tokens in `QuestionApprovals.css`, with the same colours repeated in `ExamMonthGrid.css`.

| Exam status | Text | Background | Border or dot |
| --- | --- | --- | --- |
| Draft | `#5B6684` | `#FFFFFF` | `#94A3B8` |
| Published | `#1D4ED8` | `#E8F0FF` | `#3B82F6` |
| Ongoing | `#A16207` | `#FFF3D6` | `#F59E0B` |
| Finished | `#0F766E` | `#E6F4F1` | `#0F766E` |
| Archived | `#6B7280` | `#E1E5EC` | `#CBD5E1` |

Answers in question views and results:

| Answer | Text | Row | Pill |
| --- | --- | --- | --- |
| Correct | `#21603A` | `#EEFAF1` | `#DCF5E3` |
| Wrong, as picked by a person | `#8A2A2A` | `#FDF1F1` | `#FADCDC` |
| Blank | `#8B92BC`, italic | None | |

## Typography

| Token | Font | Use |
| --- | --- | --- |
| `--font-title` | Poppins | Page, modal and section titles, `<strong>`, form action buttons |
| `--font-body` | Nunito | Everything else |

`client/index.html` loads Poppins at 400, 600 and 700, and Nunito at 300, 400 and 600. Heavier values fall back to the nearest loaded weight, so stay within these or add the weight to the font link.

| Element | Font | Size / weight | Colour |
| --- | --- | --- | --- |
| Page title | Poppins | 24 / 700 | Navy |
| Modal title | Poppins | 18 / 700 | White |
| Panel title | Poppins | 16 / 700 | Navy |
| Section header | Poppins | 12 / 700, uppercase, `0.05em` spacing | Navy |
| Control text | Nunito | 14 / 400 | `#1F2947` |
| Question and body text | Nunito | 13 / 400, line height 1.55 | `#4A5268` |
| Table header | Nunito | 13 / 600 | White on navy |
| Table cell | Nunito | 13 / 400, tabular numbers | `#2B3552` |
| Hints and details | Nunito | 11–12 | `#6B7280` |

## Layout

Every page follows the same order, and sections a page doesn't need are simply left out:

```text
Navbar           sticky, navy, 4px yellow line below
PageHeader       full width, #F9FAFF, title, subtitle, actions
CapsuleFilters   status or category, with counts
Filter row       SearchBar and DropdownSelects
Content          table, cards or a list with a side panel
Footer           navy, 2px yellow line above
```

- The page root is `<main className="xx-page page-shell">`. `.page-shell` is the only place that sets the side gutter and the space above the footer, so pages don't add their own.
- `PageHeader` goes first inside the page root, and it spans the full width by itself.

### Spacing

| Token or value | Use |
| --- | --- |
| `--page-gutter` | Page sides: 32px, or 16px at 768px and below |
| `--page-end-space` | Above the footer: 40px, or 24px at 768px and below |
| 20px | Below the page header |
| 16px | Below the capsule row and the filter row |
| 12px | Between controls in a filter row |
| 10px | Between capsules, and between cards in a list |
| 14px | Between stacked sections, and inside a section body |
| `10px 14px` | Section header bar, answer row |

### Breakpoints

Use these for new work.

| Width | What changes |
| --- | --- |
| 1024px | Side panels become full-screen overlays |
| 980px | The filter row becomes a two-column grid |
| 768px | Page gutter and end space shrink |
| 640px | Page header stacks, modal padding shrinks, modal buttons wrap |
| 480px | Small phone adjustments |

### Work queues

A page where people work through a list can fit the screen: the list scrolls inside its own section, so the page doesn't move. Approve Questions, My Questions, Board Exams, Manage Subjects, Exam Results (the dean's and program chair's, and a student's or an alumni's own), Logs and Student Registration do this, with the media queries under "Fit to the screen" in `QuestionApprovals.css`. Phones and short windows keep normal page scrolling, because the filters alone would take most of their height.

These pages share one layout: cards under a legend on one side, and the open item in a panel on the other, which takes the whole screen at 1024px and below. To use it on another page, put `ca-page` on the page root, import `QuestionApprovals.css` and use `QuestionMarkers`. Don't copy the CSS. A change to these `ca-` rules reaches all seven pages, the students' and alumni's Exam Results and the exam form's Questions tab, so check them all.

The exam form's Questions tab uses the layout inside a form rather than as a page. Its wrapper takes `ca-embedded` instead of `ca-page`, which brings the Motion rules but not "Fit to the screen". Each view's `ca-layout` also takes `mbe-workspace`, which gives it a fixed height so the list and the panel scroll inside it. The panel there has no full-screen button, because full screen only works under `ca-page`.

All seven panels open with `PanelHeader`: a small tab on the panel's left border, half in the gap beside the list, widens the panel (`<`) or narrows it again (`>`); then the title, and the full-screen and close buttons on the right, framed 32px buttons like the tab. The header is one slim row (8px top and bottom), with no line under the title. The tab rides the edge as the columns glide. The panel doesn't clip its contents (so the tab can sit outside it); its first and last parts round their own corners. `hooks/usePanelLayout.js` keeps the widened and full-screen states, so the pages behave alike. Full screen covers the whole window, navbar and footer included; Escape or closing the panel leaves it. Going in and out, the panel zooms between its place beside the list and the window, like a macOS window.

Board Exams, Manage Subjects and Exam Results also add `ca-page--stepper` to the root. Their `PanelHeader` has buttons beside the title that switch what the panel shows, and they step through many questions with `QuestionStepper`, so the class limits the bubbles' height and tightens the panel on short laptop screens.

Board Exams also has a calendar view, which needs normal page scrolling, so the page drops `ca-page` while the calendar shows.

Board Exams' Edit opens the exam in a window instead of going to the Create Exam page. The window holds the same form as that page (`ExamForm`, exported from `CreateExams.jsx`): the audience hero, the Details, Subjects, Questions and Review tabs, and the same cards. It is a `Modal` of size `wide`, whose height stays fixed as the tabs change. The form scrolls inside it on the page background, with the tab bar pinned to the top and Cancel and Save Changes pinned to the bottom, so the last tab only reviews. A line above the hero names the exam with a program chip, and warns when the exam is published, because saving moves a published exam back to Draft. Closing the window with unsaved changes, by Cancel, Escape or a click outside, asks "Discard Changes?" first. Saving closes the window, reloads the exam's questions in the panel and says how it went.

The exam form's Questions tab, on the page and in the window, opens with joined `ca-view-toggle` buttons: Approved Questions and Question Settings, with the exam's totals on the right (`mbe-question-stats`): the question count, the points and, with the question timer on, the total time. Each total is a 40px frame like the toggle, with its icon in a tinted square (the exam lists' question-list icon, and the Points and Question Timer sections' star and stopwatch) and its figure in bold. A red "!" on Question Settings means a value there needs fixing. Both views use the work-queue layout: question cards on the left, 10 to a page with the shared `Pagination` (`ca` prefix, 5 page buttons), and the open question in a panel on the right. The arrows in the panel's header step to the previous or next card, turning the page when needed.

Both views have the same filters above the list: All/Single/Group `CapsuleFilters` counting questions, a search, the subject, and a fourth dropdown for the view (Approved Questions: in this exam or not; Question Settings: own points or time, same as the exam, or needs fixing). The selection filter's "In this exam" takes the place of a separate table of chosen questions. A set is one card, and its panel steps through the set with bubbles. Checkboxes and "Select all N matching" add or remove many questions at once. The panel adds or removes one question or a whole set, and returns a question to its creator while no exam uses it.

Question Settings opens with a card holding two sections, Points (custom points, whole numbers from 1 to 100) and Question Timer (10 seconds to 60 minutes a question). Each section heads with an icon, a plain-case title, a line saying what it sets, and an on/off switch (`mbe-switch`, a checkbox with role switch). A section that is on is outlined and its icon filled; one that is off says what questions get instead. When on, it has one value that applies to every question, with the exam's total beside it, and "Apply to all" asks before resetting questions that have their own. Below it are the filters and the exam's questions as cards. Each card shows its exam number, and its points and time as chips with the star and stopwatch icons. A value of its own is outlined and marked with a pencil, and a bad one is red. A set is one card, as in Approved Questions: its exam numbers as a range ("23–25"), its passage, the count marker, and a pencil or "!" when any of its questions has its own value or a bad one. Its questions hang under it as `SetMemberRows` rows, each with its exam number and its own points and time chips (under the text when the row is narrow), and a bad one's row has a red edge. A set shows whole when any of its questions matches the filters, and pages as one card, while the panel's arrows still step question by question. The card opens the set's first question and a row opens its own; the preview has the set's bubbles (`ImportReviewBubbles`), and a bubble opens that question, with its row and its own points and time. Adding a set by its button or by ticking puts its questions in set order, as "Add all matching" does, so their exam numbers follow the set. The open question's points and time sit in the panel's header beside the arrows, each in a 32px frame like the header's buttons, so they stay in view while the preview scrolls. A value of its own outlines its frame and adds a button back to the exam's value; a bad one is red; a rule that is off shows a dashed frame with what the question gets (1 point, no limit). When the panel is under 620px wide (a container query on the panel), the frames move to their own row under the title. When Save stops on a bad value, it clears every filter, opens the first bad question and brings its frame into view. With the question timer on, a student exam's end follows its start by the questions' total time, rounded up to the minute: the date picker picks the start only and shows the end. An alumni attempt is limited to that total instead, and its window keeps both ends. Under Points and Question Timer, on the grid's whole row (`mbe-rule--wide`), is One-Way Navigation, a switch for the whole exam with no value per question: on, it explains that questions come one at a time and each needs an answer before the next, and has one option, Allow going back (`mbe-rule-check`, a checkbox with a name and a line on what it does), which lets a taker reopen the questions already answered to look at them, never to change them or to jump ahead. Review & Save shows it as "On — one question at a time, no going back" or "going back to look allowed".

The Create Exam page's Review & Save has Test Run (`mbe-btn-secondary`) to the left of Create Mock Board Exam. It runs the exam as it stands, before it is saved, in the same Test Run page Board Exams opens for a saved exam (`BoardExamTestRun.jsx`, given `draftExam` instead of `examId`). It carries the exam's points, question times and passing threshold too. Its clock is what a taker would get: an alumni attempt's limit, or the time from a student exam's start to its end. The test run takes the page's place while the form stays mounted underneath, hidden, so Exit Test Run returns to Review & Save as it was, at the same scroll. Nothing is saved. With no questions in the exam the button is off, and its tooltip says to add questions first. With a bad point or time value it is off too, and the tooltip says to fix Question Settings first. The Edit window has no Test Run, since Board Exams has one for saved exams.

Exam Results shows its toggle only once an exam has results: Overall, Questions, Individual and AI Overview (with a sparkle before its label). Without results the panel says why and shows the exam's details. Nobody computes results: the server works a student exam's out when the exam closes (or the first time someone looks), and an alumni exam's on every visit, so there are two states, Ready and Pending. Results that came in since the person last looked (a student exam ending, an alumni submitting an attempt) carry a red New pill on the card and are counted on the navbar's Exam Results item, the way Approve Questions counts pending questions; opening the exam's results clears both. Once results exist, the action bar offers Download Excel for student and alumni exams alike. Its panel sections sit straight in the scrolling content, so `ExamResults.css` stops them shrinking, since a section that clips its corners would otherwise shrink to nothing when the content is taller than the panel. Logs and Student Registration do the same in their own files.

The AI Overview (`AiOverviewView`, `AiOverview.css`) keeps the AI's words apart from the numbers: every number, chart and table comes from figures the server worked out, and the AI's words sit beside them, in plain sections or in a note with a sparkle under a chart. A strip at the top says who generated it and when, offers the earlier versions, and shows the generations left as 8 dots. Banners say when the version is an older one, when the results changed since it was written, when no generations are left and when a try failed (which isn't counted). Its two charts use series 1 `#4A56B8` and series 2 `#0F9488`, checked for colour-blind readers, with the passing line dashed; each has a hover card and a "Show the numbers" table. A question it names is a link that opens the question. The first overview is generated at once from the view; Regenerate, beside Download Excel with the generations left, asks first.

Students and alumni have their own Exam Results (`LearnerExamResults`, `lr-` classes) on the same list and panel, so a `ca-` change reaches it too. It lists the exams they answered, one card each: the score as a pill (an alumni's best, with the attempt count as a marker) and a Passed, Failed or Awaiting release marker, which are also the capsules. The panel opens with Your Result, three numbers side by side (`ca-stats`): the score, Passed or Failed as a word with the gap to the threshold (`ThresholdGap`), and the time spent; then Scores by Topic and the attempt's details. A student sees no questions, and no score before the release date: until then the panel says when it shows. An alumni's attempts are a dropdown (`DropdownSelect`) under the numbers, newest first with each one's score and the highest marked, opening on the newest; the Questions view has the same dropdown above the bubbles. Their Overall and Questions toggle adds the attempt's questions through `QuestionStepper`, with their pick on each answer; the bubbles are green for a right answer and red for a wrong or blank one, with a legend above them that counts both, and a topic row opens its first question.

The parts these panels build from are shared under "Panel parts" in `QuestionApprovals.css`: notes (`ca-hint`), status pills (`ca-tone-pill` in good, warn, bad or muted), numbers side by side (`ca-stats`, three by default, or set `--ca-stat-columns`), the quiet button (`ca-btn--plain`), and people as rows split by lines (`ca-people-tools`, `ca-person-row` and the rest). Exam Results, Logs and the register window use them.

Logs lists the program's published, ongoing and finished exams. Its panel shows how the takers are doing (started, in progress, submitted, missed, and window focus lost), then the takers as rows; opening one shows their activity, oldest first. A running exam's activity reloads every 25 seconds while it is open.

Student Registration lists the students and alumni, with Students, Alumni and Locked tabs, and the account's details in the panel. The panel's Activity section shows their last sign-in (time over date), how long that visit lasted in hours and minutes ("so far" while they are online), and the last exam they answered with its status. A locked account gets an action bar that says until when, beside Unlock Sign-in. "+ Register Accounts" opens a window (`BulkRegister`) built from the form's headed sections: the account type, the program for deans, and a row per person. A bad field is marked on its own row. The rows stay as a draft in the browser until they are sent. The window shows the progress and then how it went, and the registering carries on if it is closed.

Like the other list pages, these load their whole list once and filter, count, sort and page it in the browser, so a tab, search or page shows at once. Fetching a page from the server on each click made Student Registration wait on every click, and stand out from the rest.

## Shape, shadow and layers

| Token or value | Use |
| --- | --- |
| `--card-radius` 12px | Cards, tables |
| `--control-radius` 8px | Search bars, dropdowns, table buttons |
| 10px | Sections inside a card |
| 18px | Modals |
| 999px | Capsules, pills, markers |
| `--card-shadow` | Resting card |
| `0 4px 18px rgba(53, 64, 142, 0.12)` | Hovered card |
| `0 24px 60px rgba(17, 24, 39, 0.28)` | Modal |

Layers, lowest to highest:

| z-index | Layer |
| --- | --- |
| 1000 | Navbar, full-screen side panel |
| 1100 | Image overlay |
| 10000 | Modal |
| 10500 | Image overlay opened from inside a modal |
| 11000 | Toast |
| 20000 | Math keyboard |

## Components

| Need | Use | Notes |
| --- | --- | --- |
| Page title | `PageHeader` | `title`, `subtitle`; actions go in as children |
| Status or category filter | `CapsuleFilters` | `options` are `{ value, label, count }`; exactly one is active |
| Search | `SearchBar` | Takes the free space in a filter row |
| Dropdown | `DropdownSelect` | Same height, border and focus ring as `SearchBar` |
| Question filters | `QuestionFilters` | Search, subject, program and sort together; `extraFilters` adds filters before the sort, and children go at the end of the row |
| Table | `Table` | Navy head with a yellow line, 64px rows, horizontal scroll on small screens; no page uses it at the moment, and nothing loads `Table.css` until one does |
| Page numbers | `Pagination` | `maxPageButtons` shortens long lists |
| More actions | `ActionMenu` | 32×32 button with three dots; no page uses it at the moment |
| Delete or remove | `TrashButton` | Used for every delete and remove |
| Card markers | `QuestionMarkers` | `Marker`, `StateMarker`, and `CardLegend` or `MarkerLegend` to explain them; `StatePill` and `ExamStatePill` spell a status out where there's no legend |
| Side panel header | `PanelHeader` | A `[<]` / `[>]` tab centred on the panel's left border that widens or narrows the panel, then the title, buttons beside it that switch the panel's view (none when `views` is empty), and `children` (Approve Questions' bulk arrows) before the full-screen and close buttons (`ca-panel-btn`). Full screen puts `is-fullscreen` on `ca-sidebar`, which then covers the whole window, navbar and footer included. The tab and the full-screen button hide at 1024px and below, where the panel already covers the screen. Pair it with `usePanelLayout` |
| Many questions, one at a time | `QuestionStepper` | The bubbles and the question shown; `renderAside` and `renderDetails` add to them, and `getPanelProps` passes result props such as answer counts |
| Score per topic | `TopicScoreRows` | Rows split by lines, each with a bar and a tick at the passing threshold; `onSelect` makes each row a button |
| Dialog | `Modal` | `size="compact"` for short ones, `size="wide"` for a whole page's form (fixed height; give the body a class that lays out and scrolls the content); Escape or a click outside closes it. With modals open over one another, Escape closes only the newest |
| Ask before acting | `ConfirmationModal` | `confirmVariant` is `danger` by default, or `primary` |
| Message to acknowledge | `FeedbackModal` | `tone`: info, success, warning or danger |
| Short outcome message | `useToast().notify` | `variant`, `title`, `durationMs`; the variant defaults to `error`, so set it |
| Field is valid | `FieldCheck` | Grey circle that turns green |
| Rich text | `RichTextEditor` | Bold, italic, underline, equations |
| Show stored rich text | `SafeHtml` | Always use this for question text |
| Date and time | `DateTimePicker`, `TimeInput` | `range` picks a start and an end; `fixedDurationMs` makes the end follow the start, shown but not picked, with `endNote` saying why |

**Telling people what happened:**

- Toast: the outcome of an action, when nothing more is needed.
- `FeedbackModal`: something they must read before moving on.
- `ConfirmationModal`: before anything destructive or hard to undo. Don't use `window.confirm`.
- Inline message: an error tied to a field in a form. Keep the form open and keep what was typed.

### Buttons

| Use | Class | Look |
| --- | --- | --- |
| Main page action | `.qp-btn-add` | Navy, white text |
| Form's main action | `.qf-submit-btn` | Navy, yellow text |
| Form's second action | `.qf-draft-btn` | `#5B6DD3`, white text |
| Modal's main action | `.modal-btn-primary` | Navy, white text |
| Modal's destructive action | `.modal-btn-danger` | Red, white text |
| Modal or form cancel | `.modal-btn-cancel` | White, grey border |
| Table row | `.ui-table-btn` with `--primary`, `--secondary` or `--success` | 32px high, 8px radius; in `Table.css`, so no page has it at the moment |
| Publish or delete in a table row | `.ui-table-btn` with `.publish` or `.delete` | Green or red tint; also in `Table.css` |
| Review decisions | `.ca-btn` with `--approve`, `--return`, `--reject` or `--restore` | Tinted by outcome |
| Review edit | `.ca-btn--edit` | White, navy text, narrower than the decisions; under `ca-page--stepper` the panel's buttons spread evenly |

Disabled buttons use lowered opacity (0.5–0.6) and `cursor: not-allowed`.

## Question UI

Every question screen shares this system. New or changed question UI must follow it.

### Showing a question

Use `QuestionDetailPanels`. It stacks bordered sections in this order: Shared Passage (set members only), Question, Images, Answers, Rationalization.

- **Section:** `1px solid rgba(53, 64, 142, 0.15)`, radius 10px, white. Its header bar is `#F9FAFF` with the section header type. Its body has 14px padding.
- **Text:** the question and rationalization keep their line breaks.
- **Answers:** rows run edge to edge and are split by lines. Each has a letter in an indigo circle. The correct row has a full-width green tint and a "Correct" pill on the right, with no white gaps around the tint.
- **Images:** a thumbnail grid, 180px tall. A click opens the full image. Escape closes the image before the modal.
- **Results:** use `ResultQuestionList`, or the `selectedAnswerId` and `answerCounts` props, instead of page-specific markup.

### Question sets

- **Navigator:** `QuestionNavBubbles` everywhere, with a circle per question and a capsule per set, its bubbles 4px apart. A done question (answered, or ready in an import review) shades its own bubble, in a set too. Active is navy with yellow text. Flagged is a red number with a badge. A question whose time is up is grey with a dashed ring and a grey lock badge. Once an exam is marked, a right answer is green and a wrong or blank one red. An alumni's own results mark the bubbles the same way (`getResult` on `QuestionStepper`). Don't write bubble markup by hand.
- **Forms and read-only views:** the bubbles sit inside `ImportReviewBubbles`, a bordered section headed "Question X of N". Its `aside` prop adds something to the right of the header.
- **A whole exam or subject:** `QuestionStepper` steps through all of them with these bubbles, numbered across the list, with a capsule per set. A long list's bubbles scroll inside their section. On Board Exams the header shows the question's subject, and a Questions and Details toggle beside the exam name swaps them for the exam's information. On Manage Subjects the header shows the question's status, and a Questions and Exams toggle beside the subject name swaps them for the exams using it. Drafts aren't listed, because they stay private to whoever is writing them. On Exam Results the header shows the question's subject with its correct rate, and each answer shows how many takers picked it; one person's answers show their pick and whether they got it right.
- **Exam runners:** the bubbles sit in a `.mbep-nav-bar` card, with a legend under them when they show more than answered or not (locks, or right and wrong).
- **One at a time:** show one question, with the shared passage repeated above it.
- **Numbering:** keep exam numbering ("Question 3", "Questions 4–6"). Bubbles count 1–N within the set. Don't use "Part N" labels.

### Taking an exam

`ExamTakingView` is the screen a taker answers on. The test run, the student runner and the alumni runner all use it, so a change to it shows in all three. The page around it keeps the header, the modals and the saving: `BoardExamTestRun` for the test run, and `ExamAttemptRunner` for a real attempt (`audience` `student` or `alumni`; the two runner pages are thin wrappers around it). Its parts are `lib/examRules.js` (each question's points and time, read the way the exam stores them, and the score), `hooks/useExamClock.js` (the clocks) and `hooks/useExamRun.js` (the stop the taker is on, their answers, and the rules about moving between questions).

A real attempt keeps its answers and its place on the server (`runState` on the attempt: the stop the taker is on, the last stop reached, each question's time left and time spent), so a refresh returns to the same question with the same time left. The server keeps the rules as well as the screen does: one way, an answer is final once its question is left; a question's time left only goes down; time away from the page is charged to the question that was open. Only students are watched for leaving the exam window.

- **Column:** everything sits on one 1000px column under the page header (520px under 768px).
- **Introduction:** the run opens on an Introduction card, bubble "0" (dashed until open) before question 1. It lists the exam's facts as chips (questions, points when custom, total time or "No time limit", "Each question has its own time", passing threshold), then the Description and Instructions as bordered sections keeping their line breaks, and with question timers a section on how they work. Its button reads "Start with Question 1". The clocks start only when the taker first opens a question; after that the introduction says "Your time is running." Previous on question 1 goes back to it.
- **Status:** a progress card ("4 of 25 answered", a bar, then "53 points in all" when points are custom and "2 timed out" once any are) beside the exam's clock card ("Exam time left", or "No limit"). The clock card turns amber in the exam's last tenth, from 1 to 5 minutes, and never before its last quarter. Once marked it shows the time spent instead.
- **Question card:** the header has "Question 4 of 25", a "Question set · Questions 4–6" badge for a set, and on the right the question's points (star, only when points are custom) and its own clock (stopwatch, "1:42 left"). A 4px bar under the header shows the share of its time left. The clock and the bar turn amber in the question's last quarter, from 5 to 30 seconds. The question's text is the card's main text; a set's passage sits above it as "Shared Passage".
- **Answers:** each answer is a radio (Enter or Space picks it). A timed-out question reads "Time's up for this question. Your answer is kept and can't be changed." and its other answers fade.
- **The way on:** Previous and Next sit in one block above the bubbles (`mbep-step-actions`), spanning the column; a lone button fills it and two share it half and half, on a phone too. The filled one (`mbep-btn-nav is-forward`) is the step that commits something.
- **Summary:** after the last question comes a bubble with a tick (`QuestionNavBubbles` `outro`, dashed like the introduction's). Its card, "Your Answers", has an "N of M answered" chip and a grid of rows, one per question: the number in a circle and the answer picked ("b. Bravo"), or a dashed "No answer" row. A row opens its question when the taker may go there. The block's button here is "Submit Exam", which opens the Submit Exam confirmation. Next on the last question leads to it. A marked attempt has no summary.
- **One-way navigation:** when the exam has it on (`rules.oneWay`), the block holds one filled button, "Submit Answer →", with no line of advice above it, off until an answer is picked; after the last question it leads to the summary. No bubble can be clicked (`canSelect`), the introduction's and the summary's too; a question already left has the lock badge and the legend calls it "Closed", and the summary's rows are not links. The answer can be changed until the question is submitted. With question timers, the open question at 0:00 is submitted with its answer and the next opens; the last one ends the exam. With Allow going back (`rules.allowBack`) there is a Previous beside the filled button, the bubbles and summary rows up to the last stop reached can be opened, and nothing shows as closed, but a question gone back to is read-only: a grey note says "You submitted this answer. You can look at it, but it can't be changed.", its other answers fade, it shows no clock and costs no question time, and the filled button reads "Next →". Stops past the last one reached stay out of reach. The introduction adds a "One question at a time" chip and a section explaining it, in place of the time bank's. Once the attempt is marked, navigation is free again.
- **Time bank:** a taker moves freely. Only the open question's time runs, and leaving it keeps what it has left. At 0:00 it locks with its answer, the next question with time opens, and a notice says so ("Time's up for question 3. Its answer is kept, and question 4 is open."). When every question is out, or the exam's clock ends, the exam submits itself and says why. Viewing a timed-out question costs no question time; the exam's clock still runs.
- **Marked:** a green or red result card under the status: Passed or Failed, "38 / 50 points", the percent, chips for correct, wrong, blank and time spent, and the passing threshold. Each question shows "Correct · 3 of 3 points" (or Wrong, Blank) and "1:18 of 2:00 spent"; the right answer is green, with "Your answer" or "Right answer".
- **Score:** a right answer earns the question's points, anything else none. With custom points off every question is worth 1. Passing is the share of points at or above the threshold, as on the server.
- **Icons:** the star, stopwatch and list come from `ExamRuleIcons.jsx`, shared with Question Settings.

### Lists of questions

- **Single card:** white, `--card-border`, radius 12px, slight lift on hover. The meta row has the number, subject pill, "N answers | N images" and ▾. Closed, it shows a two-line preview.
- **Set card:** the header is the dropdown: icon, "Questions 4–6", passage title with an ellipsis, "N questions" badge and ▾. Same colours as single cards.
- **Accordion:** one card open at a time, with All/Single/Group `CapsuleFilters` and counts.
- **Sets in the list-and-panel pages** (My Questions, Approve Questions, Create Exam's Approved Questions): a set stays one card, and `SetMemberRows` hangs its questions under it as numbered one-line rows, joined to the card by a thick line: a 4px `#a5b0e6` rail 14px in from the card's edge, from the card down to the last row's middle, with an arm into each row. A row opens the set in the panel at that question; while the set is open its line turns navy and the shown question's row is outlined, following the set's bubbles. The card still opens, ticks and pages the set as one item. Question Settings uses the same rows, numbered by the exam and carrying each question's points and time.

### Nesting

- At most card → section.
- The container around the questions has no box. Approve Questions and My Questions are the exceptions: their questions sit in a bordered scrolling section with a legend.
- A question inside an open set is not its own card.
- Stacked question blocks in a form are split by a line, not boxed.
- Drill-downs follow the same idea. On Exam Results and Logs, the people are rows split by lines; opening one replaces the list with that person in the same panel, with a button back to the list.

### Forms

`QuestionForm` uses the same headed sections (`qf-section`, `qf-section-header`, `qf-section-title`, `qf-section-body`, `qf-section-hint`).

- A title carries `*` and a `FieldCheck` when the field is required.
- A hint is the first line of the section body.
- A small action button, such as "+ Add Answer", goes on the right of the header bar.
- A trash icon removes an image, and an image-plus icon adds one.

Editing a set looks and works like creating one: the same Single/Grouped toggle (Grouped active, Single disabled), the same order of subject, shared passage, notice and bubbles, and it opens on the question whose Edit was clicked.

### Modal header

Navy gradient with a white title, as `Modal` provides. Don't restyle it per page.

## Motion

Approve Questions is the reference, and My Questions, Board Exams, Manage Subjects, Exam Results, Logs and Student Registration share its animations: see the Motion section at the end of `QuestionApprovals.css`.

| Moment | Motion | Duration |
| --- | --- | --- |
| Page arrives | Fade and rise 6px | 280ms |
| Cards enter | Fade and rise 6px, 28ms apart | 240ms |
| Side panel opens | Fade and slide 14px | 260ms |
| Expand button widens or narrows the panel, or an item opens or closes on a widened panel | Columns glide to their new widths, quick then settling | 260ms |
| Full screen, in and out (above 1024px) | The panel's edges move between its place and the window, with rounded corners and a soft shadow on the way, quick then a long settle (`cubic-bezier(0.32, 0.72, 0, 1)`) | 440ms in, 380ms out |
| Full-screen panel opens (1024px and below) | Rises from the bottom, stays solid | 260ms |
| Next question in a panel | Fade only | 180ms |
| Hover on a card or main button | Lift 1px | 150–200ms |
| Press on a button | Scale to 0.97 | 150–200ms |

**Rules:**

- Animate only `transform` and `opacity`. They can't shift the layout.
- The one exception is the columns' glide, which moves the column widths (`--ca-panel-width`, only while `is-gliding` is on): when the expand button is pressed, and when an item opens or closes while the panel is set wide. Going from item to item doesn't change the widths, so nothing glides then. Moving column widths once pushed the open card out of view on Approve Questions, so each page scrolls the open card back into view when the glide ends (`usePanelLayout`'s `isGliding`). Keep that if you touch it.
- The other exception is the full-screen zoom, which moves the panel's edges (`usePanelLayout` animates `top`, `right`, `bottom` and `left`). Scaling it instead would shrink the full-screen layout into the panel's place, so its text would pop to a new size at the start or the end. Its side margins are measured from the panel's own width for the same reason. Reduced motion skips it.
- Use `backwards` fill on entrances. A fill that lasts past the end holds its transform over the hover lift.
- Don't fade anything that covers other content. The content behind shows through its text.
- Animate new views, but not each keystroke of a search. Key the list by the view, and leave the search text out of the key.
- Keep repeated actions subtle. A reviewer moves through many questions in a row.
- Put new motion inside `@media (prefers-reduced-motion: no-preference)`, and put hover lifts inside `(hover: hover)` as well. With reduced motion on, turn off endless pulses too.

## Accessibility

- **Keyboard:** everything clickable can be reached and used from the keyboard. If a whole card is clickable, include a real button inside it.
- **Focus:** show `outline: 2px solid var(--primary-bg)` with a 2px offset on `:focus-visible`. Controls use `--control-focus-ring`.
- **Icon-only buttons and markers:** give them an accessible name. Status must not rely on colour alone, so markers also need a label and a legend.
- **Capsules and bubbles:** use `aria-pressed` and `aria-current`, as the shared components already do.
- **Contrast:** at least 4.5:1 for small text.

## Writing CSS

All page styles load together, so every class is global, and a rule in one page's file can affect another page. For example, `.ca-bulk-toolbar` is styled in both `CreateExams.css` and `QuestionApprovals.css`.

- Prefix a page's classes, and scope its rules under its root class, such as `.ca-page .ca-btn`.
- Existing prefixes include `ca-` (Approve Questions, and the list and panel of My Questions, Board Exams, Manage Subjects, Exam Results, Logs and Student Registration), `qp-` (the rest of My Questions), `ambe-` (the rest of Board Exams), `st-` (the rest of Manage Subjects), `er-` (the rest of Exam Results), `lr-` (a student's or an alumni's own Exam Results), `el-` (the rest of Logs), `sm-` (the rest of Student Registration), `br-` (the register window), `aio-` (the AI Overview of Exam Results), `tsr-` (`TopicScoreRows`), `qf-` (question form and filters), `mbe-` (Create Exams) and `ui-` (shared table and menu).
- Prefix keyframe names as well, because they're global too.
- All CSS ships as one bundle, in the order each file is first imported, starting from `App.jsx`. A page imported early pulls the shared stylesheets it uses ahead of the others, which changes who wins between equal selectors. That's why `App.jsx` imports Student Registration after the other pages.
- Name the properties in a transition rather than using `transition: all`.
- Use a token instead of repeating its value.

## Known gaps

These are places where the code doesn't yet match this guide. Fix them when working in that area, rather than copying them into new work.

- **Faint text:** `#8B92BC` is used for readable text such as page subtitles, form hints and detail labels. It reaches 3.03:1 on white, 2.90:1 on `#F9FAFF` and 2.53:1 on the page background.
- **Low contrast:** white on the modal danger button `#DE7A7D` is 2.92:1, and white on the warning toast `#D97706` is 3.19:1.
- **Second palette:** `AvailableExams.css` and `AlumniAvailableExams.css` each define a different navy and yellow from the brand's (`--ae-navy` and `--aae-navy` `#1E2D6B`, `--ae-yellow` and `--aae-yellow` `#F5C518`).
- **Returned status:** its table tone is orange, but its marker is red. No table shows this status today, so settle on one before a table needs it.
- **Font weights:** many rules ask for Nunito 700 or weights of 800 and 900, which aren't loaded.
- **Button radius:** buttons use 6, 8, 10 and 12px depending on the page.
- **Breakpoints:** older styles also use 1200, 1100, 960, 900, 860, 760, 720, 600, 560 and 520px.
- **`transition: all`:** still used in 32 rules, not counting the landing and login pages.
- **Reduced motion:** only `QuestionApprovals.css` handles it, plus `Table.css` if a page uses it again. Toasts and other animated pages don't.
- **Approve Questions and My Questions:**
    - List cards don't follow the card rules above: no number, no "N answers | N images", no ▾, no All/Single/Group filter.
    - Details and notes aren't in headed sections.
- **Approve Questions:**
    - The warning modal is brown, uses an emoji and doesn't use `Modal`.
    - Bulk delete still uses `window.confirm`.
    - The image overlay doesn't close on Escape.

## Checklist for a new or changed screen

- [ ] Page root uses `.page-shell`, and `PageHeader` comes first
- [ ] Shared components used wherever one fits
- [ ] Colours come from tokens or the tables above, and status colours mean status
- [ ] No deeper than card → section
- [ ] Question UI uses `QuestionDetailPanels`, the bubbles and the headed sections
- [ ] Destructive actions ask first through `ConfirmationModal`
- [ ] Works at 1366px, tablet and phone widths with no sideways scroll
- [ ] Keyboard focus is visible, and icon-only controls have names
- [ ] Motion follows the rules above and respects reduced motion
- [ ] New CSS is prefixed and scoped to the page
