/**
 * The four words a verdict may be, and the two small things every side of the
 * product does with them.
 *
 * A verdict is the model's own word about one job posting and one person: `no`,
 * `weak`, `fair` or `strong`, worst to best. The order matters, because a run
 * can be told to keep only postings at or above one of the four words, so the
 * list below is a scale rather than a set.
 *
 * These four words are written down once, here, and everything else reads them
 * from here. Three different places need them and they must never disagree.
 * The file that builds the model request puts the four words in the request as
 * the only answers the model may give, and refuses an answer outside them. The
 * judge run and the judgment listing check a typed verdict against them. And
 * the command line prints a line for every posting a keep word dropped, which
 * means the command line needs the wording of that line too — `dropReason`
 * below — without needing anything else the judge run does.
 *
 * That last point is why this file sits under src/shared/ rather than inside
 * the judge run. `pinloop judge --keep fair` prints "dropped <id>: judged weak,
 * below fair" on the caller's own machine, from a one-line function. Before
 * this file existed that one line lived in src/core/judge.ts, so the command
 * line imported the whole judge run to get it, and through the judge run it
 * imported the model provider, the search, the fetch, the profile reader and
 * the embedder — about a dozen files of server code that the published
 * `pinloop` package has no use for and must not carry.
 *
 * Nothing in this file opens a connection, reads a credential, calls a model or
 * touches the filesystem. It is four words and two functions over them.
 */

/**
 * The four words a verdict may be, worst to best.
 *
 * Growing or reordering this list changes what the model is allowed to answer,
 * what `--keep` compares against, and what `pinloop judgment put` will store,
 * all at once. It is a spec change (specs/feature-judge.md), never a tidy-up.
 */
export const VERDICTS = ['no', 'weak', 'fair', 'strong'] as const;

/** One of the four words, as a type. */
export type Verdict = (typeof VERDICTS)[number];

/**
 * Why a judge step in a routine, or a judge run in a terminal, left a posting
 * out: the verdict it was given and the word the run was keeping at, so a person
 * reading the report sees both the judgement and the rule that acted on it.
 */
export function dropReason(verdict: string, keep: string): string {
  return `judged ${verdict}, below ${keep}`;
}

/** Where a verdict sits on the four-word scale; higher is better. */
export function rankOf(verdict: string): number {
  return VERDICTS.indexOf(verdict as Verdict);
}
