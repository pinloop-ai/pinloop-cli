/**
 * The one piece of code inside the `pinloop` command that writes to the screen
 * while a command is still working (specs/feature-terminal-polish.md, AGREED
 * 2026-08-19).
 *
 * Everything a command says WHILE it works goes through here, and every one of
 * those writes goes to standard error. Standard output is left alone entirely,
 * whoever is watching, because standard output is what a shell pipe reads and
 * what the next command in a pipeline parses. The answer itself is printed by
 * the command's own code, after the work has finished, exactly as it was printed
 * before this file existed.
 *
 * ---------------------------------------------------------------------------
 * Two ways of printing, decided once
 * ---------------------------------------------------------------------------
 *
 * As the command starts it asks the operating system one question: is standard
 * error attached to a terminal window? A terminal window means a person is
 * reading, and the command prints for a person. A pipe, a file or a coding
 * agent's captured output means a program is reading, and the command prints for
 * a coding agent. Typing `--plain` forces the second way inside a terminal
 * window.
 *
 * Printing for a person means a small group of lines at the bottom of the
 * screen that is erased and drawn again in place, so nothing scrolls past:
 *
 *   judging 12 postings, 4 at a time, openai/gpt-5.6-luna
 *   o 7f732227  thinking: comparing the Paris role against the location
 *   o a91c0d3e  answer 1,240 chars
 *   v 5 of 12 done   x 0 failed   0:48
 *
 * A quick screen, which is `pinloop judge --quick`, gets that same group of
 * lines with the count of finished postings left off the last one, so the last
 * line reads `x 0 failed   0:48`. One quick call carries up to a hundred
 * postings, so that count cannot move until the call comes back (Andrew,
 * 2026-08-20).
 *
 * and, for every other command, one line carrying the same turning character,
 * what it is doing and a clock:
 *
 *   o searching... 0:04
 *
 * A command that has to say more than fits after the clock draws a second row
 * underneath the waiting line, indented by two spaces, with no turning
 * character on it:
 *
 *   o listing... page 27, 2700 postings so far
 *     over the per-minute limit, asking for the same page again in 5s
 *
 * The first row keeps what the run has got to, and the second row carries the
 * explanation. A `pinloop list --all` run that goes over the account's
 * allowance used to put the whole explanation after the clock, where it was cut
 * off part way through a word and where it took the page count off the screen,
 * so the one thing showing that the run was still moving disappeared (Andrew,
 * 2026-08-19).
 *
 * A second row that names a number of seconds still to wait counts that number
 * down, one a second, until the wait is over: 5s, then 4s, then 3s, then 2s,
 * then 1s. It never shows 0s and never shows a fraction. Andrew watched a run
 * at his own terminal on 2026-08-20 where the row said "in 5s", five seconds
 * went by, and the row still said "in 5s", so there was no way to tell a
 * command that was about to ask again from one that had stopped for good.
 *
 * The letter o at the front of a running call's row and at the front of the
 * waiting line stands in for a character that turns. The real characters are the
 * ten braille dot patterns of the `cli-spinners` package's `dots` animation, and
 * a new one of them is shown every 80 milliseconds, so a call the model has gone
 * quiet on and a command that is only waiting both visibly move (Andrew,
 * 2026-08-19, after watching a run where nothing on the screen moved at all).
 * The letters v and x stand in for the tick and the cross on the row counting
 * what is done. All three are written as letters here only so that this comment
 * stays plain text; the code below uses the real characters.
 *
 * Printing for a coding agent means a short list of plain lines and nothing
 * else. Nothing is ever erased, because a pipe and a file only accept more text,
 * and none of the model's thinking is written at all: a coding agent cannot do
 * anything with the thinking and has to store every line it is handed.
 *
 *   judging 12 postings with openai/gpt-5.6-luna via OpenAI
 *   verdict for 7f732227: no (5 of 12 done)
 *   call 1 of 3 done, 100 verdicts (100 of 300 done)
 *   call 2 of 3 failed: the model provider closed the connection
 *
 * ---------------------------------------------------------------------------
 * Why a row is cut rather than wrapped
 * ---------------------------------------------------------------------------
 *
 * The group of lines is erased by counting the rows it drew and moving the
 * cursor back up that many rows. A row longer than the window is carried onto a
 * second screen row by the terminal itself, which makes that count wrong and
 * leaves half of the old group on the screen. So every row is cut to fit and
 * ended with the single ellipsis character. Rows are cut one character short of
 * the window's width, because a terminal that has just had its very last column
 * filled is already sitting on the row below.
 *
 * The row showing a model's thinking is the one row cut the other way round. The
 * provider sends the thinking a few characters at a time; this file joins those
 * pieces together and the row shows the END of the joined text, with the
 * ellipsis character at the front where the earlier words were left out. The
 * words then slide leftwards off the row as new ones arrive, so the row always
 * reads as a run of sentences rather than as whichever fragment arrived last
 * (Andrew, 2026-08-19, after watching a real run).
 */
import spinners from 'cli-spinners';
import { createLogUpdate } from 'log-update';
import { createColors } from 'picocolors';

import { withSeparators } from './format.ts';
import { MAX_IN_FLIGHT_REQUESTS } from '../shared/model-calls.ts';
import type { ProgressEvent } from '../shared/progress-events.ts';

/**
 * The functions that wrap a piece of text in the codes that colour it.
 *
 * They are handed to everything that builds a row rather than reached for, so
 * that the same row-building code produces coloured text for a person and
 * untouched text for a pipe, and so that a test can hand in functions that mark
 * their text with words instead of with invisible codes.
 */
export type Colours = {
  bold: (text: string) => string;
  dim: (text: string) => string;
  red: (text: string) => string;
  yellow: (text: string) => string;
  green: (text: string) => string;
};

/** Which of the two ways of printing this run picked. */
export type ScreenMode = 'person' | 'program';

/** What one screen is told about the terminal it is writing to. */
export type ScreenOptions = {
  /** Whether standard error is attached to a terminal window. */
  stderrIsTTY: boolean;
  /** Whether standard output is attached to a terminal window. */
  stdoutIsTTY: boolean;
  /** Whether the person typed --plain. */
  plain: boolean;
  /** Whether the environment variable NO_COLOR is set to anything. */
  noColor: boolean;
  /** How many characters wide the terminal window is. */
  columns: number;
  /** The stream every write goes to. */
  stderr: NodeJS.WritableStream;
  /** Standard output, which this file never writes a byte to. */
  stdout: NodeJS.WritableStream;
  /** The clock, so that a test can move time by hand. */
  now?: () => number;
};

/** The screen a command draws on while it works. */
export type Screen = {
  /** Which of the two ways of printing this run picked. */
  readonly mode: ScreenMode;
  /** The colour functions every printed row is built with. */
  readonly colours: Colours;
  /**
   * This command is now waiting on the server, doing the thing this label
   * names. Calling it again while a wait is already going changes the label
   * without restarting the clock, which is how a routine run says which step it
   * has reached. Waits nest: two calls need two stops.
   */
  wait(label: string): void;
  /**
   * The same wait, doing something else now. It changes the words on the line
   * without opening a second wait and without restarting the clock, which is how
   * a routine run says which of its steps it has reached.
   */
  relabel(label: string): void;
  /** What the waiting command has got to, in place of the clock. */
  update(detail: string): void;
  /**
   * A second row of text drawn underneath the waiting line, for an explanation
   * too long to sit after the clock. The row is indented by two spaces and
   * carries no turning character, and calling this with nothing takes the row
   * off again. What the waiting command has got to stays on the first row
   * either way, so the explanation never hides it.
   */
  note(saying: string | undefined): void;
  /**
   * The same second row, carrying a number of seconds that falls as a wait runs
   * out.
   *
   * `milliseconds` is how long the wait has left to run from this moment, and
   * `wording` is asked for the sentence to draw every time the row is redrawn,
   * with the whole seconds still to wait handed to it. The number is rounded
   * up and never goes below 1, so the row never reads "in 0s" and never reads a
   * fraction of a second. The words themselves stay with the command that is
   * waiting; all this does is redraw them as the number changes.
   *
   * The row comes off the same way any other second row does: `note` with a
   * plain sentence replaces it, and `note` with nothing takes it away.
   */
  countdown(milliseconds: number, wording: (secondsLeft: number) => string): void;
  /** This wait is over. */
  stop(): void;
  /**
   * Whether the judge run that is about to start is a quick screen, which is
   * `pinloop judge --quick`: up to a hundred postings sent in one model call
   * rather than one call for each posting.
   *
   * The judge command says which kind of run it is before the run starts.
   * Nothing here works it out from the messages the server sends, because the
   * messages of a quick screen carrying a hundred postings and the messages of
   * an ordinary run of a hundred postings say the same things.
   *
   * The one thing it changes is the last row of the group drawn while the run
   * goes. On a quick screen that row leaves out the count of finished postings;
   * see `judgeRows` further down for why.
   */
  judgeIsQuick(quick: boolean): void;
  /** One thing that happened while a judge run was going. */
  judge(event: ProgressEvent): void;
  /** The whole command is done: erase everything and give the cursor back. */
  finish(): void;
  /** Make the cursor visible again, right now. */
  restoreCursor(): void;
};

/** The bytes that make the cursor visible again. */
const SHOW_CURSOR = '\u001b[?25h';

/** How long a command waits before it draws a waiting line at all. */
const QUIET_FIRST_MS = 1_000;

/** The shortest gap between two redraws, so the screen does not flicker. */
const REDRAW_EVERY_MS = 100;

/**
 * How tall the screen is taken to be when the terminal will not say. A terminal
 * that reports no height, or a height of zero, would otherwise have everything
 * clipped away and nothing drawn.
 */
const ASSUMED_HEIGHT = 24;

/** Below this many characters wide, the group shrinks to its last row alone. */
const NARROW_WINDOW = 40;

/**
 * The characters that turn at the front of the waiting line and at the front of
 * every row of a call that is still running.
 *
 * The `cli-spinners` package is a plain list of animations with no code in it
 * and no packages of its own. The one taken here is `dots`: ten braille
 * characters with a different pattern of dots raised in each, shown one after
 * another 80 milliseconds apart, which reads as a small shape turning on the
 * spot. Andrew watched the built command run on 2026-08-19 and asked for this:
 * until then the waiting line was a word and a clock that changed once a second
 * and stood still the rest of the time, and the row of a call the model had gone
 * quiet on did not change at all, so a person could not tell a slow run from a
 * stuck one.
 */
const TURNING = spinners.dots;

/**
 * The character to show at the front of a moving row after this many
 * milliseconds of waiting or of judging.
 *
 * The character is worked out from elapsed time rather than counted up on each
 * redraw. The redraw happens ten times a second and the animation wants a new
 * character every 80 milliseconds, so the two do not line up; reading the clock
 * keeps the animation at its own speed whatever the redraw does, and it means a
 * test that moves the clock by hand always gets the same character back.
 */
function turningAt(milliseconds: number): string {
  const step = Math.floor(Math.max(0, milliseconds) / TURNING.interval);
  return TURNING.frames[step % TURNING.frames.length] ?? '';
}

/** The marks on the row counting what is done and what could not be done. */
const DONE_MARK = '✓';
const FAILED_MARK = '✗';

/**
 * The one character a row that had to be cut short ends with, and the one that
 * separates the waiting line's label from its clock. Three full stops in a row
 * would take three columns of a window this code is already fighting for.
 */
const CUT_MARK = '…';

/** What a call's row says before the model has sent anything. */
const NOTHING_YET = 'starting';

/**
 * How many characters of one call's thinking are kept.
 *
 * The provider sends the model's thinking a few characters at a time, and this
 * file joins those pieces together so the row reads as sentences rather than as
 * whatever fragment arrived last. A model can think for minutes, so the joined
 * text would grow to hundreds of thousands of characters if nothing threw any
 * of it away. Only the end of it is ever shown, and a hundred-column window
 * shows about eighty characters, so keeping the last few thousand is far more
 * than any row can hold and still costs almost nothing to hold in memory.
 */
const THINKING_KEPT = 4_000;

/**
 * The model's thinking with every run of spaces, tabs and newlines turned into
 * one single space, and any space at the very front taken off.
 *
 * A model that writes in paragraphs sends newlines, and a newline inside a row
 * would push the rest of the group onto extra screen rows, which makes the
 * count of rows to erase wrong and leaves half of the old group behind.
 */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/^ /, '');
}

/** A count of minutes and seconds, as a person reads a stopwatch. */
function clockText(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * One posting named the way every row here names it: the first eight characters
 * of its id.
 *
 * A server that is older than this command sends no posting on the message that
 * opens a call, because that field was added with this feature. The row then
 * names nothing rather than printing the word "undefined" across the screen.
 */
function shortId(id: string | undefined): string {
  if (id === undefined || id === null || String(id) === '') return '';
  return String(id).slice(0, 8);
}

/** "1 posting" or "12 postings". */
function postingWord(count: number): string {
  return `${count} posting${count === 1 ? '' : 's'}`;
}

/**
 * What one open call is doing, kept so its row can be drawn again on the next
 * redraw without waiting for the model to say something new.
 */
type OpenCall = {
  /** The posting this call is about, or the first of the many it carries. */
  id: string;
  /** How many postings this one call carries. */
  postings: number;
  /** How many calls the whole run makes. */
  of: number;
  /** The last thing that happened on this call, already written out as a row. */
  latest: string;
  /**
   * Everything the model has thought on this call so far, with the pieces it
   * arrived in joined together and every run of whitespace turned into one
   * space. Empty when the model has sent no thinking, or when an answer has
   * arrived and taken the row over.
   */
  thinking: string;
  /** How many verdicts this call has produced so far. */
  verdicts: number;
};

export function openScreen(options: ScreenOptions): Screen {
  const mode: ScreenMode = options.stderrIsTTY && !options.plain ? 'person' : 'program';
  // Colour is decided by standard output rather than by standard error, because
  // colour goes on the answer and the answer goes to standard output. The two
  // streams can point at different places: `pinloop search x | less` leaves the
  // waiting line on the screen and hands `less` plain text.
  const colours = createColors(
    options.stdoutIsTTY && !options.noColor && !options.plain,
  ) as unknown as Colours;
  const now = options.now ?? ((): number => Date.now());
  const say = (line: string): void => {
    options.stderr.write(`${line}\n`);
  };

  // -------------------------------------------------------------------------
  // What a judge run has said so far. Both ways of printing keep the same
  // record: one entry per call that is still running, plus the counts.
  // -------------------------------------------------------------------------

  /** The calls still running, in the order they started. */
  const open = new Map<number, OpenCall>();
  /** How many postings the whole run covers, worked out from the first call. */
  let runPostings = 0;
  /** The model that really answered, as the provider named it. */
  let runModel = '';
  /** True once the line naming the run has been printed for a coding agent. */
  let namedTheRun = false;
  /** Postings finished, and calls that could not be finished. */
  let done = 0;
  let failedCalls = 0;
  /**
   * True when this run is a quick screen rather than an ordinary judge run, as
   * the judge command said before the run started.
   */
  let quickRun = false;

  /**
   * How many postings the whole run covers, read off the first call that
   * started. An ordinary run makes one call per posting; a screening run makes
   * one call per hundred, and says so on every call it starts.
   */
  const wholeRun = (event: { of: number; postings: number }): number =>
    Math.max(0, event.of) * Math.max(1, event.postings);

  // -------------------------------------------------------------------------
  // Printing for a coding agent
  // -------------------------------------------------------------------------

  if (mode === 'program') {
    /** The line one screening call prints once it has produced its verdicts. */
    const callDone = (call: number, one: OpenCall): void => {
      say(
        `call ${call} of ${one.of} done, ${one.verdicts} verdicts ` +
          `(${done} of ${runPostings} done)`,
      );
      one.verdicts = 0;
    };

    return {
      mode,
      colours,
      wait: () => undefined,
      relabel: () => undefined,
      update: () => undefined,
      note: () => undefined,
      countdown: () => undefined,
      stop: () => undefined,
      // A coding agent's lines are the same lines whichever kind of run this
      // is, so which kind it is changes nothing here.
      judgeIsQuick: () => undefined,
      restoreCursor: () => undefined,
      judge(event: ProgressEvent): void {
        if (event.kind === 'call-started') {
          open.set(event.call, {
            id: event.id,
            postings: event.postings,
            of: event.of,
            latest: NOTHING_YET,
            thinking: '',
            verdicts: 0,
          });
          if (namedTheRun) return;
          namedTheRun = true;
          runPostings = wholeRun(event);
          // The model and the company serving it are read off the first piece
          // the provider sent back rather than out of anything written down
          // here, because the model that answers is not always the model that
          // was asked for.
          say(`judging ${postingWord(runPostings)} with ${event.model} via ${event.provider}`);
          return;
        }
        if (event.kind === 'verdict') {
          done += 1;
          const one = open.get(event.call);
          // A call carrying one posting names that posting. A screening call
          // carries a hundred, and naming them all would be a hundred lines a
          // coding agent has to store, so it says how many verdicts it produced
          // instead, once, when it has produced all of them.
          if (one === undefined || one.postings <= 1) {
            say(
              `verdict for ${shortId(event.id)}: ${event.verdict} ` +
                `(${done} of ${runPostings} done)`,
            );
            return;
          }
          one.verdicts += 1;
          if (one.verdicts >= one.postings) callDone(event.call, one);
          return;
        }
        if (event.kind === 'call-failed') {
          say(`call ${event.call} of ${event.of} failed: ${event.reason}`);
          open.delete(event.call);
        }
        // The model's thinking, the running count of answer characters, and the
        // line saying a step of a routine has started are all left out. None of
        // them is something a coding agent can act on, and every one of them
        // would be a line it has to store.
      },
      finish(): void {
        // A screening call that answered for fewer postings than it carried
        // never reached the count that prints its line, so it is printed here
        // with the number of verdicts it really produced.
        for (const [call, one] of open) {
          if (one.postings > 1 && one.verdicts > 0) callDone(call, one);
        }
        open.clear();
      },
    };
  }

  // -------------------------------------------------------------------------
  // Printing for a person
  // -------------------------------------------------------------------------

  const room = Math.max(1, options.columns - 1);
  // The redrawing library clips what it draws to the height the terminal
  // reports, and a terminal that reports a height of zero gets nothing drawn at
  // all. Some terminals really do report zero: one handed out by the `script`
  // program without a window size is one, and a person in that terminal would
  // watch a judge run in total silence with nothing failing anywhere. So the
  // stream handed to the library reports a sensible height whenever the real
  // one is zero or missing, and reports the real height otherwise. Everything
  // else about the stream, including every write, is the real stream's.
  const drawnOn = new Proxy(options.stderr as NodeJS.WriteStream, {
    get(real, name, receiver) {
      if (name === 'rows') {
        const height = (real as NodeJS.WriteStream).rows;
        return height === undefined || height <= 0 ? ASSUMED_HEIGHT : height;
      }
      const value = Reflect.get(real, name, receiver);
      return typeof value === 'function' ? value.bind(real) : value;
    },
  });
  const draw = createLogUpdate(drawnOn, {
    defaultWidth: options.columns,
    defaultHeight: ASSUMED_HEIGHT,
  });

  /** True while anything at all is on the screen. */
  let drawn = false;
  /**
   * True once anything has been drawn at all, ever. The cursor is hidden by the
   * first thing drawn and not before, so a command that answered too quickly to
   * draw anything must not write the code that shows the cursor again either:
   * that code would be the last thing on the screen, sitting after the answer.
   */
  let everDrawn = false;
  /** How many waits are open; the line comes off when the last one ends. */
  let waits = 0;
  /** What the waiting command is doing, and what it has got to. */
  let label = '';
  let detail: string | undefined;
  /**
   * What the second row under the waiting line says, or nothing when there is
   * no second row. It holds an explanation too long to sit after the clock, and
   * it is kept apart from the detail above so that setting one never takes the
   * other off the screen.
   *
   * It is held as something that is asked afresh on every redraw rather than as
   * a finished sentence, because a row that counts seconds down has to be built
   * again each time the clock has moved. A row set by `note` is a sentence that
   * never changes, and is held here as something that hands back that same
   * sentence every time.
   */
  let underneath: (() => string) | undefined;
  /** When the first of the open waits began, which the clock counts from. */
  let waitStartedAt = 0;
  /** When the first thing happened in a judge run, which its clock counts from. */
  let judgeStartedAt: number | undefined;
  /** When the screen was last written to, so it is redrawn ten times a second. */
  let lastDrawnAt = Number.NEGATIVE_INFINITY;
  let redrawing: NodeJS.Timeout | undefined;

  /** One row, cut to fit the window and ended with one ellipsis character. */
  const fit = (line: string): string =>
    line.length <= room ? line : `${line.slice(0, Math.max(0, room - 1))}${CUT_MARK}`;

  /**
   * The last however-many characters of a piece of text that fit in the space
   * given, with one ellipsis character at the FRONT when the beginning had to be
   * left out.
   *
   * This is how the model's thinking is cut, and it is cut the other way round
   * from every other row here. The newest words of the thinking are the ones a
   * person wants to read, so the row keeps the end of the text and drops the
   * beginning, and the words slide leftwards off the row as new ones arrive.
   * Every other row keeps its beginning and drops its end, which is what `fit`
   * above does.
   */
  const lastPartThatFits = (text: string, space: number): string => {
    if (space <= 0) return '';
    if (text.length <= space) return text;
    if (space === 1) return CUT_MARK;
    return `${CUT_MARK}${text.slice(text.length - (space - 1))}`;
  };

  /** The rows of the group drawn while a judge run goes. */
  const judgeRows = (): string[] => {
    const sinceTheRunBegan = now() - (judgeStartedAt ?? now());
    const running = clockText(sinceTheRunBegan);
    // A quick screen sends up to a hundred postings in one model call, so the
    // count of finished postings sits at 0 for the whole run and then jumps
    // straight to the total when that one call comes back. Andrew ran a quick
    // screen of thirty postings at his terminal on 2026-08-20 and watched it do
    // that, so the count is left off a quick screen's row altogether and the row
    // carries what does move: the calls that failed and the clock. An ordinary
    // judge run makes one call per posting, where the count rises as the run
    // goes, and its row is unchanged.
    const counted = quickRun
      ? `${FAILED_MARK} ${failedCalls} failed   ${running}`
      : `${DONE_MARK} ${done} of ${runPostings} done   ` +
        `${FAILED_MARK} ${failedCalls} failed   ${running}`;
    // A window too narrow for a row of columns gets the one row that matters.
    if (options.columns < NARROW_WINDOW) return [fit(counted)];

    const naming =
      `judging ${postingWord(runPostings)}, ${MAX_IN_FLIGHT_REQUESTS} at a time, ${runModel}`;
    const calls = [...open.values()]
      .slice(0, MAX_IN_FLIGHT_REQUESTS)
      .map((one) => {
        const named = shortId(one.id);
        // The row of a running call starts with the turning character, so a call
        // the model is saying nothing on still moves. The tick and the cross on
        // the row below are marks of something that has already happened, so
        // they stay the fixed characters they are.
        const head = `${turningAt(sinceTheRunBegan)} ${named === '' ? '' : `${named}  `}`;
        const thought = one.thinking.trimEnd();
        if (thought === '') return `${head}${one.latest}`;
        // The turning character, the posting and the word "thinking:" always
        // stay on the row; what is left of the window's width is filled with the
        // end of what the model has thought so far.
        const said = `${head}thinking: `;
        return `${said}${lastPartThatFits(thought, room - said.length)}`;
      });
    return [naming, ...calls, counted].map(fit);
  };

  /** What should be on the screen right now, as rows. */
  const frame = (): string[] => {
    if (judgeStartedAt !== undefined) return judgeRows();
    if (waits === 0) return [];
    const waited = now() - waitStartedAt;
    // A command that answers quickly leaves no trace of having waited at all.
    if (waited < QUIET_FIRST_MS) return [];
    const waiting = fit(`${turningAt(waited)} ${label}${CUT_MARK} ${detail ?? clockText(waited)}`);
    const explanation = underneath?.();
    if (explanation === undefined) return [waiting];
    // The second row is indented by two spaces so a person reads it as
    // belonging to the line above it. It is cut to the window by the same rule
    // as every other row, because the group is erased by counting the rows it
    // drew, and a row too long for the window is carried onto a second screen
    // row by the terminal itself, which makes that count wrong.
    return [waiting, fit(`  ${explanation}`)];
  };

  /**
   * How many whole seconds a wait that ends at the given moment still has to
   * run, as the row underneath the waiting line says it.
   *
   * The number is rounded up, so a wait with two and a half seconds left reads
   * 3s, and it never falls below 1: while there is any time left at all the row
   * reads 1s rather than 0s, and the command that is waiting replaces the row
   * with the words saying its request has gone out again the moment the wait
   * ends.
   */
  const secondsLeftUntil = (endsAt: number): number =>
    Math.max(1, Math.ceil((endsAt - now()) / 1_000));

  /**
   * Puts what should be on the screen on the screen.
   *
   * `insist` is for the two moments where the screen has to be right this
   * instant rather than at the next redraw: a wait ending, and the whole command
   * finishing. Everything else is held to ten redraws a second, because a judge
   * run produces a piece of the model's thinking every few milliseconds and
   * redrawing on every one of them makes the screen flicker.
   */
  const render = (insist = false): void => {
    if (!insist && now() - lastDrawnAt < REDRAW_EVERY_MS) return;
    const rows = frame();
    if (rows.length === 0) {
      if (drawn) {
        draw.clear();
        drawn = false;
      }
      return;
    }
    lastDrawnAt = now();
    draw(rows.join('\n'));
    drawn = true;
    everDrawn = true;
  };

  /**
   * Keeps the clock and the turning character on the screen moving even when
   * nothing else happens.
   *
   * This redraw insists, where a redraw set off by something the model sent does
   * not. The gap between two of these redraws and the gap the throttle above
   * asks for are both a tenth of a second, and a timer that fires a fraction of
   * a millisecond early would be turned away by the throttle every second or
   * third time, which would leave the turning character stopped for a fifth of a
   * second at a stretch. There is only one of these timers and it fires ten
   * times a second, so nothing here can flicker.
   */
  const keepRedrawing = (): void => {
    if (redrawing !== undefined) return;
    redrawing = setInterval(() => render(true), REDRAW_EVERY_MS);
    // A timer must never be the reason this command stays alive.
    redrawing.unref?.();
  };

  const stopRedrawing = (): void => {
    if (redrawing === undefined) return;
    clearInterval(redrawing);
    redrawing = undefined;
  };

  return {
    mode,
    colours,
    wait(waitingFor: string): void {
      if (waits === 0) {
        waitStartedAt = now();
        detail = undefined;
        underneath = undefined;
      }
      waits += 1;
      label = waitingFor;
      keepRedrawing();
      render();
    },
    relabel(waitingFor: string): void {
      label = waitingFor;
      detail = undefined;
      // The same wait is doing something else now, so an explanation of what
      // held up the thing it was doing before is out of date and comes off.
      underneath = undefined;
      render();
    },
    update(hasGotTo: string): void {
      detail = hasGotTo;
      render();
    },
    note(saying: string | undefined): void {
      underneath = saying === undefined ? undefined : (): string => saying;
      // This redraw insists rather than waiting for the next one, because the
      // one sentence this row carries at the end of a wait says the request has
      // gone out again this instant, and a server that refuses it again a few
      // milliseconds later would otherwise take that sentence off the screen
      // before it was ever drawn. Measured on 2026-08-20 against the real
      // server, waiting for the next redraw instead: of the 19 pauses in one
      // run, the sentence reached the screen on one of them. Insisting here
      // put it on the screen at 18 of those 19, the last being the pause the
      // run was killed in the middle of.
      // Nothing on this row arrives fast enough for insisting to make the
      // screen flicker; the model's thinking, which does, goes nowhere near it.
      render(true);
    },
    countdown(milliseconds: number, wording: (secondsLeft: number) => string): void {
      // The moment the wait is over is worked out once, here, and the row is
      // built from the clock on every redraw. So the number on the row falls as
      // the wait runs out, without this file holding a timer of its own: the
      // redraw that already runs ten times a second is what moves it.
      const endsAt = now() + Math.max(0, milliseconds);
      underneath = (): string => wording(secondsLeftUntil(endsAt));
      render();
    },
    stop(): void {
      waits = Math.max(0, waits - 1);
      if (waits > 0) return;
      detail = undefined;
      underneath = undefined;
      render(true);
    },
    judgeIsQuick(quick: boolean): void {
      quickRun = quick;
    },
    judge(event: ProgressEvent): void {
      if (event.kind === 'step-started' || event.kind === 'error') return;
      judgeStartedAt ??= now();
      keepRedrawing();

      if (event.kind === 'call-started') {
        runModel = event.model;
        if (runPostings === 0) runPostings = wholeRun(event);
        open.set(event.call, {
          id: event.id,
          postings: event.postings,
          of: event.of,
          latest: NOTHING_YET,
          thinking: '',
          verdicts: 0,
        });
      } else if (event.kind === 'thinking') {
        const one = open.get(event.call);
        // The provider sends the thinking in tiny pieces, often a few characters
        // and sometimes a single letter. Keeping only the newest piece, which is
        // what this did until 2026-08-19, made the row read as noise: a row
        // saying "thinking: A" and a moment later "thinking:  is a no. He's
        // also". So every piece is added to the end of what this call has
        // already thought, and the row shows the end of the joined text.
        if (one) {
          const joined = oneLine(`${one.thinking}${event.text}`);
          one.thinking =
            joined.length <= THINKING_KEPT ? joined : joined.slice(joined.length - THINKING_KEPT);
        }
      } else if (event.kind === 'answer') {
        const one = open.get(event.call);
        // The answer itself takes the row over, so the thinking behind it is
        // thrown away rather than kept for a row that will not show it again.
        if (one) {
          one.latest = `answer ${withSeparators(event.chars)} chars`;
          one.thinking = '';
        }
      } else if (event.kind === 'verdict') {
        done += 1;
        // The call's row comes off as soon as the call has produced everything
        // it was carrying. The verdict itself is never printed here: the group
        // of lines is the only thing that moves while the run is going, and
        // every verdict is printed by the judge command when the run has ended
        // (Andrew, 2026-08-19).
        const one = open.get(event.call);
        if (one) {
          one.verdicts += 1;
          if (one.verdicts >= one.postings) open.delete(event.call);
        }
      } else if (event.kind === 'call-failed') {
        failedCalls += 1;
        open.delete(event.call);
      }
      render();
    },
    finish(): void {
      stopRedrawing();
      if (drawn) {
        draw.clear();
        drawn = false;
      }
      // Gives the cursor back, which the redrawing hid. Nothing was hidden if
      // nothing was ever drawn, so nothing is written in that case.
      if (everDrawn) draw.done();
      everDrawn = false;
      waits = 0;
      judgeStartedAt = undefined;
      open.clear();
    },
    restoreCursor(): void {
      options.stderr.write(SHOW_CURSOR);
    },
  };
}
