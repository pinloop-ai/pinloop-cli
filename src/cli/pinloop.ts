#!/usr/bin/env node
/**
 * The `pinloop` command line program.
 *
 * The line above is what lets the compiled file run as a command in its own
 * right. package.json points the name `pinloop` at the compiled copy of this
 * file, so `npm link` here — or `npm install -g` from a clone — puts a working
 * `pinloop` on the PATH, and the spec's `pinloop login` is what a person
 * actually types.
 *
 * It holds no database credential and knows no SQL. Everything it does is one
 * HTTP call to the hosted Pinloop server: create an account, log in, search,
 * list, fetch, look an employer up by name, store and read back the account's
 * own profile documents, or keep named lists of postings in the account's own
 * tabs. The one verb that calls nothing at all is
 * `filter`, which works on rows another command already printed. The only thing
 * it keeps on disk is the pass the server handed back at login, written to
 * credentials.json with owner-only permissions — the same treatment an ssh
 * private key gets — and refused outright if anybody widens those permissions
 * later. That pass is good for about an hour; when it runs out, the same file's
 * renewal token buys a new one on the spot, so the command a person typed still
 * works and nobody has to log in by hand.
 *
 * Three verbs print text and take no rows at all. `welcome` prints what Pinloop
 * is, the short instruction file for a coding agent to save, and the first steps
 * to work through with the person. `skill` prints that instruction file on its
 * own. `guide` prints the full instructions, built by walking this program's own
 * list of commands, so they describe the copy installed here and never a newer
 * one. Typing `pinloop` with nothing after it prints what the account holds.
 *
 * Every verb prints the same two shapes, so one verb's output is the next
 * verb's input. With --json, standard output carries one JSON object and
 * nothing else: a `rows` array, plus `cursor` where paging applies. Anything a
 * person needs to read but a following command must not swallow — the report of
 * what filter dropped, an error, a warning — goes to standard error instead.
 *
 * This file and everything it imports are meant to be publishable on their own,
 * as an npm package a stranger installs without getting the server with it. So
 * it may import from src/cli/ and from src/shared/, and from the `commander`
 * package, and from nothing else. src/cli/package-boundary.test.ts walks the
 * imports from here and fails naming the file and the import if anything else
 * gets in, and scripts/pack-cli.mjs walks the compiled copies the same way and
 * refuses to build the package rather than shipping server code by accident.
 * When this program needs something the server also needs, the thing moves into
 * src/shared/ rather than being imported across.
 * The server's search route calls its array `results`; this program renames it
 * to `rows` on the way out so a person at a terminal only ever meets one name.
 *
 * A search answer also carries the server's report of what it actually searched
 * for: which match mode it used, how many postings it was willing to score, and
 * which spellings of each typed word it looked for. With --json that report is
 * one more key beside `rows` and `cursor`, so a program that only reads `rows`
 * is unaffected by it. Without --json the postings are still the only thing on
 * standard output, and the report is written as one plain sentence to standard
 * error, where a person reads it and the next command in a pipe never sees it.
 */
import {
  chmodSync,
  existsSync,
  fstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { Socket } from 'node:net';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { isatty } from 'node:tty';
import { Command, Option } from 'commander';

import { coverageOf, type Coverage } from '../shared/coverage.ts';
import { runFilter, type FilterRules } from '../shared/filter.ts';
import { buildGuide, NON_COMMAND_PARTS } from '../shared/guide.ts';
import { allowanceLines, SIGNED_OUT_SENTENCE } from '../shared/guide-text.ts';
import { SKILL_TEXT, SKILL_VERSION } from '../shared/skill-file.ts';
import { printWelcome } from '../shared/welcome.ts';
import {
  DEFAULT_FILE_NAME,
  FILE_CONTENT_TYPE,
  JUDGE_PROMPT_NAME,
  QUICK_JUDGE_PROMPT_NAME,
  beginsLikeAPdf,
  reservedKind,
} from '../shared/registry.ts';
import { PROGRESS_CONTENT_TYPE, type ProgressEvent } from '../shared/progress-events.ts';
import { dropReason } from '../shared/verdicts.ts';
import { compareVersions, isVersion } from '../shared/version.ts';
import {
  ADDRESS_INDENT,
  FINISH_WITH_CODE_LINE,
  HANDOFF_TRADE_PATH,
  LOGIN_CODE_ENV_VAR,
  NO_LOGIN_SAVED_LINE,
  OPEN_THIS_ADDRESS_LINE,
  PASSWORD_FLAGS_REFUSAL,
  PASTE_THE_CODE_LINE,
  loggedInLine,
  signedOutLine,
  type DeliveredPass,
} from '../shared/sign-in.ts';
import { openInBrowser, waitForBrowserSignIn } from './browser-login.ts';
import { BILLING_PATH, billingLines } from '../shared/billing.ts';
import { fractionOf, postingNamed, withSeparators } from './format.ts';
import { companyRow, postingRow, summaryLine, tabRow, verdictRow } from './rows.ts';
import { openScreen, type Screen } from './screen.ts';
import { CLI_VERSION } from './version.ts';
import {
  CONFIG_DIR_ENV_VAR,
  CREDENTIALS_FILENAME,
  CREDENTIALS_FILE_MODE,
  DEFAULT_SERVER_URL,
  SERVER_URL_ENV_VAR,
} from './paths.ts';

// ---------------------------------------------------------------------------
// The screen this run draws on
// ---------------------------------------------------------------------------

/**
 * How wide the terminal window is.
 *
 * The operating system is asked first, through the stream the group of redrawn
 * lines is written to. A stream that is not a terminal window has no width at
 * all, so the environment variable a shell sets is read next, and eighty is the
 * width every terminal has had since terminals were teleprinters.
 */
const DEFAULT_WIDTH = 80;

function terminalWidth(): number {
  const fromStream = process.stderr.columns;
  if (typeof fromStream === 'number' && fromStream > 0) return fromStream;
  const fromEnvironment = Number(process.env['COLUMNS']);
  if (Number.isFinite(fromEnvironment) && fromEnvironment > 0) return fromEnvironment;
  return DEFAULT_WIDTH;
}

/**
 * True when the answer itself is printed as rows lined up in columns rather
 * than as the plain text a pipe reads.
 *
 * It asks about standard output, not standard error, because this is about the
 * answer and the answer goes to standard output.
 *
 * It also asks whether colour was turned off, and drops back to the plain text
 * when it was. The rows lean on bold and dim to tell one column from the next,
 * so with no colour at all they are one dense run of text with three spaces in
 * it, which is harder to read than one fact per line (Andrew, 2026-08-19, after
 * reading both forms at his own terminal). So turning colour off gives the same
 * output a pipe gets, rather than a half-dressed version of the rows.
 */
let alignedRows = false;

/**
 * The one piece of code that writes to the screen while a command is working.
 *
 * It is built once, from the real streams, and every command uses that one. It
 * never touches standard output: everything the person asked for is printed by
 * the command's own code, after the work has finished.
 */
let screen: Screen = buildScreen(false);

function buildScreen(plain: boolean): Screen {
  const stderrIsTTY = process.stderr.isTTY === true;
  const stdoutIsTTY = process.stdout.isTTY === true;
  const noColor = process.env['NO_COLOR'] !== undefined && process.env['NO_COLOR'] !== '';
  alignedRows = stderrIsTTY && stdoutIsTTY && !plain && !noColor;
  return openScreen({
    stderrIsTTY,
    stdoutIsTTY,
    plain,
    noColor,
    columns: terminalWidth(),
    stderr: process.stderr,
    stdout: process.stdout,
  });
}

/**
 * What the waiting line says this command is doing, in one word or two.
 *
 * Each command sets it before it talks to the server, and every call to the
 * server puts it on the screen. It is one setting rather than an argument
 * threaded through every call because the calls happen deep inside the code that
 * talks to the server, and the word belongs to the command a person typed.
 */
let waitingLabel = 'working';

function nowDoing(label: string): void {
  waitingLabel = label;
}

/** Where the saved pass lives: the override if there is one, else ~/.pinloop. */
function configDir(): string {
  const override = process.env[CONFIG_DIR_ENV_VAR];
  if (override && override !== '') return override;
  return join(homedir(), '.pinloop');
}

function credentialsFile(): string {
  return join(configDir(), CREDENTIALS_FILENAME);
}



/** The server this CLI talks to: the environment's choice, or the hosted one. */
function serverUrl(): string {
  const chosen = process.env[SERVER_URL_ENV_VAR];
  const url = chosen && chosen !== '' ? chosen : DEFAULT_SERVER_URL;
  return url.replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// The version handshake with the server
// ---------------------------------------------------------------------------

/**
 * What every one of the two sentences below ends with. It is the exact command
 * a person, or the coding agent reading this output on their behalf, has to run
 * to get the newest copy.
 */
const UPDATE_WITH = 'update with: npm install -g pinloop';

/**
 * The newest published version, when the server said one and this copy is
 * behind it. It is remembered here rather than printed on the spot so that the
 * line comes out after whatever the person actually asked for, and so that a
 * command making several calls to the server still prints it once.
 */
let newerVersionSeen: string | undefined;

/** The line an out-of-date copy prints under its own answer. */
function outOfDateLine(newest: string): string {
  return `this pinloop is ${CLI_VERSION}. the newest is ${newest}. ${UPDATE_WITH}`;
}

/** The line a copy prints when the server will not answer it at all. */
function refusedForAgeLine(needs: string): string {
  return (
    `this pinloop is ${CLI_VERSION}. the server needs ${needs} or newer and will not ` +
    `answer this copy. ${UPDATE_WITH}`
  );
}

/**
 * Reads the two version numbers off one answer from the server.
 *
 * The server puts the newest published version and the oldest version it still
 * answers on every answer it sends, refusals included. This is where a copy of
 * the command finds out it has fallen behind. An answer whose headers are
 * missing or hold something that is not a version number changes nothing at
 * all: an older server that has never heard of these headers, or anything else
 * sitting in front of the server, must not be able to make this copy print a
 * sentence about versions.
 *
 * A copy below the oldest version the server answers is not told this way,
 * because such a copy gets status 426 and is told the other sentence instead.
 */
function readServerVersions(response: globalThis.Response): void {
  const newest = String(response.headers.get('pinloop-latest-version') ?? '');
  const oldestAnswered = String(response.headers.get('pinloop-minimum-version') ?? '');
  if (!isVersion(newest)) return;
  if (compareVersions(CLI_VERSION, newest) >= 0) return;
  if (isVersion(oldestAnswered) && compareVersions(CLI_VERSION, oldestAnswered) < 0) return;
  newerVersionSeen = newest;
}

/**
 * Prints the one line saying a newer copy exists, if the server said so.
 *
 * It goes on standard error, not standard output, because standard output is
 * what `pinloop search --json | pinloop filter ...` carries to the next
 * command, and a sentence arriving there would reach the next command as if it
 * were a posting. It is printed at the very end of the program, after the
 * answer the person asked for, so the answer is the first thing they read.
 */
function printUpdateLine(): void {
  if (newerVersionSeen === undefined) return;
  process.stderr.write(`${outOfDateLine(newerVersionSeen)}\n`);
  newerVersionSeen = undefined;
}

// ---------------------------------------------------------------------------
// The one line that says a message from Andrew is waiting
// ---------------------------------------------------------------------------

/**
 * The header every answer from the server carries, holding how many messages
 * from Andrew this account has not read yet (specs/feature-messages.md, AGREED
 * 2026-08-20).
 */
const UNREAD_HEADER = 'pinloop-unread';

/**
 * The one line printed when an answer says a message from Andrew is waiting.
 *
 * It is written for a coding agent to act on, because a coding agent is usually
 * the thing reading the terminal rather than the person. It is one line on
 * purpose: whatever is reading this output has to be able to recognise it
 * without reading a paragraph, and a person who ran a command that prints a
 * hundred postings has to be able to see it above them.
 *
 * The words themselves are Andrew's approved wording (.claude/skills/printed-message,
 * approved 2026-08-21): the person is named once, with a parenthetical, and the
 * instruction to the coding agent is stated once, with no repeated scolding
 * clauses after it.
 */
const NEW_MESSAGE_NOTICE =
  'New message from Andrew (who builds Pinloop). If you are a coding agent reading this, ' +
  'run `pinloop message` now and give the person the full message word for word before ' +
  'you continue.';

/** True once an answer has said at least one message from Andrew is unread. */
let messageFromAndrewWaiting = false;

/** True once the line above has been printed, so it is printed once per run. */
let noticeAlreadyPrinted = false;

/**
 * True while `pinloop message` itself is the command running.
 *
 * That one command never prints the notice. It is the command the notice tells
 * whoever is reading to run, and the words themselves are about to be printed
 * underneath it, so printing the line there would be telling somebody to go and
 * do the thing they are already doing.
 */
let readingTheConversation = false;

/**
 * Reads the count of unread messages off one answer from the server.
 *
 * An answer that carries no count at all, or one holding something that is not
 * a whole number, changes nothing: an older server that has never heard of this
 * header, or anything else sitting in front of the server, must not be able to
 * make this copy print a line about messages. That is the same rule the two
 * version headers above are read under.
 */
function readUnreadCount(response: globalThis.Response): void {
  const said = response.headers.get(UNREAD_HEADER);
  if (said === null || said.trim() === '') return;
  const waiting = Number(said);
  if (!Number.isInteger(waiting) || waiting <= 0) return;
  messageFromAndrewWaiting = true;
}

/**
 * Prints the one line, the first time an answer has said something is waiting.
 *
 * It is printed the moment that answer is in hand, which is before the command
 * prints whatever the person asked for. That ordering is the whole point: a
 * person reading a hundred postings scrolls straight past a line printed under
 * them. It goes to standard error, where the progress lines go, so a program
 * capturing this command's machine-readable rows never gets it mixed in among
 * them.
 */
function printNewMessageNotice(): void {
  if (!messageFromAndrewWaiting) return;
  if (noticeAlreadyPrinted || readingTheConversation) return;
  noticeAlreadyPrinted = true;
  process.stderr.write(`${NEW_MESSAGE_NOTICE}\n`);
}

/**
 * Something the person needs to read, printed plainly before a non-zero exit.
 * When the server was the one that refused, `status` carries the HTTP code it
 * answered with, which is how a refusal for a pass that ran out (401) is told
 * apart from every other kind of failure.
 */
class Failure extends Error {
  readonly status: number | undefined;
  /**
   * How many seconds the server asked the caller to wait before trying again,
   * when it said so in a Retry-After header. Only an over-allowance refusal
   * carries one, and only when the server chose to name a time.
   */
  readonly retryAfterSeconds: number | undefined;

  constructor(message: string, status?: number, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** What a person is told when neither the saved pass nor its renewal works. */
const LOG_IN_AGAIN =
  'this login has expired and could not be renewed. Run `pinloop login` to log in again.';

type SavedPass = { access_token: string; refresh_token?: string };

function savePass(pass: SavedPass): string {
  const directory = configDir();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = credentialsFile();
  writeFileSync(file, `${JSON.stringify(pass, null, 2)}\n`, { mode: CREDENTIALS_FILE_MODE });
  // writeFileSync's mode is only applied when it creates the file, and the
  // process umask can narrow it further, so the mode is set again explicitly.
  chmodSync(file, CREDENTIALS_FILE_MODE);
  return file;
}

// ---------------------------------------------------------------------------
// The short code somebody types in when the browser is on another machine
// ---------------------------------------------------------------------------

/**
 * Stops reading what is being typed into this terminal. Doing it twice is safe,
 * and doing it when nothing was being read is safe too.
 *
 * It matters that this really stops: a terminal left listening to what is typed
 * into it never reaches the end of the program, so `pinloop login` would print
 * its confirmation and then sit there doing nothing.
 */
let stopReading: () => void = () => undefined;

function stopReadingTypedLines(): void {
  stopReading();
  stopReading = () => undefined;
}

/**
 * Waits for somebody to paste the short code the sign-in page showed them, and
 * hands back the pass the server gives in exchange for it.
 *
 * This is the way in when the browser cannot reach the terminal, which is what
 * happens when the terminal is on a rented machine reached over SSH and the
 * browser is on somebody's laptop. Nothing on the laptop can talk to 127.0.0.1
 * on the rented machine, so the page parks the pass at the Pinloop server under
 * a short code and the person carries that code across by hand.
 *
 * A code that the server refuses is said out loud and the waiting goes on, so
 * somebody who mistyped one character types it again rather than starting over.
 * The promise this hands back is only ever kept, never broken: the ten-minute
 * clock inside the listener is the one thing that ends the wait.
 */
function passFromATypedCode(): Promise<DeliveredPass> {
  return new Promise<DeliveredPass>((traded) => {
    let sofar = '';
    let busy = false;

    const readTyped = (chunk: Buffer): void => {
      sofar += String(chunk);
      let breakAt = sofar.indexOf('\n');
      while (breakAt !== -1) {
        const typed = sofar.slice(0, breakAt).trim();
        sofar = sofar.slice(breakAt + 1);
        breakAt = sofar.indexOf('\n');
        if (typed === '' || busy) continue;
        busy = true;
        void tradeTheShortCode(typed).then((pass) => {
          if (pass === undefined) busy = false;
          else traded(pass);
        });
      }
    };

    process.stdin.on('data', readTyped);
    process.stdin.resume();
    stopReading = () => {
      process.stdin.off('data', readTyped);
      process.stdin.pause();
    };
  });
}

/**
 * Hands one short code to the server and takes back the pass parked under it.
 * Throws, carrying the server's own reason, when the server refuses the code.
 *
 * Trading a code never proves which terminal asked for the sign-in page that
 * showed it: the server's /auth/handoff/trade address takes whoever knows the
 * eight characters, which is what lets `--code` and PINLOOP_LOGIN_CODE finish
 * a sign-in from a process that never printed the address at all.
 */
async function exchangeCodeForPass(code: string): Promise<DeliveredPass> {
  const { json } = await callServer(HANDOFF_TRADE_PATH, { method: 'POST', body: { code } });
  if (typeof json?.access_token !== 'string' || json.access_token === '') {
    throw new Failure('that code was taken but carried no pass. Try again.');
  }
  return {
    secret: '',
    access_token: json.access_token,
    ...(typeof json.refresh_token === 'string' ? { refresh_token: json.refresh_token } : {}),
    ...(typeof json.email === 'string' ? { email: json.email } : {}),
  };
}

/**
 * Hands one short code to the server and takes back the pass parked under it.
 * Hands back nothing at all when the server refuses the code, having said why.
 *
 * This is what the interactive fallback below calls: a code mistyped into a
 * running `pinloop login` is said out loud and the wait goes on, rather than
 * ending the command the way a code given as --code or PINLOOP_LOGIN_CODE does.
 */
async function tradeTheShortCode(code: string): Promise<DeliveredPass | undefined> {
  try {
    return await exchangeCodeForPass(code);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return undefined;
  }
}

/**
 * The address to name in the line a finished sign-in prints.
 *
 * The sign-in page sends it along, because it has it already. When it did not,
 * the address written inside the pass itself is read — that is the same field,
 * put there by the login service, and it is used for this printed line and for
 * nothing else. Who the caller is, is decided by the server, from the pass, on
 * every later request.
 */
function emailToPrint(pass: DeliveredPass): string {
  if (typeof pass.email === 'string' && pass.email !== '') return pass.email;
  try {
    const middle = pass.access_token.split('.')[1] ?? '';
    const claims = JSON.parse(Buffer.from(middle, 'base64url').toString('utf8'));
    if (typeof claims?.email === 'string' && claims.email !== '') return String(claims.email);
  } catch {
    // A pass this program cannot read is still a pass the server may accept, so
    // the sign-in is not failed over the wording of one line.
  }
  return 'this account';
}

/**
 * Whether this machine holds a saved login at all.
 *
 * It only asks whether the file is there. Reading it, checking its permissions
 * and refusing a bad one is readPass below, and the two commands that print
 * something different to somebody who is not signed in — the guide, and
 * `pinloop` typed on its own — need the question answered without being stopped
 * by the answer.
 */
function haveSavedLogin(): boolean {
  return existsSync(credentialsFile());
}

/**
 * Reads the saved pass, refusing a file that anyone other than its owner can
 * read or write. A pass is a key to the account; a key lying open on a shared
 * machine is not a key.
 *
 * That permission check is skipped on Windows, because Windows files do not
 * carry the read/write/execute bits this check reads. Node has to return
 * something for them anyway, so on Windows it reports 0666 for every file that
 * is not marked read-only, no matter who is actually allowed to open it. The
 * check would therefore refuse every saved login on every Windows machine, and
 * the `chmod 0600` the refusal tells the person to run cannot change the number
 * Node reports, so there would be no way out of it. What protects the file on
 * Windows instead is the account's own profile folder, which Windows only lets
 * that account and an administrator open. Three people reported this on the day
 * the command was published; the fix and its reasoning are in docs/DECISIONS.md
 * under 2026-09-06.
 */
function readPass(): SavedPass {
  const file = credentialsFile();
  if (!existsSync(file)) {
    throw new Failure(`no saved login at ${file}. Run \`pinloop login\` first.`);
  }
  const mode = statSync(file).mode & 0o777;
  if (process.platform !== 'win32' && (mode & 0o077) !== 0) {
    throw new Failure(
      `refusing to use the saved login at ${file}: its file permissions are ` +
        `${mode.toString(8).padStart(4, '0')}, which lets other people on this machine read it. ` +
        `Run \`chmod 0600 ${file}\`.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Failure(
      `the saved login at ${file} is not readable as JSON. Run \`pinloop login\` to log in again.`,
    );
  }
  const token = (parsed as SavedPass | null)?.access_token;
  if (typeof token !== 'string' || token === '') {
    throw new Failure(`the saved login at ${file} carries no token. Run \`pinloop login\` to log in again.`);
  }
  return parsed as SavedPass;
}

/** What one call to the server came back with. */
type ServerAnswer = {
  /** The body as characters, for the answers that are characters. */
  text: string;
  /** The body parsed as JSON, or undefined when the body was not JSON. */
  json: any;
  /** The body as it arrived, which is the only useful form for a stored file. */
  bytes: Buffer;
};

/** What one call sends: JSON, or a body of raw bytes under its own content type. */
type CallOptions = {
  method?: string;
  body?: unknown;
  token?: string;
  /** Raw bytes to send as the whole body, instead of JSON. */
  bytes?: Buffer;
  /** The content type those raw bytes are sent under. */
  contentType?: string;
  /**
   * Read the answer line by line as it arrives, instead of waiting for the whole
   * of it.
   *
   * A call that hands one of these in asks the server for progress, and every
   * line is handed here the moment it arrives, the last one included. The last
   * line is also the answer itself and is handed back to the caller in the
   * ordinary way, so nothing above this function has to know whether it was
   * watched or not. Anything handed here that is not a progress event worth
   * acting on is dropped by the code that reads it (`readLines` below).
   */
  onLine?: (line: string) => void;
};

/** One call to the server, with the server's own error message passed through. */
async function callServer(path: string, options: CallOptions): Promise<ServerAnswer> {
  const headers: Record<string, string> = {};
  if (options.bytes !== undefined) headers['Content-Type'] = options.contentType ?? 'application/octet-stream';
  else if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  // Every request says which version of this command sent it. That is the only
  // thing the server has to go on: it cannot reach the machine this copy is
  // installed on, so it can neither tell this copy that a newer one exists nor
  // stop this copy at all unless this copy says who it is, every time.
  headers['pinloop-cli-version'] = CLI_VERSION;
  if (options.onLine) headers['Accept'] = PROGRESS_CONTENT_TYPE;

  // Waiting starts here and stops when the answer is in hand, so a person
  // watching a slow command sees a line with a clock on it instead of a blank
  // screen. Waits nest: a command following every page of a long answer opens
  // one wait around the whole run, and each page's call opens another inside it.
  screen.wait(waitingLabel);
  try {
    return await talkToServer(path, options, headers);
  } finally {
    screen.stop();
    // The waiting line comes down first, so the notice is not written over the
    // top of a group of lines that is still being redrawn in place. It is
    // printed here rather than at the end of the program, where the line about
    // an out-of-date copy is printed, because this is the moment the answer
    // arrived and everything the person asked for is printed after it.
    printNewMessageNotice();
  }
}

/** The call itself, once the waiting line is up. */
async function talkToServer(
  path: string,
  options: CallOptions,
  headers: Record<string, string>,
): Promise<ServerAnswer> {
  let response: globalThis.Response;
  try {
    response = await fetch(`${serverUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.bytes !== undefined
          ? new Uint8Array(options.bytes)
          : options.body === undefined
            ? undefined
            : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new Failure(
      `could not reach the Pinloop server at ${serverUrl()}: ` +
        `${error instanceof Error ? error.message : String(error)}. ` +
        'Check your network connection and try again.',
    );
  }

  // Status 426 is the server saying this copy of the command is older than the
  // oldest version it answers. Nothing was run on the server, so there is no
  // answer to print and nothing to say beyond the one sentence, which is why
  // this is thrown before the body is read or anything else is checked. It is
  // also checked before the answer is read as lines, because a refusal carries
  // no progress lines at all.
  if (response.status === 426) {
    const needs = String(response.headers.get('pinloop-minimum-version') ?? '');
    throw new Failure(refusedForAgeLine(isVersion(needs) ? needs : 'a newer version'), 426);
  }
  readServerVersions(response);
  readUnreadCount(response);

  // An answer that arrives as lines is read as it arrives. Every line is handed
  // to the caller the moment it lands, and the last line is also the answer,
  // which is what the rest of this program then reads.
  if (options.onLine && response.status < 400) {
    const lastLine = await readLines(response, options.onLine);
    let watchedJson: any;
    try {
      watchedJson = JSON.parse(lastLine);
    } catch {
      watchedJson = undefined;
    }
    return { text: lastLine, json: watchedJson, bytes: Buffer.from(lastLine, 'utf8') };
  }

  // The body is read as bytes because one answer, the stored resume, is bytes
  // and turning a PDF into characters would ruin it. Everything else the server
  // says is JSON, and only those answers are read as characters at all.
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = String(response.headers.get('content-type') ?? '');
  const inWords = contentType === '' || contentType.includes('json') || contentType.startsWith('text/');
  const text = inWords ? bytes.toString('utf8') : '';
  let json: any;
  if (inWords) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }

  if (response.status >= 400) {
    const askedToWait = Number(response.headers.get('retry-after'));
    throw new Failure(
      String(json?.error ?? json?.message ?? text ?? `HTTP ${response.status}`),
      response.status,
      Number.isFinite(askedToWait) && askedToWait > 0 ? askedToWait : undefined,
    );
  }
  return { text, json, bytes };
}

/**
 * Reads an answer that arrives as one JSON object per line, hands every line to
 * `onLine` the instant that line lands, and gives back the last line.
 *
 * Nothing is held back. A line is only known to be the last one when the line
 * after it arrives or the answer ends, so waiting to find out before passing a
 * line on would mean every line reached the screen one line late. That is not a
 * detail: the line a routine run sends before each step says which step is
 * about to start, so a screen fed one line late names the step that has already
 * finished. Andrew ran a three-step routine at his terminal on 2026-08-20 and
 * watched the waiting line read "step 1 of 3" through the whole ten seconds of
 * judging that was really step 2, with steps 2 and 3 going past in the last
 * instant of the run. So each line goes to `onLine` as it arrives, and the last
 * one is simply remembered as well and handed back, which is what makes it the
 * answer.
 *
 * The last line therefore reaches `onLine` too. Both callers parse the line and
 * drop anything that is not a progress event they act on: the routine run
 * command acts only on `step-started`, and the judge command's `watchProgress`
 * drops any line with no `kind` in it, which is every answer either route ever
 * returns. The one answer that does carry a `kind` is the failure line a run
 * writes when it broke after its first progress line had gone out, and both
 * callers ignore that one as well and report the failure from the answer they
 * were handed back.
 */
async function readLines(
  response: globalThis.Response,
  onLine: (line: string) => void,
): Promise<string> {
  const stream = response.body;
  if (!stream) return '';
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  let pending = '';
  /** The newest line seen so far, which at the end of the answer is the answer. */
  let newest: string | undefined;
  const keep = (line: string): void => {
    if (line.trim() === '') return;
    newest = line;
    onLine(line);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    let cut = pending.indexOf('\n');
    while (cut !== -1) {
      keep(pending.slice(0, cut));
      pending = pending.slice(cut + 1);
      cut = pending.indexOf('\n');
    }
  }
  keep(pending);
  return newest ?? '';
}

/**
 * One call made as the logged-in account, with the renewal that keeps an
 * expired pass from ever reaching the person.
 *
 * A pass from the login service is good for about an hour. When it runs out the
 * server answers 401, and the saved login file also holds a renewal token that
 * login put there. So on a 401, this trades that renewal token for a new pass,
 * writes the new pass to the same file with the same owner-only permissions,
 * and makes the identical call one more time. Exactly one renewal and exactly
 * one retry per command: if the second call is refused too, that refusal is
 * what the person sees, and nothing loops.
 *
 * Signing up, logging in and renewing never come through here, so a refusal of
 * a password or of a renewal token can never set off another renewal.
 */
async function callAsAccount(
  pass: SavedPass,
  path: string,
  options: Omit<CallOptions, 'token'> = {},
): Promise<ServerAnswer> {
  try {
    return await callServer(path, { ...options, token: pass.access_token });
  } catch (error) {
    const refusedForLogin = error instanceof Failure && error.status === 401;
    if (!refusedForLogin) throw error;
    if (!pass.refresh_token) throw new Failure(LOG_IN_AGAIN);
    return await callServer(path, { ...options, token: await renewPass(pass.refresh_token) });
  }
}

/**
 * Asks the server for a new pass using the renewal token, saves what comes
 * back, and hands the new pass to the caller. A server that refuses the renewal
 * means the renewal token is spent or was never good, and the only way out of
 * that is logging in again — so that is what the person is told. A server that
 * could not be reached at all is reported as itself, because a machine with no
 * network is not an expired login.
 */
async function renewPass(refreshToken: string): Promise<string> {
  let json: any;
  try {
    ({ json } = await callServer('/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    }));
  } catch (error) {
    if (error instanceof Failure && error.status !== undefined) throw new Failure(LOG_IN_AGAIN);
    throw error;
  }
  if (typeof json?.access_token !== 'string' || json.access_token === '') {
    throw new Failure(LOG_IN_AGAIN);
  }
  savePass({
    access_token: json.access_token,
    refresh_token: typeof json.refresh_token === 'string' ? json.refresh_token : refreshToken,
  });
  return json.access_token;
}

type Card = {
  id: string;
  title: string;
  company: string;
  locations?: string[];
  posted_at?: string | null;
  url: string;
};

/**
 * One posting, printed the way a person reads it.
 *
 * Inside a terminal window it is two rows with their columns lined up, the job
 * title in bold and everything else dim (src/cli/rows.ts). Anywhere else — a
 * pipe, a file, a coding agent's captured output — it is exactly the plain
 * lines it has always been, one fact per line, so nothing that reads this
 * command's output today has to change.
 */
function printCard(card: Card, extraLines: string[] = []): void {
  if (alignedRows) {
    const rows = [postingRow(card, screen.colours, terminalWidth())];
    // A meaning search's match strength, and anything else the caller wanted
    // under the posting, sits indented under the two rows.
    for (const extra of extraLines) rows.push(`  ${screen.colours.dim(extra)}`);
    process.stdout.write(`${rows.join('\n')}\n`);
    return;
  }
  const lines: string[] = [];
  const add = (value: unknown) => {
    if (value !== undefined && value !== null && String(value) !== '') lines.push(String(value));
  };
  add(card.title);
  add(card.company);
  add(card.locations?.[0]);
  if (card.posted_at) add(String(card.posted_at).slice(0, 10));
  add(card.url);
  for (const line of extraLines) add(line);
  process.stdout.write(`${lines.join('\n')}\n\n`);
}

/**
 * One employer, printed the way a person reads it: its id, its name, the website
 * its postings come from, and how many postings it currently has.
 *
 * The id comes first because it is what this verb exists to hand over. Company
 * names in the corpus are messy — "Google" and "Google LLC" are two separate
 * employers — so somebody looks the employer up here, picks the right row by its
 * name and its posting count, and then gives that row's id to `pinloop search
 * --company`. Every id is the same width, so putting it in the first column
 * makes it easy to pick out and copy however long the names beside it run.
 */
function printCompany(row: Record<string, unknown>): void {
  if (alignedRows) {
    process.stdout.write(`${companyRow(row, screen.colours, terminalWidth())}\n`);
    return;
  }
  const count = Number(row['posting_count'] ?? 0);
  const pieces: string[] = [String(row['id'] ?? ''), String(row['name'] ?? '')];
  const domain = row['website_domain'];
  if (domain !== null && domain !== undefined && String(domain) !== '') pieces.push(String(domain));
  pieces.push(`${count} ${count === 1 ? 'posting' : 'postings'}`);
  process.stdout.write(`${pieces.join(' | ')}\n`);
}

/**
 * The stored record of one posting, every column on its own line, with the
 * employer's name lifted up next to the job title. The server returns the
 * employer's name alongside the posting's own columns, and left where it
 * arrives it would print underneath the full job description, where nobody
 * would find it; beside the title it is the second thing a person reads.
 */
function printRecord(row: Record<string, unknown>): void {
  const lines: string[] = [];
  for (const [column, value] of Object.entries(withCompanyBesideTitle(row))) {
    const shown =
      value === null || value === undefined
        ? ''
        : Array.isArray(value) || typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
    lines.push(`${column}: ${shown}`);
  }
  process.stdout.write(`${lines.join('\n')}\n\n`);
}

/**
 * The same record with the `company` field moved to sit directly after `title`.
 * Every other field keeps the order the server sent it in, and a record that
 * carries no company, or no title, is handed back untouched.
 */
function withCompanyBesideTitle(row: Record<string, unknown>): Record<string, unknown> {
  if (!('company' in row) || !('title' in row)) return row;
  const reordered: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    if (column === 'company') continue;
    reordered[column] = value;
    if (column === 'title') reordered['company'] = row['company'];
  }
  return reordered;
}

/**
 * The one JSON object a --json run prints, and the only thing that run writes
 * to standard output. Everything else a verb has to say goes to standard error,
 * because whatever reads this output is another program, not a person.
 */
function printJson(answer: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// The first of the two calls five commands now take
// (specs/feature-judge-confirmation.md, AGREED 2026-08-26)
// ---------------------------------------------------------------------------

/**
 * The option every one of those five commands takes, declared in one place so
 * the five spellings cannot drift apart.
 */
const CONFIRM_OPTION_HELP =
  'the token the first call printed; only a call carrying it judges or stores anything';

/**
 * Whether the server stopped this call to have the person asked first, rather
 * than doing what it was asked.
 *
 * A call that really judged or really stored something carries no confirm token
 * at all, and that is the one thing that tells the two answers apart.
 */
function stoppedToAsk(json: unknown): boolean {
  const token = (json as { confirm_token?: unknown } | undefined)?.confirm_token;
  return typeof token === 'string' && token.trim() !== '';
}

/**
 * Which of the five commands a stopped call is being reported for, plus every
 * piece of context each command already has that the server's answer does not
 * carry: the routine name a person typed after `--routine`, for the two
 * automation commands that name a routine directly. `schedule put` and `watch
 * put` are the only two that need it. `routine put`'s block names the schedule
 * or watch already running the routine instead, which is server-known rather
 * than typed on this call, and `judge` and `routine run` never name a routine
 * in their block at all (approved-gate-text.md, drafted 2026-08-26).
 *
 * Every field beyond `kind` is also what `nextCommandLine` below reads to
 * print the whole next command a person can copy and run, so each is the
 * resolved value the second call actually needs — not necessarily the exact
 * text the person typed. A judge call's `ids` is the full resolved list even
 * when the first call read them from a pipe, and a `routine run` call's
 * `within` is the resolved comma-separated set even when the person typed `-`
 * to read it from a pipe, because a command line has no pipe to read from a
 * second time and still has to work when pasted on its own.
 */
type ConfirmGate =
  | { kind: 'judge'; ids: readonly string[]; quick: boolean; again: boolean }
  | { kind: 'routine-run'; name: string; within?: string }
  | {
      kind: 'schedule-put';
      routineName: string;
      name: string;
      everyHours: string;
      firstDueAt?: string;
    }
  | { kind: 'watch-put'; routineName: string; name: string }
  | { kind: 'routine-put'; name: string; description?: string; steps?: string };

/** "26" and "1,000": how every count of judgments is written out. */
function withCommas(n: number): string {
  return n.toLocaleString('en-US');
}

/** "1 full judgment" / "4 full judgments" / "1,000 quick judgments". */
function judgmentPhrase(count: number, kind: string): string {
  return `${withCommas(count)} ${kind} judgment${count === 1 ? '' : 's'}`;
}

/**
 * How many judgments of one kind an account has left to run this month, as
 * text: a real number is written out with commas, and the one non-numeric
 * value the server ever sends here, `UNLIMITED` (`src/server/limits.ts`,
 * `'unlimited'`), is printed exactly as sent rather than forced through
 * `Number()`, which would otherwise turn it into "NaN".
 */
function leftAmount(remaining: unknown): { text: string; plural: boolean } {
  const asNumber = Number(remaining);
  if (Number.isFinite(asNumber)) return { text: withCommas(asNumber), plural: asNumber !== 1 };
  return { text: String(remaining), plural: true };
}

/** The exact-figure rate a fact is stated with: "once an hour" / "once every 24 hours". */
function rateFactual(hours: number): string {
  return hours === 1 ? 'once an hour' : `once every ${hours} hours`;
}

/**
 * The rate as it is spoken to the person, colloquially, inside the
 * coding-agent line: "once an hour" and "once a day" are the two the approved
 * text gives verbatim; anything else falls back to the exact figure.
 */
function rateColloquial(hours: number): string {
  if (hours === 1) return 'once an hour';
  if (hours === 24) return 'once a day';
  return rateFactual(hours);
}

/**
 * "up to 100 full judgments" for a routine holding one kind of judging step, or
 * "up to 1,000 quick judgments and up to 100 full judgments" for one holding
 * both, quick named first, matching the approved text's own ordering. Never
 * one combined figure: a full judgment and a quick judgment cost this account's
 * month different amounts, so adding them first would mean converting both back
 * into Pinloop's own bookkeeping (specs/feature-judge-confirmation.md).
 */
function ceilingPhrase(judgments: Record<string, number>): string {
  return ['quick', 'full']
    .filter((kind) => kind in judgments)
    .map((kind) => `up to ${judgmentPhrase(judgments[kind]!, kind)}`)
    .join(' and ');
}

/**
 * "full judge step" / "quick-judge step" / "judge step and a quick-judge step":
 * how the naming line (point 1 of a stored schedule, watch, or routine's block)
 * names which step, or steps, the routine reaches.
 */
function stepLabelNaming(kinds: string[]): string {
  if (kinds.length > 1) return 'judge step and a quick-judge step';
  return kinds[0] === 'quick' ? 'quick-judge step' : 'full judge step';
}

/**
 * "judge step" / "quick-judge step" / "judge step and quick-judge step": how
 * the free-alternative sentence (point 4 of that same block) names the step
 * being left out. Never carries "full", because leaving out "the judge step" is
 * unambiguous on its own; "quick-judge step" keeps its own word because "the
 * judge step" alone would misname it.
 */
function stepLabelLeftOut(kinds: string[]): string {
  if (kinds.length > 1) return 'judge step and quick-judge step';
  return kinds[0] === 'quick' ? 'quick-judge step' : 'judge step';
}

/** "1 hour" / "2 hours": how the token's own lifetime is spoken. */
function hoursPhrase(hours: number): string {
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * The "matches only ..." clause under the token, naming exactly what a second
 * call has to match for that token to work: different at each of the five
 * commands, because each parks its token under different arguments
 * (src/server/confirm.ts, confirmSubjectForJudge and confirmSubjectForRow).
 */
function tokenScope(gate: ConfirmGate): string {
  switch (gate.kind) {
    case 'judge':
      return 'these exact postings';
    case 'routine-run':
      return 'this exact routine at this exact step';
    case 'schedule-put':
      return 'this exact schedule name, routine name, and cadence';
    case 'watch-put':
      return 'this exact watch name and routine name';
    case 'routine-put':
      return 'this exact routine name and these exact steps';
  }
}

/**
 * One word of a shell command line, quoted only when it needs to be.
 *
 * A posting id, a routine name, a schedule name, and a cadence in hours are
 * all plain letters, digits, dashes, and commas — the approved gate text
 * prints those bare, unquoted, exactly as a person would type them. Anything
 * else (a `--description` a person wrote in their own words, or a `--steps`
 * JSON blob) can hold spaces, quotes, or other characters a shell would
 * otherwise split on, so it is wrapped in single quotes, with any single
 * quote inside it closed out and reopened around an escaped one.
 */
function shellArg(value: string): string {
  if (/^[A-Za-z0-9._,:@/-]+$/.test(value)) return value;
  return `'${value.split("'").join(`'\\''`)}'`;
}

/**
 * The whole next command, ready to copy and run, ending in `--confirm` and
 * the token — served on a silver platter rather than left for a coding agent
 * to rebuild and risk getting wrong (Andrew, 2026-08-26). Built from the real
 * arguments the caller actually used, per `ConfirmGate`'s own doc comment,
 * never from the placeholder-ish forms the approved gate text shows for
 * `schedule put` and `routine put`.
 *
 * A judge call's posting ids are never shortened, even when there are as many
 * as a hundred of them: a long line is a smaller problem than a coding agent
 * rebuilding the list wrong (Andrew, 2026-08-26).
 *
 * `routine put`'s steps carry into the line only when the caller gave them
 * directly as `--steps`: that text is already in hand, so the printed
 * command is self-sufficient. Steps piped in on standard input are left out
 * instead, because a single command line has no pipe to read from a second
 * time — running the printed line as it stands then needs `--steps` or a
 * pipe supplied again. Either way, the printed command always carries the
 * routine's own name, and its `--description` when one was given.
 */
function nextCommandLine(gate: ConfirmGate, token: string): string {
  const words: string[] = ['pinloop'];
  switch (gate.kind) {
    case 'judge':
      words.push('judge', ...gate.ids.map(shellArg));
      if (gate.again) words.push('--again');
      if (gate.quick) words.push('--quick');
      break;
    case 'routine-run':
      words.push('routine', 'run', shellArg(gate.name));
      if (gate.within !== undefined) words.push('--within', shellArg(gate.within));
      break;
    case 'schedule-put':
      words.push(
        'schedule',
        'put',
        shellArg(gate.name),
        '--routine',
        shellArg(gate.routineName),
        '--every-hours',
        shellArg(gate.everyHours),
      );
      if (gate.firstDueAt !== undefined) words.push('--first-due-at', shellArg(gate.firstDueAt));
      break;
    case 'watch-put':
      words.push('watch', 'put', shellArg(gate.name), '--routine', shellArg(gate.routineName));
      break;
    case 'routine-put':
      words.push('routine', 'put', shellArg(gate.name));
      if (gate.description !== undefined) words.push('--description', shellArg(gate.description));
      if (gate.steps !== undefined) words.push('--steps', shellArg(gate.steps));
      break;
  }
  words.push('--confirm', token);
  return words.join(' ');
}

/**
 * Prints what the second call would do and the whole next command a person
 * can copy and run to make it.
 *
 * Under --json it is one JSON object on standard output and nothing else, so a
 * following command reads the token and every number straight out of it — the
 * server's own CONFIRM_REFUSAL sentence rides along there under
 * `confirm_message`, unchanged. Read by a person it is plain lines on
 * standard error, built to the wording Andrew approved (approved-gate-text.md,
 * drafted 2026-08-26 against specs/feature-judge-confirmation.md and
 * .claude/skills/printed-message/SKILL.md): what would really be judged and by
 * which model, what that would spend and what would be left, what a judgment
 * gives that reading the material yourself does not, the free path open to a
 * coding agent itself, one plain sentence for that agent to put to the
 * person, and the whole next command, ending in --confirm and the token, with
 * a note underneath on how long the token lasts and what it matches. The
 * server's CONFIRM_REFUSAL sentence is not printed a second time here: this
 * block already says, in its own words, that nothing was judged or stored and
 * what the coding agent does next, so repeating that server sentence on top
 * would say the same thing a third time (Andrew, 2026-08-26).
 */
function reportConfirmation(json: any, asJson: boolean, gate: ConfirmGate): void {
  const judgments = (json?.confirm_judgments ?? {}) as Record<string, number>;
  const left = (json?.confirm_left ?? {}) as Record<string, number | string>;
  const token = String(json?.confirm_token ?? '');
  const tokenHours = Number(json?.confirm_token_hours ?? 1);

  if (asJson) {
    printJson({
      confirm_token: token,
      confirm_message: String(json?.confirm_message ?? ''),
      confirm_judgments: judgments,
      confirm_token_hours: tokenHours,
      ...(json?.confirm_sending === undefined ? {} : { confirm_sending: json.confirm_sending }),
      ...(json?.confirm_left === undefined ? {} : { confirm_left: left }),
      ...(json?.confirm_model === undefined ? {} : { confirm_model: json.confirm_model }),
      ...(json?.confirm_named === undefined ? {} : { confirm_named: json.confirm_named }),
      ...(json?.confirm_skipped === undefined ? {} : { confirm_skipped: json.confirm_skipped }),
      ...(json?.confirm_cadence_hours === undefined
        ? {}
        : { confirm_cadence_hours: json.confirm_cadence_hours }),
      ...(json?.confirm_fired_by === undefined ? {} : { confirm_fired_by: json.confirm_fired_by }),
    });
    return;
  }

  const lines: string[] = [];
  const kinds = Object.keys(judgments);

  if (gate.kind === 'judge' || gate.kind === 'routine-run') {
    // A judging run holds exactly one kind: a call is either a full judgement
    // or a quick screen, never both at once.
    const kind = kinds[0] ?? 'full';
    const count = judgments[kind] ?? 0;
    const remaining = left[kind];
    const sending = Number(json?.confirm_sending ?? count);
    const named = Number(json?.confirm_named ?? sending);
    const skipped = Number(json?.confirm_skipped ?? 0);
    const model = typeof json?.confirm_model === 'string' ? json.confirm_model : undefined;
    const skippedClause =
      skipped > 0 ? `; ${withCommas(skipped)} of ${withCommas(named)} already have a saved judgment and would be skipped` : '';

    // Point 1: what would really be sent, and to which model.
    if (gate.kind === 'judge') {
      const verb = kind === 'quick' ? 'would quickly screen' : 'would judge';
      const modelClause = kind === 'full' && model ? ` with ${model}` : '';
      lines.push(
        `${verb} ${withCommas(sending)} of ${withCommas(named)} named postings${modelClause}${skippedClause}`,
      );
    } else {
      const verb = kind === 'quick' ? 'would quickly screen' : 'would judge';
      const modelClause = kind === 'full' && model ? ` with ${model}` : '';
      const stepWord = kind === 'quick' ? 'quick-judge step' : 'judge step';
      lines.push(
        `${verb} ${withCommas(sending)} of ${withCommas(named)} postings${modelClause} at the ` +
          `routine's ${stepWord}${skippedClause}`,
      );
    }

    // Point 2: what confirming would spend, and what would still be left.
    const remainingAmount = leftAmount(remaining);
    lines.push(
      `confirming would use ${judgmentPhrase(count, kind)}, leaving room for ` +
        `${remainingAmount.text} more ${kind} judgment${remainingAmount.plural ? 's' : ''} this month`,
    );

    // Point 3: what a judgment gives that reading the material yourself does
    // not. Left out entirely for a quick screen, which never sends job
    // description text and so gives nothing beyond the free path itself.
    if (kind === 'full') {
      lines.push(
        "a judgment is Pinloop's own reasoning pass against everything in this account's " +
          'profile, saved as a graded verdict (no, weak, fair, or strong) for reuse later at ' +
          'no cost — reading the raw text yourself is not that reasoning pass',
      );
    }

    // Point 4: the free path open to the coding agent itself.
    const freeSuffix = gate.kind === 'routine-run' ? ", instead of the routine's judge step" : '';
    lines.push(
      'you can also read this yourself for free: `pinloop fetch` on these postings and ' +
        '`pinloop profile get` on the profile, then reason about fit on your own' + freeSuffix,
    );

    // Point 5: one plain sentence for the coding agent to put to the person.
    // A quick screen's own verdict IS reused for free, but only by a later
    // quick screen: a later full `pinloop judge` on the same posting ignores
    // it and judges the posting again, spending again (checked in
    // `src/core/judge.ts`, `splitByStoredVerdict`: `if (row && (quick ||
    // String(row.judged_by) !== QUICK_JUDGED_BY)) reuse.push(row)` reuses
    // every stored row, quick or full, on a quick run, but on a full run
    // skips any row labelled as quick-judged). So the free-reuse claim is
    // narrower for a quick screen, never absent.
    const reuseClause =
      kind === 'quick'
        ? ', saved for free reuse the next time this posting comes up in another quick ' +
          'screen, though a later full judgment does not read that back and judges the ' +
          'posting again'
        : ', saved for free reuse anytime this posting comes up again';
    lines.push(
      'if you are a coding agent: ask the person, in one plain sentence, whether they want ' +
        'Pinloop to run a real judgment — using its own already-built instructions for reading ' +
        `a profile against a posting well${reuseClause} — which would spend ` +
        `${judgmentPhrase(count, kind)} and leave ` +
        `${remainingAmount.text} for the rest of the month, or have you read the ` +
        'material yourself and give them a quick, unsaved opinion for free instead (you can ' +
        "still save that opinion afterward with `pinloop judgment put` if it's worth keeping) " +
        '— then wait for their answer before running this again with --confirm',
    );
  } else {
    // The three automation commands: nobody knows yet how many postings a
    // future firing will match, so this reports the most one firing could
    // possibly spend instead (specs/feature-judge-confirmation.md).
    const cadenceHours = Number(json?.confirm_cadence_hours ?? 1);
    const namingLabel = stepLabelNaming(kinds);
    const leftOutLabel = stepLabelLeftOut(kinds);
    const ceiling = ceilingPhrase(judgments);

    if (gate.kind === 'schedule-put') {
      lines.push(`stored nothing. the routine '${gate.routineName}' ends in a ${namingLabel}`);
      lines.push(`storing this schedule would let ${ceiling} run per firing, as often as ${rateFactual(cadenceHours)}`);
      lines.push(
        `the same routine with its ${leftOutLabel} left out still runs for free, searching ` +
          `for new postings on the same ${cadenceHours}-hour schedule — you or the person can ` +
          'read what it finds and judge it by hand instead of paying for automatic judging ' +
          "every time (any of those can still be saved with `pinloop judgment put` if worth " +
          'keeping)',
      );
      lines.push(
        'if you are a coding agent: ask the person, in one plain sentence, whether they want ' +
          'to approve automatic judging — using Pinloop\'s own already-built instructions for ' +
          'reading a profile against a posting well, with every verdict saved for free reuse ' +
          `afterward — which could run ${ceiling} per firing, as often as ` +
          `${rateColloquial(cadenceHours)}, or keep this schedule free and read and judge new ` +
          'postings by hand instead — then wait for their answer before running this again ' +
          'with --confirm',
      );
    } else if (gate.kind === 'watch-put') {
      lines.push(`stored nothing. the routine '${gate.routineName}' ends in a ${namingLabel}`);
      lines.push(`storing this watch would let ${ceiling} run per firing, as often as ${rateFactual(cadenceHours)}`);
      lines.push(
        `the same routine with its ${leftOutLabel} left out still checks for new postings ` +
          'every hour for free — you or the person can read what it finds and judge it by ' +
          'hand instead of paying for automatic judging every time (any of those can still be ' +
          'saved with `pinloop judgment put` if worth keeping)',
      );
      lines.push(
        'if you are a coding agent: ask the person, in one plain sentence, whether they want ' +
          'to approve automatic judging — using Pinloop\'s own already-built instructions for ' +
          'reading a profile against a posting well, with every verdict saved for free reuse ' +
          `afterward — which could run ${ceiling} per firing, as often as ` +
          `${rateColloquial(cadenceHours)}, or keep this watch free and read and judge new ` +
          'postings by hand instead — then wait for their answer before running this again ' +
          'with --confirm',
      );
    } else {
      const firedBy = json?.confirm_fired_by as { kind: 'schedule' | 'watch'; name: string } | undefined;
      const firedByKind = firedBy?.kind ?? 'schedule';
      const firedByName = firedBy?.name ?? '';
      lines.push(
        `stored nothing. the ${firedByKind} '${firedByName}' already runs this routine, and ` +
          `the routine being stored still ends in a ${namingLabel}`,
      );
      lines.push(
        `storing this routine would let ${ceiling} run per firing of '${firedByName}', as ` +
          `often as ${rateFactual(cadenceHours)}`,
      );
      lines.push(
        `the same routine with its ${leftOutLabel} left out would still run for free on that ` +
          `same ${firedByKind} — you or the person can read what it finds and judge it by hand ` +
          'instead of paying for automatic judging every time (any of those can still be ' +
          'saved with `pinloop judgment put` if worth keeping)',
      );
      lines.push(
        'if you are a coding agent: ask the person, in one plain sentence, whether they want ' +
          'to keep automatic judging on this routine — using Pinloop\'s own already-built ' +
          'instructions for reading a profile against a posting well, with every verdict saved ' +
          `for free reuse afterward — which could run ${ceiling} per firing, as often as ` +
          `${rateColloquial(cadenceHours)}, or remove the judge step and read and judge new ` +
          'postings by hand instead — then wait for their answer before running this again ' +
          'with --confirm',
      );
    }
  }

  // The sentence saying nothing was judged and nothing was stored is not
  // printed here: `stored nothing.` (the automation gates) or the fact that
  // no verdict went to the model (points 1–2 above) already say so, and the
  // "if you are a coding agent" line already tells the agent to put the
  // choice to the person and wait for an answer before running this again
  // with --confirm. Printing the server's CONFIRM_REFUSAL sentence as well
  // would say the same thing a third time. CONFIRM_REFUSAL itself is
  // untouched: it is still the one sentence every one of the five commands
  // answers with when the token a second call carries is missing, invented,
  // made for something else, or stale (src/server/confirm.ts), and it still
  // rides along unprinted in the JSON form of this same answer.
  lines.push(`next command: ${nextCommandLine(gate, token)}`);
  lines.push(`(token expires in ${hoursPhrase(tokenHours)}, matches only ${tokenScope(gate)})`);
  process.stderr.write(`${lines.join('\n')}\n`);
}

/**
 * Reads everything given to this command on its standard input, to the end of
 * the input, whether that input is another command's output through a pipe or a
 * file the shell redirected in.
 *
 * Neither branch below goes through `process.stdin`, and that is deliberate.
 * The tests run this program through vite-node, and vite-node starts a Vite
 * development server in the same process; that server installs its own handler
 * on `process.stdin` which calls process.exit as soon as standard input closes.
 * So a command that read `process.stdin` to the end would be killed the instant
 * the input ran out, throwing away whatever it still had to do — measured, a
 * command that reads piped input and then makes one HTTP call exits quietly
 * with nothing printed and a success code. Reading the descriptor through a
 * handle of our own leaves that stream untouched, and a person running the
 * installed command sees exactly what the tests see.
 *
 * Which handle depends on what standard input actually is. A pipe has to be
 * read as it arrives, because the command upstream may not have written a byte
 * yet and a plain read of a pipe that is not ready fails outright. A file the
 * shell redirected in is already there and is read in one go, which is also the
 * only thing that works for a file: a socket cannot be opened on one.
 */
async function readStandardInputBytes(): Promise<Buffer> {
  const input = fstatSync(0);
  if (!input.isFIFO() && !input.isSocket()) return readFileSync(0);

  const pipe = new Socket({ fd: 0, readable: true, writable: false });
  const pieces: Buffer[] = [];
  for await (const piece of pipe) pieces.push(Buffer.from(piece));
  return Buffer.concat(pieces);
}

/** The same input, as characters, for every verb that reads text. */
async function readStandardInput(): Promise<string> {
  return (await readStandardInputBytes()).toString('utf8');
}

/**
 * True when a person is sitting at a terminal and nothing was piped in. The
 * question goes to the descriptor rather than to `process.stdin`, for the
 * reason written above: this program never touches that stream.
 */
function nothingWasPipedIn(): boolean {
  return isatty(0);
}

/** An example of the pipeline the stdin-reading verbs are built for. */
const EXAMPLE_PIPELINE =
  'pinloop list --employment INTERN --country "United States" --all --json' +
  ' | pinloop filter --posted-after 2026-06-01 --json';

/**
 * The rows piped into this command. The shape accepted is deliberately wide:
 * the object every pinloop verb prints (a `rows` array), the object the server
 * itself would print (a `results` array), or a bare array of rows.
 */
async function rowsPipedIn(verb: string): Promise<Record<string, unknown>[]> {
  if (nothingWasPipedIn()) {
    throw new Failure(
      `${verb} reads postings from standard input: it expects the JSON another ` +
        `pinloop command printed to be piped into it, and there is a terminal on ` +
        `standard input instead, so nothing was piped in.\n\n` +
        `For example:\n  ${EXAMPLE_PIPELINE}\n`,
    );
  }
  const text = await readStandardInput();
  if (text.trim() === '') {
    throw new Failure(
      `${verb} was piped nothing at all. It expects the JSON another pinloop ` +
        `command printed, for example:\n  ${EXAMPLE_PIPELINE}\n`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Failure(
      `${verb} could not read what was piped into it as JSON ` +
        `(${error instanceof Error ? error.message : String(error)}). ` +
        `Give the command before the pipe its \`--json\` option, for example:\n  ${EXAMPLE_PIPELINE}\n`,
    );
  }
  const held = parsed as { rows?: unknown; results?: unknown } | null;
  const rows = Array.isArray(parsed) ? parsed : (held?.rows ?? held?.results);
  if (!Array.isArray(rows)) {
    throw new Failure(
      `${verb} was piped JSON that carries no rows array. ` +
        `Give the command before the pipe its \`--json\` option, for example:\n  ${EXAMPLE_PIPELINE}\n`,
    );
  }
  return rows as Record<string, unknown>[];
}

/**
 * The posting ids of the rows piped into this command. Every verb that takes a
 * set of postings from a pipe — `--within -`, `pinloop tab add`, `pinloop
 * fetch` — reads its ids through this one function, so all of them accept the
 * same input shapes and refuse an empty or unreadable pipe in the same words.
 */
async function idsPipedIn(verb: string): Promise<string[]> {
  const rows = await rowsPipedIn(verb);
  return rows.map((row) => String(row['id'] ?? '')).filter((id) => id !== '');
}

/**
 * The posting ids a command is to work on: the ids typed on the command line,
 * or, when none were typed, the ids of the rows piped in.
 *
 * Typed ids win, and nothing is merged. A command given both is a command whose
 * author meant one of the two, and quietly working on the union of them would
 * be the surprising answer. `pinloop tab add` has behaved this way since it
 * shipped and `pinloop fetch` now matches it.
 */
async function typedIdsOrPipedIn(verb: string, given: string[]): Promise<string[]> {
  const typed = given.flatMap((one) => one.split(',')).filter((one) => one.trim() !== '');
  if (typed.length > 0) return typed;
  return idsPipedIn(verb);
}

/**
 * What `--within` means as a parameter sent to the server. A single dash means
 * "the postings piped into this command"; anything else is already a list of
 * ids separated by commas and is passed through as it stands.
 */
async function withinSet(value: string, verb: string): Promise<string> {
  if (value.trim() !== '-') return value;
  return (await idsPipedIn(`${verb} --within -`)).join(',');
}

/**
 * The sentence every option that takes a set of posting ids carries, saying why
 * a large set cannot be typed out.
 *
 * Linux refuses to start a program when any one of its arguments is longer than
 * about 128 kilobytes. A posting id written out is 37 characters, so a list of
 * them typed as one argument stops working somewhere above three thousand ids,
 * a long way below the ten thousand a request may name. Reading the ids from a
 * pipe instead has no such limit, because a pipe is a stream rather than an
 * argument, which is why the piped form is the one to reach for on any set worth
 * calling large.
 */
const LARGE_SETS_MUST_BE_PIPED =
  'a set of more than about 3,000 ids cannot be typed out, because a shell ' +
  'cannot pass that much text as one argument, so pipe large sets in as --json rows instead';

/** The same sentence for an option whose piped form is written as a single dash. */
const WITHIN_HELP =
  'only these postings: their ids separated by commas, or - to read them from the JSON piped in; ' +
  `${LARGE_SETS_MUST_BE_PIPED} (the - form)`;

/** The postings in a server answer, under whichever of the two names it used. */
function rowsOf(json: any): Record<string, unknown>[] {
  const rows = json?.rows ?? json?.results;
  return Array.isArray(rows) ? rows : [];
}

/** The handle for the next page in a server answer, under either agreed name. */
function cursorOf(json: any): unknown {
  return json?.cursor ?? json?.next_cursor ?? null;
}

/**
 * One posting an answer named, written out the way a person recognises it.
 *
 * The entry is whatever the server sent — a posting that could not be judged, one
 * a keep word held back, one whose verdict was deleted — and every one of those
 * now carries the job title and the employer beside the id. A server old enough
 * to send the posting id on its own, as a bare string rather than as an object,
 * is printed as that string, which is exactly what these messages printed before
 * the title and the employer were added to them.
 */
function named(one: unknown): string {
  if (one === null || typeof one !== 'object') return String(one);
  const held = one as Record<string, unknown>;
  return postingNamed(
    held['title'] as string | null | undefined,
    held['company'] as string | null | undefined,
    String(held['id']),
  );
}

/**
 * The two coverage numbers out of a server answer, when it sent them.
 *
 * Every answer that can leave something out carries `coverage`: how many of the
 * things asked for came through, and how many there were in all. An answer with
 * no coverage in it at all reads back as undefined, and the line that would have
 * been printed from it is not printed. That happens with a server older than
 * this rule, and it is better than printing a fraction made up here.
 */
function coverageIn(value: unknown): Coverage | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const held = value as Record<string, unknown>;
  const covered = Number(held['covered']);
  const total = Number(held['total']);
  if (!Number.isFinite(covered) || !Number.isFinite(total)) return undefined;
  return coverageOf(covered, total);
}

/** The fraction a person reads, straight off an answer that carried coverage. */
function fractionIn(value: unknown): string | undefined {
  const held = coverageIn(value);
  return held === undefined ? undefined : fractionOf(held.covered, held.total);
}

/**
 * Writes one coverage line to standard error, and only when something really was
 * left out. `covered` of the `total` came through; the lines naming what
 * happened to the rest are written by the caller, after this one, because
 * Andrew's rule of 2026-08-15 is that the fraction leads and the detail follows.
 */
function sayCoverage(value: unknown, sentence: (fraction: string) => string): void {
  const held = coverageIn(value);
  if (held === undefined || held.covered >= held.total) return;
  process.stderr.write(`${sentence(fractionOf(held.covered, held.total))}\n`);
}

/**
 * The server's report of what a search actually looked for, when it sent one.
 * An answer with no report at all — an older server, or a route that does not
 * produce one — reads back as undefined, and nothing is printed for it.
 */
function interpretationOf(json: any): Record<string, unknown> | undefined {
  const report = json?.interpretation;
  return report && typeof report === 'object' && !Array.isArray(report)
    ? (report as Record<string, unknown>)
    : undefined;
}

/**
 * Which parts of a posting the search read, but only when the person narrowed
 * them. Searching the title and the description is what every search does
 * without being asked, so saying so on every line would be noise nobody reads;
 * a search held to the title alone is a restriction the person chose and a
 * reason a posting they expected could be missing, so that one is said out loud.
 */
function fieldsClause(value: unknown): string | undefined {
  const fields = Array.isArray(value) ? value.map((one) => String(one)) : [];
  if (fields.length === 0 || fields.includes('description')) return undefined;
  if (fields.length === 1 && fields[0] === 'title') return 'titles only';
  return `only the ${fields.join(' and ')}`;
}

/**
 * The employer ids a report says a search was held to. The shape the server
 * sends is read generously — one id as text, several separated by commas, a list
 * of ids, or a list of employers each carrying an id — because the sentence is
 * only worth printing if it survives the server wording the report differently
 * from what this program expected.
 */
function companyIdsIn(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((one) => one.trim())
      .filter((one) => one !== '');
  }
  if (Array.isArray(value)) {
    return value.flatMap((one) =>
      one !== null && typeof one === 'object'
        ? companyIdsIn((one as Record<string, unknown>)['id'])
        : companyIdsIn(one),
    );
  }
  if (value !== null && typeof value === 'object') {
    const held = value as Record<string, unknown>;
    return companyIdsIn(held['ids'] ?? held['id']);
  }
  return [];
}

/**
 * The employers a search was held to, said only when it was held to any. One
 * employer is named by its id, because that is the id the person handed over and
 * the one they would check; several are counted, because a line carrying twenty
 * ids is unreadable and the ids are already in the person's own command.
 *
 * A report that claims a restriction in a shape this program cannot read is
 * still reported, without the ids. A restriction the person cannot see is worse
 * than one described vaguely.
 */
function companyClause(value: unknown): string | undefined {
  if (value === null || value === undefined || value === false || value === '') return undefined;
  const ids = companyIdsIn(value);
  if (ids.length === 1) return `within company ${ids[0]}`;
  if (ids.length > 1) return `within ${ids.length} companies`;
  return 'within the companies the request named';
}

/**
 * The server's report turned into one sentence a person reads.
 *
 * It says which of the two match modes the search used — every typed word, or
 * any one of them — and then, for each word the person typed, the spellings the
 * search really looked for, so "intern" openly reporting that it also looked
 * for "interns", "internship" and "internships" is not a surprise.
 *
 * Two more things are said only when they apply: that the search was held to
 * posting titles, and that it was held to certain employers. Both are
 * restrictions the person chose, and both are reasons a posting they expected
 * could be absent, so a person hunting a missing posting can see them. Neither
 * is printed on a search that did not use it, because a line that says the same
 * thing every time stops being read.
 *
 * The ceiling is mentioned only when it really cut something off. A best-match
 * answer carries how many postings matched in all and how many of them the
 * ceiling lets the search hand back, so the two numbers say plainly whether
 * anything was left out, and the line that says so is printed above this
 * sentence rather than inside it. A server old enough to send no such numbers
 * falls back to the older guess: a page exactly as long as the ceiling is a page
 * the ceiling probably ended.
 */
function interpretationSentence(report: Record<string, unknown>, rowCount: number): string {
  const words = Array.isArray(report['words']) ? (report['words'] as any[]) : [];
  const within = companyClause(report['company']);

  let said: string;
  if (words.length === 0) {
    // With no words nothing was matched against any field, so which fields were
    // read says nothing here; which employers were allowed still does.
    said =
      `searched for no words${within ? ` ${within}` : ''}, ` +
      'so every posting the other conditions allow came back';
  } else {
    const perWord = words.map((one) => {
      const given = String(one?.given ?? '');
      const forms = (Array.isArray(one?.forms) ? one.forms : []).map((form: unknown) =>
        String(form),
      );
      return forms.length > 0 ? `${given} (${forms.join(', ')})` : given;
    });
    const howMany =
      report['mode'] === 'all' ? 'every one of these words' : 'any one of these words';
    const narrowing = [fieldsClause(report['fields']), within].filter(
      (clause): clause is string => clause !== undefined,
    );
    said =
      `searched ${[...narrowing, `for postings carrying ${howMany}`].join(' ')}: ` +
      perWord.join('; ');
  }

  if (report['ceiling_applies'] === false) {
    // A search with no words, and a search asked for newest first, are both in
    // date order with nothing to rank, so no ceiling applies to either of them
    // and both hand back every posting the conditions allow, page after page.
    // Saying so is what keeps a run that is fetching the whole corpus from
    // looking like a ceiling that failed to hold.
    return `${said}; this search has no ceiling, so it hands back every posting the conditions allow, page after page`;
  }

  const ceiling = Number(report['ceiling']);
  const counted = coverageIn(report['coverage']);
  if (counted === undefined && Number.isFinite(ceiling) && ceiling > 0 && rowCount >= ceiling) {
    said += `; stopped at the best ${ceiling} postings`;
  }
  return said;
}

/**
 * The line printed above the sentence above, saying how much of what matched
 * this search really hands back. It is printed only when the ceiling left
 * something out, because a search that hands back everything it matched has
 * nothing to report.
 */
function saySearchCoverage(report: Record<string, unknown>): void {
  const ceiling = Number(report['ceiling']);
  sayCoverage(
    report['coverage'],
    (fraction) =>
      `${fraction} postings that matched came back. ` +
      `This search hands back the best ${ceiling} and no more, raise --top to see more.`,
  );
}

/**
 * Everything a meaning search did, written to standard error, one plain line at
 * a time.
 *
 * These lines are for the person and never for the next command in a pipe, so
 * they go to standard error the same way the word search's report does. What
 * they cover is criterion 7 of this feature, minus the two things Andrew's
 * printed-message rule 1 forbids printing anywhere (money, and token counts):
 * which mode ran, the model and the vendor it ran on, where the search text
 * came from, which profile documents went and which stayed, how deep the
 * search was told to look, and how much of the searched set could be ranked
 * at all.
 */
function saySemanticReport(report: Record<string, unknown>): void {
  const say = (line: string): void => {
    process.stderr.write(`${line}\n`);
  };
  const query = (report['query'] ?? {}) as Record<string, unknown>;

  say('mode: semantic');
  say(`model: ${String(report['model'] ?? '')} via ${String(report['vendor'] ?? '')}`);

  if (query['source'] === 'profile') {
    const documents = Array.isArray(query['documents'])
      ? (query['documents'] as Record<string, unknown>[])
      : [];
    const named = documents
      .map((one) => `${String(one['name'])} (updated ${String(one['updated_at'])})`)
      .join(', ');
    say(`query: profile documents ${named}`);

    const sent = documents.map((one) => String(one['name']));
    const notSent = Array.isArray(query['not_sent']) ? query['not_sent'].map(String) : [];
    say(
      `searched with ${sent.join(', ')}` +
        (notSent.length === 0 ? '' : `; did not send ${notSent.join(', ')}`),
    );

    const absent = Array.isArray(query['absent']) ? query['absent'].map(String) : [];
    if (absent.length > 0) say(`not stored in this profile: ${absent.join(', ')}`);

    const notes = Array.isArray(query['notes']) ? query['notes'].map(String) : [];
    for (const note of notes) say(note);

    if (typeof query['cut_after'] === 'string') {
      say(
        `text cut after ${query['cut_after']}: the whole of it was longer than the model reads ` +
          'in one go, so everything past that document was not sent',
      );
    }
  } else {
    say('query: typed text');
  }

  if (typeof report['top'] === 'number') say(`closest ${report['top']}`);
  if (typeof report['min_match'] === 'number') say(`at or above ${report['min_match']}`);

  const filters = (report['filters'] ?? {}) as Record<string, unknown>;
  const named = Object.entries(filters).map(([name, value]) => {
    if (name === 'within') return `within a named set of ${String(value)} postings`;
    // The restriction that leaves out this account's judged postings is written
    // out in the same words a word search writes it in, rather than as the bare
    // name of the flag, because "unjudged true" says nothing to a person.
    if (name === 'unjudged') return 'leaving out postings you already judged';
    return `${name} ${String(value)}`;
  });
  if (named.length > 0) say(`filters: ${named.join(', ')}`);

  // The coverage fraction is printed on every meaning search rather than only
  // when something was left out, because it is the one line that says how much
  // of the searched set could be ranked at all, and a person reading a short
  // answer deserves to know whether it is short because the corpus is or
  // because part of it has no vector yet.
  // A preview searched nothing, so a fraction of nothing ("0/0") would only
  // read as something broken; the preview says what it would send instead.
  const covered = report['preview_text'] === undefined ? coverageIn(report['coverage']) : undefined;
  if (covered !== undefined) {
    say(
      `${fractionOf(covered.covered, covered.total)} postings in the searched set had a ` +
        'vector and were ranked',
    );
  }

  if (typeof report['preview_text'] === 'string') {
    say('this is what would be sent, and nothing was sent:');
    say(report['preview_text']);
  }
}

// ---------------------------------------------------------------------------
// Following every page
// ---------------------------------------------------------------------------

/**
 * `--all` means "do not stop at one page: keep asking for the next one until
 * there are no more, and print the whole thing once".
 *
 * Without it, a command that pages hands back one page and the handle for the
 * next one, and following that handle is the caller's job. That is the right
 * default for reading at a terminal and the wrong one for a pipe, where the
 * command after the pipe wants everything that matched, not the first hundred
 * of it. With `--all` the program asks for pages of a hundred — the largest the
 * server will hand over at once — and follows the handle it gets back until the
 * server stops giving one, then prints one result: with `--json`, the usual
 * object holding every row from every page in the order they arrived and a
 * `cursor` of null, because there is nothing left to follow; without `--json`,
 * the same readable output the command always prints, for every row.
 *
 * One run may fetch at most five thousand postings. The first request of a run
 * says that it is the first request of a run, and the server counts how many
 * postings the conditions match before it fetches anything: a run over that
 * ceiling is refused in one sentence naming how many matched, rather than being
 * served the first of a hundred and eighty-six pages
 * (specs/feature-pull-ceiling.md). Five thousand postings is fifty pages, and an
 * account may make a hundred and twenty requests a minute, so a run that is
 * allowed at all finishes without ever being told to wait. If a page is refused
 * anyway — the allowance spent on something else, or the server busy — the
 * program waits and asks for the same page again rather than failing or skipping
 * it. Every wait is said out loud on standard error, so a run that is crawling
 * says so rather than looking hung.
 *
 * Everything printed about the progress of the fetching goes to standard error.
 * Standard output carries the result and nothing else, because a pipe reads
 * standard output and would choke on a progress line.
 */

/** How many rows one page asks for while every page is being followed. */
const PAGE_WHILE_FOLLOWING = 100;

/**
 * How long to wait before asking for the same page again after the server said
 * the account is over its allowance and did not name a time itself. The
 * allowance window is a minute long, so a few seconds is enough to make
 * progress without hammering the server.
 */
const WAIT_AFTER_OVER_ALLOWANCE_MS = 5_000;

/**
 * How long to wait before asking for the same page again after the server said
 * it was busy and did not name a time itself.
 *
 * The server says busy when it could not get a free database connection within
 * a few seconds, which is a passing state rather than a broken one, so a few
 * seconds is long enough for the connections to come free again.
 */
const WAIT_AFTER_BUSY_MS = 5_000;

/** A progress line is written after every this many pages. */
const PROGRESS_EVERY_PAGES = 10;

/** What a person is told when they ask for every page and a page size at once. */
const ALL_AND_LIMIT_CONTRADICT =
  '`--all` and `--limit` contradict each other: `--all` fetches every page there is, ' +
  'and `--limit` asks for a set number of rows. Use one or the other.';

/** Refuses the two flags that cannot both be meant. */
function refuseAllWithLimit(options: Record<string, unknown>): void {
  const limit = options['limit'];
  if (options['all'] === true && typeof limit === 'string' && limit !== '') {
    throw new Failure(ALL_AND_LIMIT_CONTRADICT);
  }
}

/**
 * What the waiting line says a run following every page has got to. The same
 * words are put back on that line when a page is refused, so that the pause is
 * explained on the row underneath without the count of pages disappearing.
 */
function pagesSoFar(pages: number, rows: number): string {
  return `page ${pages}, ${rows} postings so far`;
}

/**
 * What the row underneath the waiting line says the instant the wait is over
 * and the request for the same page has been sent again.
 *
 * It says the request has gone out, not that it worked: whether it worked is
 * not known yet. When it does work the row comes off the screen altogether and
 * the page count above it moves on.
 */
const ASKING_AGAIN_NOW = 'asking for the same page again now';

/**
 * The `(attempt 3)` written after the explanation of a pause, or nothing at all
 * the first time a page is refused.
 *
 * `asksSoFar` is how many times the page has been asked for already, so the
 * attempt about to be made is one more than that. The first refusal of a page
 * is the ordinary case and the sentence stays as it is. From the second refusal
 * of that same page onward the number is written down, so a person can tell a
 * run that keeps being refused and keeps trying from a run that is stuck.
 */
function attemptSaying(asksSoFar: number): string {
  const next = asksSoFar + 1;
  return next <= 2 ? '' : ` (attempt ${next})`;
}

/** Waits, without holding anything else up. */
function waitFor(milliseconds: number): Promise<void> {
  return new Promise((done) => setTimeout(done, milliseconds));
}

/** Everything the pages of one answer added up to. */
type EveryPage = {
  /** Every row from every page, in the order the pages arrived. */
  rows: Record<string, unknown>[];
  /** How many pages were fetched. */
  pages: number;
  /** The whole body of every page, for the commands that read more than rows. */
  bodies: any[];
};

/**
 * Asks for page after page until the server hands back no handle for a next
 * one, and returns everything they held.
 *
 * `askFor` is given the handle for the page to fetch — nothing for the first
 * one — and hands back what the server said. Neither an over-allowance refusal
 * nor a "Pinloop is busy" answer is an error here: the same page is asked for
 * again after a wait, so no page is ever skipped and none is dropped without a
 * word.
 */
async function followEveryPage(
  verb: string,
  askFor: (cursor: string | undefined) => Promise<ServerAnswer>,
  startingCursor: string | undefined,
): Promise<EveryPage> {
  // A person watching a screen gets one line that says which page the run has
  // reached, redrawn in place. A coding agent gets one plain line before the
  // waiting starts, because a line written into a log file can never be erased
  // and a page count that scrolls past is noise. Every other command says
  // nothing at all while it waits, which is what makes this line worth writing.
  if (screen.mode === 'program') {
    process.stderr.write('fetching every page, this can take a minute\n');
  }
  screen.wait(waitingLabel);
  let every: EveryPage;
  try {
    every = await followPages(verb, askFor, startingCursor);
  } finally {
    screen.stop();
  }
  // Said after the waiting line has come off the screen, so it is not written
  // over the top of it.
  process.stderr.write(
    `${verb} --all: fetched ${every.pages} page${every.pages === 1 ? '' : 's'} ` +
      `holding ${every.rows.length} row${every.rows.length === 1 ? '' : 's'} in all\n`,
  );
  return every;
}

/** The page-following itself, once the waiting line is up. */
async function followPages(
  verb: string,
  askFor: (cursor: string | undefined) => Promise<ServerAnswer>,
  startingCursor: string | undefined,
): Promise<EveryPage> {
  const rows: Record<string, unknown>[] = [];
  const bodies: any[] = [];
  let cursor = startingCursor;
  let pages = 0;
  /**
   * How many times the page being fetched right now has been asked for. It goes
   * back to nothing as soon as a page arrives and the run moves on to the next
   * one, so the number on the screen counts the attempts at one page rather
   * than the attempts made by the whole run.
   */
  let asksForThisPage = 0;

  for (;;) {
    let answer: ServerAnswer;
    try {
      asksForThisPage += 1;
      answer = await askFor(cursor);
    } catch (error) {
      // Two answers mean "this page was not served, wait and ask for it again"
      // rather than "stop": the account is over its allowance (429), and the
      // server could not get a free database connection in time and said it was
      // busy (503 with a Retry-After header). Without the second one, a command
      // that had already fetched ninety pages would stop on the busiest second
      // of the day and print an error instead of the set it was most of the way
      // through building.
      if (!(error instanceof Failure) || (error.status !== 429 && error.status !== 503)) {
        throw error;
      }
      const overAllowance = error.status === 429;
      const waitMs =
        error.retryAfterSeconds !== undefined
          ? error.retryAfterSeconds * 1000
          : overAllowance
            ? WAIT_AFTER_OVER_ALLOWANCE_MS
            : WAIT_AFTER_BUSY_MS;
      const because = overAllowance ? 'this account is over its allowance' : 'it is busy';
      const seconds = Math.round(waitMs / 1000);
      const held =
        `the server says ${because}; ` +
        `waiting ${seconds}s and asking for the same page again ` +
        `(${rows.length} rows so far)`;
      // A person watching keeps the page count where it already is and reads
      // the reason for the pause on a row underneath it. The whole sentence
      // used to go on the waiting line itself, where the line was far too
      // narrow to hold it, so it was cut off part way through a word, and where
      // it took the page count off the screen, so the one thing showing that
      // the run was still moving disappeared (Andrew, 2026-08-19). A coding
      // agent gets the whole sentence as a line of its own, because no page is
      // ever skipped quietly and a run that is crawling has to say so.
      if (screen.mode === 'person') {
        // Before the first page has arrived there is no page count to keep, and
        // the waiting line shows its clock, which is left alone.
        if (pages > 0) screen.update(pagesSoFar(pages, rows.length));
        // The seconds on this row count down as the wait runs out, so a person
        // can tell a command about to ask again from one that has stopped. The
        // row said "in 5s", five seconds went by, and it still said "in 5s"
        // until 2026-08-20, when Andrew watched it do exactly that.
        const attempt = attemptSaying(asksForThisPage);
        // Which of the two refusals this pause is for. A page refused because
        // the account has asked for too many in one minute and a page refused
        // because the server could not get a free database connection are two
        // different things to be waiting on, so the row says which one it is
        // rather than blaming the allowance for both.
        const reason = overAllowance ? 'over the per-minute limit' : 'the server is busy';
        screen.countdown(
          waitMs,
          (left) => `${reason}, asking for the same page again in ${left}s${attempt}`,
        );
      } else process.stderr.write(`${verb} --all: ${held}\n`);
      await waitFor(waitMs);
      // The wait is over and the request for the same page goes out again this
      // instant, so the row says so. Without this the row would sit at "in 1s"
      // for as long as the server took to answer, which is the same standing
      // still that the counting down is there to end.
      screen.note(ASKING_AGAIN_NOW);
      continue;
    }

    pages += 1;
    // This page arrived, so the count of attempts starts again at the next one.
    asksForThisPage = 0;
    bodies.push(answer.json);
    rows.push(...rowsOf(answer.json));

    // What the run has got to, put on the waiting line in place of its clock.
    screen.update(pagesSoFar(pages, rows.length));

    // The page arrived, so the row underneath explaining the pause comes off.
    screen.note(undefined);

    // A person watching already has the page count on the waiting line, redrawn
    // in place. This line is for the log a coding agent keeps.
    if (screen.mode === 'program' && pages % PROGRESS_EVERY_PAGES === 0) {
      process.stderr.write(`${verb} --all: ${rows.length} rows so far, after ${pages} pages\n`);
    }

    const next = cursorOf(answer.json);
    if (typeof next !== 'string' || next === '') break;
    cursor = next;
  }

  return { rows, pages, bodies };
}

/**
 * Follows every page of a verb whose parameters travel in the address, which is
 * all of them except search, list and fetch. The page size is set here rather
 * than by the caller, because following every page means asking for the largest
 * page the server will hand over.
 */
function everyPageOf(
  pass: SavedPass,
  verb: string,
  path: string,
  query: URLSearchParams,
  startingCursor: string | undefined,
): Promise<EveryPage> {
  return followEveryPage(
    verb,
    (from) => {
      const asking = new URLSearchParams(query);
      asking.set('limit', String(PAGE_WHILE_FOLLOWING));
      if (from !== undefined) asking.set('cursor', from);
      else asking.delete('cursor');
      return callAsAccount(pass, `${path}?${asking.toString()}`);
    },
    startingCursor,
  );
}

/** Copies the flags a person typed into the query parameters the server reads. */
function queryFrom(
  options: Record<string, unknown>,
  pairs: ReadonlyArray<readonly [string, string]>,
): URLSearchParams {
  const query = new URLSearchParams();
  for (const [flag, parameter] of pairs) {
    const value = options[flag];
    if (typeof value === 'string' && value !== '') query.set(parameter, value);
  }
  return query;
}

/**
 * The same parameters, as the JSON object search, list and fetch are sent as.
 *
 * Those three commands are sent to the server as a POST with the parameters in
 * the body rather than as a GET with them in the address, because `--within`
 * may now carry up to ten thousand posting ids, which is around 370 kilobytes
 * of text. An address that long is refused before it reaches our server at all.
 * The server reads the two forms as the same parameters, so nothing about what
 * a command means changes with the way it travels.
 */
function bodyFrom(query: URLSearchParams): Record<string, string> {
  return Object.fromEntries(query);
}

/**
 * The newest version of the short instruction file, as the server says.
 *
 * The guide asks the server this one thing and nothing else. A server that
 * cannot be reached does not stop the guide printing, because instructions a
 * person cannot read when the network is down are worse than instructions that
 * skipped one check. What it must never do is fail quietly: when the check did
 * not happen, the person is told on standard error that their saved copy was
 * not compared against anything.
 */
async function newestSkillVersion(): Promise<number> {
  try {
    const { json } = await callServer('/guide', {});
    if (Number.isInteger(json?.skill_version)) return json.skill_version as number;
    process.stderr.write(
      'the server did not say which version of the instruction file is newest, so the copy ' +
        'you have saved was not compared against anything.\n',
    );
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `${said}. The copy of the instruction file you have saved was not compared against ` +
        `anything, so it may be out of date.\n`,
    );
  }
  return SKILL_VERSION;
}

export function buildProgram(): Command {
  const program = new Command();
  program.name('pinloop').description('Search the Pinloop job corpus from a terminal.');
  // Registered so `pinloop --help` lists it. The answer itself is written in
  // main, which sees --version before commander does.
  program.version(CLI_VERSION, '--version', 'print the version of this pinloop and exit');
  // Registered so `pinloop --help` lists it. It is acted on in main below, which
  // takes it off the arguments before commander reads them, so that it can be
  // typed anywhere on the line — `pinloop judge <ids> --plain` reads as well as
  // `pinloop --plain judge <ids>`, and a person reaching for it is usually
  // reaching for it after they have already typed the command.
  program.option(
    '--plain',
    'print the way a coding agent is printed for: no colour, no redrawn lines',
  );

  /**
   * `pinloop` typed with nothing after it: what this account holds.
   *
   * It is the one output in this program written for the person rather than for
   * the coding agent, and it is what somebody types when they do not know what
   * to do next. Run by somebody who is not signed in it names the command that
   * creates an account and the command that introduces Pinloop to an agent, and
   * it reports success rather than failing, because an agent that was told
   * nothing runs this first and that output is the only handoff it gets.
   *
   * It prints no dollar amount and says nothing about anything spent (Andrew,
   * 2026-08-18). Pinloop is sold as one flat monthly subscription, so a person
   * is not spending money run by run, and a total printed here would be what
   * Pinloop's own model calls cost us rather than what this person owes.
   */
  program.action(async () => {
    if (!haveSavedLogin()) {
      process.stdout.write(
        `${SIGNED_OUT_SENTENCE}\n` +
          `If you are the coding agent reading this, run \`pinloop welcome\` first and follow it.\n`,
      );
      return;
    }

    const pass = readPass();
    const { json } = await callAsAccount(pass, '/account');
    const documents = Array.isArray(json?.documents) ? (json.documents as string[]) : [];
    const schedules = Array.isArray(json?.schedules)
      ? (json.schedules as { name: string; last_fired_at: string | null }[])
      : [];

    const lines: string[] = [];
    lines.push(
      documents.length === 0
        ? 'Stored documents: none currently stored.'
        : `Stored documents: ${documents.join(', ')}`,
    );
    lines.push('');
    if (schedules.length === 0) {
      lines.push('Schedules: none currently stored.');
    } else {
      lines.push('Schedules:');
      for (const schedule of schedules) {
        const when =
          typeof schedule.last_fired_at === 'string' && schedule.last_fired_at !== ''
            ? `last ran ${schedule.last_fired_at.slice(0, 16).replace('T', ' ')}`
            : 'has not run yet';
        lines.push(`  ${schedule.name}, ${when}`);
      }
    }
    lines.push('');
    // The two monthly counts, as the server's answer states them. The numbers
    // are all the server's: this program holds no copy of any limit, so a limit
    // Andrew changes changes what this already-installed copy prints.
    lines.push(...allowanceLines(json?.allowances));
    lines.push('');
    lines.push('Ask your coding agent to run `pinloop guide` and read all of it.');

    process.stdout.write(`${lines.join('\n')}\n`);
  });

  /**
   * The three commands that print text and contact almost nothing.
   *
   * `pinloop welcome` and `pinloop skill` contact no server at all: every word
   * they print ships inside this program. `pinloop guide` makes one request, for
   * the newest version number of the short instruction file, and prints the
   * instructions it built itself out of the commands this copy actually has.
   *
   * None of the three takes --json. They print prose written to be read, so
   * there is nothing in them to hand back as machine-readable data, and asking
   * for it is refused by name rather than quietly ignored.
   */
  program
    .command('welcome')
    .description('print what Pinloop is, the instruction file to save, and the first steps')
    .action(async () => {
      process.stdout.write(printWelcome());
    });

  program
    .command('skill')
    .description('print the short instruction file for a coding agent to save')
    .action(async () => {
      process.stdout.write(`${SKILL_TEXT.trim()}\n`);
    });

  program
    .command('guide')
    .description('print the full instructions for using Pinloop')
    .argument(
      '[part]',
      `one part only: a command name such as "judge" or "profile put", or one of ` +
        `${NON_COMMAND_PARTS.join(', ')}`,
    )
    .option('--skill <n>', 'the version of the instruction file you have saved')
    .action(async (part: string | undefined, options: Record<string, string | undefined>) => {
      const saved = options['skill'];
      let savedSkillVersion: number | undefined;
      if (typeof saved === 'string' && saved !== '') {
        savedSkillVersion = Number(saved);
        if (!Number.isInteger(savedSkillVersion)) {
          throw new Failure(
            '`--skill` takes the whole number printed in the instruction file you saved ' +
              '(for example 3).',
          );
        }
      }

      process.stdout.write(
        buildGuide({
          program,
          part,
          signedIn: haveSavedLogin(),
          newestSkillVersion: await newestSkillVersion(),
          savedSkillVersion,
        }),
      );
    });

  /**
   * `pinloop login`: sign in through a browser, and save the pass this machine
   * will use (specs/feature-browser-sign-in.md, agreed 2026-08-19).
   *
   * There is no `pinloop signup` any more, and no password anywhere in this
   * product. The first time an email address signs in, the login service creates
   * the account at that moment; every later sign-in opens the same account. So
   * one command is the whole of the way in, and a person never has to know
   * whether they already have an account.
   *
   * What happens, in order. This command starts a small web server inside its own
   * process, listening on 127.0.0.1, which is the address a machine uses to talk
   * to itself. It prints the web address of the sign-in page, carrying the port
   * it is listening on and a one-time secret it invented, and on a machine that
   * has a browser it also opens that address itself. The person signs in on that
   * page with Google, with GitHub, or with a 6-digit code Pinloop emails them,
   * and the script inside the page hands the pass back to the port this command
   * named. When the browser is on a different machine from this terminal — over
   * SSH, which is where this happens — nothing answers on that port, so the page
   * shows a short code instead and this command takes it typed in here.
   *
   * The address is printed even on a machine where the browser is opened, because
   * the person running this command is often a coding agent and the human does
   * the browser part on their own screen.
   *
   * `--code` (or the PINLOOP_LOGIN_CODE environment variable) finishes a
   * sign-in with that same short code and nothing else: it never opens the
   * small web server above, so it works in a process that never ran `pinloop
   * login` and never saw the address this command printed. This is what a
   * coding agent runs after a person has finished signing in in their own
   * browser, because a coding agent has no prompt to paste a code into and,
   * on Windows, no way to receive one over a named pipe either. The flag wins
   * when both it and the environment variable are set.
   *
   * When neither is given and stdin is not a terminal — a coding agent's shell
   * again — this command prints the address and one line naming the `--code`
   * command to run next, then exits without waiting for anything: there is
   * nobody at this terminal to paste a code into or to watch it time out. A
   * real terminal, where a person can paste a code in by hand, keeps waiting
   * exactly as it does today.
   */
  program
    .command('login')
    .description('sign in through the browser and save the pass this machine will use')
    // Declared so that somebody who types the flags this command used to take is
    // told what to do instead, in one sentence, rather than being told by the
    // argument reader that `--email` is a word it does not know.
    .option('--email <email>', 'no longer taken: signing in happens in the browser')
    .option('--password <password>', 'no longer taken: Pinloop has no passwords')
    .option(
      '--code <code>',
      'finish signing in with the short code the sign-in page showed, without waiting here',
    )
    .action(async (options: { email?: string; password?: string; code?: string }) => {
      if (options.email !== undefined || options.password !== undefined) {
        throw new Failure(PASSWORD_FLAGS_REFUSAL);
      }

      const typedCode = options.code ?? process.env[LOGIN_CODE_ENV_VAR];
      if (typedCode !== undefined && typedCode.trim() !== '') {
        const pass = await exchangeCodeForPass(typedCode.trim());
        savePass({
          access_token: pass.access_token,
          ...(pass.refresh_token !== undefined ? { refresh_token: pass.refresh_token } : {}),
        });
        process.stdout.write(`${loggedInLine(emailToPrint(pass))}\n`);
        return;
      }

      const waiting = await waitForBrowserSignIn();
      try {
        const addressLines = `${OPEN_THIS_ADDRESS_LINE}\n${ADDRESS_INDENT}${waiting.pageUrl}\n`;

        // Nobody is at this terminal to paste a code into or to watch it give
        // up after ten minutes, so nothing here waits: the address is printed,
        // one line says what to run once the person has finished in their
        // browser, and the command ends.
        if (!process.stdin.isTTY) {
          process.stdout.write(`${addressLines}${FINISH_WITH_CODE_LINE}\n`);
          return;
        }

        process.stdout.write(`${addressLines}${PASTE_THE_CODE_LINE}\n`);
        openInBrowser(waiting.pageUrl);

        // Three things can end the wait: the browser hands the pass to the port
        // this command named, somebody types the short code the page showed
        // them, or ten minutes go by. Whichever happens first is what this
        // command does; the other two are dropped.
        const pass = await Promise.race([waiting.pass, passFromATypedCode()]);
        savePass({
          access_token: pass.access_token,
          ...(pass.refresh_token !== undefined ? { refresh_token: pass.refresh_token } : {}),
        });
        // The one line above is the whole of what a finished sign-in prints, and
        // it is the line login has printed since slice 1. Until 2026-08-19 a
        // block of onboarding text followed it on every sign-in; Andrew removed
        // it that day. Signing in again in a second terminal printed a paragraph
        // of instructions at the person, which reads badly, and an agent that ran
        // this command already knows the person just signed in.
        process.stdout.write(`${loggedInLine(emailToPrint(pass))}\n`);
      } finally {
        await waiting.stop();
        stopReadingTypedLines();
      }
    });

  /**
   * `pinloop logout`: delete the saved login on this machine.
   *
   * It contacts no server at all. Deleting that one file is the whole of what
   * signing out has ever been here — the pass in it is what proves to the server
   * who is running a command, and with the file gone this machine has no way to
   * prove anything. The command exists so that nobody has to be told to delete a
   * file by hand.
   *
   * It signs out this machine and nothing else. A pass saved on another machine
   * keeps working until it runs out, and cancelling one from somewhere else is
   * not built (specs/feature-browser-sign-in.md, non-goals).
   */
  program
    .command('logout')
    .description('delete the saved login on this machine')
    .action(async () => {
      const file = credentialsFile();
      if (!existsSync(file)) {
        process.stdout.write(`${NO_LOGIN_SAVED_LINE}\n`);
        return;
      }
      rmSync(file, { force: true });
      process.stdout.write(`${signedOutLine()}\n`);
    });

  /**
   * `pinloop billing`: open the page where a Pinloop subscription is set up,
   * changed or cancelled (specs/feature-subscription.md, DRAFT 2026-08-21).
   *
   * A card cannot be typed into a terminal, so the whole job of this command is
   * to hand a person a web address and, on a machine that has a browser, open it
   * for them. The address is printed as well, never only opened, for the two
   * reasons `pinloop login` prints its address: the person running the command
   * is often a coding agent while the human is looking at a browser on another
   * screen, and a rented machine reached over SSH has no browser at all.
   *
   * The server decides which address this is. An account that pays nothing gets
   * Pinloop's own payment page, carrying a one-time code that says which account
   * is paying. An account that already pays gets Stripe's own page for its
   * customer, which is where cancelling a subscription and replacing an expired
   * card happen. This command never learns which of the two it got, which is why
   * the line it prints is true either way.
   *
   * `pinloop upgrade` runs the same command. Andrew rejected `upgrade` as the
   * only name on 2026-08-21, because somebody who wants to cancel or replace a
   * card would never think to type the word upgrade; it stays as a second name so
   * that a person who guesses it is not told they guessed wrong.
   */
  program
    .command('billing')
    .alias('upgrade')
    .description('open the page where a Pinloop subscription is set up, changed or cancelled')
    .action(async () => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, BILLING_PATH, { method: 'POST', body: {} });
      const url = typeof json?.url === 'string' ? json.url : '';
      if (url === '') {
        throw new Failure('the Pinloop server handed back no address to open. Try again.');
      }
      process.stdout.write(billingLines(url));
      openInBrowser(url);
    });

  program
    .command('search')
    .description('search the corpus')
    .argument('[words...]', 'the words a posting has to contain')
    .option('--limit <n>', 'how many postings to show')
    .option('--cursor <cursor>', 'the cursor a previous search handed back')
    .option('--country <country>', 'only postings in this country')
    .option('--workplace <workplace>', 'only postings with this workplace kind')
    .option('--employment <employment>', 'only postings with this employment label')
    .option('--posted-after <date>', 'only postings posted on or after this date (YYYY-MM-DD)')
    .option('--within <ids>', WITHIN_HELP)
    .option(
      '--match <all|any>',
      'whether a posting has to carry every word or just one of them (any by default)',
    )
    .option(
      '--order <match|newest>',
      'put the best matches first, or the newest postings first (best matches by default)',
    )
    .option('--top <n>', 'how many postings the server may consider before it stops')
    .option('--in <part>', 'search only this part of a posting: title')
    .option(
      '--company <ids>',
      'only postings from these employers: their ids separated by commas, as "pinloop companies" prints them',
    )
    .option(
      '--semantic',
      'find postings by what they mean rather than by the words they carry',
    )
    .option(
      '--from-profile [names]',
      'with --semantic: search with the documents stored in this profile. Bare, it sends ' +
        'every document that describes you; given names separated by commas, it sends ' +
        'exactly those',
    )
    .option(
      '--min-match <fraction>',
      'with --semantic: return every posting whose match strength is at least this, ' +
        'written from 0 to 1 (for example 0.6)',
    )
    .option(
      '--preview',
      'with --semantic: print the text that would be sent and contact nobody',
    )
    .option('--unjudged', 'leave out every posting this account has already judged')
    .option('--json', 'print one JSON object holding the rows, instead of cards')
    .option(
      '--all',
      'follow every page and print them all at once, instead of one page and a cursor',
    )
    .action(async (words: string[], options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();
      nowDoing('searching');
      refuseAllWithLimit(options);
      const query = queryFrom(options, [
        ['limit', 'limit'],
        ['cursor', 'cursor'],
        ['country', 'country'],
        ['workplace', 'workplace'],
        ['employment', 'employment'],
        ['postedAfter', 'posted_after'],
        // The relevance options. Nothing is checked here on purpose: the server
        // is the one that knows which values it serves, and it already answers a
        // value it will not serve with a message naming the ones it will, which
        // this program prints as it stands.
        ['match', 'match'],
        ['order', 'order'],
        ['top', 'top'],
        ['in', 'in'],
        ['company', 'company'],
      ]);
      const q = words.join(' ').trim();
      if (q !== '') query.set('q', q);
      // The meaning-search options. Nothing is checked here either: the server
      // is the one that refuses a word-search option given alongside --semantic,
      // by name, and this program prints what it says. --from-profile arrives as
      // true when it was typed bare and as the names when they were given.
      if (options['semantic'] === true) query.set('semantic', 'true');
      if (options['preview'] === true) query.set('preview', 'true');
      const fromProfile = options['fromProfile'];
      if (fromProfile === true) query.set('from_profile', 'true');
      else if (typeof fromProfile === 'string' && fromProfile !== '') {
        query.set('from_profile', fromProfile);
      }
      const minMatch = options['minMatch'];
      if (typeof minMatch === 'string' && minMatch !== '') query.set('min_match', minMatch);
      const within = options['within'];
      if (typeof within === 'string' && within !== '') {
        query.set('within', await withinSet(within, 'pinloop search'));
      }
      // The server decides whose verdicts these are, from the login pass. All
      // this says is that the caller asked for the restriction.
      if (options['unjudged'] === true) query.set('unjudged', 'true');

      let rows: Record<string, unknown>[];
      let report: Record<string, unknown> | undefined;
      let cursor: unknown = null;

      if (options['all'] === true) {
        // A best-match search over any of the words stops at its own ceiling
        // rather than at the end of the corpus, and the server marks that end by
        // handing back no cursor. So following every page here reaches the
        // ceiling and stops, exactly as it does one page at a time, and the
        // report the search prints says which ceiling ended it.
        //
        // A search with no words, and a search asked for newest first, have no
        // ceiling at all: both are in date order with nothing to rank, so
        // following every page of one really does walk every posting the
        // conditions allow. That is said out loud on the first page rather than
        // at the end, because the end may be a long way off and a person
        // watching the row count climb deserves to know why before it gets
        // there.
        let saidNoCeiling = false;
        // A search in date order walks every posting the conditions allow, with
        // no ceiling of its own, which is the run the pull ceiling is about. A
        // best-match search stops at its own `top` and is bounded already. The
        // order is worked out the same way the server works it out: best match
        // when there are words and the caller did not ask for newest, date order
        // otherwise. The first request of a date-ordered run says so, and the
        // server counts what matched before it fetches anything and refuses the
        // whole run when the count is over what one command may pull
        // (specs/feature-pull-ceiling.md, section 2). Only the first request
        // carries the mark; the pages after it belong to a run already allowed.
        const dateOrdered = q === '' || options['order'] === 'newest';
        let openingRequest = true;
        const every = await followEveryPage(
          'pinloop search',
          async (from) => {
            const body = bodyFrom(query);
            body['limit'] = String(PAGE_WHILE_FOLLOWING);
            if (from !== undefined) body['cursor'] = from;
            else delete body['cursor'];
            if (dateOrdered && openingRequest) body['all'] = 'true';
            const answer = await callAsAccount(pass, '/search', { method: 'POST', body });
            // Marked as done only once a page has really arrived, so that a
            // first page refused for the allowance and asked for again is still
            // counted when it is served.
            openingRequest = false;
            if (!saidNoCeiling && interpretationOf(answer.json)?.['ceiling_applies'] === false) {
              saidNoCeiling = true;
              process.stderr.write(
                'search --all: this search is sorted by date, so there is no limit on how ' +
                  'many postings come back. It will keep fetching until it has every posting ' +
                  'that matches. Press Ctrl-C to stop it.\n',
              );
            }
            return answer;
          },
          textOption(options['cursor']),
        );
        rows = every.rows;
        report = interpretationOf(every.bodies[0]);
      } else {
        const { json } = await callAsAccount(pass, '/search', {
          method: 'POST',
          body: bodyFrom(query),
        });
        rows = rowsOf(json);
        report = interpretationOf(json);
        cursor = cursorOf(json);
      }

      if (options['json']) {
        // A JSON caller never sees the interpretation sentence above, but it
        // still needs to know when the ceiling cut its results short, so that
        // line goes to standard error here exactly as it does for a person —
        // standard output stays nothing but the JSON.
        if (report && report['mode'] !== 'semantic') saySearchCoverage(report);
        const answer: Record<string, unknown> = { rows, cursor };
        if (report) answer['interpretation'] = report;
        printJson(answer);
        return;
      }

      // What the search actually looked for goes to standard error, the same
      // way filter's report of what it dropped does: it is for the person, and
      // standard output has to stay nothing but the postings.
      if (report?.['mode'] === 'semantic') {
        saySemanticReport(report);
        // A preview searched for nothing, so there is nothing to say about how
        // many postings came back.
        if (report['preview_text'] !== undefined) return;
      } else if (report) {
        // How much came back leads, and what the search looked for follows it.
        saySearchCoverage(report);
        // The one line saying what the search looked for and how much came
        // back. It is dimmed for a person, so it reads as a note about the list
        // rather than as another row of it, and left exactly as it is for
        // anything else reading.
        process.stderr.write(
          `${summaryLine(interpretationSentence(report, rows.length), screen.colours)}\n`,
        );
        // Then the one thing the sentence above cannot say, because it is about
        // what was taken away rather than what was looked for: the postings this
        // account has a verdict for were left out.
        if (report['unjudged'] === true) {
          process.stderr.write('leaving out postings you already judged\n');
        }
      }

      if (rows.length === 0) {
        process.stdout.write('no postings matched that search\n');
        return;
      }
      // A meaning search's rows each carry a match strength; it is printed as
      // one extra line on the card so it is visible without --json.
      for (const card of rows) {
        const strength = (card as { strength?: unknown }).strength;
        printCard(
          card as unknown as Card,
          typeof strength === 'number' ? [`match ${strength.toFixed(2)}`] : [],
        );
      }
    });

  program
    .command('list')
    .description('list postings by exact conditions, newest first, with no word matching')
    .option('--employment <employment>', 'only postings with this employment label')
    .option('--country <country>', 'only postings in this country')
    .option('--workplace <workplace>', 'only postings with this workplace kind')
    .option('--posted-after <date>', 'only postings posted on or after this date (YYYY-MM-DD)')
    .option('--limit <n>', 'how many postings to show')
    .option('--cursor <cursor>', 'the cursor a previous list handed back')
    .option('--within <ids>', WITHIN_HELP)
    .option('--unjudged', 'leave out every posting this account has already judged')
    .option('--json', 'print one JSON object holding the rows, instead of cards')
    .option(
      '--all',
      'follow every page and print them all at once, instead of one page and a cursor',
    )
    .action(async (options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();
      nowDoing('listing');
      refuseAllWithLimit(options);
      const query = queryFrom(options, [
        ['employment', 'employment'],
        ['country', 'country'],
        ['workplace', 'workplace'],
        ['postedAfter', 'posted_after'],
        ['limit', 'limit'],
        ['cursor', 'cursor'],
      ]);
      const within = options['within'];
      if (typeof within === 'string' && within !== '') {
        query.set('within', await withinSet(within, 'pinloop list'));
      }
      // Whose verdicts these are is decided by the server, from the login pass.
      if (options['unjudged'] === true) query.set('unjudged', 'true');

      let rows: Record<string, unknown>[];
      let cursor: unknown = null;

      if (options['all'] === true) {
        // The first request of the run says that it is the first request of a
        // run. The server counts how many postings the conditions match before
        // it fetches anything and refuses the whole run when that count is over
        // what one command may pull, so a run that cannot finish is refused in
        // one sentence instead of being served the first of a hundred and
        // eighty-six pages (specs/feature-pull-ceiling.md, section 2). Only the
        // first request carries it: the pages after it belong to a run that was
        // already allowed, and counting again on each of them would cost a
        // second statement a page. A run given a starting cursor sends it on its
        // first request too, because that run is just as long.
        let openingRequest = true;
        const every = await followEveryPage(
          'pinloop list',
          async (from) => {
            const body = bodyFrom(query);
            body['limit'] = String(PAGE_WHILE_FOLLOWING);
            if (from !== undefined) body['cursor'] = from;
            else delete body['cursor'];
            if (openingRequest) body['all'] = 'true';
            const answer = await callAsAccount(pass, '/list', { method: 'POST', body });
            // Marked as done only once a page has really arrived, so that a
            // first page refused for the allowance and asked for again is still
            // counted when it is served.
            openingRequest = false;
            return answer;
          },
          textOption(options['cursor']),
        );
        rows = every.rows;
      } else {
        const { json } = await callAsAccount(pass, '/list', {
          method: 'POST',
          body: bodyFrom(query),
        });
        rows = rowsOf(json);
        cursor = cursorOf(json);
      }

      if (options['json']) {
        printJson({ rows, cursor });
        return;
      }
      if (rows.length === 0) {
        process.stdout.write('no postings matched those conditions\n');
        return;
      }
      for (const card of rows) printCard(card as unknown as Card);
    });

  program
    .command('fetch')
    .description(
      'show the complete stored record behind each posting id, by id or from the JSON piped in',
    )
    .argument(
      '[ids...]',
      'the posting ids to fetch; with none, they are read from what is piped in. ' +
        `${LARGE_SETS_MUST_BE_PIPED}, for example: pinloop search intern --all --json | pinloop fetch --json`,
    )
    .option('--json', 'print one JSON object holding the records, instead of a readable view')
    .action(async (ids: string[], options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();
      const wanted = await typedIdsOrPipedIn('pinloop fetch', ids);
      nowDoing('fetching');
      const { json } = await callAsAccount(pass, '/fetch', {
        method: 'POST',
        body: { ids: wanted.join(',') },
      });
      const rows = rowsOf(json);
      const notFound = Array.isArray(json?.not_found) ? json.not_found : [];
      if (options['json']) {
        printJson({ rows, not_found: notFound, coverage: json?.coverage });
        return;
      }
      for (const row of rows) printRecord(row);
      // How many of the ids were found leads, and the ids that were not follow.
      sayCoverage(
        json?.coverage,
        (fraction) => `${fraction} posting ids you asked for were found.`,
      );
      for (const missing of notFound) {
        process.stderr.write(`${String(missing)}: no posting with that id\n`);
      }
    });

  program
    .command('companies')
    .description('find employers by words in their name, the one with the most postings first')
    .argument('<words...>', 'the words an employer name has to contain')
    .option('--limit <n>', 'how many employers to show')
    .option('--cursor <cursor>', 'the cursor a previous companies lookup handed back')
    .option('--json', 'print one JSON object holding the rows, instead of one line each')
    .option(
      '--all',
      'follow every page and print them all at once, instead of one page and a cursor',
    )
    .action(async (words: string[], options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();
      refuseAllWithLimit(options);
      const query = queryFrom(options, [
        ['limit', 'limit'],
        ['cursor', 'cursor'],
      ]);
      const q = words.join(' ').trim();
      if (q !== '') query.set('q', q);
      nowDoing('looking up employers');

      let rows: Record<string, unknown>[];
      let cursor: unknown = null;
      if (options['all'] === true) {
        rows = (
          await everyPageOf(
            pass,
            'pinloop companies',
            '/companies',
            query,
            textOption(options['cursor']),
          )
        ).rows;
      } else {
        const { json } = await callAsAccount(pass, `/companies?${query.toString()}`);
        rows = rowsOf(json);
        cursor = cursorOf(json);
      }

      if (options['json']) {
        printJson({ rows, cursor });
        return;
      }
      if (rows.length === 0) {
        process.stdout.write('no employers matched those words\n');
        return;
      }
      for (const row of rows) printCompany(row);
    });

  /**
   * The back-and-forth between this account and Andrew, who builds Pinloop
   * (specs/feature-messages.md, AGREED 2026-08-20).
   *
   * Words after the command send those words. The command on its own prints the
   * whole conversation, oldest message first, so it reads from top to bottom the
   * way a conversation does.
   *
   * The two things only Andrew may do are written as options with two dashes
   * rather than as a second word after `message`. That is deliberate: somebody
   * who types `pinloop message inbox is broken` sends the words "inbox is
   * broken". If `inbox` were a second word instead, it would be read as the name
   * of a command and the message would never be sent.
   */
  const CONVERSATION_INSTRUCTION =
    'If you are a coding agent, give the person every message below word for word before ' +
    'you continue.';

  /** One message, printed the way a person reads a conversation. */
  function printMessage(row: Record<string, unknown>): void {
    const who = String(row['written_by']) === 'andrew' ? 'Andrew' : 'you';
    const when = String(row['written_at'] ?? '');
    process.stdout.write(`${who}, ${when}\n${String(row['body'] ?? '')}\n\n`);
  }

  /** One waiting conversation, printed the way Andrew reads his own listing. */
  function printWaiting(row: Record<string, unknown>): void {
    process.stdout.write(
      `${String(row['email'] ?? '')}  ${String(row['written_at'] ?? '')}\n` +
        `${String(row['body'] ?? '')}\n\n`,
    );
  }

  program
    .command('message')
    .description('send a message to Andrew (who builds Pinloop), and read what he says back')
    .argument('[words...]', 'the words to send; with none, the conversation is printed')
    .option('--json', 'print one JSON object holding the messages, instead of lines')
    .option('--inbox', 'list the conversations waiting for an answer (Andrew only)')
    .option('--reply <email>', 'answer the account at this email address (Andrew only)')
    .action(async (words: string[], options: Record<string, string | boolean | undefined>) => {
      // Whatever this command does, it never prints the line telling somebody to
      // run it. This is set before the first call to the server, because that
      // call is where an answer carrying a count above zero would arrive.
      readingTheConversation = true;
      const pass = readPass();
      const said = words.join(' ').trim();
      const asJson = options['json'] === true;
      const replyTo = textOption(options['reply']);

      if (options['inbox'] === true) {
        nowDoing('reading the waiting conversations');
        const { json } = await callAsAccount(pass, '/message/inbox');
        const waiting = rowsOf(json);
        if (asJson) {
          printJson({ rows: waiting, cursor: cursorOf(json) });
          return;
        }
        if (waiting.length === 0) {
          process.stdout.write('nobody is waiting for an answer\n');
          return;
        }
        for (const row of waiting) printWaiting(row);
        return;
      }

      if (replyTo !== undefined) {
        if (said === '') throw new Failure('write the answer after the address you are answering');
        nowDoing('sending the answer');
        const { json } = await callAsAccount(pass, '/message/reply', {
          method: 'POST',
          body: { email: replyTo, words: said },
        });
        if (asJson) {
          printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
          return;
        }
        process.stdout.write(`answered ${replyTo}\n`);
        return;
      }

      if (said !== '') {
        nowDoing('sending the message');
        const { json } = await callAsAccount(pass, '/message', {
          method: 'POST',
          body: { words: said },
        });
        if (asJson) {
          printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
          return;
        }
        process.stdout.write(
          'sent. Andrew (who builds Pinloop) reads messages himself. The next Pinloop command ' +
            'you run after he replies will notify you of his response\n',
        );
        return;
      }

      nowDoing('reading the conversation');
      const { json } = await callAsAccount(pass, '/message');
      const conversation = rowsOf(json);
      if (asJson) {
        printJson({ rows: conversation, cursor: cursorOf(json) });
        return;
      }
      if (conversation.length === 0) {
        process.stdout.write(
          'nothing has been said yet. Write your words after `pinloop message` to send the first one.\n',
        );
        return;
      }
      // The instruction goes to standard error, next to everything else a person
      // reads that a following command must not swallow, and the messages
      // themselves go to standard output.
      process.stderr.write(`${CONVERSATION_INSTRUCTION}\n`);
      for (const row of conversation) printMessage(row);
    });

  program
    .command('filter')
    .description('keep the postings piped in that satisfy these conditions, and say what was dropped')
    .option('--country <country>', 'keep only postings in this country')
    .option('--workplace <workplace>', 'keep only postings with this workplace kind')
    .option('--employment <employment>', 'keep only postings with this employment label')
    .option('--posted-after <date>', 'keep only postings posted on or after this date (YYYY-MM-DD)')
    .option('--json', 'print one JSON object holding the survivors, instead of cards')
    .action(async (options: Record<string, string | boolean | undefined>) => {
      const rows = await rowsPipedIn('pinloop filter');
      const rules: FilterRules = {
        country: textOption(options['country']),
        workplace: textOption(options['workplace']),
        employment: textOption(options['employment']),
        posted_after: textOption(options['postedAfter']),
      };

      const { survivors, dropped, coverage } = runFilter(rows, rules);
      // The rows piped in already carry the title and the employer, so the drop
      // report below can name a posting the way a person knows it instead of by
      // its bare id, by looking each dropped id back up in the rows this run
      // started with.
      const pipedById = new Map(
        rows.map((row) => [String((row as Record<string, unknown>)['id'] ?? ''), row]),
      );

      // The drop report goes to standard error on purpose: standard output has
      // to stay pure JSON for whatever command comes next in the pipe. How many
      // postings satisfied every condition is said first, and which postings did
      // not, and why, is said after it.
      sayCoverage(
        coverage,
        (fraction) => `${fraction} postings piped in satisfied every condition.`,
      );
      for (const drop of dropped) {
        const piped = pipedById.get(drop.id) as Record<string, unknown> | undefined;
        const name = namePosting(
          drop.id,
          piped?.['title'] === undefined ? undefined : String(piped['title']),
          piped?.['company'] === undefined ? undefined : String(piped['company']),
        );
        process.stderr.write(`dropped ${name}: ${drop.reason}\n`);
      }

      if (options['json']) {
        printJson({ rows: survivors, coverage });
        return;
      }
      for (const card of survivors) printCard(card as unknown as Card);
    });

  addJudgeCommands(program);
  addProfileCommands(program);
  addRoutineCommands(program);
  addScheduleCommands(program);
  addWatchCommands(program);
  addTabCommands(program);

  return program;
}

/**
 * How a posting is named in a message a person reads: the job title and the
 * employer when both are known, whichever one is known when only one is, and
 * the bare id, in parentheses either way, only when neither is known
 * (rule 3, .claude/skills/printed-message/SKILL.md).
 */
function namePosting(id: string, title?: string, company?: string): string {
  const t = title?.trim();
  const c = company?.trim();
  if (t && c) return `the ${t} posting at ${c} (${id})`;
  if (c) return `the posting at ${c} (${id})`;
  if (t) return `the ${t} posting (${id})`;
  return id;
}

/**
 * `pinloop judge`, and the `pinloop judgment` verbs that read back what it
 * stored.
 *
 * Judging calls a paid model, but Pinloop charges one flat subscription rather
 * than metering each run, so the output never says what a run cost — it says
 * how many postings were judged and which model did it. That line, and
 * everything else a person needs to read rather than pipe onward — a posting
 * that could not be judged, a previous verdict that was replaced, a posting a
 * keep word left out — goes to standard error, exactly where filter's drop
 * report goes, so standard output stays nothing but the verdicts the next
 * command in the pipe would read.
 *
 * `--preview` is the way to see what a run would send without sending it: it
 * prints the instructions the model would be given, the posting, every profile
 * document in full, and the model's name, and it contacts nobody and buys
 * nothing.
 */
function addJudgeCommands(program: Command): void {
  /** The path of one stored verdict on the server. */
  const judgmentPath = (postingId: string) => `/judgment/${encodeURIComponent(postingId)}`;

  /**
   * What a person is told when they typed a posting id with no verdict beside
   * it. Typing an id means storing that one verdict, and there is no verdict to
   * store without the word, so nothing is sent.
   */
  const NEEDS_A_VERDICT = '`judgment put` needs `--verdict` when a posting id is typed';

  /** What the listing prints under a verdict whose reasoning text is empty. */
  const NO_REASONING_RECORDED = 'no reasoning was recorded';

  /**
   * The postings a run is judging: the ids typed on the command line, or, when
   * none were typed, the ids of the rows piped in. That is the pipe this verb
   * exists for — a search prints postings, and those postings are judged without
   * anybody copying an id by hand.
   */
  async function idsToJudge(given: string[]): Promise<string[]> {
    const typed = given.flatMap((one) => one.split(',')).filter((one) => one.trim() !== '');
    if (typed.length > 0) return typed;
    const rows = await rowsPipedIn('pinloop judge');
    return rows.map((row) => String(row['id'] ?? '')).filter((id) => id !== '');
  }

  /** One verdict block: the verdict and the posting, then the model's own words. */
  function printJudgment(row: Record<string, unknown>): void {
    if (alignedRows) {
      process.stdout.write(`${verdictRow(row, screen.colours, terminalWidth())}\n`);
      const said = String(row['reasoning'] ?? '');
      if (said !== '') process.stdout.write(`${said}\n`);
      process.stdout.write('\n');
      return;
    }
    process.stdout.write(`${String(row['verdict'])}  ${String(row['id'])}\n`);
    const reasoning = String(row['reasoning'] ?? '');
    if (reasoning !== '') process.stdout.write(`${reasoning}\n`);
    process.stdout.write('\n');
  }

  /**
   * One line per posting whose stored verdict a run would read back instead of
   * buying. They are printed before any material, because they are the cheap
   * half of the answer and a person deciding whether to spend wants to see what
   * they are already getting for nothing first.
   */
  function printWouldReuse(json: any): void {
    const would = Array.isArray(json?.reused) ? (json.reused as Record<string, unknown>[]) : [];
    for (const one of would) {
      process.stdout.write(
        `would reuse ${String(one['id'])}: ${String(one['verdict'])}, ` +
          `judged by ${String(one['judged_by'])}\n`,
      );
    }
    if (would.length > 0) process.stdout.write('\n');
  }

  /** One posting's assembled material, printed whole, exactly as it would go. */
  function printPreview(row: Record<string, unknown>): void {
    // The posting's own title and employer travel with the preview material
    // already, so the header names the posting the way a person knows it
    // rather than by its bare id.
    const posting = row['posting'];
    const postingFields = posting && typeof posting === 'object' ? (posting as Record<string, unknown>) : {};
    const name = namePosting(
      String(row['id']),
      postingFields['title'] === undefined ? undefined : String(postingFields['title']),
      postingFields['company'] === undefined ? undefined : String(postingFields['company']),
    );
    process.stdout.write(`would judge ${name} with ${String(row['model'])}\n\n`);
    // What the model would be told to do: this account's own judge-prompt
    // document when it has stored one, and the text Pinloop ships otherwise.
    // Printing it is how a person reads the instructions before editing them.
    const instructions = String(row['instructions'] ?? '');
    if (instructions !== '') {
      process.stdout.write(`--- instructions ---\n${instructions}\n--- end of instructions ---\n\n`);
    }
    if (posting && typeof posting === 'object') printRecord(posting as Record<string, unknown>);

    const documents = Array.isArray(row['documents'])
      ? (row['documents'] as Record<string, unknown>[])
      : [];
    for (const document of documents) {
      process.stdout.write(
        `--- ${String(document['name'])} (last updated ${String(document['updated_at'])}) ---\n` +
          `${String(document['text'] ?? '')}\n\n`,
      );
    }

    const resume = row['resume'] as Record<string, unknown> | null;
    process.stdout.write(
      resume
        ? `resume: ${String(resume['original_filename'])}, ${Number(resume['bytes'])} bytes, ` +
            'sent as the PDF file itself\n\n'
        : 'resume: none stored, so no resume would be sent\n\n',
    );
  }

  /**
   * One thing the server said while a run was going, handed to the one piece of
   * code that owns the screen (src/cli/screen.ts).
   *
   * Nothing is decided here. A person watching gets a group of lines redrawn in
   * place; a coding agent gets a short list of plain lines with none of the
   * model's thinking in it. Which of the two, and what each of them says, is
   * that file's business.
   *
   * A line the run's own failure arrives on is left alone: it is reported by the
   * command ending in a failure, further down, rather than by anything here.
   */
  function watchProgress(line: string): void {
    let event: ProgressEvent | undefined;
    try {
      event = JSON.parse(line) as ProgressEvent;
    } catch {
      return;
    }
    if (event === undefined || typeof event.kind !== 'string') return;
    screen.judge(event);
  }

  /**
   * The line a run adds when a call to the model ended before it ever
   * answered.
   *
   * It comes after the line saying how many postings were judged, so a person
   * reads that count and then reads that some of the calls behind it never
   * came back at all.
   */
  function sayUnknownCost(json: any): void {
    const calls = Number(json?.failed_calls ?? 0);
    if (!Number.isFinite(calls) || calls < 1) return;
    process.stderr.write(calls === 1 ? '1 call failed\n' : `${calls} calls failed\n`);
  }

  /**
   * Everything about a run a person reads and the next command must not see.
   *
   * It is written in three pieces, and each piece says how much came through
   * before it says what happened to the rest: how many of the postings were
   * judged and then the ones that could not be, how many judged postings the
   * keep word hands on and then the ones it leaves behind, and how many of the
   * profile documents were sent and then what the absent ones would have done.
   * After the three pieces come the verdicts this run replaced and the line
   * saying how many postings were judged and with which model.
   */
  function reportRun(json: any, keep: string | undefined): void {
    const judgedOf = fractionIn(json?.coverage);
    if (judgedOf !== undefined) {
      process.stderr.write(`${judgedOf} postings you named were judged.\n`);
    }
    for (const one of (json?.failed ?? []) as Record<string, unknown>[]) {
      process.stderr.write(`could not judge ${named(one)}: ${String(one['reason'])}\n`);
    }

    const keptOf = fractionIn(json?.kept_coverage);
    if (keptOf !== undefined) {
      process.stderr.write(
        `${keptOf} postings that were judged are kept by "${String(keep)}" and handed on.\n`,
      );
    }
    for (const one of (json?.dropped ?? []) as Record<string, unknown>[]) {
      process.stderr.write(
        `dropped ${named(one)}: ${dropReason(String(one['verdict']), String(keep))}\n`,
      );
    }

    sayCoverage(
      json?.documents_coverage,
      (fraction) => `${fraction} profile documents were stored and sent to the model.`,
    );
    for (const note of (json?.notes ?? []) as unknown[]) {
      process.stderr.write(`${String(note)}\n`);
    }

    // A replaced verdict names who made the one that went. Pinloop made most of
    // them, but a verdict a person's own agent produced would carry that
    // person's own label, and it should not disappear without being named.
    for (const one of (json?.replaced ?? []) as Record<string, unknown>[]) {
      process.stderr.write(
        `replaced the verdict this account already had for ${String(one['id'])}, ` +
          `judged by ${String(one['judged_by'])}\n`,
      );
    }
    // The last line says how many postings were judged and with which model.
    // When some of the verdicts were read back out of the table instead of
    // freshly judged, both numbers are named as a fraction of the postings the
    // run was given, because "judged 3 postings" on its own reads like a run of
    // three postings when it was a run of forty-three.
    const judged = Number(json?.judged ?? 0);
    const reused = Number(json?.reused ?? 0);
    const failed = ((json?.failed ?? []) as unknown[]).length;
    const model = String(json?.model ?? '');
    // The postings this run never sent to the model at all, because this
    // account has used the postings a model may judge for it this month. They
    // are named on the same last line, with the reason the server gave, so a
    // run that stopped early never looks like a run that finished.
    const untouched = (json?.not_attempted ?? []) as Record<string, unknown>[];
    if (reused > 0 || untouched.length > 0) {
      const given = judged + reused + failed + untouched.length;
      const pieces = [`judged ${judged} of ${given} postings with ${model}`];
      if (reused > 0) {
        pieces.push(
          `${reused} of ${given} reused the judgment this account already saved for the same posting(s)`,
        );
      }
      if (untouched.length > 0) {
        pieces.push(
          `${untouched.length} not attempted because ${String(untouched[0]?.['reason'] ?? '')}`,
        );
      }
      process.stderr.write(`${pieces.join('; ')}\n`);
      sayUnknownCost(json);
      return;
    }
    process.stderr.write(`judged ${judged} posting${judged === 1 ? '' : 's'} with ${model}\n`);
    sayUnknownCost(json);
  }

  /**
   * Everything about a quick screening run a person reads and the next command
   * must not see.
   *
   * A screen is a different thing from a judgement, so it says different things.
   * Each posting it left alone is named with the verdict it kept and who made
   * that verdict, so nobody has to guess why a posting they named is missing.
   * Each model call that could not answer for everything it carried is named
   * with the fraction it did manage. Each posting it could not judge is named
   * with the reason, in the words an ordinary run already uses. And the last
   * line says the run was a screen, so a line about a hundred postings screened
   * is never mistaken for a hundred full judgements.
   */
  function reportScreen(json: any, keep: string | undefined): void {
    const judgedOf = fractionIn(json?.coverage);
    if (judgedOf !== undefined) {
      process.stderr.write(`${judgedOf} postings you named were screened.\n`);
    }
    for (const one of (json?.skipped ?? []) as Record<string, unknown>[]) {
      process.stderr.write(
        `skipped ${String(one['id'])}: kept ${String(one['verdict'])}, ` +
          `judged by ${String(one['judged_by'])}\n`,
      );
    }

    const calls = (json?.calls ?? []) as Record<string, unknown>[];
    for (const [index, call] of calls.entries()) {
      const coverage = (call['coverage'] ?? {}) as { covered?: unknown; total?: unknown };
      const covered = Number(coverage.covered ?? 0);
      const total = Number(coverage.total ?? 0);
      // A call that answered for everything it carried is the ordinary case and
      // says nothing; a call that did not is the whole reason this line exists.
      if (covered === total) continue;
      process.stderr.write(
        `quick call ${index + 1} of ${calls.length}: ${covered}/${total} postings were judged.\n`,
      );
    }

    for (const one of (json?.failed ?? []) as Record<string, unknown>[]) {
      process.stderr.write(`could not judge ${named(one)}: ${String(one['reason'])}\n`);
    }
    for (const one of (json?.ignored ?? []) as Record<string, unknown>[]) {
      process.stderr.write(`ignored ${String(one['id'])}: ${String(one['reason'])}\n`);
    }

    const keptOf = fractionIn(json?.kept_coverage);
    if (keptOf !== undefined) {
      process.stderr.write(
        `${keptOf} postings that were screened are kept by "${String(keep)}" and handed on.\n`,
      );
    }
    for (const one of (json?.dropped ?? []) as Record<string, unknown>[]) {
      process.stderr.write(
        `dropped ${named(one)}: ${dropReason(String(one['verdict']), String(keep))}\n`,
      );
    }

    sayCoverage(
      json?.documents_coverage,
      (fraction) => `${fraction} profile documents were stored and sent to the model.`,
    );
    for (const note of (json?.notes ?? []) as unknown[]) {
      process.stderr.write(`${String(note)}\n`);
    }
    for (const one of (json?.replaced ?? []) as Record<string, unknown>[]) {
      process.stderr.write(
        `replaced the verdict this account already had for ${String(one['id'])}, ` +
          `judged by ${String(one['judged_by'])}\n`,
      );
    }

    const judged = Number(json?.judged ?? 0);
    process.stderr.write(
      `quickly judged ${judged} posting${judged === 1 ? '' : 's'} with ${String(json?.model ?? '')}\n`,
    );
    sayUnknownCost(json);
  }

  program
    .command('judge')
    .description('judge postings against this account’s stored profile')
    .argument('[ids...]', 'the posting ids to judge; with none, they are read from what is piped in')
    .option('--preview', 'print exactly what would be sent, without sending it or contacting the model')
    .option(
      '--keep <verdict>',
      'hand on only the postings judged at or above this word: no, weak, fair or strong',
    )
    .option(
      '--again',
      'buy a fresh verdict for every posting named and write it over the stored one, ' +
        'instead of reading back the verdicts this account already has',
    )
    .option(
      '--quick',
      'screen instead of judging: up to 100 postings in one model call, on their plain ' +
        'facts and without their job description text',
    )
    .option('--json', 'print one JSON object holding the verdicts, instead of blocks')
    .option('--confirm <token>', CONFIRM_OPTION_HELP)
    .action(async (ids: string[], options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();
      const wanted = await idsToJudge(ids);
      const keep = textOption(options['keep']);
      const quick = options['quick'] === true;
      const again = options['again'] === true;

      const body: Record<string, unknown> = { ids: wanted };
      if (options['preview']) body['preview'] = true;
      if (keep !== undefined) body['keep'] = keep;
      if (again) body['again'] = true;
      if (quick) body['quick'] = true;
      const confirming = textOption(options['confirm']);
      if (confirming !== undefined) body['confirm'] = confirming;

      // A real run asks the server to say what is happening while it happens,
      // and prints one line per thing on standard error. A preview asks nobody
      // anything and has nothing to report, so it makes the plain call it always
      // made.
      nowDoing('judging');
      // Which kind of run this is comes from the flag the person typed, told to
      // the screen here rather than worked out there from what the server says
      // while the run goes. A quick screen's group of redrawn rows leaves the
      // count of finished postings off its last row, because one quick call
      // carries every posting it was given and that count cannot move until the
      // call comes back (Andrew, 2026-08-20).
      screen.judgeIsQuick(quick);
      const { json } = await callAsAccount(pass, '/judge', {
        method: 'POST',
        body,
        ...(options['preview'] ? {} : { onLine: watchProgress }),
      });
      // The run has ended, so the group of redrawn lines comes off the screen
      // and the cursor comes back before one byte of the answer is printed.
      // Nothing below this point may print while that group is still up.
      screen.finish();
      // A run that failed after its first progress line had gone out says so in
      // its last line, because the status number at the top of the answer went
      // out as 200 long before anything went wrong.
      if ((json as { kind?: unknown } | undefined)?.kind === 'error') {
        throw new Failure(
          String((json as { message?: unknown }).message ?? 'the judge run failed; try again'),
        );
      }
      // Nothing was judged: this is the first of the two calls, and what it
      // printed is what the second call would do plus the token that confirms it
      // (specs/feature-judge-confirmation.md, AGREED 2026-08-26).
      if (stoppedToAsk(json)) {
        reportConfirmation(json, options['json'] === true, { kind: 'judge', ids: wanted, quick, again });
        return;
      }
      const rows = rowsOf(json);

      if (options['preview']) {
        if (options['json']) {
          printJson({
            rows,
            cursor: cursorOf(json),
            model: json?.model,
            ...(quick ? { quick: true } : {}),
            instructions: json?.instructions ?? '',
            reused: json?.reused ?? [],
            coverage: json?.coverage,
            documents_coverage: json?.documents_coverage,
            absent_documents: json?.absent_documents ?? [],
            notes: json?.notes ?? [],
          });
          return;
        }
        sayCoverage(
          json?.documents_coverage,
          (fraction) => `${fraction} profile documents were stored and would be sent.`,
        );
        for (const note of (json?.notes ?? []) as unknown[]) {
          process.stderr.write(`${String(note)}\n`);
        }
        printWouldReuse(json);
        for (const row of rows) printPreview(row);
        return;
      }

      if (quick) reportScreen(json, keep);
      else reportRun(json, keep);

      if (options['json']) {
        printJson({
          rows,
          cursor: cursorOf(json),
          model: json?.model,
          judged: json?.judged ?? 0,
          reused: json?.reused ?? 0,
          // What only a screening run has to say, left out of an ordinary run's
          // answer so that nothing reading it has to check two shapes.
          ...(quick
            ? {
                quick: true,
                skipped: json?.skipped ?? [],
                ignored: json?.ignored ?? [],
                calls: json?.calls ?? [],
              }
            : {}),
          coverage: json?.coverage,
          ...(json?.kept_coverage === undefined ? {} : { kept_coverage: json.kept_coverage }),
          documents_coverage: json?.documents_coverage,
          failed: json?.failed ?? [],
          failed_calls: json?.failed_calls ?? 0,
          dropped: json?.dropped ?? [],
          replaced: json?.replaced ?? [],
          absent_documents: json?.absent_documents ?? [],
          notes: json?.notes ?? [],
        });
        return;
      }
      // Andrew, 2026-08-16: ten thousand read-back verdicts must not print ten thousand blocks; the summary line already counts them and `judgment list` or `--json` shows them.
      for (const row of rows) if (row['reused'] !== true) printJudgment(row);
    });

  const judgment = program
    .command('judgment')
    .description(
      'store verdicts you made outside Pinloop, and read back or remove the ones already stored',
    );

  judgment
    .command('list')
    .description('show every verdict this account has stored, newest first')
    .option('--limit <n>', 'how many verdicts to show')
    .option('--cursor <cursor>', 'the cursor a previous page handed back')
    .option('--verdict <word>', 'show only the verdicts carrying this word: no, weak, fair or strong')
    .option(
      '--judged-by <who>',
      'show only the verdicts from this source: user, pinloop or pinloop-quick',
    )
    .option('--reasoning', 'print the reasoning of each verdict under its own line')
    .option('--json', 'print one JSON object holding the verdicts, instead of lines')
    .option(
      '--all',
      'follow every page and print them all at once, instead of one page and a cursor',
    )
    .action(async (options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();
      nowDoing('reading verdicts');
      refuseAllWithLimit(options);
      // The two filters travel as query parameters, so they are carried on every
      // page a --all run follows rather than only on the first one.
      const query = queryFrom(options, [
        ['limit', 'limit'],
        ['cursor', 'cursor'],
        ['verdict', 'verdict'],
        ['judgedBy', 'judged_by'],
      ]);

      let rows: Record<string, unknown>[];
      let cursor: unknown = null;
      if (options['all'] === true) {
        rows = (
          await everyPageOf(
            pass,
            'pinloop judgment list',
            '/judgment',
            query,
            textOption(options['cursor']),
          )
        ).rows;
      } else {
        const { json } = await callAsAccount(pass, `/judgment?${query.toString()}`);
        rows = rowsOf(json);
        cursor = cursorOf(json);
      }

      if (options['json']) {
        printJson({ rows, cursor });
        return;
      }
      if (rows.length === 0) {
        process.stdout.write('this account currently has no stored verdicts\n');
        return;
      }
      for (const row of rows) {
        // Who judged goes on every line: a verdict Pinloop bought and one a
        // person stored by hand are the same shape otherwise, and the whole
        // point of the column is being able to tell them apart at a glance.
        if (alignedRows) {
          process.stdout.write(`${verdictRow(row, screen.colours, terminalWidth())}\n`);
        } else {
          process.stdout.write(
            `${String(row['verdict'])}  ${String(row['id'])}  ` +
              `${String(row['judged_at'] ?? '').slice(0, 10)}  ` +
              `judged by ${String(row['judged_by'])}\n`,
          );
        }
        if (options['reasoning'] !== true) continue;
        const reasoning = String(row['reasoning'] ?? '');
        process.stdout.write(
          `${reasoning === '' ? NO_REASONING_RECORDED : reasoning}\n\n`,
        );
      }
    });

  judgment
    .command('put')
    .description('store a verdict you made outside Pinloop, so Pinloop counts that posting judged')
    .argument('[posting-id]', 'the posting to store a verdict for; with none, rows are piped in')
    .option('--verdict <word>', 'the verdict: no, weak, fair or strong')
    .option('--reasoning <text>', 'why you judged it that way')
    .option('--json', 'print one JSON object holding what was stored, instead of lines')
    .action(
      async (postingId: string | undefined, options: Record<string, string | boolean | undefined>) => {
        const pass = readPass();
        const typed = typeof postingId === 'string' && postingId.trim() !== '';

        let rows: unknown[];
        if (typed) {
          const verdict = textOption(options['verdict']);
          if (verdict === undefined) throw new Failure(NEEDS_A_VERDICT);
          const reasoning = textOption(options['reasoning']);
          rows = [
            {
              id: postingId!.trim(),
              verdict,
              ...(reasoning === undefined ? {} : { reasoning }),
            },
          ];
        } else {
          // Exactly the rows that were piped in, in the order they arrived and
          // with nothing added or taken out. The server sets aside the rows it
          // cannot store and reports each one by its place in the input, and
          // those places only mean anything if this end sends what it was given.
          rows = await rowsPipedIn('pinloop judgment put');
        }

        const { json } = await callAsAccount(pass, '/judgment', {
          method: 'POST',
          body: { rows },
        });
        const stored = rowsOf(json);
        const replaced = (json?.replaced ?? []) as Record<string, unknown>[];
        const dropped = (json?.dropped ?? []) as Record<string, unknown>[];

        if (options['json']) {
          printJson({ rows: stored, cursor: cursorOf(json) ?? null, replaced, dropped });
          return;
        }

        // Nothing at all on standard output: a store hands nothing onward, and
        // everything below is for the person rather than for the next command.
        for (const one of replaced) {
          process.stderr.write(
            `replaced the verdict this account already had for ${String(one['id'])}, ` +
              `judged by ${String(one['judged_by'])}\n`,
          );
        }
        for (const one of dropped) {
          const where = `dropped row ${Number(one['position'])}`;
          const which = one['id'] === null || one['id'] === undefined
            ? ''
            : `, posting ${String(one['id'])}`;
          process.stderr.write(`${where}${which}: ${String(one['reason'])}\n`);
        }
        process.stderr.write(
          `stored ${stored.length} of ${rows.length} verdicts, replaced ${replaced.length}\n`,
        );
      },
    );

  judgment
    .command('get')
    .description('show one stored verdict whole, the model’s reasoning included')
    .argument('<posting-id>', 'the posting whose verdict to show')
    .option('--json', 'print one JSON object holding the verdict, instead of lines')
    .action(async (postingId: string, options: Record<string, boolean | undefined>) => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, judgmentPath(postingId));
      if (options['json']) {
        printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
        return;
      }
      const found = rowsOf(json)[0];
      if (!found) throw new Failure(`no verdict is saved in this account for posting ${postingId}`);

      process.stdout.write(`${String(found['verdict'])}  ${String(found['id'])}\n`);
      process.stdout.write(`judged by ${String(found['judged_by'])} with ${String(found['model'])}`);
      // No dollar figure here: Pinloop is one flat subscription, and a per-run
      // figure would be Pinloop's own cost, not something the person owes
      // (printed-message skill, rule 1).
      process.stdout.write(` on ${String(found['judged_at'] ?? '').slice(0, 10)}\n`);
      const sent = Array.isArray(found['documents_sent'])
        ? (found['documents_sent'] as Record<string, unknown>[])
        : [];
      if (sent.length > 0) {
        process.stdout.write(
          `it read: ${sent.map((one) => String(one['name'])).join(', ')}\n`,
        );
      }
      process.stdout.write(`\n${String(found['reasoning'] ?? '')}\n`);
    });

  judgment
    .command('delete')
    .description('remove the stored verdicts for these postings')
    .argument('<posting-ids...>', 'the postings whose verdicts to remove')
    .option('--json', 'print one JSON object holding what was removed')
    .action(async (postingIds: string[], options: Record<string, boolean | undefined>) => {
      const pass = readPass();
      const wanted = postingIds.flatMap((one) => one.split(',')).filter((one) => one.trim() !== '');
      const query = new URLSearchParams({ ids: wanted.join(',') });

      const { json } = await callAsAccount(pass, `/judgment?${query.toString()}`, {
        method: 'DELETE',
      });
      const removed = rowsOf(json);
      const notFound = Array.isArray(json?.not_found) ? json.not_found : [];

      if (options['json']) {
        printJson({
          rows: removed,
          cursor: cursorOf(json),
          not_found: notFound,
          coverage: json?.coverage,
        });
        return;
      }
      sayCoverage(
        json?.coverage,
        (fraction) => `${fraction} postings you named had a stored verdict, and it was removed.`,
      );
      for (const one of notFound as unknown[]) {
        process.stderr.write(`no verdict is saved in this account for ${named(one)}\n`);
      }
      for (const row of removed) {
        process.stdout.write(`deleted the verdict for ${named(row)}\n`);
      }
    });
}

/**
 * The `pinloop tab` verbs: the account's own named lists of postings.
 *
 * A tab is a list a person makes and fills themselves — the postings worth a
 * real application, the ones to think about later — and it is filled straight
 * out of a pipe. What `pinloop search --json` prints goes into `pinloop tab
 * add <name>` as it stands, and what a tab prints goes on into the next command
 * the same way, because every one of these verbs prints the same JSON object
 * every other verb prints.
 *
 * Anything a person has to read but the next command in a pipe must not swallow
 * goes to standard error: the postings an add did not put in because they were
 * already there or because no posting has that id, and the postings in a tab
 * whose job has since left the corpus. Standard output stays nothing but the
 * answer itself.
 */
function addTabCommands(program: Command): void {
  const tab = program
    .command('tab')
    .description('keep named lists of postings, and fill them from a pipe');

  /** The path of one tab on the server, with the name safely encoded. */
  const tabPath = (name: string) => `/tab/${encodeURIComponent(name)}`;

  /** The ids in a group the server named, as plain text lines for a person. */
  function reportGroup(what: string, ids: unknown): void {
    const group = Array.isArray(ids) ? ids : [];
    for (const id of group) process.stderr.write(`${what} ${String(id)}\n`);
  }

  /**
   * The postings an add is putting in the tab: the ids typed on the command
   * line, or, when none were typed, the ids of the rows piped in. That is the
   * pipe this whole verb exists for — a search prints postings, and those
   * postings go into the tab without anybody copying an id by hand.
   */
  async function idsToAdd(name: string, given: string[]): Promise<string[]> {
    return typedIdsOrPipedIn(`pinloop tab add ${name}`, given);
  }

  /** One tab, printed the way a person reads it: its name, size and description. */
  function printTab(row: Record<string, unknown>): void {
    if (alignedRows) {
      process.stdout.write(`${tabRow(row, screen.colours, terminalWidth())}\n`);
      return;
    }
    const items = Number(row['items'] ?? 0);
    const description = String(row['description'] ?? '');
    process.stdout.write(
      `${String(row['name'])}  ${items} posting${items === 1 ? '' : 's'}` +
        `${description === '' ? '' : `  ${description}`}\n`,
    );
  }

  tab
    .command('create')
    .description('make one named list of postings')
    .argument('<name>', 'the tab name: lowercase letters, digits and dashes')
    .option('--description <text>', 'what this tab is for')
    .option('--json', 'print one JSON object holding the new tab, instead of a line')
    .action(async (name: string, options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();
      const body: Record<string, unknown> = { name };
      const description = textOption(options['description']);
      if (description !== undefined) body['description'] = description;

      const { json } = await callAsAccount(pass, '/tab', { method: 'POST', body });
      if (options['json']) {
        printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
        return;
      }
      process.stdout.write(`created your '${name}' tab\n`);
    });

  tab
    .command('list')
    .description('show every tab this account has, with how many postings each holds')
    .option('--limit <n>', 'how many tabs to show')
    .option('--cursor <cursor>', 'the cursor a previous listing handed back')
    .option('--json', 'print one JSON object holding the tabs, instead of lines')
    .option(
      '--all',
      'follow every page and print them all at once, instead of one page and a cursor',
    )
    .action(async (options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();
      nowDoing('reading tabs');
      refuseAllWithLimit(options);
      const query = queryFrom(options, [
        ['limit', 'limit'],
        ['cursor', 'cursor'],
      ]);

      let tabs: Record<string, unknown>[];
      let cursor: unknown = null;
      if (options['all'] === true) {
        tabs = (
          await everyPageOf(pass, 'pinloop tab list', '/tab', query, textOption(options['cursor']))
        ).rows;
      } else {
        const { json } = await callAsAccount(pass, `/tab?${query.toString()}`);
        tabs = rowsOf(json);
        cursor = cursorOf(json);
      }

      if (options['json']) {
        printJson({ rows: tabs, cursor });
        return;
      }
      if (tabs.length === 0) {
        process.stdout.write('this account currently has no tabs\n');
        return;
      }
      for (const one of tabs) printTab(one);
    });

  tab
    .command('get')
    .description('show the postings in one tab as they are in the corpus right now')
    .argument('<name>', 'the tab to show')
    .option('--sort <added|posted>', 'order by when it was added, or by the date the job was posted')
    .option('--order <asc|desc>', 'newest first (desc, the default) or oldest first (asc)')
    .option('--limit <n>', 'how many postings to show')
    .option('--cursor <cursor>', 'the cursor a previous page handed back')
    .option('--json', 'print one JSON object holding the rows, instead of cards')
    .option(
      '--all',
      'follow every page and print them all at once, instead of one page and a cursor',
    )
    .action(async (name: string, options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();
      nowDoing('reading the tab');
      refuseAllWithLimit(options);
      const query = queryFrom(options, [
        ['sort', 'sort'],
        ['order', 'order'],
        ['limit', 'limit'],
        ['cursor', 'cursor'],
      ]);

      let rows: Record<string, unknown>[];
      let cursor: unknown = null;
      let gone: unknown[];
      /** How many items on the pages read are still in the corpus, out of them all. */
      let held: Coverage | undefined;

      if (options['all'] === true) {
        const every = await everyPageOf(
          pass,
          'pinloop tab get',
          tabPath(name),
          query,
          textOption(options['cursor']),
        );
        rows = every.rows;
        // A posting that has left the corpus is reported page by page, so
        // following every page has to gather every page's report rather than
        // keeping only the first one's.
        gone = every.bodies.flatMap((body) =>
          Array.isArray(body?.no_longer_present) ? body.no_longer_present : [],
        );
        // Each page counts its own items, so following every page adds the
        // pages' counts together rather than reporting the first page's.
        held = every.bodies.reduce<Coverage | undefined>((running, body) => {
          const page = coverageIn(body?.coverage);
          if (page === undefined) return running;
          return running === undefined
            ? page
            : coverageOf(running.covered + page.covered, running.total + page.total);
        }, undefined);
      } else {
        const { json } = await callAsAccount(pass, `${tabPath(name)}?${query.toString()}`);
        rows = rowsOf(json);
        cursor = cursorOf(json);
        gone = Array.isArray(json?.no_longer_present) ? json.no_longer_present : [];
        held = coverageIn(json?.coverage);
      }

      if (options['json']) {
        printJson({ rows, cursor, no_longer_present: gone, coverage: held });
        return;
      }

      // A posting that has left the corpus is said out loud rather than quietly
      // left out, and it is said on standard error so the next command in a pipe
      // never sees it. How many of the tab's postings are still there is said
      // first; the item id comes with each one that is gone, because that is what
      // "pinloop tab remove" takes to get rid of it.
      sayCoverage(held, (fraction) => `${fraction} postings in this tab are still in the corpus.`);
      for (const one of gone as Record<string, unknown>[]) {
        process.stderr.write(
          `no longer in the corpus: posting ${String(one['posting_id'])} ` +
            `(remove it with item id ${String(one['item_id'])})\n`,
        );
      }

      if (rows.length === 0) {
        process.stdout.write('this tab holds no postings that are still in the corpus\n');
        return;
      }
      // The item id rides on every card, because it is the handle
      // "pinloop tab remove" takes and the plain view is where a person
      // would otherwise have no way to see one.
      for (const card of rows) {
        printCard(card as unknown as Card, [
          `item ${String((card as Record<string, unknown>)['item_id'])}`,
        ]);
      }
    });

  tab
    .command('add')
    .description('put postings in one tab, by id or from the JSON piped in')
    .argument('<name>', 'the tab to put them in')
    .argument('[ids...]', 'the posting ids to add; with none, they are read from what is piped in')
    .option('--json', 'print one JSON object holding what was added, instead of a line')
    .action(
      async (name: string, ids: string[], options: Record<string, string | boolean | undefined>) => {
        const pass = readPass();
        const wanted = await idsToAdd(name, ids);

        const { json } = await callAsAccount(pass, `${tabPath(name)}/add`, {
          method: 'POST',
          body: { ids: wanted },
        });
        const added = rowsOf(json);
        const already = Array.isArray(json?.already_present) ? json.already_present : [];
        const unknown = Array.isArray(json?.unknown) ? json.unknown : [];

        if (options['json']) {
          printJson({
            rows: added,
            cursor: cursorOf(json),
            already_present: already,
            unknown,
            coverage: json?.coverage,
          });
          return;
        }

        // The two groups nothing was written for go to standard error, the same
        // way filter's report of what it dropped does, and how many postings did
        // go in is said before either of them.
        sayCoverage(
          json?.coverage,
          (fraction) => `${fraction} postings you named were put in your '${name}' tab.`,
        );
        reportGroup(`already in your '${name}' tab:`, already);
        reportGroup('no posting has this id:', unknown);
        process.stdout.write(
          `added ${added.length} posting${added.length === 1 ? '' : 's'} to your '${name}' tab\n`,
        );
      },
    );

  tab
    .command('remove')
    .description('take postings out of one tab, by the item ids the tab printed')
    .argument('<name>', 'the tab to take them out of')
    .argument('<item-ids...>', 'the item ids to remove, as "pinloop tab get" prints them')
    .option('--json', 'print one JSON object holding what was taken out, instead of a line')
    .action(
      async (
        name: string,
        itemIds: string[],
        options: Record<string, string | boolean | undefined>,
      ) => {
        const pass = readPass();
        const wanted = itemIds.flatMap((one) => one.split(',')).filter((one) => one.trim() !== '');

        const { json } = await callAsAccount(pass, `${tabPath(name)}/remove`, {
          method: 'POST',
          body: { item_ids: wanted },
        });
        const removed = rowsOf(json);
        const notFound = Array.isArray(json?.not_found) ? json.not_found : [];

        if (options['json']) {
          printJson({
            rows: removed,
            cursor: cursorOf(json),
            not_found: notFound,
            coverage: json?.coverage,
          });
          return;
        }
        sayCoverage(
          json?.coverage,
          (fraction) => `${fraction} items you named were taken out of your '${name}' tab.`,
        );
        reportGroup(`not in your '${name}' tab:`, notFound);
        process.stdout.write(
          `removed ${removed.length} posting${removed.length === 1 ? '' : 's'} from your '${name}' tab\n`,
        );
      },
    );

  tab
    .command('rename')
    .description('give one tab a different name, keeping everything in it')
    .argument('<name>', 'the tab to rename')
    .argument('<new-name>', 'what to call it instead')
    .option('--json', 'print one JSON object holding the renamed tab, instead of a line')
    .action(
      async (name: string, to: string, options: Record<string, string | boolean | undefined>) => {
        const pass = readPass();
        const { json } = await callAsAccount(pass, `${tabPath(name)}/rename`, {
          method: 'POST',
          body: { to },
        });
        if (options['json']) {
          printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
          return;
        }
        process.stdout.write(`renamed your '${name}' tab to '${to}'\n`);
      },
    );

  tab
    .command('delete')
    .description('remove one tab and everything in it')
    .argument('<name>', 'the tab to remove')
    .option('--json', 'print one JSON object holding the tab that was removed')
    .action(async (name: string, options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, tabPath(name), { method: 'DELETE' });
      const removed = rowsOf(json)[0] ?? {};
      if (options['json']) {
        printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
        return;
      }
      const items = Number(removed['items'] ?? 0);
      process.stdout.write(
        `deleted your '${name}' tab, and the ${items} posting${items === 1 ? '' : 's'} it held\n`,
      );
    });
}

/**
 * The `pinloop routine` verbs: a pipeline of commands, stored under a name and
 * run again whenever it is wanted.
 *
 * A routine holds a list of steps, and each step names one of the commands a
 * routine may call — search, list, fetch and filter — together with the
 * arguments that command takes. Running it hands what each step produced to the
 * step after it, which is what typing those commands into a pipe does by hand.
 *
 * A run plugs into pipes at both ends. Postings piped into `routine run
 * --within -` become the set its first step works inside, and what a run prints
 * is the same JSON every other verb prints, so the next command in the pipe
 * reads it without knowing a routine was involved. The report of what each step
 * received, passed on and dropped goes to standard error, exactly as filter's
 * drop report does, so standard output stays nothing but postings.
 */
function addRoutineCommands(program: Command): void {
  const routine = program
    .command('routine')
    .description('store a pipeline of commands under a name, and run it again');

  /** The path of one routine on the server, with the name safely encoded. */
  const routinePath = (name: string) => `/routine/${encodeURIComponent(name)}`;

  /**
   * The steps a put is storing: the JSON given on the command line, or the JSON
   * piped in, read the same way `profile put` reads a document. They are parsed
   * here rather than sent as they arrived so that a typo in the JSON is a plain
   * message from this command rather than a refusal from the server.
   */
  async function stepsToStore(
    name: string,
    options: Record<string, string | boolean | undefined>,
  ): Promise<unknown> {
    const given = options['steps'];
    let text: string;
    if (typeof given === 'string' && given.trim() !== '') {
      text = given;
    } else if (nothingWasPipedIn()) {
      throw new Failure(
        `pinloop routine put ${name} takes its steps either from --steps or from ` +
          `standard input, and it was given neither. For example:\n` +
          `  pinloop routine put ${name} --steps '[{"command":"list",` +
          `"args":{"employment":"INTERN"}},{"command":"filter",` +
          `"args":{"posted_after":"2026-06-01"}}]'\n`,
      );
    } else {
      text = await readStandardInput();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Failure(
        `the steps of a routine are a JSON list, and this could not be read as JSON ` +
          `(${error instanceof Error ? error.message : String(error)})`,
      );
    }
    if (!Array.isArray(parsed)) {
      throw new Failure(
        'the steps of a routine are a JSON list of steps, and what was given is not a list',
      );
    }
    return parsed;
  }

  /** One routine printed the way a person reads it: what it is, then its steps. */
  function printRoutine(row: Record<string, unknown>): void {
    const description = String(row['description'] ?? '');
    process.stdout.write(`${String(row['name'])}\n`);
    if (description !== '') process.stdout.write(`${description}\n`);
    const steps = Array.isArray(row['steps']) ? (row['steps'] as Record<string, unknown>[]) : [];
    steps.forEach((step, index) => {
      const args = (step['args'] ?? {}) as Record<string, unknown>;
      const written = Object.entries(args)
        .map(([argument, value]) => `${argument}=${String(value)}`)
        .join(' ');
      process.stdout.write(`  ${index + 1}. ${String(step['command'])} ${written}\n`.trimEnd() + '\n');
    });
  }

  /**
   * The per-step report of a run, written where the next command cannot see it.
   *
   * Every step's line leads with how many of the postings handed to that step
   * came out of it, and the lines naming the postings that did not come out, and
   * why, follow underneath. A first step that was handed nothing has no fraction
   * to state, because nothing of anybody's could have been left behind, so that
   * line says how many postings the step produced instead.
   */
  function reportSteps(json: any): void {
    const steps = Array.isArray(json?.steps) ? (json.steps as Record<string, unknown>[]) : [];
    for (const [index, step] of steps.entries()) {
      const outOfIn = fractionIn(step['coverage']);
      const out = Number(step['rows_out']);
      process.stderr.write(
        `step ${index + 1} (${String(step['command'])}): ` +
          (outOfIn === undefined
            ? `${out} posting${out === 1 ? '' : 's'} came out, none were handed in\n`
            : `${outOfIn} postings handed in came out\n`),
      );
      // Only there when the step named the postings it looks inside and the run
      // handed it a set of postings as well.
      const note = step['note'];
      if (typeof note === 'string' && note !== '') {
        process.stderr.write(`  note: ${note}\n`);
      }
      // A judge step that read verdicts out of the table rather than buying them
      // says how many, because that is the difference between a run that cost
      // money and a run that cost nothing. A step that reused none says nothing,
      // so the line means something when it does appear.
      const reused = Number(step['reused'] ?? 0);
      if (reused > 0) {
        process.stderr.write(`  ${reused} reused the judgment this account already had\n`);
      }
      // A tab step hands every posting it was given straight on, so its own
      // fraction above is always the whole of it. How many were really written
      // into the tab is the number that can be short, and it is said here.
      const intoTab = fractionIn(step['tab_coverage']);
      if (intoTab !== undefined) {
        process.stderr.write(`  ${intoTab} postings handed in were put in the tab\n`);
      }
      // Without this line a tab step handed three postings it already held
      // printed "0/3 postings handed in were put in the tab" and stopped, which
      // reads exactly like a run that failed to store anything (Andrew, at his
      // own terminal, 2026-08-20). A step that found none of them already there
      // says nothing, so the line means something when it does appear.
      const alreadyInTab = Number(step['already_present'] ?? 0);
      if (alreadyInTab > 0) {
        process.stderr.write(
          `  ${alreadyInTab} ${alreadyInTab === 1 ? 'was' : 'were'} already in the tab, ` +
            `so nothing was written for ${alreadyInTab === 1 ? 'it' : 'them'}\n`,
        );
      }
      const unknown = Array.isArray(step['unknown']) ? (step['unknown'] as unknown[]) : [];
      for (const id of unknown) {
        process.stderr.write(`  no posting has this id: ${String(id)}\n`);
      }
      const dropped = Array.isArray(step['dropped'])
        ? (step['dropped'] as Record<string, unknown>[])
        : [];
      for (const drop of dropped) {
        process.stderr.write(`  dropped ${String(drop['id'])}: ${String(drop['reason'])}\n`);
      }
    }
  }

  routine
    .command('put')
    .description('store one routine, replacing whatever that name held before')
    .argument('<name>', 'the routine name: lowercase letters, digits and dashes')
    .option('--description <text>', 'what this routine is for')
    .option('--steps <json>', 'the steps as a JSON list, instead of standard input')
    .option('--json', 'print the stored routine, and the version it replaced, as JSON')
    .option('--confirm <token>', CONFIRM_OPTION_HELP)
    .action(async (name: string, options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();
      const steps = await stepsToStore(name, options);
      const body: Record<string, unknown> = { steps };
      const description = textOption(options['description']);
      if (description !== undefined) body['description'] = description;
      const confirming = textOption(options['confirm']);
      if (confirming !== undefined) body['confirm'] = confirming;

      const { json } = await callAsAccount(pass, routinePath(name), { method: 'POST', body });
      // Nothing was stored: a schedule or a watch already fires this routine and
      // the version being stored can judge, so the person is asked first.
      if (stoppedToAsk(json)) {
        // The steps go into the reproduced next command only when they were
        // given directly as --steps: the piped form has no pipe to read from
        // a second time (ConfirmGate's own doc comment above).
        const stepsGiven = textOption(options['steps']);
        reportConfirmation(json, options['json'] === true, {
          kind: 'routine-put',
          name,
          description,
          steps: stepsGiven,
        });
        return;
      }
      if (options['json']) {
        printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
        return;
      }
      const stored = rowsOf(json)[0] ?? {};
      const count = Array.isArray(stored['steps'])
        ? (stored['steps'] as unknown[]).length
        : (steps as unknown[]).length;
      process.stdout.write(`stored your '${name}' routine (${count} step${count === 1 ? '' : 's'})\n`);
      // The version a replace overwrote is what undoes the replace, so a person
      // who did not mean to replace anything is told it happened, and told where
      // the old version is. Leads with the verb that says what the system did,
      // not with the circumstance that led to it (printed-message skill, rule 5).
      if (stored['replaced']) {
        process.stderr.write(
          `replaced the routine that was connected to '${name}'. Run the same command ` +
            `with --json to see the version that was overwritten.\n`,
        );
      }
    });

  routine
    .command('get')
    .description('show one routine and its steps')
    .argument('<name>', 'the routine to show')
    .option('--json', 'print one JSON object holding the routine, instead of lines')
    .action(async (name: string, options: Record<string, boolean | undefined>) => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, routinePath(name));
      if (options['json']) {
        printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
        return;
      }
      const found = rowsOf(json)[0];
      if (!found) throw new Failure(`no routine named '${name}' is stored in this account`);
      printRoutine(found);
    });

  routine
    .command('list')
    .description('show every routine this account has stored')
    .option('--json', 'print one JSON object holding the routines, instead of lines')
    .action(async (options: Record<string, boolean | undefined>) => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, '/routine');
      const routines = rowsOf(json);
      if (options['json']) {
        printJson({ rows: routines, cursor: cursorOf(json) });
        return;
      }
      if (routines.length === 0) {
        process.stdout.write('this account currently has no stored routines\n');
        return;
      }
      for (const one of routines) {
        const description = String(one['description'] ?? '');
        process.stdout.write(
          `${String(one['name'])}${description === '' ? '' : `  ${description}`}\n`,
        );
      }
    });

  routine
    .command('delete')
    .description('remove one routine')
    .argument('<name>', 'the routine to remove')
    .option('--json', 'print the removed routine as JSON, so the delete can be undone')
    .action(async (name: string, options: Record<string, boolean | undefined>) => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, routinePath(name), { method: 'DELETE' });
      if (options['json']) {
        printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
        return;
      }
      process.stdout.write(`deleted your '${name}' routine\n`);
    });

  routine
    .command('run')
    .description('run one routine’s steps in order and print what the last step produced')
    .argument('<name>', 'the routine to run')
    .option(
      '--within <ids>',
      'the postings the first step works inside: their ids separated by commas, or - to read ' +
        `them from the JSON piped in; ${LARGE_SETS_MUST_BE_PIPED} (the - form)`,
    )
    .option('--json', 'print one JSON object holding the rows, instead of cards')
    .option('--confirm <token>', CONFIRM_OPTION_HELP)
    .action(async (name: string, options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();
      const body: Record<string, unknown> = {};
      const within = options['within'];
      if (typeof within === 'string' && within !== '') {
        body['within'] = await withinSet(within, 'pinloop routine run');
      }
      const confirming = textOption(options['confirm']);
      if (confirming !== undefined) body['confirm'] = confirming;

      // A run of a stored sequence can take minutes, so it asks the server to
      // say which step it has reached. A person watching reads that on the one
      // line already on the screen. A coding agent gets one plain line, once,
      // the moment the first step starts — which is the first moment anything
      // knows how many steps this routine has.
      nowDoing(`running your '${name}' routine`);
      let saidHowLongThisTakes = false;
      const { json } = await callAsAccount(pass, `${routinePath(name)}/run`, {
        method: 'POST',
        body,
        onLine: (line) => {
          let event: ProgressEvent | undefined;
          try {
            event = JSON.parse(line) as ProgressEvent;
          } catch {
            return;
          }
          if (event?.kind !== 'step-started') return;
          if (screen.mode === 'person') {
            screen.relabel(`running your '${name}' routine, step ${event.step} of ${event.of}`);
            return;
          }
          if (saidHowLongThisTakes) return;
          saidHowLongThisTakes = true;
          process.stderr.write(
            `running your '${name}' routine, ${event.of} step${event.of === 1 ? '' : 's'}, ` +
              `this can take a few minutes\n`,
          );
        },
      });
      screen.finish();
      // A run that failed after its first progress line had gone out says so in
      // its last line, because the status number at the top of the answer went
      // out as 200 long before anything went wrong.
      if ((json as { kind?: unknown } | undefined)?.kind === 'error') {
        throw new Failure(
          String((json as { message?: unknown }).message ?? `the run of your '${name}' routine failed`),
        );
      }
      // The run stopped at a judge step so the person can be asked first. It
      // judged nothing and spent nothing (specs/feature-judge-confirmation.md).
      if (stoppedToAsk(json)) {
        // The resolved set of ids, not the raw `--within` text: when the
        // person typed `-` to read them from a pipe, that pipe is gone by the
        // time this line is read, so the reproduced command carries the ids
        // themselves instead (ConfirmGate's own doc comment above).
        const resolvedWithin = typeof body['within'] === 'string' ? body['within'] : undefined;
        reportConfirmation(json, options['json'] === true, {
          kind: 'routine-run',
          name,
          within: resolvedWithin,
        });
        return;
      }
      const rows = rowsOf(json);

      // What each step did goes to standard error, so that standard output
      // carries nothing but the postings the run produced.
      reportSteps(json);

      if (options['json']) {
        printJson({ rows, cursor: cursorOf(json) });
        return;
      }
      if (rows.length === 0) {
        process.stdout.write(`your '${name}' routine produced no postings\n`);
        return;
      }
      for (const card of rows) printCard(card as unknown as Card);
    });

  routine
    .command('results')
    .description('show what the most recent run of one routine produced, read fresh')
    .argument('<name>', 'the routine whose results to show')
    .option('--json', 'print one JSON object holding the rows, instead of records')
    .action(async (name: string, options: Record<string, boolean | undefined>) => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, `${routinePath(name)}/results`);
      const rows = rowsOf(json);
      const ranAt = json?.ran_at;

      if (options['json']) {
        printJson({
          rows,
          cursor: cursorOf(json),
          ran_at: ranAt ?? null,
          coverage: json?.coverage,
        });
        return;
      }
      if (!ranAt) {
        process.stdout.write(`your '${name}' routine currently has no stored results\n`);
        return;
      }
      // A posting that run produced can leave the corpus before anybody reads
      // the results back, so how many are still there is said before the cards.
      sayCoverage(
        json?.coverage,
        (fraction) =>
          `${fraction} postings from that run of your '${name}' routine are still in the corpus.`,
      );
      process.stderr.write(`from your '${name}' routine's run at ${String(ranAt)}\n`);
      // Results come back as complete stored records, but a person scanning
      // them wants the same short card search and list print. The whole
      // record stays available behind --json.
      for (const row of rows) {
        const record = row as Record<string, unknown>;
        printCard({
          title: record['title'],
          company: record['company'],
          locations: record['locations'],
          posted_at: record['posted_at'],
          url: record['posting_url'],
        } as unknown as Card);
      }
    });
}

/**
 * The `pinloop schedule` verbs: the rows that make a stored routine run without
 * anybody typing anything.
 *
 * A schedule says: run this routine every N hours. It can also say when the
 * first run happens, which is how "every morning at eight" is written — every 24
 * hours, first run tomorrow at 08:00. Whatever time of day the first run lands
 * on is the time of day every later run lands on, however late any one run turns
 * out to be.
 *
 * Nothing here fires anything. These four verbs write and read the rows; the
 * server's own clock reads them a minute at a time and runs what is due. What
 * the overnight run produced is read with `pinloop routine results`, and how the
 * firing itself went is on the schedule, which is what `get` and `list` print.
 */
function addScheduleCommands(program: Command): void {
  const schedule = program
    .command('schedule')
    .description('run a stored routine every so many hours, with nobody at the keyboard');

  /** The path of one schedule on the server, with the name safely encoded. */
  const schedulePath = (name: string) => `/schedule/${encodeURIComponent(name)}`;

  /**
   * How one firing ended, in the one line a person reads.
   *
   * The line says how many of the routine's steps ran before it says anything
   * about how the firing ended, because a firing that was refused after four of
   * its five steps ran is a different thing from one that never started a step.
   * A firing written down before this product counted its steps carries no such
   * numbers, and its line simply leaves them out.
   */
  function firingLine(row: Record<string, unknown>): string {
    const startedAt = row['last_firing_started_at'];
    if (typeof startedAt !== 'string' || startedAt === '') return 'has not run yet';
    const outcome = row['last_firing_outcome'] as Record<string, unknown> | null;
    if (outcome === null || outcome === undefined) {
      // The start was written down and the ending never was. Saying so plainly
      // is the whole point of keeping the two apart.
      return `started ${startedAt} and never finished`;
    }
    const stepsOf = fractionIn(outcome['coverage']);
    const steps = stepsOf === undefined ? '' : `, ${stepsOf} steps ran`;
    if (outcome['ok'] === true) {
      const rows = Number(outcome['rows'] ?? 0);
      return `ran ${startedAt}${steps}, ${rows} posting${rows === 1 ? '' : 's'}`;
    }
    return `ran ${startedAt}${steps}, and was refused: ${String(outcome['error'] ?? '')}`;
  }

  /** One schedule printed the way a person reads it. */
  function printSchedule(row: Record<string, unknown>): void {
    const hours = Number(row['every_hours']);
    process.stdout.write(`your '${String(row['name'])}' schedule\n`);
    process.stdout.write(
      `  runs your '${String(row['routine'])}' routine every ${hours} hour${hours === 1 ? '' : 's'}\n`,
    );
    process.stdout.write(`  next run ${String(row['next_due_at'])}\n`);
    process.stdout.write(`  ${firingLine(row)}\n`);
  }

  schedule
    .command('put')
    .description('store one schedule, replacing whatever that name held before')
    .argument('<name>', 'the schedule name: lowercase letters, digits and dashes')
    .requiredOption('--routine <name>', 'the routine this schedule runs')
    .requiredOption('--every-hours <hours>', 'how many hours between runs, from 1 to 168')
    .option(
      '--first-due-at <time>',
      'when the first run happens, for example 2026-08-16T08:00:00Z; ' +
        'the time of day it lands on is the time of day every later run lands on',
    )
    .option('--json', 'print the stored schedule, and the version it replaced, as JSON')
    .option('--confirm <token>', CONFIRM_OPTION_HELP)
    .action(async (name: string, options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();
      const routineName = textOption(options['routine']) ?? '';
      const body: Record<string, unknown> = {
        routine: routineName,
        every_hours: textOption(options['everyHours']),
      };
      const firstDueAt = textOption(options['firstDueAt']);
      if (firstDueAt !== undefined) body['first_due_at'] = firstDueAt;
      const confirming = textOption(options['confirm']);
      if (confirming !== undefined) body['confirm'] = confirming;

      const { json } = await callAsAccount(pass, schedulePath(name), { method: 'POST', body });
      // No row was written: the routine this schedule names reaches a judge
      // step, so the person is asked before it starts firing on its own.
      if (stoppedToAsk(json)) {
        reportConfirmation(json, options['json'] === true, {
          kind: 'schedule-put',
          routineName,
          name,
          everyHours: textOption(options['everyHours']) ?? '',
          firstDueAt,
        });
        return;
      }
      if (options['json']) {
        printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
        return;
      }
      const stored = rowsOf(json)[0] ?? {};
      const hours = Number(stored['every_hours']);
      process.stdout.write(
        `stored your '${name}' schedule: runs your '${String(stored['routine'])}' routine every ` +
          `${hours} hour${hours === 1 ? '' : 's'}, first run ${String(stored['next_due_at'])}\n`,
      );
      // The version a replace overwrote is what undoes the replace, so a person
      // who did not mean to replace anything is told it happened, and told where
      // the old version is.
      if (stored['replaced']) {
        process.stderr.write(
          `replaced the schedule that was connected to '${name}'. Run the same command ` +
            `with --json to see the version that was overwritten.\n`,
        );
      }
    });

  schedule
    .command('get')
    .description('show one schedule, when it next runs, and how its last run went')
    .argument('<name>', 'the schedule to show')
    .option('--json', 'print one JSON object holding the schedule, instead of lines')
    .action(async (name: string, options: Record<string, boolean | undefined>) => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, schedulePath(name));
      if (options['json']) {
        printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
        return;
      }
      const found = rowsOf(json)[0];
      if (!found) throw new Failure('no schedule of that name is stored in this account');
      printSchedule(found);
    });

  schedule
    .command('list')
    .description('show every schedule this account has stored')
    .option('--json', 'print one JSON object holding the schedules, instead of lines')
    .action(async (options: Record<string, boolean | undefined>) => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, '/schedule');
      const schedules = rowsOf(json);
      if (options['json']) {
        printJson({ rows: schedules, cursor: cursorOf(json) });
        return;
      }
      if (schedules.length === 0) {
        process.stdout.write('this account currently has no stored schedules\n');
        return;
      }
      for (const one of schedules) printSchedule(one);
    });

  schedule
    .command('delete')
    .description('remove one schedule, so the routine it runs stops running by itself')
    .argument('<name>', 'the schedule to remove')
    .option('--json', 'print the removed schedule as JSON, so the delete can be undone')
    .action(async (name: string, options: Record<string, boolean | undefined>) => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, schedulePath(name), { method: 'DELETE' });
      if (options['json']) {
        printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
        return;
      }
      process.stdout.write(`deleted your '${name}' schedule\n`);
    });
}

/**
 * The `pinloop watch` verbs: the rows that run a stored routine over the
 * postings that arrived since the last time that row looked.
 *
 * A watch says: run this routine every hour, over only the postings that were
 * written into our database since I last looked. It takes no cadence at all. A
 * person who wants a routine on a cadence of their own stores a schedule
 * instead, and typing a cadence flag here is refused on this machine before any
 * request leaves it, with the schedule command spelled out in the refusal.
 *
 * Nothing here fires anything. These four verbs write and read the rows; the
 * server's own clock reads them a minute at a time and runs what is due. What
 * the latest firing produced is read with `pinloop routine results`, what has
 * collected over many firings is read with `pinloop tab get`, and how the firing
 * itself went is on the watch, which is what `get` and `list` print.
 */
function addWatchCommands(program: Command): void {
  const watch = program
    .command('watch')
    .description('run a stored routine every hour over the postings that just arrived');

  /** The path of one watch on the server, with the name safely encoded. */
  const watchPath = (name: string) => `/watch/${encodeURIComponent(name)}`;

  /**
   * How one firing ended, in the one line a person reads.
   *
   * The line says how many postings arrived in the stretch of time the firing
   * covered, how many of them the routine's first step handed on, and how many
   * of the routine's steps ran out of how many it has, before it says anything
   * about how the firing ended. An hour that brought forty postings and matched
   * none of them reads nothing like an hour that brought nothing at all, and a
   * firing refused after four of its five steps ran is a different thing from one
   * that never started a step. A firing written down before this product counted
   * its steps carries no such fraction, and its line simply leaves it out.
   */
  function firingLine(row: Record<string, unknown>): string {
    const startedAt = row['last_firing_started_at'];
    if (typeof startedAt !== 'string' || startedAt === '') return 'not fired yet';
    const outcome = row['last_firing_outcome'] as Record<string, unknown> | null;
    if (outcome === null || outcome === undefined) {
      // The start was written down and the ending never was. Saying so plainly
      // is the whole point of keeping the two apart.
      return `started ${startedAt} and has not finished`;
    }
    const arrived = withSeparators(Number(outcome['arrived'] ?? 0));
    const matched = withSeparators(Number(outcome['matched'] ?? 0));
    const stepsOf = fractionIn(outcome['coverage']);
    const steps = stepsOf === undefined ? '' : `, ${stepsOf} steps ran`;
    const counts = `${arrived} arrived, ${matched} matched${steps}`;
    if (outcome['ok'] === true) return `${counts}, completed`;
    return `${counts}, refused: ${String(outcome['error'] ?? '')}`;
  }

  /** One watch printed the way a person reads it. */
  function printWatch(row: Record<string, unknown>): void {
    process.stdout.write(`your '${String(row['name'])}' watch\n`);
    process.stdout.write(`  runs your '${String(row['routine'])}' routine every hour\n`);
    process.stdout.write(`  next run ${String(row['next_due_at'])}\n`);
    // The moment the watch has already looked up to. Without it nobody can tell
    // what the next firing is going to cover.
    process.stdout.write(`  watching from ${String(row['arrival_cutoff'])}\n`);
    process.stdout.write(`  ${firingLine(row)}\n`);
  }

  /**
   * What a person is told when they type a flag that sets a cadence.
   *
   * A watch checks every hour and there is nothing to choose, so rather than
   * ignoring the flag or storing a watch that does not do what was typed, the
   * command refuses here, on this machine, and points at the command that does
   * take a cadence, written out with the names the person just typed in it.
   */
  function cadenceRefusal(name: string, routine: string): string {
    return (
      'a watch checks every hour and takes no cadence. To run a routine on a cadence ' +
      `of your own, store a schedule instead: pinloop schedule put ${name} ` +
      `--routine ${routine} --every-hours <hours>`
    );
  }

  watch
    .command('put')
    .description('store one watch, replacing whatever that name held before')
    .argument('<name>', 'the watch name: lowercase letters, digits and dashes')
    .requiredOption(
      '--routine <name>',
      'the routine this watch runs, whose first step must be a search or a list. ' +
        'A tab is the only place where the finds of many firings collect, so a routine ' +
        'whose last step adds to a tab is what fills one overnight',
    )
    // The two flags a schedule takes. They are declared so that typing one here
    // is refused in words that say what to do instead, rather than with
    // commander's own "unknown option", and they are kept out of the help text
    // because they are not things a watch has.
    .addOption(
      new Option('--every-hours <hours>', 'a watch has no cadence; store a schedule instead')
        .hideHelp(),
    )
    .addOption(
      new Option('--first-due-at <time>', 'a watch has no first run time; store a schedule instead')
        .hideHelp(),
    )
    .option('--json', 'print the stored watch, and the version it replaced, as JSON')
    .option('--confirm <token>', CONFIRM_OPTION_HELP)
    .action(async (name: string, options: Record<string, string | boolean | undefined>) => {
      const routine = textOption(options['routine']) ?? '';
      if (options['everyHours'] !== undefined || options['firstDueAt'] !== undefined) {
        throw new Failure(cadenceRefusal(name, routine));
      }

      const pass = readPass();
      const confirming = textOption(options['confirm']);
      const { json } = await callAsAccount(pass, watchPath(name), {
        method: 'POST',
        body: { routine, ...(confirming === undefined ? {} : { confirm: confirming }) },
      });
      // No row was written: the routine this watch names reaches a judge step,
      // so the person is asked before it starts looking every hour on its own.
      if (stoppedToAsk(json)) {
        reportConfirmation(json, options['json'] === true, {
          kind: 'watch-put',
          routineName: routine,
          name,
        });
        return;
      }
      if (options['json']) {
        printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
        return;
      }
      const stored = rowsOf(json)[0] ?? {};
      process.stdout.write(
        `stored your '${name}' watch: runs your '${String(stored['routine'])}' routine every hour ` +
          `over the postings that arrive after ${String(stored['arrival_cutoff'])}, first run ` +
          `${String(stored['next_due_at'])}\n`,
      );
      // The version a replace overwrote is what undoes the replace, so a person
      // who did not mean to replace anything is told it happened, and told where
      // the old version is.
      if (stored['replaced']) {
        process.stderr.write(
          `replaced the watch that was connected to '${name}'. Run the same command ` +
            `with --json to see the version that was overwritten.\n`,
        );
      }
    });

  watch
    .command('get')
    .description('show one watch, when it next runs, and how its last firing went')
    .argument('<name>', 'the watch to show')
    .option('--json', 'print one JSON object holding the watch, instead of lines')
    .action(async (name: string, options: Record<string, boolean | undefined>) => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, watchPath(name));
      if (options['json']) {
        printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
        return;
      }
      const found = rowsOf(json)[0];
      if (!found) throw new Failure('no watch of that name is stored in this account');
      printWatch(found);
    });

  watch
    .command('list')
    .description('show every watch this account has stored')
    .option('--json', 'print one JSON object holding the watches, instead of lines')
    .action(async (options: Record<string, boolean | undefined>) => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, '/watch');
      const watches = rowsOf(json);
      if (options['json']) {
        printJson({ rows: watches, cursor: cursorOf(json) });
        return;
      }
      if (watches.length === 0) {
        process.stdout.write('this account currently has no stored watches\n');
        return;
      }
      for (const one of watches) printWatch(one);
    });

  watch
    .command('delete')
    .description('remove one watch, so the routine it runs stops running by itself')
    .argument('<name>', 'the watch to remove')
    .option('--json', 'print the removed watch as JSON, so the delete can be undone')
    .action(async (name: string, options: Record<string, boolean | undefined>) => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, watchPath(name), { method: 'DELETE' });
      if (options['json']) {
        printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
        return;
      }
      process.stdout.write(`deleted your '${name}' watch\n`);
    });
}

/**
 * The `pinloop profile` verbs: the documents Pinloop reads when it judges a
 * posting for this account.
 *
 * A document is stored under a name the person chooses, from a file on their
 * machine or from whatever is piped into the command, and it comes back out as
 * exactly the characters that went in. `get <name>` writes those characters to
 * standard output and adds nothing at all — no heading, no extra line break —
 * because that is what makes it possible to store a document, read it back, and
 * compare the two byte for byte.
 */
function addProfileCommands(program: Command): void {
  const profile = program
    .command('profile')
    .description('store and read the documents Pinloop judges postings against');

  /** The path of one document on the server, with the name safely encoded. */
  const documentPath = (name: string) => `/profile/${encodeURIComponent(name)}`;

  /**
   * Removes one document, treating "this account never stored one" as done
   * rather than as a failure. Only the reset below uses that leniency: a person
   * asking for the shipped prompt back has got what they asked for whether or
   * not a prompt of their own was ever there.
   */
  async function removeDocument(pass: SavedPass, name: string): Promise<void> {
    try {
      await callAsAccount(pass, documentPath(name), { method: 'DELETE' });
    } catch (error) {
      if (!(error instanceof Failure) || error.status !== 404) throw error;
    }
  }

  /**
   * What a person is told when they named neither a file nor piped anything in.
   */
  const nothingToStore = (name: string, example: string) =>
    new Failure(
      `pinloop profile put ${name} takes the document either from a file or from ` +
        `standard input, and it was given neither. For example:\n` +
        `  pinloop profile put ${name} --file ${example}\n`,
    );

  /** Sends one document's bytes as a file, and reports the size stored. */
  async function sendFile(
    pass: SavedPass,
    name: string,
    bytes: Buffer,
    filename: string,
  ): Promise<number> {
    const query = new URLSearchParams({ filename });
    const { json } = await callAsAccount(pass, `${documentPath(name)}?${query.toString()}`, {
      method: 'POST',
      bytes,
      contentType: FILE_CONTENT_TYPE,
    });

    // What the server read out of the PDF, said on standard error so that the
    // one line standard output carries stays the one line every script that
    // stores a resume already reads. A person uploading a resume finds out here
    // whether their file has words in it, which is the one moment they can do
    // anything about it.
    const stored = rowsOf(json)[0] ?? {};
    if (typeof stored['pages'] === 'number') {
      const pagesRead = Number(stored['pages_read'] ?? stored['pages']);
      const characters = Number(stored['characters'] ?? 0);
      process.stderr.write(
        `your '${name}' document: ${stored['pages']} page${stored['pages'] === 1 ? '' : 's'}, ` +
          `${pagesRead} read, ${characters} characters of text stored\n`,
      );
      if (typeof stored['note'] === 'string') process.stderr.write(`${stored['note']}\n`);
    }

    return Number(stored['bytes'] ?? bytes.length);
  }

  /** Sends one document's characters as text, and reports the size stored. */
  async function sendText(pass: SavedPass, name: string, text: string): Promise<number> {
    const { json } = await callAsAccount(pass, documentPath(name), {
      method: 'POST',
      body: { text },
    });
    return Number(rowsOf(json)[0]?.['bytes'] ?? Buffer.byteLength(text, 'utf8'));
  }

  /**
   * Sends one document to the server and hands back how many bytes it stored.
   *
   * There are two ways to send it, and two things decide which. The registry
   * that this command and the server both read says which names hold a file:
   * `resume` does, every other name holds text, so anything stored under
   * `resume` is sent as bytes. On top of that, a named file that actually is a
   * PDF is sent as bytes whatever name it was given, so that pointing a PDF at a
   * name that holds text comes back as the server saying that name holds text,
   * rather than as a mangled PDF stored as characters.
   *
   * What is sent as bytes goes exactly as it sits on disk, under the PDF content
   * type, with the name the file had on this machine attached to the address.
   * What is sent as text goes as JSON, the way it always has. The server decides
   * whether what arrived is acceptable either way, and its refusal is what a
   * person reads.
   */
  async function sendDocument(
    pass: SavedPass,
    name: string,
    options: Record<string, string | undefined>,
  ): Promise<number> {
    const file = options['file'];
    const holdsAFile = reservedKind(name) === 'file';

    if (typeof file === 'string' && file !== '') {
      const bytes = readFileSync(file);
      if (holdsAFile || beginsLikeAPdf(bytes)) return sendFile(pass, name, bytes, basename(file));
      return sendText(pass, name, bytes.toString('utf8'));
    }

    if (nothingWasPipedIn()) throw nothingToStore(name, `./${name}.${holdsAFile ? 'pdf' : 'txt'}`);
    if (holdsAFile) {
      // Nothing piped in has a name of its own, so it gets the plain one.
      return sendFile(pass, name, await readStandardInputBytes(), DEFAULT_FILE_NAME);
    }
    return sendText(pass, name, await readStandardInput());
  }

  profile
    .command('put')
    .description('store one document, replacing whatever that name held before')
    .argument('<name>', 'the document name: lowercase letters, digits and dashes')
    .option('--file <path>', 'read the document from this file instead of standard input')
    .option(
      '--default',
      `only for ${JUDGE_PROMPT_NAME} and ${QUICK_JUDGE_PROMPT_NAME}: remove the stored ` +
        'prompt, so the run sends the one Pinloop ships',
    )
    .action(async (name: string, options: Record<string, string | boolean | undefined>) => {
      const pass = readPass();

      // Going back to the shipped instructions is removing the stored document,
      // because an absent prompt is what makes a run send the default. The flag
      // exists only for the two names Pinloop ships a version of: nothing else
      // in a profile has one, so there is nothing for it to mean there.
      if (options['default'] === true) {
        if (name !== JUDGE_PROMPT_NAME && name !== QUICK_JUDGE_PROMPT_NAME) {
          throw new Failure(
            `--default works on ${JUDGE_PROMPT_NAME} and ${QUICK_JUDGE_PROMPT_NAME}, and on ` +
              `no other document, because those are the only documents Pinloop ships a ` +
              `version of. Nothing was changed.`,
          );
        }
        await removeDocument(pass, name);
        process.stdout.write(
          name === QUICK_JUDGE_PROMPT_NAME
            ? `reset ${QUICK_JUDGE_PROMPT_NAME} to the default: quick screens now send the ` +
                `prompt Pinloop ships\n`
            : `reset ${JUDGE_PROMPT_NAME} to the default: judge now sends the prompt Pinloop ships\n`,
        );
        return;
      }

      const size = await sendDocument(pass, name, options as Record<string, string | undefined>);
      process.stdout.write(`stored your '${name}' document (${size} bytes)\n`);
    });

  profile
    .command('get')
    .description('print one document, or every document as JSON')
    .argument('[name]', 'the document to print')
    .option('--all', 'print every document, text included, as one JSON object')
    .option('--json', 'print JSON (implied by --all)')
    .option('--text', 'print the words read out of a stored file, instead of the file itself')
    .action(async (name: string | undefined, options: Record<string, boolean | undefined>) => {
      const pass = readPass();

      if (options['all']) {
        const { json } = await callAsAccount(pass, '/profile?include=text');
        printJson({ rows: rowsOf(json), cursor: cursorOf(json) });
        return;
      }
      if (name === undefined || name === '') {
        throw new Failure(
          'pinloop profile get needs a document name, or --all to print every document.',
        );
      }

      // --text asks the server for the document itself rather than the file,
      // and the words that were read off the file's pages at upload come back
      // on it. Everything else about the command is unchanged, so a person who
      // does not ask for the text still gets the file.
      const wantsTheWords = options['text'] === true;
      const answer = await callAsAccount(
        pass,
        wantsTheWords ? `${documentPath(name)}?include=text` : documentPath(name),
      );

      // A document that holds a file comes back as the file's own bytes, and
      // they are written out exactly as they arrived, with nothing added and
      // nothing turned into characters on the way. That is what makes
      // "pinloop profile get resume > resume.pdf" give back the PDF that was
      // uploaded, byte for byte.
      if (reservedKind(name) === 'file' && !wantsTheWords) {
        process.stdout.write(answer.bytes);
        return;
      }

      const document = rowsOf(answer.json)[0];
      if (!document) throw new Failure(`no document named '${name}' is stored in this profile`);

      // A stored file with no words on it hands back no text at all, and there
      // are two ways to arrive there: the PDF was read and held nothing, or it
      // was uploaded before Pinloop read the words out of anything. A person
      // cannot tell those apart from here, so the refusal names both and says
      // what to do about each.
      if (wantsTheWords && typeof document['text'] !== 'string') {
        throw new Failure(
          `no words are stored for your '${name}' document. A file uploaded before 2026-08-16 has ` +
            `none until it is uploaded again with "pinloop profile put ${name} --file <path>", and a ` +
            `scanned file holds pictures of words rather than words, so nothing can be read off its ` +
            `pages.`,
        );
      }
      // Written raw, with nothing added: what comes out is what went in.
      process.stdout.write(String(document['text'] ?? ''));

      // The judge-prompt is the one name the server answers for when the
      // account has stored nothing, handing back the instructions Pinloop
      // ships. Standard output stays the text itself, so it can be redirected
      // into a file and edited; the note that it is the default goes where
      // every other thing a person reads goes.
      if (document['stored'] === false) {
        // A blank line then a plain --- line, both on standard error, mark
        // where the prompt text ends and the note to the reader begins —
        // otherwise the two run together in a terminal with nothing between
        // them. Standard output carries none of this, so a pipe or a
        // redirect into a file still gets the prompt text alone.
        process.stderr.write('\n---\n');
        process.stderr.write(
          `that is the default ${name} Pinloop ships, and this account has stored none of ` +
            `its own. Store your own with "pinloop profile put ${name} --file <path>".\n`,
        );
      }
    });

  profile
    .command('list')
    .description('show every stored document with its kind, size and last-updated date')
    .option('--json', 'print one JSON object holding the documents, instead of lines')
    .action(async (options: Record<string, boolean | undefined>) => {
      const pass = readPass();
      const { json } = await callAsAccount(pass, '/profile');
      const documents = rowsOf(json);

      if (options['json']) {
        printJson({ rows: documents, cursor: cursorOf(json) });
        return;
      }
      if (documents.length === 0) {
        process.stdout.write('this profile currently has no stored documents\n');
        return;
      }
      for (const document of documents) {
        const day = String(document['updated_at'] ?? '').slice(0, 10);
        // A document that holds a file also shows the name that file had on the
        // machine it was uploaded from, which is the only place a person ever
        // sees it again.
        const uploadedAs = document['original_filename'];
        const wasCalled = typeof uploadedAs === 'string' && uploadedAs !== '' ? `  ${uploadedAs}` : '';
        process.stdout.write(
          `${String(document['name'])}  ${String(document['kind'])}  ` +
            `${Number(document['bytes'])} bytes  ${day}${wasCalled}\n`,
        );
      }
    });

  profile
    .command('delete')
    .description('remove one document, or every document this account has stored')
    .argument('[name]', 'the document to remove')
    .option('--all', 'remove every document this account has stored')
    .action(async (name: string | undefined, options: Record<string, boolean | undefined>) => {
      const pass = readPass();

      if (options['all']) {
        const { json } = await callAsAccount(pass, '/profile?all=true', { method: 'DELETE' });
        const gone = rowsOf(json).length;
        process.stdout.write(`deleted ${gone} document${gone === 1 ? '' : 's'}\n`);
        return;
      }
      if (name === undefined || name === '') {
        throw new Failure(
          'pinloop profile delete needs a document name, or --all to remove every document.',
        );
      }

      await callAsAccount(pass, documentPath(name), { method: 'DELETE' });
      // Removing either prompt does not leave the run it belongs to with no
      // instructions: it leaves that run sending the ones Pinloop ships. Saying
      // only that a document went would leave a person guessing what judging or
      // screening does now.
      if (name === JUDGE_PROMPT_NAME) {
        process.stdout.write(`deleted ${name}: judge now uses the default prompt Pinloop ships\n`);
      } else if (name === QUICK_JUDGE_PROMPT_NAME) {
        process.stdout.write(
          `deleted ${name}: quick screens now use the default prompt Pinloop ships\n`,
        );
      } else {
        process.stdout.write(`deleted your '${name}' document\n`);
      }
    });
}

/** One flag's value when a person typed one, and undefined when they did not. */
function textOption(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * True when this is the operating system saying the thing reading our output
 * has gone away.
 *
 * `pinloop search --json | head -20` closes the pipe as soon as head has its
 * twenty lines, and every write after that comes back with the code EPIPE. That
 * is the ordinary end of a shell pipeline, not a failure of the command.
 */
function isBrokenPipe(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'EPIPE'
  );
}

/**
 * Ends the command quietly the moment the reader of its output goes away.
 *
 * Without this, `pinloop profile get resume | head -c 200` prints a Node stack
 * trace and exits 1: nothing is listening for the error the stream raises, so
 * Node treats it as a crash. A broken pipe reaches this program in two
 * different ways and both are handled. A write that is still in flight raises
 * an `error` event on standard output, which is what this listener catches, and
 * it ends the process there and then because there is nothing left to write to.
 * A write that fails while the call is still running throws instead, and the
 * catch in `main` below reads the same code off it. Any other error on standard
 * output is raised again, so nothing else is quietly swallowed here.
 */
function endQuietlyOnBrokenPipe(): void {
  process.stdout.on('error', (error: NodeJS.ErrnoException) => {
    if (!isBrokenPipe(error)) throw error;
    process.exit(0);
  });
}

export async function main(argv: string[] = process.argv): Promise<number> {
  endQuietlyOnBrokenPipe();
  // Which of the two ways of printing this run uses is settled here, before any
  // command runs, and never again. `--plain` is taken off the arguments so that
  // commander never sees it: it belongs to the whole program rather than to the
  // command a person typed, and commander parses each command's options on its
  // own.
  const plain = argv.includes('--plain');
  if (plain) {
    screen = buildScreen(true);
    argv = argv.filter((one) => one !== '--plain');
  }
  giveTheCursorBackOnCtrlC();
  // `pinloop --version` is answered here, before commander is built and before
  // anything reaches the network, so it still answers when the server is down
  // and when nobody has ever logged in on this machine. It is answered here
  // rather than by commander's own version option because commander prints and
  // then calls process.exit, which can cut a write to a pipe off halfway.
  if (argv.slice(2).length === 1 && argv[2] === '--version') {
    process.stdout.write(`${CLI_VERSION}\n`);
    return 0;
  }
  try {
    await buildProgram().parseAsync(argv);
    screen.finish();
    printUpdateLine();
    return 0;
  } catch (error) {
    // Whatever was on the screen comes off before the failure is printed, so the
    // sentence a person reads is not written over the top of a line that was
    // being redrawn.
    screen.finish();
    // The reader closed the pipe. Nothing more is written, nothing is said, and
    // the command reports the success it had up to that point.
    if (isBrokenPipe(error)) return 0;
    const said = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${said}\n`);
    printUpdateLine();
    return 1;
  }
}

/**
 * Makes the cursor visible again when a person presses Ctrl-C.
 *
 * Drawing a group of lines in place hides the cursor, which is the blinking mark
 * showing where typed characters go. A run killed while that group is up would
 * leave the cursor hidden in the shell the person goes back to, and getting it
 * back means knowing to type `reset`, which most people do not. So the group is
 * erased, the cursor is put back, and only then does the command die — with a
 * status that says it was interrupted rather than that it finished.
 */
const INTERRUPTED_EXIT_CODE = 130;

function giveTheCursorBackOnCtrlC(): void {
  process.on('SIGINT', () => {
    screen.finish();
    screen.restoreCursor();
    process.exit(INTERRUPTED_EXIT_CODE);
  });
}

/**
 * Runs the command the person typed — unless this file was loaded only for the
 * two things it exports, which is what `PINLOOP_CLI_IMPORT_ONLY` says.
 *
 * src/core/catalog.test.ts sets that variable and then imports this file, so
 * that it can call `buildProgram()` and read the real list of commands out of
 * it. Without this check that import would run `main()`, which would parse the
 * test runner's own arguments as if a person had typed them, print the help
 * text, and end the process. Nothing else sets the variable, so every real way
 * of starting the CLI still runs the command as before.
 *
 * The check is on a variable rather than on whether this file is the file node
 * was started with, because the tests start the CLI through vite-node, and
 * vite-node leaves its own loader in `process.argv[1]` rather than the path of
 * this file. A guard reading that would be false every time the tests run the
 * CLI, so the CLI would print nothing at all.
 */
if (!process.env['PINLOOP_CLI_IMPORT_ONLY']) {
  process.exitCode = await main();
}
