/**
 * How much of what somebody asked for was actually covered, and the one way this
 * product says it.
 *
 * Andrew's rule, 2026-08-15. Whenever this product tells somebody that something
 * was left out, failed, dropped, skipped or not found, the first thing it says
 * is how much of the whole did come through, written as a fraction of the real
 * numbers. Not "4 postings without embeddings were not considered", but
 * "996/1000 postings had embeddings and were considered". The fraction goes
 * first, and the list of which ones and why goes after it.
 *
 * Two things about the numbers. They are never reduced: 249 out of 250 is
 * written 249/250, not 249/250 turned into anything smaller, and 996 out of 1000
 * stays 996/1000 however large the numbers get. And when there was nothing to
 * cover in the first place, the answer is "0/0" rather than a division nobody
 * can do.
 *
 * In an answer a program reads, the two numbers travel as plain whole numbers in
 * an object of exactly this shape, sitting next to whatever the answer already
 * carried:
 *
 *   "coverage": { "covered": 996, "total": 1000 }
 *
 * Nothing that was already in an answer was taken away to make room for it, so a
 * program that reads `not_found` or `dropped` today still reads them.
 *
 * In text a person reads, the same two numbers are written with thousands
 * separators, because 149,446/149,519 can be read at a glance and 149446/149519
 * cannot. Writing them that way is the command line's job and lives in
 * src/cli/format.ts: the server hands back the two whole numbers and nothing
 * else, and only the program a person is looking at turns them into a sentence.
 *
 * This file sits under src/shared/ because both sides run it. The server works
 * the numbers out; the command line reads them off an answer and prints them.
 * Nothing here opens a connection, reads a credential or writes SQL, which is
 * what lets the published `pinloop` package carry it without carrying the
 * server.
 */

/** How many of a set were covered, and how many there were in all. */
export type Coverage = {
  /** How many came through: the successes. */
  covered: number;
  /** How many there were altogether, the covered ones included. */
  total: number;
};

/** The two numbers, in the one shape every answer in this product uses. */
export function coverageOf(covered: number, total: number): Coverage {
  return { covered, total };
}
