/**
 * How many calls to the model provider Pinloop keeps open at the same time.
 *
 * This number lives in src/shared/ rather than beside the code that makes the
 * calls because two very different pieces of the product need the same figure
 * and neither may import the other. The server uses it to decide how many
 * postings it sends to the model at once. The `pinloop` command prints it in the
 * group of lines it redraws while a judge run goes — "judging 12 postings, 4 at
 * a time" — and the command may import nothing from the server
 * (src/cli/package-boundary.test.ts walks its imports and fails on any file
 * outside src/cli/ and src/shared/). Written down twice, the two copies would
 * drift and the line on the screen would quietly start lying about what the
 * server is doing.
 */

/**
 * How many provider calls may be in flight at once.
 *
 * One at a time would make a full hundred-posting run take ten minutes or more,
 * which is the run the cap allows; a large number is a burst the provider
 * throttles. Four keeps a full run inside the low minutes the design promises
 * and stays well under any published rate.
 */
export const MAX_IN_FLIGHT_REQUESTS = 4;
