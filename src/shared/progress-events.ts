/**
 * What the server says to a caller while a judge run is still going, and the
 * one content type it says it under.
 *
 * A caller that wants to watch a run put the header `Accept:
 * application/x-ndjson` on the request it already makes. The server then
 * answers 200 under that same content type and writes one complete JSON object
 * per line, each line ended with a newline, as things happen. Every line but the
 * last is one of the events below. The last line is not an event at all: it is
 * the complete answer the same request without that header returns, unchanged.
 *
 * This file lives in src/shared/ because both halves need it. The server writes
 * these objects and the `pinloop` command reads them, and the command may import
 * nothing from the server (src/cli/package-boundary.test.ts walks its imports and
 * fails on any file outside src/cli/ and src/shared/).
 */

/** The content type progress is asked for and answered under: JSON, one object per line. */
export const PROGRESS_CONTENT_TYPE = 'application/x-ndjson';

/**
 * One thing that happened while a run was going.
 *
 * A run makes one model call per posting, or one call per hundred postings when
 * it is a quick screen, so `call` and `of` count one call off against the whole
 * run: call 3 of 12. The model and the serving company on a call-started event
 * are read off the first piece that call's provider sent back, never out of a
 * constant, because the model that answers is not always the model that was
 * asked for.
 */
export type ProgressEvent =
  /** A call's first piece has arrived, so the call is really under way. */
  | {
      kind: 'call-started';
      call: number;
      of: number;
      /** How many postings this one call carries: one, or up to a hundred. */
      postings: number;
      /**
       * The posting this call is about. A quick screen packs up to a hundred
       * postings into one call, and this then holds the first of them, in the
       * order the call carried them.
       *
       * It is here because the group of lines the `pinloop` command redraws
       * while a run goes names each open call by the first eight characters of a
       * posting's id, and until the call finishes there is nothing else on the
       * call to name it by.
       */
      id: string;
      /** The model that is really answering, as the provider named it. */
      model: string;
      /** The company serving that model, as the provider named it. */
      provider: string;
    }
  /** A piece of the model's thinking, in the words it arrived in. */
  | { kind: 'thinking'; call: number; text: string }
  /** How many characters of the answer itself have arrived so far. */
  | { kind: 'answer'; call: number; chars: number }
  /** One posting's verdict, the moment the call carrying it finished. */
  | { kind: 'verdict'; call: number; id: string; verdict: string }
  /** A call that could not be finished, with the reason in the words it came in. */
  | { kind: 'call-failed'; call: number; of: number; reason: string }
  /**
   * A step of a stored command sequence has begun. A run of a stored sequence
   * says nothing else while it goes: the answer still arrives once, at the end.
   * `command` is the command that step names — search, list, filter, fetch, tab
   * add or judge — so a person waiting reads what is happening rather than only
   * how far along it is.
   */
  | { kind: 'step-started'; step: number; of: number; command: string }
  /**
   * The run itself failed after progress had already started. It is only ever
   * the last line, and it is how a failure is reported at all once the status
   * number at the top of the answer has gone out as 200.
   */
  | { kind: 'error'; message: string };
