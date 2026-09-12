/**
 * The version number this copy of the `pinloop` command reports about itself.
 *
 * Why this file exists. Once `pinloop` is installed from npm onto somebody
 * else's machine, nobody here can reach it. A copy installed in September keeps
 * running in November exactly as it was, until the person who installed it
 * chooses to install it again. The one thing that copy can do is say which
 * version it is, on every request it sends, so the server can answer with the
 * newest published version and the copy can print a line telling its owner that
 * a newer copy exists. This constant is that number.
 *
 * What breaks silently if this number is wrong. The number below has to be the
 * same number the published package carries. scripts/pack-cli.mjs reads the
 * `version` field of the repository's package.json and copies it straight into
 * the package people install, so if package.json were raised to 0.2.0 and this
 * constant were left at 0.1.0, every installed copy of 0.2.0 would report 0.1.0
 * to the server. The server would compare 0.1.0 against a newest published
 * version of 0.2.0, decide those people were out of date, and print the update
 * line at people who had already updated. Nothing would fail, and installing
 * again would not stop the line, because installing again would not change the
 * number being reported. A test in src/cli/cli-version.test.ts reads both this
 * constant and package.json and fails the moment the two stop matching.
 *
 * This file lives in src/cli because the published package is built out of
 * src/cli and src/shared alone. It imports nothing, and reading package.json at
 * run time is deliberately not done here: the published package's own
 * package.json sits at a different place relative to this file than the
 * repository's does, so a file read would be a thing that works in the test
 * suite and breaks in the thing people install.
 */

/** The version this copy of the command is. Must equal package.json's `version`. */
export const CLI_VERSION = '0.4.3';
