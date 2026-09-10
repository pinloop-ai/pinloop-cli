/**
 * STUB. Browser sign-in does not exist yet.
 *
 * Nothing here is implementation. Every name below is a number, an address, or
 * a printed sentence that both the tests of this feature and the build that
 * follows them read out of this one file, so that neither side can carry its
 * own copy and drift. It is the same arrangement src/cli/paths.ts has held
 * since slice 1, and the same one src/server/limits.ts holds for the ceilings.
 *
 * The feature is specs/feature-browser-sign-in.md, agreed 2026-08-19, with the
 * architecture agreed 2026-08-20. In one paragraph: `pinloop login` starts a
 * small web server inside its own process listening on 127.0.0.1, prints the
 * web address of the sign-in page with the port it is listening on and a
 * one-time secret in that address, and waits. A person opens that address in a
 * browser, signs in with Google, with GitHub, or with a 6-digit code Pinloop
 * emails them, and the script inside the page sends the pass to 127.0.0.1 on
 * the port the terminal named. When the browser cannot reach the terminal —
 * the terminal is on a rented machine reached over SSH and the browser is on a
 * laptop — the page shows a short code instead, and the person pastes that code
 * into the waiting terminal.
 *
 * This file is imported by the command line and by the server, so it lives in
 * src/shared: src/cli/package-boundary.test.ts allows the published command to
 * be built out of src/cli and src/shared and nothing else.
 */

// ---------------------------------------------------------------------------
// The release this feature ships as
// ---------------------------------------------------------------------------

/**
 * The version of the `pinloop` command this feature ships as, and the version
 * the server's MINIMUM_CLI_VERSION rises to on the day it ships.
 *
 * Why the minimum moves, which it almost never does. Every copy of `pinloop`
 * published before this one signs a person in by sending their password to two
 * server addresses that this feature deletes, so the sign-in in every one of
 * those copies is broken beyond repair from here. src/server/versions.ts says
 * the minimum moves only when one specific older copy is provably giving people
 * wrong answers or doing something unsafe, and a copy whose only way in no
 * longer exists meets that bar.
 */
export const BROWSER_SIGN_IN_RELEASE = '0.2.0';

/**
 * The release before this one: the last published copy that signs in with a
 * password. A request naming this version is the exact thing the server has to
 * refuse with the line naming `npm install -g pinloop`.
 */
export const RELEASE_BEFORE_BROWSER_SIGN_IN = '0.1.0';

// ---------------------------------------------------------------------------
// Where the pages and the three new server addresses live
// ---------------------------------------------------------------------------

/**
 * Where the sign-in page is served from in production.
 *
 * It has to be this name rather than api.pinloop.ai, even though one Fly
 * machine answers both: the login service will only send a browser back to an
 * address on its allowed list, and that list names https://pinloop.ai/auth/callback
 * (specs/feature-browser-sign-in.md, the recorded settings of 2026-08-19).
 */
export const SIGN_IN_SITE_URL = 'https://pinloop.ai';

/**
 * Environment variable overriding where the sign-in page lives. Unset in
 * production; the tests point it at the server they started on this machine,
 * the same way PINLOOP_SERVER_URL in src/cli/paths.ts points the command at a
 * server.
 */
export const SIGN_IN_SITE_URL_ENV_VAR = 'PINLOOP_SIGN_IN_URL';

/** The page a person signs in on: Google, GitHub, or a box for an email address. */
export const SIGN_IN_PAGE_PATH = '/login';

/**
 * The page the login service sends the browser back to once Google, GitHub or
 * the emailed code has proved who the person is. Its script is what delivers
 * the pass to the waiting terminal.
 */
export const CALLBACK_PAGE_PATH = '/auth/callback';

/** Asks Pinloop to email a 6-digit code to one address. Nobody is signed in yet. */
export const SEND_CODE_PATH = '/auth/send-code';

/** Hands back a pass when the 6-digit code matches. Nobody is signed in yet. */
export const VERIFY_CODE_PATH = '/auth/verify-code';

/**
 * Parks a pass in the server's memory under a short code, for the case where
 * the browser cannot reach the terminal. Nobody is signed in yet.
 */
export const HANDOFF_PATH = '/auth/handoff';

/** Trades that short code for the pass, once. Nobody is signed in yet. */
export const HANDOFF_TRADE_PATH = '/auth/handoff/trade';

/**
 * The three addresses this feature adds that answer a caller who has not signed
 * in. Storing a held pass and trading it back are one address for the purpose
 * of counting requests, because they are two halves of the same fallback.
 */
export const SIGN_IN_ADDRESSES: readonly string[] = Object.freeze([
  SEND_CODE_PATH,
  VERIFY_CODE_PATH,
  HANDOFF_PATH,
]);

// ---------------------------------------------------------------------------
// The listener inside the terminal, and what the browser sends it
// ---------------------------------------------------------------------------

/** The one address the small web server inside `pinloop login` answers. */
export const LOOPBACK_CALLBACK_PATH = '/callback';

/** The name in the printed web address that carries the port being listened on. */
export const PORT_PARAMETER = 'port';

/**
 * The name in the printed web address that carries the one-time secret the
 * terminal invented when it started listening.
 *
 * The delivery has to carry the same secret back in its body. Without it, a
 * page still open from a different sign-in could hand a pass to the wrong
 * terminal, and anything else running on the machine could hand it one too.
 */
export const SECRET_PARAMETER = 'secret';

/**
 * What the page's script sends to the terminal, as JSON.
 *
 * The email address rides along rather than being read out of the pass. The
 * page already has it — the login service hands the account back with the
 * sign-in — and it is used for one thing only, the printed confirmation line,
 * never for deciding who anybody is. Who the caller is, is decided by the
 * server, from the pass, on every later request.
 */
export type DeliveredPass = {
  /** The one-time secret out of the printed address. */
  secret: string;
  /** The pass itself: what proves to the server who is running a command. */
  access_token: string;
  /** The renewal token, which buys the next pass when this one runs out. */
  refresh_token?: string;
  /** The address that signed in, for the confirmation line and nothing else. */
  email?: string;
};

/** How long `pinloop login` waits for a browser before it gives up: 10 minutes. */
export const WAIT_FOR_SIGN_IN_MS = 10 * 60 * 1000;

/** How long a short code shown by the page can be traded for the pass: 10 minutes. */
export const HANDOFF_CODE_LIFETIME_MS = 10 * 60 * 1000;

/** How many digits the code Pinloop emails has. The live login service is set to this. */
export const EMAILED_CODE_DIGITS = 6;

// ---------------------------------------------------------------------------
// Every sentence this feature prints, word for word
// ---------------------------------------------------------------------------

/**
 * The first line `pinloop login` prints, with the web address on its own
 * indented line under it.
 *
 * The address is always printed, even on a machine where the command also opens
 * the browser itself, because the person running the command is often a coding
 * agent and the human does the browser part on their own screen.
 */
export const OPEN_THIS_ADDRESS_LINE = 'open this address in your browser to sign in:';

/** How far the printed web address is indented under the line above it. */
export const ADDRESS_INDENT = '  ';

/**
 * The line under the address, for the case where the browser is on a different
 * machine from the terminal and cannot reach it.
 */
export const PASTE_THE_CODE_LINE = 'if the page shows you a code, paste it here:';

/**
 * The line printed under the address instead of PASTE_THE_CODE_LINE, when
 * `pinloop login` is run with stdin that is not a terminal.
 *
 * A coding agent running the command cannot type into the prompt
 * PASTE_THE_CODE_LINE opens, so nothing is opened at all: the command prints
 * this line and exits, and the person finishes signing in later with
 * `pinloop login --code`, which takes the same short code the page would have
 * had them paste in.
 */
export const FINISH_WITH_CODE_LINE = 'then run: pinloop login --code XXXX-XXXX';

/**
 * The environment variable `pinloop login --code` reads when the flag itself
 * is absent. The flag wins when both are set.
 *
 * It exists for the same reason `--code` does: a coding agent finishing a
 * sign-in a person completed in their own browser has nowhere to paste a code
 * into, and a command-line flag or an environment variable are the two ways an
 * agent can hand a value to a process it starts.
 */
export const LOGIN_CODE_ENV_VAR = 'PINLOOP_LOGIN_CODE';

/** The one line printed when nothing was delivered inside WAIT_FOR_SIGN_IN_MS. */
export const GAVE_UP_LINE =
  'the sign-in did not finish within 10 minutes. Run "pinloop login" to try again.';

/**
 * The one line a finished sign-in prints. It is the line `pinloop login` has
 * printed since slice 1, unchanged: the browser is a new way of proving who
 * somebody is, and nothing about what the command does afterwards changes.
 *
 * Andrew's ruling (2026-08-22): no mention of a file, a path, or "this
 * machine" — that is implementation detail a consumer product does not
 * surface. The email address is kept because it confirms which account just
 * got signed in; everything about where the pass went is dropped.
 */
export function loggedInLine(email: string): string {
  return `logged in as ${email}`;
}

/** The one line `pinloop logout` prints when it deleted a saved login. */
export function signedOutLine(): string {
  return 'logout successful';
}

/** The one line `pinloop logout` prints when there was nothing to delete. */
export const NO_LOGIN_SAVED_LINE = 'not logged in';

/**
 * What somebody typing the old password sign-in is told.
 *
 * A copy of the command from before this release never reaches this sentence —
 * the server refuses it by version and tells it to install again. This sentence
 * is for a person who has the new copy and typed the flags from memory or from
 * a saved note.
 */
export const PASSWORD_FLAGS_REFUSAL =
  'pinloop login no longer takes --email or --password. ' +
  'Run "pinloop login" and finish signing in in the browser.';
