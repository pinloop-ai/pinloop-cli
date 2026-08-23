/**
 * One row of a list, printed the way a person reads it
 * (specs/feature-terminal-polish.md, AGREED 2026-08-19, the section headed
 * "Aligned rows with colour when a command answers").
 *
 * Every function here takes a stored row, the colour functions to build it with,
 * and how wide the window is, and hands back the text of that row. None of them
 * writes anything anywhere and none of them reaches for a colour of its own.
 * That is what makes the same code produce coloured rows for a person and plain
 * rows for a pipe: the caller hands in colour functions that colour nothing when
 * nobody is watching a screen.
 *
 * The shape one posting prints as:
 *
 *   Software Engineer Intern   Joby Aviation   Santa Cruz, CA   2026-08-12
 *     7f732227  https://jobs.jobvite.com/joby/job/abc
 *
 * Three spaces between the columns of the first row, which is wide enough to
 * read as a break and narrow enough that a job title and an employer stay on one
 * row. The second row is indented by two spaces and carries the posting's id and
 * its web address, both of which a person copies rather than reads, so they are
 * out of the way of the reading and still easy to select. The job title is the
 * one thing in bold; everything else on both rows is dim.
 *
 * Nothing here is ever cut short. Only the group of lines that is redrawn in
 * place is cut (src/cli/screen.ts), because erasing that group works by counting
 * the rows it drew and a row the terminal wrapped makes the count wrong. A
 * printed row is written once and never erased, so a terminal wrapping it costs
 * nothing, and cutting a job title in half would cost a person the thing they
 * were reading.
 */
import type { Colours } from './screen.ts';

/** How many characters sit between two columns of the same row. */
const BETWEEN_COLUMNS = '   ';

/** How far the second row of a posting is indented. */
const INDENT = '  ';

/**
 * How many characters sit between the id and the web address on that second
 * row. Two rather than three, because both are things a person double-clicks
 * rather than reads, and they read as one pair.
 */
const BETWEEN_ID_AND_LINK = '  ';

/** How much of an id is printed where the whole thing is not needed. */
const SHORT_ID = 8;

/** One posting, as a search, a list, a tab and a routine run all print it. */
export type PostingRow = {
  id: string;
  title?: string | null;
  company?: string | null;
  locations?: string[] | null;
  posted_at?: string | null;
  url?: string | null;
};

/** One employer, as `pinloop companies` prints it. */
export type CompanyRow = {
  id?: string | null;
  name?: string | null;
  website_domain?: string | null;
  posting_count?: number | null;
};

/** One tab, as `pinloop tab list` prints it. */
export type TabListRow = {
  name?: string | null;
  items?: number | null;
  description?: string | null;
};

/** One stored verdict, as judge and `pinloop judgment list` print it. */
export type VerdictRow = {
  id?: string | null;
  verdict?: string | null;
  judged_at?: string | null;
  judged_by?: string | null;
};

/** The parts of a row that carried something, joined into one row. */
function joined(parts: (string | undefined)[]): string {
  return parts.filter((one): one is string => one !== undefined && one !== '').join(BETWEEN_COLUMNS);
}

/** One value as text, or nothing at all when the row carries nothing for it. */
function said(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value);
  return text === '' ? undefined : text;
}

/** The day a date fell on, which is all of a stored instant a person reads. */
function day(value: unknown): string | undefined {
  const text = said(value);
  return text === undefined ? undefined : text.slice(0, 10);
}

/**
 * One posting as two rows: what it is, and then how to reach it.
 *
 * A column the posting carries nothing for is left out rather than printed
 * empty, so a posting with no location and no date reads as a title and an
 * employer rather than as a row of gaps.
 */
export function postingRow(row: PostingRow, colours: Colours, _columns: number): string {
  const facts = joined([said(row.company), said(row.locations?.[0]), day(row.posted_at)]);
  const first = joined([colours.bold(said(row.title) ?? ''), facts === '' ? undefined : colours.dim(facts)]);
  const reach = [said(row.id)?.slice(0, SHORT_ID), said(row.url)]
    .filter((one): one is string => one !== undefined && one !== '')
    .join(BETWEEN_ID_AND_LINK);
  return `${first}\n${INDENT}${colours.dim(reach)}`;
}

/**
 * One employer as two rows, with its whole id on the second.
 *
 * The whole id and not the first eight characters, because handing that id to
 * `pinloop search --company` is the only reason this list exists. Employer names
 * in the corpus are messy — "Google" and "Google LLC" are two separate rows —
 * so a person picks the right employer by its name and its posting count and
 * then copies the id underneath it.
 */
export function companyRow(row: CompanyRow, colours: Colours, _columns: number): string {
  const count = Number(row.posting_count ?? 0);
  const facts = joined([
    said(row.website_domain),
    `${count} posting${count === 1 ? '' : 's'}`,
  ]);
  const first = joined([colours.bold(said(row.name) ?? ''), colours.dim(facts)]);
  return `${first}\n${INDENT}${colours.dim(said(row.id) ?? '')}`;
}

/** One tab as a single row: its name, how much it holds, and what it is for. */
export function tabRow(row: TabListRow, colours: Colours, _columns: number): string {
  const items = Number(row.items ?? 0);
  const facts = joined([
    `${items} posting${items === 1 ? '' : 's'}`,
    said(row.description),
  ]);
  return joined([colours.bold(said(row.name) ?? ''), colours.dim(facts)]);
}

/**
 * The colour each of the four verdict words is written in, worst to best: red
 * for a no, dim for a weak, yellow for a fair, green for a strong. A word
 * outside the four is left uncoloured rather than guessed at.
 */
function inItsOwnColour(verdict: string, colours: Colours): string {
  if (verdict === 'no') return colours.red(verdict);
  if (verdict === 'weak') return colours.dim(verdict);
  if (verdict === 'fair') return colours.yellow(verdict);
  if (verdict === 'strong') return colours.green(verdict);
  return verdict;
}

/**
 * One stored verdict as a single row: the word, then the posting it is about,
 * when it was made and who made it.
 *
 * Who judged is on every row because a verdict Pinloop bought and one a person
 * stored by hand are otherwise identical to look at, and telling them apart at a
 * glance is the whole point of the column.
 */
export function verdictRow(row: VerdictRow, colours: Colours, _columns: number): string {
  const word = said(row.verdict) ?? '';
  const rest = joined([
    said(row.id),
    day(row.judged_at),
    said(row.judged_by) === undefined ? undefined : `judged by ${said(row.judged_by)}`,
  ]);
  return `${inItsOwnColour(word, colours)}${BETWEEN_COLUMNS}${colours.dim(rest)}`;
}

/**
 * The one line a list ends with, saying how much of what matched came back.
 *
 * The words are the caller's and are not touched here. All this does is dim
 * them, so that the line reads as a note about the list rather than as another
 * row of it.
 */
export function summaryLine(line: string, colours: Colours): string {
  return colours.dim(line);
}
