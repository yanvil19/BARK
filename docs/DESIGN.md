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

A status keeps its colour everywhere. Markers use the text, background and border columns. Tables use a dot with the listed `ui-table-status--` tone.

| Status | Text | Background | Border | Table tone |
| --- | --- | --- | --- | --- |
| Draft | `#475569` | `#F8FAFC` | `#CBD5E1` | `hollow` |
| Pending | `#B45309` | `#FFFBEB` | `#FCD34D` | `amber` |
| Returned | `#B91C1C` | `#FEF2F2` | `#FCA5A5` | `orange` |
| Approved | `#15803D` | `#F0FDF4` | `#86EFAC` | `green` |
| Rejected | `#BE123C` | `#FFF1F2` | `#FDA4AF` | `red` |
| Restored | `#7E22CE` | `#FAF5FF` | `#E9D5FF` | `violet` |
| Used in exam | `#1D4ED8` | `#EFF6FF` | `#93C5FD` | |

Exams have their own set, used by the Board Exams markers and the exam calendar. They're the `--ambe-status-` tokens in `BoardExams.css`.

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

A page where people work through a list can fit the screen: the list scrolls inside its own section, so the page doesn't move. Approve Questions, My Questions and Board Exams do this, with the media queries under "Fit to the screen" in `QuestionApprovals.css`. Phones and short windows keep normal page scrolling, because the filters alone would take most of their height.

These pages share one layout: cards under a legend on one side, and the open item in a panel on the other, which takes the whole screen at 1024px and below. To use it on another page, put `ca-page` on the page root, import `QuestionApprovals.css` and use `QuestionMarkers`. Don't copy the CSS. A change to these `ca-` rules reaches all three pages, so check them all.

Board Exams also has a calendar view, which needs normal page scrolling, so the page drops `ca-page` while the calendar shows.

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
| Table | `Table` | Navy head with a yellow line, 64px rows, horizontal scroll on small screens |
| Page numbers | `Pagination` | `maxPageButtons` shortens long lists |
| More actions | `ActionMenu` | 32×32 button with three dots; no page uses it at the moment |
| Delete or remove | `TrashButton` | Used for every delete and remove |
| Card markers | `QuestionMarkers` | `Marker`, `StateMarker`, and `CardLegend` or `MarkerLegend` to explain them |
| Dialog | `Modal` | `size="compact"` for short ones; Escape or a click outside closes it |
| Ask before acting | `ConfirmationModal` | `confirmVariant` is `danger` by default, or `primary` |
| Message to acknowledge | `FeedbackModal` | `tone`: info, success, warning or danger |
| Short outcome message | `useToast().notify` | `variant`, `title`, `durationMs`; the variant defaults to `error`, so set it |
| Field is valid | `FieldCheck` | Grey circle that turns green |
| Rich text | `RichTextEditor` | Bold, italic, underline, equations |
| Show stored rich text | `SafeHtml` | Always use this for question text |
| Date and time | `DateTimePicker`, `TimeInput` | |

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
| Table row | `.ui-table-btn` with `--primary`, `--secondary` or `--success` | 32px high, 8px radius |
| Publish or delete in a table row | `.ui-table-btn` with `.publish` or `.delete` | Green or red tint |
| Review decisions | `.ca-btn` with `--approve`, `--return`, `--reject` or `--restore` | Tinted by outcome |
| Review edit | `.ca-btn--edit` | White, navy text, narrower than the decisions; Board Exams spreads its panel buttons evenly |

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

- **Navigator:** `QuestionNavBubbles` everywhere, with a circle per question and a capsule per set. Active is navy with yellow text. Flagged is a red number with a badge. Don't write bubble markup by hand.
- **Forms and read-only views:** the bubbles sit inside `ImportReviewBubbles`, a bordered section headed "Question X of N". Its `aside` prop adds something to the right of the header.
- **A whole exam:** Board Exams steps through every question of the exam with these bubbles, numbered across the exam, with a capsule per set and the question's subject in `aside`. A long exam's bubbles scroll inside their section. A Questions and Details toggle beside the exam name swaps them for the exam's information.
- **Exam runners:** the bubbles sit in a `.mbep-nav-bar` card.
- **One at a time:** show one question, with the shared passage repeated above it.
- **Numbering:** keep exam numbering ("Question 3", "Questions 4–6"). Bubbles count 1–N within the set. Don't use "Part N" labels.

### Lists of questions

- **Single card:** white, `--card-border`, radius 12px, slight lift on hover. The meta row has the number, subject pill, "N answers | N images" and ▾. Closed, it shows a two-line preview.
- **Set card:** the header is the dropdown: icon, "Questions 4–6", passage title with an ellipsis, "N questions" badge and ▾. Same colours as single cards.
- **Accordion:** one card open at a time, with All/Single/Group `CapsuleFilters` and counts.

### Nesting

- At most card → section.
- The container around the questions has no box. Approve Questions and My Questions are the exceptions: their questions sit in a bordered scrolling section with a legend.
- A question inside an open set is not its own card.
- Stacked question blocks in a form are split by a line, not boxed.
- Drill-downs follow the same idea: person card → subject rows split by lines → question cards, with one item open at a time.

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

Approve Questions is the reference, and My Questions and Board Exams share its animations: see the Motion section at the end of `QuestionApprovals.css`.

| Moment | Motion | Duration |
| --- | --- | --- |
| Page arrives | Fade and rise 6px | 280ms |
| Cards enter | Fade and rise 6px, 28ms apart | 240ms |
| Side panel opens | Fade and slide 14px | 260ms |
| Full-screen panel opens | Rises from the bottom, stays solid | 260ms |
| Next question in a panel | Fade only | 180ms |
| Hover on a card or main button | Lift 1px | 150–200ms |
| Press on a button | Scale to 0.97 | 150–200ms |

**Rules:**

- Animate only `transform` and `opacity`. They can't shift the layout.
- Don't animate column widths. On Approve Questions this pushed the open card out of view.
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
- Existing prefixes include `ca-` (Approve Questions, and the list and panel of My Questions and Board Exams), `qp-` (the rest of My Questions), `ambe-` (the rest of Board Exams), `qf-` (question form and filters), `mbe-` (Create Exams) and `ui-` (shared table and menu).
- Prefix keyframe names as well, because they're global too.
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
- **Breakpoints:** older styles also use 1100, 900, 860, 760, 720, 600 and 560px.
- **`transition: all`:** still used in 36 rules.
- **Reduced motion:** only `Table.css` and `QuestionApprovals.css` handle it. Toasts and other animated pages don't.
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
