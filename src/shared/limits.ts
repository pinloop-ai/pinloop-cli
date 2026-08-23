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
 * (specs/feature-pull-ceiling.md, section 2). It covers the two commands that
 * page through the bought corpus, `pinloop list` and `pinloop search`, and it
 * covers a whole `--all` run rather than one page of one.
 *
 * Why five thousand: a page holds at most MAX_PAGE_SIZE postings, which is 100,
 * so 5,000 postings is 50 requests. An account may make RATE_LIMIT_REQUESTS
 * requests a minute, which is 120, and the rule this feature comes from is that
 * no single typed command may spend more than half of a minute's allowance.
 * Fifty is well under half of a hundred and twenty, and a run of 5,000 postings
 * finishes in a few seconds without ever being told to wait.
 */
export const PULL_CEILING = 5_000;
