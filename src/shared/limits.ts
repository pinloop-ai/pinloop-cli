/**
 * The numbers both the server and the installed `pinloop` command have to
 * state, kept in one place so neither carries its own copy of them.
 *
 * Every other limit in this product lives in src/server/limits.ts, which is
 * where they are read from and where they are documented. These live here
 * instead, and src/server/limits.ts exports them again under the same names, so
 * that every file which already reads them keeps reading them from the same
 * place.
 *
 * They are here because the block of instructions the installed `pinloop`
 * command prints for a coding agent states them out loud
 * (src/shared/guide-text.ts), and the installed command may only be built out
 * of src/cli/ and src/shared/ — no database driver, no web framework, none of
 * the server (src/cli/package-boundary.test.ts). Each number below is printed
 * by those instructions as well as enforced by the server. A number typed into
 * the instructions a second time would go on saying 60 after the server had
 * moved to 120, so the instructions read the number instead of repeating it.
 */

/**
 * The most messages one account may send inside one day
 * (specs/feature-messages.md, AGREED 2026-08-20).
 *
 * Twenty is far more than a person writes in a day, and low enough that a
 * coding agent stuck repeating itself overnight cannot write thousands of rows
 * into the database before anybody is awake to see it. The count is of rows
 * written in the last 24 hours, not a tally held in the server's memory, because
 * a tally in memory is emptied by every deploy and a per-day limit that forgets
 * itself on every deploy is not a per-day limit.
 *
 * The one account this is never applied to is the account the server's owner
 * setting names, which is Andrew's: he answers many people in one sitting.
 */
export const MESSAGES_PER_DAY = 20;

/**
 * The most characters one message may carry
 * (specs/feature-messages.md, AGREED 2026-08-20).
 *
 * Ten thousand is long enough for a real report with the command that failed
 * and its whole error dump pasted into it, which is exactly what the
 * instructions tell a coding agent to put in the draft.
 */
export const MAX_MESSAGE_CHARS = 10_000;

/**
 * How many requests one account may make inside RATE_LIMIT_WINDOW_MS before the
 * server starts answering "try again later" (HTTP 429).
 *
 * Raised from 60 to 120 on 2026-08-20 (specs/feature-pull-ceiling.md, section
 * 3). Sixty was a guess made when nothing else in Pinloop bounded anything, and
 * nobody had ever measured it. Twenty full pages of `pinloop list` sent to the
 * live server at the same instant all came back inside 1.22 seconds, which is
 * about a thousand requests a minute on the one machine Pinloop runs on. What
 * protects that machine under real load is POOL_WAIT_MS, not this number.
 */
export const RATE_LIMIT_REQUESTS = 120;

/**
 * The most postings one typed command may pull, however many pages it follows.
 *
 * A command that would pull more than this is refused before a single page is
 * fetched, in the one sentence pullCeilingRefusal writes
 * (specs/feature-pull-ceiling.md, section 2). It covers the three commands that
 * page through postings — `pinloop list`, `pinloop search` and `pinloop pull` —
 * and it covers a whole `--all` run rather than one page of one.
 *
 * What it is measured against is how many postings the command would hand over,
 * never how many exist (Andrew, 2026-09-14). A run over every page would hand
 * over everything that matches, so for that run the two numbers are the same. An
 * ordinary page would hand over the page size somebody typed, which can never be
 * more than a hundred, so an ordinary page is never refused by this ceiling
 * however many postings sit behind it. Until 2026-09-14 `pinloop pull --limit 2`
 * over conditions matching 41,897 postings was refused for asking for 41,897
 * postings, when it was asking for two.
 *
 * Why five thousand: a page holds at most MAX_PAGE_SIZE postings, which is 100,
 * so 5,000 postings is 50 requests. An account may make RATE_LIMIT_REQUESTS
 * requests a minute, which is 120, and the rule this feature comes from is that
 * no single typed command may spend more than half of a minute's allowance.
 * Fifty is well under half of a hundred and twenty, and a run of 5,000 postings
 * finishes in a few seconds without ever being told to wait.
 */
export const PULL_CEILING = 5_000;

/**
 * How many times one account that pays nothing may ask how many postings
 * exist, in one day.
 *
 * Asking hands no posting over, so it is bounded by the day rather than by the
 * month: each ask is one request against a hard monthly limit on requests, and a
 * coding agent in a loop could otherwise use a month of them in an afternoon.
 *
 * It moved here from src/server/limits.ts on 2026-09-13, when the part of the
 * instructions telling a coding agent how to narrow a query with counts began
 * stating it out loud (Andrew's ruling that date). src/server/limits.ts exports
 * it again under the same name, so every file that already read it there is
 * unchanged.
 *
 * A paying account gets a higher number, PAID_MARKET_COUNTS_PER_DAY below
 * (Andrew's ruling, 2026-09-14).
 *
 * Cut from 50 to 10 on 2026-09-26 (Andrew: cutting fantastic.jobs requests,
 * decision 2), because every count is a request against the month's allowance.
 */
export const MARKET_COUNTS_PER_DAY = 10;

/**
 * How many times one account with a live paid subscription may ask how many
 * postings exist, in one day. Set by Andrew 2026-09-14, replacing the earlier
 * rule that every account, paying or not, got the same fifty, and cut from 200
 * to 50 on 2026-09-26 (cutting fantastic.jobs requests, decision 2).
 */
export const PAID_MARKET_COUNTS_PER_DAY = 50;

/**
 * How many applications Pinloop fills in one month for an account on the free
 * plan: 10. The free plan was first given 6 when slice 1 of the stage-one fill
 * server was approved on 2026-09-23, and Andrew raised it to 10 the same day,
 * in the ruling that also set how many minutes of live view each plan has.
 *
 * Each filled application runs one small cloud desktop and one run of the model
 * that reads the form and fills it, which together cost under a cent (about
 * 0.7 cents in the 2026-09-23 estimate, two minutes of review included). The
 * count is taken when the person applies, before any of that is spent, and is
 * handed back when Pinloop could not finish the form. It is counted on the same
 * month as judged postings: the calendar month for the free plan, and the two
 * days Stripe charged on for Pro.
 */
export const FREE_FILLS_PER_MONTH = 10;

/**
 * How many applications Pinloop fills in one month for an account on Pro: 100,
 * unchanged by Andrew's 2026-09-23 ruling on the monthly plan limits.
 */
export const PAID_FILLS_PER_MONTH = 100;

/**
 * How many seconds of live view one account on the free plan has in one month:
 * 1800 seconds, which is 30 minutes. Slice 2 of the stage-one server, review
 * and submit, was approved on 2026-09-23 with 120 minutes on every plan, and
 * Andrew's ruling later that day set the free plan to 30 minutes and Pro to
 * 300.
 *
 * Live view is watching and using an application's own cloud desktop in the
 * browser. While an application that is Ready for you is open, the live-view
 * page checks in every 30 seconds, and each check-in counts 30 seconds whether
 * or not the mouse or keyboard was used, so a script cannot keep a desktop
 * awake for free. Watching a form while Pinloop is still filling it counts
 * nothing, because the desktop is running for the fill anyway. It is counted
 * on the same month as filled applications: the calendar month on the free
 * plan, and the two days Stripe charged on for Pro. It is stored in seconds and
 * shown to people as minutes.
 */
export const FREE_LIVE_VIEW_SECONDS_PER_MONTH = 1_800;

/**
 * How many seconds of live view one account on Pro has in one month: 18000
 * seconds, which is 300 minutes (Andrew's ruling, 2026-09-23). The sentences a
 * person reads when the month's live view is used up are written from these two
 * numbers, one sentence for the free plan and one for Pro, so changing either
 * number changes the number in those sentences and nothing else.
 */
export const PAID_LIVE_VIEW_SECONDS_PER_MONTH = 18_000;
