/**
 * Reading and comparing the version numbers the installed `pinloop` command and
 * the server tell each other about.
 *
 * Why this file exists, and why it sits in src/shared rather than on one side
 * or the other. The installed command sends its own version number to the
 * server on every request. The server sends two numbers back on every answer:
 * the newest version of the command that has been published, and the oldest
 * version the server will still answer at all. Both sides then have to decide
 * whether one version number is below another. The server decides it to work
 * out whether to refuse the request outright. The command decides it to work
 * out whether to print the line saying a newer copy exists. If the two pieces
 * of code did that differently, a copy could be refused by the server while
 * being told nothing at all by itself, so the comparison is written once here
 * and imported by both.
 *
 * What breaks silently if this file is wrong. Version numbers look like text
 * and are not text. Compared as text, "0.9.0" sorts after "0.10.0", because the
 * character "9" comes after the character "1". A comparison that made that
 * mistake would tell a person running 0.10.0 to install 0.9.0, and the day the
 * oldest answered version passed 0.9.0 it would cut that person off while they
 * were running the newest copy in existence. Nothing would fail anywhere; the
 * server would simply stop answering. The other silent failure is answering
 * "these are the same version" for text that is not a version number at all,
 * because "the same version" is exactly what an up-to-date copy looks like, so
 * an unreadable number would be read as up to date forever. That is why
 * compareVersions throws rather than guessing, and why isVersion exists to give
 * a plain yes or no about a piece of text before anybody compares it.
 *
 * This file touches nothing outside itself: no network, no database, no money.
 */

/**
 * True when `text` is three whole numbers separated by dots, and nothing else.
 *
 * Anything else is false: an empty string, "1.2", "1.2.3.4", "v1.2.3",
 * "1.2.3-beta", a number with a space in front of it. The server needs this
 * answer because a version header holding text of any other shape has to be
 * treated exactly like a request that carried no version header at all.
 */
export function isVersion(text: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(text);
}

/**
 * Compares two version numbers and returns a negative number when `a` is older
 * than `b`, zero when they are the same version, and a positive number when `a`
 * is newer than `b`.
 *
 * Only the sign of the answer means anything, which is what lets this be handed
 * straight to a sort. Each of the three parts is read as a number rather than
 * as text, and the first part decides before the second is looked at, so 1.0.0
 * is newer than 0.99.99 and 0.1.20 is newer than 0.1.3.
 *
 * Text that is not a version number throws instead of being given an answer.
 */
export function compareVersions(a: string, b: string): number {
  const left = partsOf(a);
  const right = partsOf(b);
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The three whole numbers inside a version number, or a refusal to read it. */
function partsOf(text: string): number[] {
  if (!isVersion(text)) {
    throw new Error(
      `${JSON.stringify(text)} is not a version number of the form 1.2.3. This is a ` +
        'Pinloop problem, not something you did. Run `pinloop message` and describe ' +
        'what you were doing when it happened.',
    );
  }
  return text.split('.').map((part) => Number(part));
}
