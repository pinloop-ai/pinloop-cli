/**
 * Turning what the server sent into the words a person reads at a terminal.
 *
 * Only the command line prints for people. The server hands back whole numbers
 * and stored fields, and the command line writes them as a sentence, so these
 * functions live beside the command line rather than beside the counting. The
 * counting itself, and the shape the two numbers travel in, is
 * src/shared/coverage.ts, and the rule about always leading with the fraction is
 * written out in full there.
 *
 * Nothing in this file reads a file, opens a connection or calls anything. It
 * takes numbers and text and gives back text.
 */
import type { Coverage } from '../shared/coverage.ts';

/** One whole number with thousands separators, for a person to read. */
export function withSeparators(count: number): string {
  return count.toLocaleString('en-US');
}

/**
 * The fraction a person reads, real numbers and never reduced: "996/1,000".
 * A whole of nothing reads "0/0", because there was nothing to cover.
 */
export function fractionOf(covered: number, total: number): string {
  return `${withSeparators(covered)}/${withSeparators(total)}`;
}

/** The same fraction, taken straight off a coverage the answer carried. */
export function fractionIn(held: Coverage): string {
  return fractionOf(held.covered, held.total);
}

/**
 * One posting named the way a person recognises it: the job title, then the
 * employer, then the posting id in parentheses.
 *
 * A message that named a posting by its id alone — "could not judge
 * jb-88213" — left the person reading it with a string they never typed and
 * cannot place, so they had to go and fetch the posting to find out which job
 * the message was even about. The title and the employer are what answer that,
 * and the id stays on the end because it is the thing that gets pasted into
 * `pinloop fetch` or `pinloop judgment get` afterwards.
 *
 * A posting the server sent no title for is named by its employer alone, and one
 * with neither a title nor an employer falls back to the bare id, because "the
 * posting at " with nothing after it is worse than the id it replaced.
 */
export function postingNamed(
  title: string | null | undefined,
  company: string | null | undefined,
  id: string,
): string {
  const job = String(title ?? '').trim();
  const employer = String(company ?? '').trim();
  if (job !== '' && employer !== '') return `the ${job} posting at ${employer} (${id})`;
  if (job !== '') return `the ${job} posting (${id})`;
  if (employer !== '') return `the posting at ${employer} (${id})`;
  return id;
}
