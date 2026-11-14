// Line icons for an exam's rules, shared by Question Settings on the Create Exam page and the
// screen a taker answers on: points (a star), the question timer (a stopwatch), and the rest.
export const ruleIcon = (children, size = 20) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const POINTS_RULE_ICON = ruleIcon(<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />);
export const TIMER_RULE_ICON = ruleIcon(
  <>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 10v3.5l2.5 2M9.5 2.5h5M12 2.5V6" />
  </>
);
// One-way navigation: forward only, up to a wall
export const ONE_WAY_RULE_ICON = ruleIcon(<path d="M3 12h12M10.5 7l5 5-5 5M20.5 5v14" />);
// Drops a question's own value
export const RESET_ICON = ruleIcon(<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4.5H8" />, 13);
// The list icon the student and alumni exam lists show beside a question count
export const QUESTIONS_ICON = ruleIcon(
  <>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M3 6h.01M3 12h.01M3 18h.01" strokeWidth="4" />
  </>
);
// A question whose time is up
export const LOCK_ICON = ruleIcon(
  <>
    <rect x="5" y="11" width="14" height="9.5" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>
);
export const CHECK_ICON = ruleIcon(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const CROSS_ICON = ruleIcon(<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />);
