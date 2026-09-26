/**
 * Every sentence Pinloop puts in front of a person about the job postings an
 * account has been handed (docs/postings-release-slice-1-criteria.md, approved
 * by Andrew 2026-09-12; specs/feature-posting-allowance.md).
 *
 * Every account has a number of job postings it may be handed. An account that
 * pays gets 1,500 over the two dates Stripe charged it for, and an account that
 * pays nothing gets five over one day measured in UTC, and ten on the day the
 * account was created. A search charges one posting for each card on the page
 * this account has never been handed before, and a posting this account has been
 * handed before comes back free, forever.
 *
 * Four things get said about that, and they are said here so the wording is
 * changed in one place: the line printed after a search, the refusal when a
 * search could take more than the account has left, the message that stops a big
 * search so the person can be asked first, and the line the bare `pinloop`
 * command prints.
 *
 * This file holds nothing but text a person reads. It writes nothing to the
 * terminal itself and raises no error: every function here hands a sentence back
 * to whoever is printing it. That is what lets the installed `pinloop` command
 * and the server build the same sentence out of the same words, which matters
 * because the numbers are the server's and the printing is the command's.
 *
 * Nothing here names a dollar figure or a supplier. To a person there is one job
 * board, Pinloop, and a search is a search (src/cli/printed-messages.test.ts
 * holds both rules). The sentences that do name what Pro costs live in
 * src/shared/plan-text.ts, and the functions below take the offer as an argument
 * and append the paragraph that hands it to the person, so there is still one
 * file holding every sentence about money (Andrew, 2026-09-14).
 */
import {
  OPEN_THE_PAGE,
  type ProOffer,
  cannotRunOnFreeSentence,
  lastPostingUsedSentence,
  notEnoughPostingsSentence,
  pullUsedTheLastSentence,
  relayParagraph,
  searchWasTrimmedSentence,
  tooManyCountsSentence,
  tooManyPullsSentence,
} from './plan-text.ts';

/**
 * Which stretch of time an account's number of postings is counted over.
 *
 * An account that pays has a number covering the two dates Stripe charged for,
 * and every sentence about it says "this month". An account that pays nothing
 * has a number covering one day measured in UTC, and every sentence about it
 * says "today".
 */
export type Period = 'month' | 'day';

/** The word that stands where a number would be for an account with no limit. */
const NO_LIMIT = 'unlimited';

/** The months, so a day written 2026-10-01 can be read out as October 1. */
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A whole number written the way a person reads one, with a comma every three digits. */
function withCommas(value: number | string): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : String(value);
}

/**
 * A day written 2026-10-01 read out as October 1.
 *
 * The year is left off on purpose: the day a number returns to full is always
 * within the next month or so, and a year in the middle of a sentence is one
 * more thing to read past. A day that cannot be read is handed back as it came,
 * so a sentence never carries the word "undefined" where a date belongs.
 */
export function dayInWords(day: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ''));
  if (parts === null) return String(day ?? '');
  const month = MONTH_NAMES[Number(parts[2]) - 1];
  if (month === undefined) return String(day);
  return `${month} ${Number(parts[3])}`;
}

/** "this month" or "today", depending on which stretch the number covers. */
function stretch(period: Period): string {
  return period === 'day' ? 'today' : 'this month';
}

/**
 * When this account's number of postings returns to full.
 *
 * An account counted over a month is told the day, because that day is weeks
 * away and is the day Stripe charges it again rather than the first of any
 * calendar month. An account counted over one day is told midnight UTC instead:
 * naming a date there would be right on the first day and wrong on every day
 * after it.
 */
export function usageResetsSentence(period: Period, resetsOn: string): string {
  if (period === 'day') return 'Usage resets at midnight UTC.';
  return `Usage resets on ${dayInWords(resetsOn)}.`;
}

/** The numbers the line after a search is built from. */
export type SearchUsed = {
  /** How many cards this page hands back. */
  showing: number;
  /** How many postings match this search in all. */
  matching: number;
  /** How many cards on this page this account had already been handed. */
  alreadyHad: number;
  /** How many postings this search really took. */
  used: number;
  /** How many this account has left, or the word for having no limit. */
  left: number | string;
  period: Period;
  /** The page size this search asked for, when it was cut down to what was left. */
  askedFor?: number;
  /** Both plans' numbers and the price, for an account that could buy Pro. */
  offer?: ProOffer;
};

/**
 * The line printed after a search.
 *
 * It is printed after every search, including one that took nothing at all, so
 * that a coding agent always knows where the account stands rather than reading
 * a silence it has to guess at.
 *
 * Two things were added on 2026-09-14. A search that asked for an ordinary page
 * and got fewer cards because that was all the day had left now says so: until
 * that day the only thing on screen was "Showing 3 of 3,719", which reads as a
 * fact about the query rather than about the account, and the likely paraphrase
 * was "I found 3 postings". And a search that used the last of the day ends with
 * the paragraph handing the person the one sentence that says what the free plan
 * gives, what Pro gives and what Pro costs. That paragraph is added at zero and
 * nowhere else on purpose: a marker on every search would be read past within a
 * day.
 */
export function searchUsedLine({
  showing,
  matching,
  alreadyHad,
  used,
  left,
  period,
  askedFor,
  offer,
}: SearchUsed): string {
  const remaining =
    String(left) === NO_LIMIT
      ? `no limit on this account`
      : `${withCommas(left)} left ${stretch(period)}`;
  const wasTrimmed = askedFor !== undefined && askedFor > showing && offer !== undefined;
  const trimmed = wasTrimmed
    ? ` This page stopped at ${withCommas(showing)} because ${withCommas(showing)} was all ` +
      `this account had left ${stretch(period)}.`
    : '';
  const said =
    `Showing ${withCommas(showing)} of ${withCommas(matching)} matching postings. ` +
    `${withCommas(alreadyHad)} of these you already had. ` +
    `${withCommas(used)} postings used, ${remaining}.${trimmed}`;
  if (offer === undefined || String(left) === NO_LIMIT) return said;
  if (wasTrimmed) {
    return (
      said +
      relayParagraph(searchWasTrimmedSentence(offer, showing, matching), OPEN_THE_PAGE)
    );
  }
  if (Number(left) !== 0 || used === 0) return said;
  return said + relayParagraph(lastPostingUsedSentence(offer), OPEN_THE_PAGE);
}

/** The numbers the refusal is built from. */
export type NotEnoughPostings = {
  /** The page size the command asked for, which is the most it could take. */
  couldTake: number;
  /** How many this account has left. */
  left: number;
  period: Period;
  /** The day the number returns to full, written 2026-10-01. */
  resetsOn: string;
  /** Both plans' numbers and the price, for an account that could buy Pro. */
  offer?: ProOffer;
};

/**
 * What a person reads when a search could take more postings than this account
 * has left. Nothing is taken and no cards come back.
 *
 * The number compared against what is left is the page size the command asked
 * for, not the number of cards that would turn out to be new, because the server
 * cannot know the second number without running the search first. So the
 * sentence says both halves out loud: the most this could have taken, and the
 * fact that a posting this account already has comes back free.
 */
export function notEnoughPostingsRefusal({
  couldTake,
  left,
  period,
  resetsOn,
  offer,
}: NotEnoughPostings): string {
  // "Add --limit 0" is not an instruction anybody can follow, and an account
  // with nothing left read exactly that until this clause was dropped.
  const smaller =
    left > 0 ? `Add --limit ${withCommas(left)}, or narrow the search. ` : 'Narrow the search. ';
  const said =
    `this search could take up to ${withCommas(couldTake)} new postings and this account has ` +
    `${withCommas(left)} left ${stretch(period)}. ${smaller}` +
    `Postings this account already has come back free and are not counted. ` +
    `${usageResetsSentence(period, resetsOn)}`;
  if (offer === undefined) return said;
  return (
    said + relayParagraph(notEnoughPostingsSentence(offer, couldTake, left), OPEN_THE_PAGE)
  );
}

/**
 * The sentence that goes in front of the stop-and-ask message when this account
 * has already been handed a lot of postings inside the last hour.
 */
export function handedInLastHourSentence(howMany: number): string {
  return `This account has been handed ${withCommas(howMany)} postings in the last hour.`;
}

/** The numbers the stop-and-ask message is built from. */
export type StopAndAsk = {
  /** How many new postings the run would take, or the page size it is capped at. */
  wouldTake: number;
  /** True when the number above is a page size asked for rather than a real count. */
  cappedByLimit: boolean;
  /** How many of the matching postings this account already has. */
  alreadyHas: number;
  /** How many postings match this search in all. */
  matching: number;
  /** How many this account has left. */
  left: number;
  /** How many would be left if the person said yes. */
  wouldBeLeft: number;
  period: Period;
  /** The whole command to run again, ending in --confirm and the token. */
  command: string;
  /** How many postings this account has been handed in the past hour, when a lot. */
  handedInLastHour?: number;
  /** Both plans' numbers and the price, for an account that could buy Pro. */
  offer?: ProOffer;
};

/**
 * What a coding agent reads when a search is big enough that the person has to
 * be asked first. Nothing is taken and no cards come back until the same command
 * is run again carrying the token.
 *
 * A run that asked for every page can be counted exactly, so the message names
 * the real figure. A run that named a page size cannot: the server does not know
 * how many of that page this account already has without running the search
 * first, so the number named is the page size and the verb says it is a ceiling.
 */
export function stopAndAskMessage({
  wouldTake,
  cappedByLimit,
  alreadyHas,
  matching,
  left,
  wouldBeLeft,
  period,
  command,
  handedInLastHour,
  offer,
}: StopAndAsk): string {
  const opening =
    handedInLastHour === undefined ? '' : `${handedInLastHourSentence(handedInLastHour)} `;
  const taking = cappedByLimit
    ? `this could take up to ${withCommas(wouldTake)} new postings.`
    : `this would take ${withCommas(wouldTake)} new postings.`;
  // A run asking for more than this account has left cannot go ahead at all, and
  // "so 0 would be left" invited the agent to confirm a run that was about to be
  // refused anyway (Andrew, 2026-09-14).
  const cannotRun = wouldTake > left;
  const outcome = cannotRun
    ? 'so this run cannot go ahead'
    : `so ${withCommas(wouldBeLeft)} would be left`;
  const said =
    `${opening}${taking} This account already has ${withCommas(alreadyHas)} of the ` +
    `${withCommas(matching)} that match, and has ${withCommas(left)} left ${stretch(period)}, ` +
    `${outcome}. Put the choice to the person in one plain ` +
    `sentence before you go ahead. To go ahead, run:\n${command}`;
  if (offer === undefined || !cannotRun) return said;
  return said + relayParagraph(cannotRunOnFreeSentence(offer, wouldTake), OPEN_THE_PAGE);
}

/** The numbers the line the bare `pinloop` command prints is built from. */
export type PostingsSummary = {
  /** How many postings this account has been handed in this stretch of time. */
  used: number;
  /** How many it has left, or the word for having no limit. */
  left: number | string;
  period: Period;
  /** The day the number returns to full, written 2026-10-01. */
  resetsOn: string;
};

/**
 * The line `pinloop` typed with nothing after it prints about postings, beside
 * the line it already prints about judging.
 */
export function postingsSummaryLine({ used, left, period, resetsOn }: PostingsSummary): string {
  if (String(left) === NO_LIMIT) {
    return `Postings: ${withCommas(used)} handed over ${stretch(period)}, no limit`;
  }
  return (
    `Postings: ${withCommas(used)} used, ${withCommas(left)} left ${stretch(period)}. ` +
    `${usageResetsSentence(period, resetsOn)}`
  );
}

// ---------------------------------------------------------------------------
// The sentences `pinloop pull` and `pinloop count` print
// (docs/postings-release-slice-3-criteria.md, approved by Andrew 2026-09-12)
//
// `pinloop pull` asks for the newest postings matching the conditions somebody
// typed, stores them, hands them over, and charges one posting for every row
// that came back — including a row this account had already been handed.
// `pinloop count` says how many postings match and hands none of them over.
//
// These sentences live here for the same reason the ones above do: the wording
// is changed in one place, and the installed command and the server build the
// same sentence out of the same words.
// ---------------------------------------------------------------------------

/**
 * The stretch of time a pull or a count covered.
 *
 * A pull that named no day covers the last week. A count that named no day
 * covers the last month (Andrew, 2026-09-13): a count hands no posting over and
 * so costs nothing per row, and a month is the stretch a person asking "how much
 * work is out there" means. Either command covers everything since the day
 * somebody named when they named one.
 */
export type PullWindow =
  | { kind: 'last-week' }
  | { kind: 'last-month' }
  | { kind: 'since'; day: string };

/** "from the last week" or "since 2026-09-03", as a line about a pull says it. */
function windowInWords(window: PullWindow): string {
  if (window.kind === 'since') return `since ${window.day}`;
  return window.kind === 'last-month' ? 'from the last month' : 'from the last week';
}

/** "in the last month" or "since 2026-09-03", as a line about a count says it. */
function countWindowInWords(window: PullWindow): string {
  if (window.kind === 'since') return `since ${window.day}`;
  return window.kind === 'last-month' ? 'in the last month' : 'in the last week';
}

/** The numbers the line after a pull is built from. */
export type PullUsed = {
  /** How many postings this pull handed back. */
  pulled: number;
  /** How many postings match these conditions in the window, in all. */
  matching: number;
  /** The stretch of time this pull covered. */
  window: PullWindow;
  /** How many of the rows that came back this account had already been handed. */
  alreadyHad: number;
  /** How many postings this pull really took, which is every row that came back. */
  used: number;
  /** How many this account has left, or the word for having no limit. */
  left: number | string;
  period: Period;
  /** The day to name in --posted-after next time, which is the day this pull ran. */
  nextPostedAfter: string;
  /** Both plans' numbers and the price, for an account that could buy Pro. */
  offer?: ProOffer;
};

/**
 * The line printed after a pull.
 *
 * It ends by naming the day to pass back as --posted-after, so the next pull
 * over the same conditions brings back only what is newer than this one.
 */
export function pullUsedLine({
  pulled,
  matching,
  window,
  alreadyHad,
  used,
  left,
  period,
  nextPostedAfter,
  offer,
}: PullUsed): string {
  const remaining =
    String(left) === NO_LIMIT
      ? 'no limit on this account'
      : `${withCommas(left)} left ${stretch(period)}`;
  const said =
    `Pulled the newest ${withCommas(pulled)} of ${withCommas(matching)} matching postings ` +
    `${windowInWords(window)}. ${withCommas(alreadyHad)} of these you already had. ` +
    `${withCommas(used)} postings used, ${remaining}. To pull only newer ones next time, ` +
    `add --posted-after ${nextPostedAfter}.`;
  // The offer is added only when this pull used the last of the day, for the
  // same reason the line after a search adds it only at zero.
  if (offer === undefined || String(left) === NO_LIMIT || Number(left) !== 0 || used === 0) {
    return said;
  }
  return said + relayParagraph(pullUsedTheLastSentence(offer, pulled, matching), OPEN_THE_PAGE);
}

/** The numbers the refusal before a pull is built from. */
export type NotEnoughForPull = {
  /** How many postings this pull would take, which is every row it would bring back. */
  wouldTake: number;
  /** How many this account has left. */
  left: number;
  period: Period;
  /** The day the number returns to full, written 2026-10-01. */
  resetsOn: string;
  /** Both plans' numbers and the price, for an account that could buy Pro. */
  offer?: ProOffer;
};

/**
 * What a person reads when a pull would take more postings than this account has
 * left. Nothing is asked of anybody and nothing is taken.
 *
 * It says "would take" where the refusal before a search says "could take up
 * to". That difference is real: a search charges only for the cards this account
 * has never been handed, so its figure is a ceiling it will often come in under,
 * while a pull charges for every row that comes back and its figure is exact.
 */
export function notEnoughPostingsForPullRefusal({
  wouldTake,
  left,
  period,
  resetsOn,
  offer,
}: NotEnoughForPull): string {
  const smaller = left > 0 ? `Add --limit ${withCommas(left)}, or narrow it. ` : 'Narrow it. ';
  const said =
    `this pull would take ${withCommas(wouldTake)} postings and this account has ` +
    `${withCommas(left)} left ${stretch(period)}. ${smaller}` +
    `${usageResetsSentence(period, resetsOn)}`;
  if (offer === undefined) return said;
  return (
    said + relayParagraph(notEnoughPostingsSentence(offer, wouldTake, left), OPEN_THE_PAGE)
  );
}

/** The numbers the message that stops a big pull is built from. */
export type PullStopAndAsk = {
  /** How many postings the run would take. */
  wouldTake: number;
  /** How many this account has left. */
  left: number;
  /** How many would be left if the person said yes. */
  wouldBeLeft: number;
  period: Period;
  /** The whole command to run again, ending in --confirm and the token. */
  command: string;
  /** Both plans' numbers and the price, for an account that could buy Pro. */
  offer?: ProOffer;
};

/**
 * What a coding agent reads when a pull is big enough that the person has to be
 * asked first. Nothing is asked of anybody and no posting comes back until the
 * same command is run again carrying the token.
 *
 * A pull names one figure and no ceiling, because a pull charges for every row
 * it brings back and that number is known before the run starts.
 */
export function pullStopAndAskMessage({
  wouldTake,
  left,
  wouldBeLeft,
  period,
  command,
  offer,
}: PullStopAndAsk): string {
  const cannotRun = wouldTake > left;
  const outcome = cannotRun
    ? 'so this run cannot go ahead'
    : `so ${withCommas(wouldBeLeft)} would be left`;
  const said =
    `this would take ${withCommas(wouldTake)} postings, and this account has ${withCommas(left)} ` +
    `left ${stretch(period)}, ${outcome}. Search reads postings Pinloop already has; only ` +
    `postings new to this account use its allowance. This pull can collect more matching ` +
    `postings, and every posting it returns uses allowance, including a posting this account ` +
    `already has. Put the choice to the ` +
    `person in one plain sentence before you go ahead. To go ahead, run:\n${command}`;
  if (offer === undefined || !cannotRun) return said;
  return said + relayParagraph(cannotRunOnFreeSentence(offer, wouldTake), OPEN_THE_PAGE);
}

/**
 * What a person reads when this account has already run its day's pulls.
 *
 * The number is handed in rather than written here, because an account that pays
 * may run fifty a day and an account that pays nothing may run ten, and both
 * read the same sentence.
 */
export function tooManyPullsRefusal(limit: number, offer?: ProOffer): string {
  const said =
    `this account has hit its limit of daily pulls (${withCommas(limit)}). ` +
    `Usage resets at midnight UTC.`;
  if (offer === undefined) return said;
  return said + relayParagraph(tooManyPullsSentence(offer), OPEN_THE_PAGE);
}

/** The same, for the day's counts over everything available. */
export function tooManyCountsRefusal(limit: number, offer?: ProOffer): string {
  const said =
    `this account has hit its limit of daily counts (${withCommas(limit)}). ` +
    `Usage resets at midnight UTC.`;
  if (offer === undefined) return said;
  return said + relayParagraph(tooManyCountsSentence(offer), OPEN_THE_PAGE);
}

/**
 * The one line `pinloop count --from ...` prints: how many postings exist
 * in the window it asked over, and which window that was.
 *
 * A count that named no place counts the career sites only and prints this
 * same line, followed by the sentence below (Andrew, 2026-09-26).
 */
export function marketCountLine(matching: number, window: PullWindow): string {
  return `${withCommas(matching)} match ${countWindowInWords(window)}.`;
}

/**
 * The sentence `pinloop count` adds after the number when nobody said which of
 * the two places to count (cutting fantastic.jobs requests, Andrew, 2026-09-26,
 * decision 1). Such a count asks the career sites only, one request rather than
 * two, and this says so and says how to count the job boards.
 */
export function jobBoardsNotCountedSentence(): string {
  return 'Job boards were not counted; add --from "job boards" to count them.';
}

/**
 * The one line `pinloop count` printed when nobody said which of the two
 * places to count (Andrew, 2026-09-13), from a server that still asked both.
 * Kept so that this copy of the command still reads such a server's answer; a
 * server from 2026-09-26 on answers one number instead.
 *
 * A posting is either on an employer's own hiring page or on a job board, never
 * both, so the two numbers are separate questions and neither one on its own is
 * the answer to "how many are out there". The line says both rather than adding
 * them up, because which of the two a person wants decides what they type on the
 * pull that follows.
 */
export function bothFeedsCountLine(
  careerSites: number,
  jobBoards: number,
  window: PullWindow,
): string {
  return (
    `${withCommas(careerSites)} from career sites and ${withCommas(jobBoards)} from job boards ` +
    `${countWindowInWords(window)}.`
  );
}

/**
 * What a person reads when `pinloop pull` did not say which of the two places a
 * posting comes from to collect from (Andrew, 2026-09-13). Nothing is asked of
 * anybody and nothing is taken.
 *
 * A posting is either on an employer's own hiring page or on a job board, never
 * both, and a pull counts one posting out of the account for every row it brings
 * back. So a pull that quietly collected from one of the two would hide half the
 * work from the person, and a pull that collected from both would take up to
 * twice the rows they asked for. The sentence names both values, because a pull
 * with no place named is a person who does not yet know there are two.
 */
export function pullNeedsAFromRefusal(): string {
  return 'A pull needs --from: "career sites" (employers\' own hiring pages) or "job boards".';
}

/**
 * What a person reads when `pinloop count` was given neither of its two flags,
 * or both of them. Nothing runs.
 *
 * The sentence names both flags and what each one does, because a count with no
 * flag is a person who does not yet know there are two of them.
 */
export function countNeedsAFlagRefusal(): string {
  return (
    'count needs one of two flags: --free counts the postings Pinloop already holds, ' +
    '--all counts every posting available. Add one.'
  );
}

/**
 * What a person reads when a pull, or a count over everything available, could
 * not be finished.
 *
 * It says four things on purpose: the fault is Pinloop's rather than theirs,
 * somebody has been told about it, their own number of postings did not move,
 * and trying again in a few minutes is the whole of what they have to do.
 * Nothing in it says where a posting would have come from.
 */
export function couldNotFinishSentence(what: 'pull' | 'count'): string {
  return (
    `Pinloop could not finish this ${what}. This is a problem on Pinloop's side, not yours. ` +
    'It has been recorded and Andrew has been notified of the error. The number of remaining ' +
    'postings this account can view this month is unchanged. Try again in a few minutes.'
  );
}

/**
 * What a person reads when a pull, or a count over everything available, ran out
 * of time rather than failing (Andrew, 2026-09-14).
 *
 * One request is given twenty seconds and is not sent a second time. A request
 * that spends all twenty seconds and is stopped is almost always a query that
 * covers far too much: no country, no kind of job, no words, and a window
 * reaching back months. The sentence therefore names the four things to narrow
 * and says that nothing was taken.
 *
 * This is a different sentence from couldNotFinishSentence above, which stays
 * for a request that really did fail — a refusal from the company, a broken
 * answer, a dropped connection. That one says the fault is Pinloop's, that
 * Andrew has been told, and to try again in a few minutes, and all three of
 * those are wrong for a query that was simply too broad: nothing is broken,
 * nobody needs telling, and trying the identical query again in a few minutes
 * will do exactly the same thing.
 *
 * A count takes no postings from an account at all, so the sentence a count
 * reads stops after the second sentence rather than saying that nothing was
 * taken.
 */
export function tooBroadToFinishSentence(what: 'pull' | 'count'): string {
  const narrow =
    `This ${what} covers too many postings to finish, so Pinloop stopped it. Narrow it, with ` +
    'a more recent --posted-after, a category, a country or words, and try again.';
  if (what === 'count') return narrow;
  return `${narrow} Nothing was taken from this account's postings.`;
}

/**
 * What a person reads when --posted-after names a day further back than six
 * months. Six months is the furthest back any window on offer reaches.
 */
export function postedAfterTooOldRefusal(): string {
  return (
    '--posted-after reaches back further than six months. ' +
    'Pinloop can pull postings from the last six months.'
  );
}

/**
 * What a person reads when a count matching on words is asked to reach back
 * further than thirty days.
 *
 * Saying how many postings anywhere in the world carry a set of words is a
 * different question from handing back the postings that carry them, and the
 * furthest back that question can be asked is thirty days. Matching on the title
 * alone has no such limit, so the sentence names both ways forward: move the
 * day, or match on the title.
 *
 * A pull matching on words has a limit of its own, which is a different number
 * on a different feed; pullByWordsTooOldRefusal below is that sentence.
 *
 * The day handed in is the oldest day this count can still be asked over,
 * written 2026-08-14.
 */
export function countByWordsTooOldRefusal(oldestDay: string): string {
  return (
    'Counting by words reaches back at most 30 days. ' +
    `Move --posted-after to ${oldestDay} or later, or count by title only with --in title.`
  );
}

/**
 * What a person reads when a pull from the job boards, matching words against
 * the whole of a posting, is asked to reach back further than seven days.
 *
 * Measured live against fantastic.jobs on 2026-09-15. The address that hands
 * over job-board postings accepts the windows 1h, 24h, 7d and 6m and no others,
 * and it answers HTTP 400 — "Description search is not available for
 * time_frame=6m. Use a shorter time window for description filtering." — to any
 * request carrying words matched against the whole of a posting together with
 * the six-month window. The same request matching on the title instead is
 * answered normally, and the address that hands over postings from employers'
 * own hiring pages answers the six-month version normally too. So seven days is
 * the furthest back this one shape of pull can reach, and past that there is no
 * window left to send.
 *
 * The sentence names all three ways forward, because all three really work:
 * move the day inside seven days, match on the title instead, or ask the
 * employers' own hiring pages, which take words over the whole six months.
 *
 * The day handed in is the oldest day this pull can still be asked over,
 * written 2026-09-08.
 */
export function pullByWordsTooOldRefusal(oldestDay: string): string {
  return (
    'Pulling from the job boards by words reaches back at most 7 days. ' +
    `Move --posted-after to ${oldestDay} or later, pull by title only with --in title, ` +
    'or pull the same words with --from "career sites", which reaches back six months.'
  );
}

/**
 * The ending two sentences about a date-ordered search now carry, in place of
 * promising every posting the conditions allow.
 *
 * A date-ordered search still has no ceiling of its own. What ended on
 * 2026-09-12 is the promise that it hands back everything: it now hands back
 * postings until this account's own number of them runs out, which is a
 * different thing and is the thing that really happens.
 */
export const UNTIL_POSTINGS_RUN_OUT = "until the account's postings for the month run out";

// ---------------------------------------------------------------------------
// The two sentences slice 5 of the postings release adds
// (docs/postings-release-slice-5-criteria.md, approved by Andrew 2026-09-12,
// criteria 2 and 3)
// ---------------------------------------------------------------------------

/**
 * What a person reads when a routine's pull step names its own day to collect
 * from.
 *
 * A watch sets that day itself, to the day of its last look, and a schedule's
 * pull asks for the last week every time, so a step naming its own day would
 * quietly fight both. It is refused the moment the routine is stored rather than
 * at four in the morning.
 */
export function pullStepTakesNoPostedAfterRefusal(): string {
  return (
    'a pull step in a routine takes no --posted-after. A watch sets that date itself, ' +
    "to the day of its last look, and a schedule's pull asks for the last week every time."
  );
}

/** One pull step that matches no posting at all, as the refusal below reads it. */
export type EmptyPullStep = {
  /** Which step of the routine it is, counting the first step as 1. */
  position: number;
  /** The conditions the step was counted over, as a pull reads them. */
  conditions: Record<string, string>;
};

/** The order a pull step's conditions are read back to the person in. */
const CONDITION_ORDER = [
  'in',
  'country',
  'workplace',
  'employment',
  'company',
  'experience',
  'education',
  'category',
  'from',
] as const;

/** One value, in quotes when it holds a space and bare when it does not. */
function asWritten(value: string): string {
  return value.includes(' ') ? `"${value}"` : value;
}

/** The words a pull step names, one by one. */
function wordsOf(step: EmptyPullStep): string[] {
  return (step.conditions['q'] ?? '')
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '');
}

/** A pull step's conditions written the way a person would type them. */
function stepAsTyped(step: EmptyPullStep): string {
  const written: string[] = [];
  const words = step.conditions['q'] ?? '';
  if (words.trim() !== '') written.push(`"${words}"`);
  for (const named of CONDITION_ORDER) {
    const value = step.conditions[named];
    if (value === undefined || value === '') continue;
    written.push(`--${named} ${asWritten(value)}`);
  }
  return written.join(' ');
}

/**
 * What a person reads when the routine, watch or schedule they are storing holds
 * a pull step that matches no posting at all at this moment.
 *
 * The several-words half of it is the whole point of the sentence. A person
 * carried six words over from `pinloop search`, where any one of the six being in
 * a posting is enough, into a pull step, where all six have to be in the same
 * posting. Two schedules fired that routine for a day, every firing said every
 * step ran and no postings came back, and nothing anywhere said why.
 */
export function pullStepMatchingNothingRefusal(routine: string, step: EmptyPullStep): string {
  const words = wordsOf(step);
  const opening =
    `step ${step.position} of your '${routine}' routine goes out and collects postings, and ` +
    `nothing at all matches what it asks for right now. It asks for \`${stepAsTyped(step)}\`. `;
  if (words.length < 2) {
    return (
      opening +
      "Nothing was stored. Widen the step's conditions and check them with `pinloop count` " +
      'before storing it again.'
    );
  }
  return (
    opening +
    `A pull looks for one posting carrying every word it was given, so all ${words.length} of ` +
    'those words have to appear in the same posting, and a search that was happy with any one ' +
    'of them says nothing about what a pull will find. Nothing was stored. Give the step fewer ' +
    'words, or write them as one bracketed group with OR between them, as in `--in title ' +
    `"(${words[0]} OR ${words[1]})"\`, and check the change with \`pinloop count\` over the ` +
    'same conditions before storing it again.'
  );
}

/**
 * The one sentence a watch whose routine starts by reading the postings Pinloop
 * already holds carries, in its stored outcome and in the lines `pinloop watch
 * get` and `pinloop watch list` print for it.
 *
 * Such a watch keeps working exactly as it always has. What it cannot do is go
 * out and collect anything of its own, so its owner is told what it really does
 * and what to store instead. It never says who collects: to a person there is
 * one job board, Pinloop.
 */
export function searchWatchNotice(routineName: string): string {
  return (
    'this watch only checks postings Pinloop has already collected. To have it go out and ' +
    'collect new postings on its own, store the routine again with a pull as its first step: ' +
    `pinloop routine put ${routineName} ...`
  );
}

// ---------------------------------------------------------------------------
// The employer names `pinloop pull` and `pinloop count` are given
// (Andrew, 2026-09-14)
// ---------------------------------------------------------------------------

/**
 * The most employer names one pull or one count may carry.
 *
 * Two hundred names is about eight thousand characters of web address, which was
 * measured working on 2026-09-14. Five hundred names, about twenty thousand
 * characters, was measured being refused. The limit is here rather than left to
 * chance so that somebody handing over a very long list is told so plainly
 * instead of watching a request fail for a reason nobody can read.
 */
export const MOST_EMPLOYERS_ON_ONE_COMMAND = 200;

/**
 * The employer names out of what somebody typed on `--company`, in the order
 * they typed them.
 *
 * One `--company` may hold several names separated by commas, and `--company`
 * may be written several times over, so both forms arrive here as one piece of
 * text with commas in it. Spaces around each name are dropped, an empty entry is
 * dropped, and the same name written twice is kept once, compared without regard
 * to capital letters, keeping the first spelling. A name itself may not contain
 * a comma, because the comma is what separates one name from the next.
 */
export function employerNamesFrom(text: string | undefined): string[] {
  if (text === undefined) return [];
  const kept: string[] = [];
  const alreadyKept = new Set<string>();
  for (const piece of text.split(',')) {
    const name = piece.trim();
    if (name === '') continue;
    const sameNameAnyCase = name.toLowerCase();
    if (alreadyKept.has(sameNameAnyCase)) continue;
    alreadyKept.add(sameNameAnyCase);
    kept.push(name);
  }
  return kept;
}

/**
 * A list of employer names written out the way a person reads one: commas
 * between them and "or" before the last, because a posting matches when it is
 * from any one of them rather than from all of them.
 */
export function employersInWords(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]!}`;
}

/**
 * What a person reads when `--company` was written but every name on it was
 * blank, so there is no employer to hold the postings to.
 *
 * Going ahead without the restriction would hand back postings from every
 * employer there is while the person believes they asked for one, which is the
 * kind of quiet widening that makes an answer untrustworthy.
 */
export function companyNeedsAnEmployerRefusal(): string {
  return '--company needs at least one employer name. Separate several names with commas.';
}

/** What a person reads when one command named more employers than it may carry. */
export function tooManyEmployersRefusal(named: number): string {
  return (
    `--company takes at most ${withCommas(MOST_EMPLOYERS_ON_ONE_COMMAND)} employer names on ` +
    `one command, and this one named ${withCommas(named)}. Split them across several commands.`
  );
}

/**
 * The line a pull or a count prints when it was held to more than one employer,
 * so the person can see which employers the number in front of them covers.
 *
 * Nothing is printed for a single employer: that name is already the whole of
 * what the person typed and is sitting on the screen above. A hundred names are
 * not, because they came out of a list an agent built.
 */
export function heldToEmployersLine(names: readonly string[]): string {
  return `held to postings from ${employersInWords(names)}.`;
}

// ---------------------------------------------------------------------------
// Two groups of title words joined by AND (Andrew, 2026-09-14)
// ---------------------------------------------------------------------------

/**
 * Whether the words typed on `--in title` are asking for two conditions at once
 * rather than for one list of words.
 *
 * A bracket anywhere in the words, or the word AND written in capitals with a
 * space on each side, means the person wants groups. Everything else, including
 * OR on its own and including a lowercase "and", is left exactly as it was: the
 * words go to the plain title condition, which already reads OR as a choice
 * between words and a space as a demand for both. So nothing anybody types today
 * changes meaning.
 *
 * The reason groups need a road of their own is that the plain title condition
 * ignores brackets completely. Measured on 2026-09-14 over the last month in the
 * United States, on employers' own hiring pages: the plain condition answered
 * 30,416 for "intern OR internship", and answered 109,153 for
 * "(intern OR internship) AND (software OR engineer)". A question that adds a
 * second demand cannot have more postings in it than the first demand alone, so
 * 109,153 is the brackets being thrown away rather than read. The same question
 * asked as groups answered 2,787.
 */
export function titleWordsAreGroups(typed: string): boolean {
  return typed.includes('(') || typed.includes(')') || typed.includes(' AND ');
}

/** One piece of what somebody typed on `--in title`. */
type TitlePiece = {
  /** A plain word, one of the two joining words, or one of the two brackets. */
  kind: 'word' | 'and' | 'or' | 'open' | 'close';
  /** The word itself, for a plain word. */
  text: string;
};

/**
 * What somebody typed on `--in title`, cut into words, joining words and
 * brackets.
 *
 * A bracket ends the word before it and stands on its own, so nobody has to
 * leave a space around brackets. Runs of spaces separate words and are otherwise
 * thrown away. A word spelled exactly AND or exactly OR, in capitals, is a
 * joining word; "and", "And", "or" and "Or" are ordinary words that get looked
 * for in job titles like any other word.
 */
function titlePiecesOf(typed: string): TitlePiece[] {
  const pieces: TitlePiece[] = [];
  let word = '';
  const finishWord = (): void => {
    if (word === '') return;
    const kind = word === 'AND' ? 'and' : word === 'OR' ? 'or' : 'word';
    pieces.push({ kind, text: word });
    word = '';
  };
  for (const letter of typed) {
    if (letter === '(' || letter === ')') {
      finishWord();
      pieces.push({ kind: letter === '(' ? 'open' : 'close', text: letter });
    } else if (/\s/.test(letter)) {
      finishWord();
    } else {
      word += letter;
    }
  }
  finishWord();
  return pieces;
}

/** Whether one piece can end something that a joining word has to join. */
function endsSomething(piece: TitlePiece | undefined): boolean {
  return piece !== undefined && (piece.kind === 'word' || piece.kind === 'close');
}

/** Whether one piece can begin something that a joining word has to join. */
function beginsSomething(piece: TitlePiece | undefined): boolean {
  return piece !== undefined && (piece.kind === 'word' || piece.kind === 'open');
}

/**
 * What is wrong with the shape of the typed title words, said in a few words, or
 * nothing when the shape is fine.
 *
 * Four things count as wrong: a bracket that is never closed, a closing bracket
 * that closes nothing, a pair of brackets with no words between them, and AND or
 * OR standing where there is nothing on one side of it for it to join.
 */
function titleGroupsFault(pieces: readonly TitlePiece[]): string | undefined {
  if (pieces.length === 0) return 'no words in them';
  let open = 0;
  for (let at = 0; at < pieces.length; at += 1) {
    const piece = pieces[at]!;
    const before = at === 0 ? undefined : pieces[at - 1]!;
    const after = pieces[at + 1];
    if (piece.kind === 'open') {
      open += 1;
      if (after === undefined || after.kind === 'close') {
        return 'a pair of brackets with nothing between them';
      }
    }
    if (piece.kind === 'close') {
      open -= 1;
      if (open < 0) return 'a closing bracket that closes nothing';
    }
    if (piece.kind === 'and' || piece.kind === 'or') {
      const word = piece.kind === 'and' ? 'AND' : 'OR';
      if (!endsSomething(before)) return `${word} with nothing before it`;
      if (!beginsSomething(after)) return `${word} with nothing after it`;
    }
  }
  if (open > 0) return 'an unclosed bracket';
  return undefined;
}

/** The shape every refusal about title groups shows the person. */
const TITLE_GROUPS_SHAPE = '(intern OR internship) AND (software OR engineer)';

/**
 * What a person reads when the words typed on `--in title` are asking for groups
 * but are not written in a shape that can be read, or nothing when they are
 * fine.
 *
 * This is decided before a single request leaves, so a misplaced bracket costs
 * nobody one of the day's counts and takes no posting out of the account.
 */
export function titleGroupsRefusal(typed: string): string | undefined {
  const fault = titleGroupsFault(titlePiecesOf(typed));
  if (fault === undefined) return undefined;
  return `the title words have ${fault}; write them like "${TITLE_GROUPS_SHAPE}"`;
}

/**
 * The typed title words written the way the search expression is written.
 *
 * OR becomes a vertical bar, AND becomes an ampersand, brackets stay where they
 * are, and two words with nothing but a space between them become that same
 * ampersand, because a space between title words already means both words are
 * demanded. That last piece was measured rather than assumed, on 2026-09-14 over
 * the last month in the United States on employers' own hiring pages: the plain
 * title condition answered 277 for "software engineer intern", 9,266 for
 * "summer 2027" and 742 for "intern software", and the expression written with
 * ampersands answered 277, 9,266 and 742 for those same three.
 *
 * The expression also offers an adjacency form, two words joined by <->, meaning
 * the second word directly follows the first. That form asks a different
 * question and is not used here. It answered 7,208 for summer followed by 2027
 * against the plain condition's 9,266, so writing a two-word phrase that way
 * would quietly throw away a fifth of the postings the person asked for.
 *
 * A hyphenated word is handed over exactly as it was typed, nothing split and
 * nothing quoted. Measured the same day: "co-op" answered 2,102 through the
 * plain condition and 2,102 through the expression, and "back-end" answered 78
 * through both. Splitting the two halves and joining them with <-> answered
 * 2,160 and 242, which are different questions again.
 *
 * Whoever calls this has already run `titleGroupsRefusal` over the same words
 * and found nothing wrong, so there is no shape left here to refuse.
 */
export function advancedTitleFrom(typed: string): string {
  let built = '';
  let lastEndedSomething = false;
  for (const piece of titlePiecesOf(typed)) {
    // Two things side by side with no joining word between them are both
    // demanded, which is the plain condition's own reading of a space.
    if ((piece.kind === 'word' || piece.kind === 'open') && lastEndedSomething) built += '&';
    if (piece.kind === 'word') built += piece.text;
    else if (piece.kind === 'open') built += '(';
    else if (piece.kind === 'close') built += ')';
    else built += piece.kind === 'and' ? '&' : '|';
    lastEndedSomething = piece.kind === 'word' || piece.kind === 'close';
  }
  return built;
}
