/**
 * The written text `pinloop guide` prints: one entry per command, plus the
 * sections that are not about any one command.
 *
 * The instructions are not one long document typed out by hand. The builder in
 * src/shared/guide.ts walks the real command tree the installed program builds
 * and looks up, for each command it finds, the entry here keyed by that
 * command's name. The names are spelled exactly the way src/core/catalog.ts
 * spells them, with the words joined by single spaces: `search`, `profile put`,
 * `tab add`. A command with no entry here makes src/shared/guide.test.ts fail
 * naming that command, so nobody can add a command to Pinloop and leave it
 * undocumented by accident.
 *
 * Two things are deliberately not in this file. There is no count of what one
 * account has used or has left, of job postings, of judging or of anything else,
 * because a number written here would be compiled into a copy of the program
 * somebody installed weeks ago and would be wrong; the guide names `pinloop`
 * typed on its own as the place those numbers are read. And there are no dollar
 * amounts anywhere.
 *
 * A third thing was deliberately absent until 2026-08-26 and is here now: the
 * instruction telling an agent to ask the person before spending. Andrew ruled
 * against such an instruction on 2026-08-18, emphatic, reaffirmed 2026-08-19,
 * on the grounds that the allowance the server enforces is what protects the
 * person's money. He reversed that on 2026-08-26, after a coding agent ran one
 * `pinloop judge` command over a hundred postings on his own account with
 * nothing said to him first. A run that stays inside the allowance the whole way
 * is never refused, so nothing told him anything had happened
 * (specs/feature-judge-confirmation.md, AGREED 2026-08-26). CONFIRM_EXPLANATION
 * below is that instruction, written once and put into every section whose
 * command can take two calls — five of them since 2026-08-26 and seven since the
 * postings release, which added `search` and `pull`.
 *
 * The three numbers the guide does state — how many requests an account may make
 * in a minute, the most postings one typed command may hand over, and how many
 * counts of what is available an account may run in a day — are read from
 * src/shared/limits.ts rather than typed out here, so that a copy of them cannot
 * go on saying 60 after the server has moved to 120
 * (specs/feature-pull-ceiling.md, section 7). The third of those three moved into
 * src/shared/limits.ts on 2026-09-13 for this reason. Every other ceiling the
 * guide states — a page of 100, a tab of 1,000, 20 steps in a routine — lives in
 * src/server/limits.ts, which the installed command may not import
 * (src/cli/package-boundary.test.ts), so those are written out here as they have
 * always been.
 *
 * The part keyed `method`, which prints under the heading "How to use Pinloop
 * well", was added 2026-09-13 on Andrew's ruling after he ran the onboarding on
 * a staging copy with a coding agent. The agent was told "big tech software
 * internships, at UMD, would relocate in the US". It typed the words "software
 * engineering internship" with a country on them, saw a count of 729, collected
 * five postings and got a construction company's internship and an energy
 * company's internship, because words match loosely. It then used five more of
 * the person's postings tuning the query, and finished by telling the person
 * there were only 167 matching postings in the United States in the last month,
 * which reads as though Pinloop were thin when it holds millions. His ruling was
 * that the agent is not being taught how to use Pinloop at all: it treats typed
 * words as the main condition and the fixed conditions as an afterthought, it
 * collects before it has tuned the query with counts, it hands a first thin count
 * to the person as Pinloop's answer, and it never tells the person why Pinloop
 * has the postings it has. The method is written once, here. A short version of
 * the same mindset is in src/shared/skill-file.ts, and the onboarding's peek step
 * points at this part by its heading rather than carrying its own copy.
 *
 * Rewritten 2026-09-13 for the postings release (specs/feature-posting-allowance.md
 * and specs/feature-postings-on-demand.md, both AGREED 2026-09-10). What changed
 * under the text: nothing collects job postings on a timer any more, `search`
 * reads only what Pinloop has already collected and counts one posting for every
 * result on the page this account never had, `pull` goes out to collect and
 * counts every row it brings back, `count` asks how many match without handing
 * any over, and the six meaning-and-memory flags left `search` for `viewed`.
 *
 * Lane L on the pre-launch board wrote every sentence below, finished 2026-08-21
 * once the two lanes that still touched the command surface had settled their
 * shapes: the monthly allowances on branch judging-allowance, and the
 * subscription command on branch subscription. The entry keyed `billing` is
 * written for a command those branches add. Until one of them ships it, the walk
 * finds no such command and the entry is simply never printed, which is why
 * writing it early breaks nothing.
 *
 * Four of the six worked examples in the `examples` section are real runs against
 * https://api.pinloop.ai on 2026-08-21, pasted as they came back. Where output
 * was cut short the text says so. Two mistakes in the draft they replaced were
 * found by running it: the draft told an agent to type `--country CA`, which
 * matches nothing because postings carry a country's full name, and it spelled a
 * routine's search step `words` when the argument is `q`.
 *
 * The other two examples carry no pasted output and say so in the section
 * itself. They are the one that counts before it collects and the one that
 * searches by meaning, and both name commands that did not exist on 2026-08-21:
 * `pinloop count`, `pinloop pull` and `pinloop viewed`. Pasting made-up output
 * under them would be worse than describing what they do, so nothing is pasted.
 * The pasted four also predate the count of job postings, which is why the
 * section says out loud that a run today prints one line more than they show.
 */
import {
  MARKET_COUNTS_PER_DAY,
  MAX_MESSAGE_CHARS,
  MESSAGES_PER_DAY,
  PAID_MARKET_COUNTS_PER_DAY,
  PULL_CEILING,
  RATE_LIMIT_REQUESTS,
} from './limits.ts';
import {
  firstDayLine,
  firstDaySentence,
  proOfferBlock,
  proOfferFrom,
  relayParagraph,
} from './plan-text.ts';
import { postingsSummaryLine } from './postings-text.ts';

/**
 * The two numbers the message section states out loud, written the way a person
 * reads them: ten thousand as 10,000 rather than 10000.
 *
 * They are built from the constants the server enforces rather than typed here,
 * so a change to either number changes both the limit and the sentence that
 * describes it. The locale is named rather than left to the machine, so the
 * printed text is the same on every machine.
 */
const inFigures = (howMany: number): string => howMany.toLocaleString('en-US');

/**
 * One of the two monthly counts, exactly as the server hands it over: how many
 * of that count this account has used this month, what its limit is or the word
 * saying it has none, and the day the count returns to zero.
 */
export type PrintableAllowance = {
  used: number;
  limit: number | string;
  resets_at: string;
};

/**
 * The word the server sends in place of a number for a count this account has no
 * limit on.
 */
const NO_LIMIT = 'unlimited';

/**
 * The two lines the bare `pinloop` command prints about this month's judging and
 * meaning-based searching, built out of the numbers the server sent.
 *
 * Every number in them comes from the server (specs/feature-judging-allowance.md,
 * AGREED 2026-08-21, architecture point 8). Nothing here holds a copy of any
 * limit, so the day Andrew changes one, every copy of the command anybody has
 * already installed starts printing the new one without being upgraded.
 *
 * A count with no limit prints what it has used and says there is no limit,
 * rather than a fraction of nothing. A count whose numbers the server did not
 * send — an older server answering a newer command — prints no line at all,
 * which is better than a line built out of guesses.
 */
export function allowanceLines(allowances: unknown, plan?: unknown): string[] {
  const held = (allowances ?? {}) as Record<string, unknown>;
  const lines: string[] = [];
  const judge = slotIn(held['judge']);
  const semantic = slotIn(held['semantic']);
  const fullJudgmentCosts = costOfOneFullJudgment(held['quick_postings_per_full_judgment']);
  if (judge) {
    const left = leftOf(judge);
    // How many of those postings this account may still have judged on its own,
    // with the whole job description sent to the model. It is the figure above
    // divided by what the server said one such judgment costs, rounded down
    // (specs/feature-quick-judging-limits.md, AGREED 2026-08-22). Rounded down,
    // because a person told they may judge two postings and then refused the
    // second has been lied to; and no fraction is ever printed, because "1.28
    // full judgments" teaches a person nothing.
    const fullJudgments =
      fullJudgmentCosts === undefined ? undefined : Math.floor(left / fullJudgmentCosts);
    lines.push(
      judge.limit === NO_LIMIT
        ? `Judging: ${judge.used} judged postings this month, no limit`
        : `Judging: ${left} of ${judge.limit} judged postings left this month` +
          (fullJudgments === undefined
            ? ''
            : `, or ${fullJudgments} judged one at a time`) +
          `, resets ${judge.resets_at}`,
    );
  }
  if (semantic) {
    lines.push(
      semantic.limit === NO_LIMIT
        ? `Search by meaning: ${semantic.used} searches by meaning this month, no limit`
        : `Search by meaning: ${leftOf(semantic)} of ${semantic.limit} left this month, ` +
          `resets ${semantic.resets_at}`,
    );
  }
  // The third line, added 2026-09-12 with the posting allowance: how many job
  // postings this account has been handed in the stretch of time it is counted
  // over, and how many are left. Its words live in src/shared/postings-text.ts
  // with every other sentence about postings, so the wording is changed in one
  // place. An account that pays is counted over a month; an account that pays
  // nothing is counted over a day, and the server says which.
  const postings = slotIn(held['postings']);
  if (postings) {
    lines.push(
      postingsSummaryLine({
        used: postings.used,
        left: postings.limit === NO_LIMIT ? NO_LIMIT : leftOf(postings),
        period: String((held['postings'] as Record<string, unknown>)['period']) === 'day'
          ? 'day'
          : 'month',
        resetsOn: postings.resets_at,
      }),
    );
    // What today's number is for, on either of the two days a free account is
    // handed more postings than an ordinary day gives: the day the account was
    // created, and the first day it has run this version of Pinloop. Until
    // 2026-09-14 nothing anywhere said this rule existed, so the account
    // silently had ten and then silently had five.
    const held2 = (plan ?? {}) as Record<string, unknown>;
    const offer = proOfferFrom(held2['offer']);
    const firstDay = held2['first_day'];
    if (
      offer !== undefined &&
      (firstDay === 'new-account' || firstDay === 'new-version') &&
      typeof postings.limit === 'number'
    ) {
      lines.push(
        firstDayLine(firstDay, postings.limit, offer.free.postings) +
          relayParagraph(firstDaySentence(offer, firstDay, postings.limit)),
      );
    }
  }
  // The block that says what the free plan gives and what Pro gives, set apart
  // by a blank line under the lines above, printed only for an account that
  // could actually buy Pro. An account already on Pro and the owner account are
  // sent no offer at all and read nothing here (Andrew, 2026-09-14). Since
  // 2026-09-15 this is the only place those numbers print: `pinloop upgrade`
  // prints the address and nothing else.
  const offer = proOfferFrom(((plan ?? {}) as Record<string, unknown>)['offer']);
  if (offer !== undefined) {
    lines.push('');
    lines.push(proOfferBlock(offer));
  }
  return lines;
}

/**
 * What one posting judged on its own costs out of the judging count, exactly as
 * the server sent it (specs/feature-quick-judging-limits.md, AGREED
 * 2026-08-22).
 *
 * The installed command holds no copy of this number, for the same reason it
 * holds no copy of any limit: a number typed in here would go on being printed
 * after Andrew changed it, on every copy anybody had already installed. A server
 * that sent nothing usable — an older server answering a newer command — makes
 * this undefined, and the judging line then prints the one figure it can be sure
 * of rather than a second figure built out of a guess.
 */
function costOfOneFullJudgment(value: unknown): number | undefined {
  const cost = Number(value);
  if (!Number.isFinite(cost) || cost < 1) return undefined;
  return Math.floor(cost);
}

/** One of the two counts, when the server really sent all three of its parts. */
function slotIn(value: unknown): PrintableAllowance | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const held = value as Record<string, unknown>;
  const used = Number(held['used']);
  const limit = held['limit'];
  const resetsAt = held['resets_at'];
  if (!Number.isFinite(used)) return undefined;
  if (typeof limit !== 'number' && typeof limit !== 'string') return undefined;
  if (typeof resetsAt !== 'string') return undefined;
  return { used, limit, resets_at: resetsAt };
}

/**
 * How many of one count are left this month. It never goes below zero: a count
 * that somehow sits past its limit has none left, and a negative number in front
 * of a person would only read as a mistake.
 */
function leftOf(slot: PrintableAllowance): number {
  const limit = Number(slot.limit);
  if (!Number.isFinite(limit)) return 0;
  return Math.max(0, limit - slot.used);
}

/**
 * The one sentence printed at the very bottom of the guide when nobody is
 * signed in, set apart by a blank line.
 *
 * It sits at the bottom rather than the top because somebody who has just run
 * the guide is looking at the end of their screen, not the start of it. It names
 * the command to run, because a person who reads it and cannot see what to type
 * has learned nothing.
 *
 * The command it names is `pinloop login` and there is no other
 * (specs/feature-browser-sign-in.md, agreed 2026-08-19). Signing in happens in a
 * browser, no password exists anywhere in this product, and the first time an
 * address signs in the account is created at that moment, so there is nothing a
 * separate sign-up step would do.
 */
export const SIGNED_OUT_SENTENCE =
  'Nobody is signed in on this machine. Run "pinloop login" and finish signing in in the browser; the first sign-in creates the account.';

/**
 * The notice that opens the guide when the agent's saved copy of the short
 * instruction file is older than the one this program ships.
 *
 * It tells the agent to tell the person before replacing the file. A file that
 * changes on somebody's machine without them being told is a surprise, and the
 * person may have edited that file themselves.
 */
export function staleSkillNotice(saved: number, newest: number): string {
  return `The copy of the Pinloop instruction file you have saved is out of date.
The copy you are holding is version ${saved}, and this Pinloop ships version ${newest}.
Tell the person their saved Pinloop instruction file is being replaced, then run "pinloop skill" and write the text it prints over the body of the old file.
If "pinloop skill" prints the same version number you already have, this copy of the pinloop command is older than the server and cannot produce the newer file. Tell the person, in plain words, that the Pinloop command on this machine needs updating, and run: npm install -g pinloop
Keep the header your tool put at the top of that file, such as its name and description, and replace only the text below it.`;
}

/**
 * The two-call pattern, written once and put into every section whose command
 * can take two calls: judge, routine run, routine put, schedule put and watch put
 * (specs/feature-judge-confirmation.md, AGREED 2026-08-26), and, from the
 * postings release of 2026-09, search and pull as well
 * (specs/feature-posting-allowance.md: a search asking for more than an ordinary
 * page, or made by an account that has been handed a great many postings in the
 * past hour, and a pull asking for more than an ordinary page, all stop the same
 * way). It was written for judging alone and now says what the first call prints
 * in either case.
 *
 * It is one block reused rather than seven paragraphs saying the same thing,
 * because seven copies are seven places that can quietly drift apart, and a
 * coding agent reading only one section still has to learn the whole rule.
 *
 * It names no dollar figure and never uses the word Pinloop's own bookkeeping is
 * counted in. Everything it states is a count of judgments, full or quick
 * (Andrew, 2026-08-26).
 */
export const CONFIRM_EXPLANATION = `This command can take two calls. The first call does nothing at all: it judges
nothing, it collects nothing, it stores nothing, it takes nothing out of this
account, and it prints what the second call would do along with a token, which is
a random piece of text. Only a second call carrying that same piece of text after
--confirm does the work.

What the first call prints depends on what is being held back. For work that
would judge, it prints how many judgments the work would run, full or quick, and
how many more of that same kind this account has left this month. For work that
would hand job postings over, it prints how many postings the work would take,
how many of the matching postings this account already has, and how many would be
left afterwards. Work that would do both prints both. For a schedule or a watch
it prints the most one firing of the routine could possibly do instead, because
nobody knows yet how many postings a future run will find.

Put the choice to the person in one plain sentence before you run the second
call. Say how much of the month confirming would use, in the counts the first
call printed. Where judging is what is being asked about, say what a Pinloop
judgment gives that reading the postings yourself does not: Pinloop follows its
own worked-out instructions for reading a profile against a posting, and it keeps
the model's written reasoning. A full judgment's verdict is saved for free reuse
anytime that posting comes up again. A quick screen's verdict is saved too, and a
later quick screen on the same posting reads it back for free, but a later full
judgment ignores it and judges that posting again, taking more out of the month.
Then say what the free way is, which is open to you as well:
run "pinloop viewed", "pinloop fetch", "pinloop filter" and "pinloop profile get",
read the postings this account already holds and the
same profile without taking anything out of the month, form your own opinion, and
store that opinion with "pinloop judgment put" if it is worth keeping, after which
Pinloop counts that posting judged exactly as one it judged itself. Wait for the
person to answer, then run the same command again with --confirm and the token.

A token is good for one hour, for this one account, and only for the exact
request that printed it. Naming a different posting, a different number of
postings, the same ones in a different order, a different condition, or a
different number of hours between firings all mean the token no longer matches,
and then the first call has to be run again. A token confirming one page is used
up on that one call. A token confirming a run that follows every page stays good
for the rest of its hour and travels on every page of that run, so nobody is
asked twice for the same run; starting a second run on the same token is
refused.`;

/**
 * One entry per command and per non-command part.
 *
 * The keys are the exact names the catalog spells. Nothing here is generated:
 * this is where a person writes what a command is for.
 */
export const GUIDE_TEXT: Record<string, string> = {
  // -------------------------------------------------------------------------
  // The parts that are not about any one command
  // -------------------------------------------------------------------------

  overview: `Pinloop is a job search tool driven from a terminal. It holds a large collection
of real job postings, it stores written documents describing the person you are
working with, and it reads postings against those documents and says, for each
posting, whether it suits them and why.

You are the one who types these commands. The person you are working with talks
to you, and you run the commands and read the answers back to them.

What changed in this version. Postings no longer arrive in Pinloop on their own
once an hour. Run "pinloop pull" to collect them, or set up a schedule or a
watch that runs a pull automatically. Two commands came with that
change: "pinloop count" says how many postings match a set of conditions and
hands none of them over, which takes nothing out of the account, and "pinloop
pull" goes out and collects them. If you are reading this after updating from an
older copy, those two commands are the ones you did not have before.

There are two ways to reach a job posting, and the difference between them
decides what a command takes out of the account. "pinloop search" looks through
the postings Pinloop has already collected and hands back a page of them.
"pinloop pull" is Pinloop going out to collect right now, so it can bring back
postings Pinloop has never held.

Every account has a number of job postings it may be handed. A posting counts the
first time it reaches this account, in any form, and from then on it belongs to
the account and comes back free forever, whatever happens to the subscription.
The one exception is "pinloop pull", which counts every row it brings back
whether or not the account already had that row, because a pull goes out and
collects rather than reading what Pinloop already holds. That difference is the
single most useful thing to know about working within the number.
Type "pinloop" on its own to read how many this account has used and how many are
left. No such number is written into these instructions on purpose: a number
written here is compiled into the copy of Pinloop somebody installed weeks ago
and is wrong by the time they read it.

Pinloop searches postings and judges them. It does not fill application forms in
and it does not submit applications. If the person expects that, say so plainly
rather than letting them find out later.

A line may appear under any command's answer saying this copy of Pinloop is older
than the newest published one. It names both version numbers and the command that
installs the newest, and it says that new postings now arrive only through the
newer copy, because an older one has no way to collect anything. When you see it,
tell the person and install the newest copy. A different line appears when a copy
is so old the server will not answer it at all, and then nothing works until it is
replaced.

Everything below is generated from the commands this copy of Pinloop actually
has, so it never describes a command that is not on this machine.`,

  method: `Read this part before you run a search, a count or a pull for anybody. The parts
about the single commands further down assume you are working this way.

WHAT PINLOOP HOLDS

New job postings arrive in Pinloop once an hour, taken straight from the systems
employers post their jobs on, like Greenhouse, Lever and Workday, and from the
job boards. They come from everywhere in the world, and there are millions of
them. So when an answer comes back almost empty, the thing to suspect first is
the query you wrote, not the number of postings Pinloop has. Tell the person
where the postings come from, once, in your own words, before you show them any
number. They have no way of knowing how much sits behind a thin-looking answer
unless you say so.

HOW THE WORDS YOU TYPE ARE MATCHED, AND WHY THEY ARE THE BLUNT PART

On "pinloop count" and on "pinloop pull", the words you type go out as one
condition over the whole text of a posting, the job description included, or
over the job title alone when you add --in title. Matching the whole description
is very loose. Almost every posting that deals with the public says the word
representative somewhere in its body text, and an insurance claims department's
posting uses the word representative exactly as often as a retailer's
storefront posting does. Neither of those two commands takes --match at all, and
every word you type has to appear in the same posting before that posting comes
back, exactly the way --match all works on a search. So there is no way to
narrow where the words are looked for beyond --in title, and no way to ask for
any one of several words except the bracketed OR group the next paragraph
describes.

Words held to the title with --in title take two joining words, written in
capitals. OR between two words means either one will do, so "intern OR
internship" finds a title carrying either. AND between two groups means both
groups have to be satisfied, and every group AND joins has to sit inside its own
pair of brackets, as in "(intern OR internship) AND (software OR engineer)". The
brackets are not decoration: without them AND takes hold of the two words either
side of it and nothing else, so "intern OR internship AND software" asks for the
word intern on its own or for internship and software together, which is not the
question anybody meant to ask. Brackets are read on --in title only, and a
bracket left unclosed, or AND with nothing on one side of it, is refused before
anything is counted or collected.

A pull hands over every posting that comes back for the conditions you sent, and
a count counts the same postings, so the two agree. Whatever a count's number
looks like is what a pull over those conditions will collect from.

There is one exception, and it is --posted-after. Postings are collected over
fixed stretches of time, so a pull asking for postings since a day you named
collects over the next stretch wider than the one you want and then leaves out
the postings older than your day. That is the one reason a pull can hand back
fewer postings than the --limit you asked for.

"pinloop search" and "pinloop viewed" read the postings Pinloop has already
collected, and they match words differently from the two commands above. There a
whole word is matched, widened to its other spellings, so "intern" also looks
for interns, internship and internships and stops matching "internal". Any one
of your words is enough unless you add --match all, and --in title looks at the
title only.

BUILD THE QUERY OUT OF THE CONDITIONS FIRST AND THE WORDS SECOND

The conditions that take fixed values are the exact ones: --category,
--employment, --experience, --education, --workplace, --from, --country and
--posted-after. A posting carries each of those as a label of its own, so asking
for --category "Customer Service & Support" and --employment FULL_TIME asks for
the thing itself rather than for a word that happens to appear in the text
somewhere. The searching part of these instructions lists every value each one
takes.

Here is what that looks like. Somebody says they want a customer service
representative role at a large retailer in the United States, and would move
for it. The query that serves them is --category "Customer Service & Support",
--employment FULL_TIME, --country "United States" and --posted-after set to a
month ago, plus --company with every employer they name on it. When the person
names a group of employers rather than single ones, such as big tech, the big
four, or the major hospital systems in a city, write that group out as a list of
names before your first count, put the whole list on one --company value, and
tell the person the list was chosen for them. Few words on it,
or none at all. The query that fails them is the three
words customer service representative with a country beside them, because that
asks for every posting whose text mentions those words. That is how an
insurance company's claims representative posting and a pharmaceutical
company's sales representative posting end up in front of somebody who asked
for a storefront customer service job.

When words do belong on the query, put every name the job goes by into one
--in title value with OR between them, because a title carrying any one of those
names is the job. When the person asked for two things at once, such as an
internship that is also software work, put both groups into that same one title
value with AND between them, as in --in title "(intern OR internship) AND
(software OR engineer)", so the count or the pull carries both demands itself
rather than leaning on --category to supply the second one.

THE LOOP TO RUN EVERY TIME

1. Write down what the person asked for, in their own words, before you type
anything.

2. Build the query out of the fixed conditions above. Add words only where the
conditions leave something out.

3. Count it with "pinloop count". A count hands over no posting and takes
nothing out of this account's postings. Leave --from off and it counts both
places a posting can come from and prints both numbers.

4. Read the number against what that kind of work in that place really has. A
number far below what you would expect means the query is throwing postings
away. Customer service jobs across the United States over a month is a large
number, so an answer in the low hundreds is a query to fix rather than an answer
to report.

5. Change one thing and count again. Try a different category, a different band
of years of experience, the words dropped entirely, the words moved onto the
title with --in title, the other place with --from. Try three or four shapes
before you settle on one. A free account may run ${MARKET_COUNTS_PER_DAY} of these counts a day,
and an account with a paid subscription may run ${PAID_MARKET_COUNTS_PER_DAY}, so a few tries leave
plenty for the rest of the day.

6. Only when the count says what the person asked for, run "pinloop pull", once.

If a count is refused because this account has run all of its counts for the day,
stop tuning and say so. Do not quietly settle for the best query you had reached,
because the person then reads a thin result as what Pinloop holds rather than as
where you stopped.

WHAT YOU SAY TO THE PERSON, AND WHAT YOU KEEP TO YOURSELF

Never tell a person Pinloop has little for them until you have tried several
shapes of the query yourself. A first count is a step in your own working out. A
person handed that first number as the answer walks away believing something
untrue about what is there for them. When you do give them a number, say what
you counted in their own words: "there are 4,200 customer service jobs in the
United States from the last month" rather than a number on its own.

Keep the tuning to yourself. The person sees the final count and the postings,
not the four queries you tried on the way to them. Reading out which conditions
you swapped gives them nothing they can act on and makes a good answer read as
an uncertain one.

WHAT THIS PART DOES NOT REPEAT

What a pull takes out of this account, and the four things to do before you run
one, are written in the part about "pinloop pull". Read that part before the
first pull you run for anybody.`,

  // The four worked examples of the loop above. They sit here, immediately
  // after the method, and print wherever the method prints, because an agent
  // that reads the method without them keeps handing a person five postings
  // that fit half the request. `pinloop guide worked-examples` prints them on
  // their own. The heading line the approved text carried, WORKED EXAMPLES OF
  // THE LOOP, is the section heading in PART_HEADINGS rather than a line of the
  // body, so the part prints under one heading rather than two. Every other
  // sentence is Andrew's approved text of 2026-09-14, word for word.
  'worked-examples': `Four requests, each followed by the working a thorough agent does before it
spends a posting, and then the few sentences it says to the person. The
working is the part to copy. In every one of them the first count is a
question rather than an answer, the whole working fits inside about ten
counts because an account may only run so many a day, and the pull comes
last and runs once. The numbers are what the agent saw in that one example
and nothing more; none of them is a fact about the world, and the agent never
says one as if it were.

Two things all four lean on. First, every label a posting carries, its
category, its kind of employment, its years of experience, was put there by a
reading of the posting, and a reading gets things wrong. The INTERN label
misses co-ops, "new grad" and "early career" roles, titles that say "Summer
2027" or "Class of 2027", and internships the reading labelled FULL_TIME. A
category is a judgement: a paralegal job may be Legal or Administrative, and
a software internship at a bank may be Finance & Accounting or Technology
rather than Software. So never treat one label as the whole truth: count the
obvious label, then count the shapes that label would miss, compare the
numbers, and decide from what you learned. Second, words joined with OR
inside one --in title value are one query and one count, so a dozen names
for the same job cost one count rather than twelve. When the person asked
for two things at once, both go in that same value as two groups joined with
AND, each group inside brackets, and the brackets are required because
without them the meaning changes. Each word matches a whole word, so intern
does not match international, and a phrase like "summer 2027" inside a group
means both words are in the title. A count on title words, or on no words at
all, reaches back six months when --posted-after asks it to; a count on
words in the body of a posting reaches back one month at most.

1. A GROUP OF EMPLOYERS, AND A LABEL THAT MISSES THINGS

The person says: "I'm looking for software engineering internships at big tech
companies in the US."

The working. Four things were asked for: software engineering, internship, big
tech, United States. The country maps onto a condition. Software engineering
and internship will each end up as a group of words in the title, because
the counts below show that the labels for both miss too much. "Big tech" is
a group of employers, and --company takes several names at once and matches
a posting from any of them, so the agent writes the group out as names
before it counts anything, and the list is long rather than short: the dozen
names everybody says first, the chip makers, the cloud and database
companies, the large consumer apps, the enterprise software houses, the ride
and delivery platforms, the payments companies, the streaming services, the
big game studios, and the large hardware makers, about a hundred names in
all, each typed the way the employer is commonly known. That is a choice made
on the person's behalf, so it gets said out loud before any posting is spent.

The INTERN label was put on each posting by a reading of it, and a reading
misses internships whenever the posting does not call itself one in a way the
reading recognised. So the agent does not count the label once and move on.
It counts the shapes an internship takes in this field, but it packs the
shapes into as few counts as they fit, because an account has a fixed number
of counts a day and the whole job, employers included, should fit in about
ten.

Every count below carries --category Software --country "United States"
unless it says otherwise. Words joined with OR inside one --in title value
count as one query, so a dozen names for the same thing cost one count, and
two bracketed groups joined with AND still cost one count.

Count one, the label, to learn the size of the labelled field: --employment
INTERN, no words. It sees 610 from career sites and 640 from job boards.

Count two, the names an internship goes by, in the title, with no employment
label at all: --in title "intern OR internship OR co-op OR coop OR summer
2027 OR class of 2027". Title-only counts reach back six months rather than
one, and internships for a summer are posted the previous autumn, so this one
carries --posted-after set to six months ago. It sees 1,180 and 1,320. That
is roughly twice what the label alone admits, and every posting in it says
in its own title that it is an internship.

Count three, the same title words with --employment INTERN added back. It
sees 590 and 640. The difference between counts two and three, about 600 and
700, is the number of internships the label would throw away. That is what
decides that the pull will not carry --employment INTERN.

Count four, the person's two things joined, with the Software category taken
off and software words put in the title in its place: --in title "(intern OR
internship OR co-op OR coop OR summer 2027 OR class of 2027) AND (software
OR engineer OR engineering OR developer OR SWE)", no category. It sees 1,610
and 1,790. That is more than count two, by about 430 and 470, and the extra
is software engineering internships the reading filed under Technology,
Engineering, Data & Analytics or a bank's Finance & Accounting, which the
Software label alone would have thrown away. Some of count two is missing
from this one too, a Data Science Intern or a Product Intern filed under
Software, and that is right, because the person asked for software
engineering. So the pull carries no category, and the software words in the
title carry that condition instead. The two groups have to be joined with
AND: internship words alone with no category would let through every
internship in the country, marketing and finance and legal among them, and a
five-posting pull cannot spend one of its five on a marketing intern.

Count five, the internships hiding behind plain titles: the word internship
in the body rather than the title, with --posted-after set to a month ago
because counts by words in the body reach back one month. It sees 140 and
180 over the month that the title-word count sees 260 and 300 over. About a
third of last month's internships would be missed by a title-only pull. That
is worth knowing and worth telling the person, and it is not worth a pull of
its own on a five-posting day.

Count six, the neighbours the person did not ask for, so they can be told the
pool exists: --in title "(new grad OR new graduate OR early career OR entry
level OR graduate program OR rotational program OR apprentice OR campus) AND
(software OR engineer OR engineering OR developer OR SWE)", no category. It
sees 540 and 610. One clause in what the agent says, nothing more.

Count seven, the employers, with the internship words only: the hundred
names written down at the start, all on --company at once, with the title
words of count two, --posted-after six months ago, no category and no
employment label. It sees 310 and 420. That is every internship of any kind
at those hundred employers, and it is the number that shows the hole the
next count closes.

Count eight, the same hundred names with the title value of count four, both
groups joined with AND. It sees 170 and 230. So nearly half of what big tech
posts as internships is finance, marketing, legal, design and hardware work
rather than software engineering, and a pull built on count seven would have
spent two of its five on those. This is the number the person hears.

Eight counts. Nothing about the experience band, because a count of every
junior job in the country is not something the pull can use, and nothing per
employer, because the pull itself hands back which employers the five came
from and the person can name one to go deeper on. If the day's counts are
short, count six goes first and count seven second, because neither changes
the pull; count eight is the number the person hears and stays.

The pull is built from what the counts taught: --in title "(intern OR
internship OR co-op OR coop OR summer 2027 OR class of 2027) AND (software
OR engineer OR engineering OR developer OR SWE)", the hundred names on
--company, --country "United States", --from "career sites", --posted-after
six months ago, no category, no employment label, --limit 5. Every one of the
five says in its own title that it is an internship and that it is software
or engineering work, and each comes from a named employer on the list. The
agent still reads every title before showing it, because a title can carry
both groups and not be engineering: a Software Sales Intern, a Sales
Engineer Intern, an Engineering Program Manager Intern. Any of those is
reported as a miss rather than shown as a fit.

What the agent says, before the pull: "Pinloop has about 170 software
engineering internships from the last six months on the careers pages of
about a hundred big tech companies, and about 230 more on job boards. I'm
taking big tech to mean the well-known dozen plus the chip, cloud,
enterprise software, payments, streaming and hardware companies of that
size; say so if you want the list or want names added. Want five from the
careers pages?"

After the pull: the five, each with employer, title, location and how long
ago it was posted, then one sentence: "Those are five of about 170. Those
companies also have about 140 other internships from the same months, in
finance, marketing, design and hardware, and a few hundred new grad and
early career software roles, if you want either of those pools; and about a
third of internships hide behind plain titles like Software Engineer with
the internship only mentioned in the text, so say if you want me to look for
those too."

2. THE CATEGORY IS A JUDGEMENT, AND SO IS THE EMPLOYMENT LABEL

The person says: "I'm a paralegal in Canada looking for a full time job."

The working. Three things were asked for: paralegal, full time, Canada. All
three look like they map onto conditions, and two of the three are labels a
reading put on the posting, so each label gets counted and then checked. One
choice comes first. Paralegal work is posted under other titles as well, law
clerk, legal assistant and litigation assistant among them, so the agent
counts those titles beside the person's own word and says so before a posting
is spent. Every count below carries --country Canada; the title-word counts
carry --posted-after set to six months ago, because a count on title words
reaches back that far.

Count one, the labels, to learn the size of the labelled field: --category
Legal --employment FULL_TIME, no words. It sees 480 from career sites and
1,300 from job boards. Legal holds lawyers, clerks, compliance officers and
legal assistants, so that number says little about paralegal jobs, and
nothing about the ones filed elsewhere.

Count two, the person's own word, in the title, with no category and no
employment label: --in title paralegal. It sees 520 and 1,400. Every posting
in it calls itself a paralegal job in its own title.

Count three, the names the work goes by: --in title "paralegal OR legal
assistant OR law clerk OR litigation assistant". It sees 1,450 and 3,900.
That is the pool, nearly three times the person's own word, and the three
added titles are the reason the choice gets said to the person: legal
assistant in particular is a wider job than paralegal, and some of those
postings will be filing and reception work.

Count four, the title words of count three with --category Legal added back.
It sees 1,090 and 2,950. The difference from count three, about 360 and 950,
is paralegal-shaped postings the reading filed under some other category. A
pull carrying --category Legal would throw a quarter of the pool away, which
decides that the pull carries no category.

Count five, where the quarter went: the same title words with --category
Administrative. It sees 290 and 780. That is most of the gap; the rest is
spread thin across Government & Public Sector, Finance & Accounting and Human
Resources. A paralegal posting whose text is mostly about scheduling, filing
and correspondence reads as administrative work to the reading that labels
it, and it is still a paralegal job.

Count six, the employment label: the title words of count three with
--employment FULL_TIME, no category. It sees 900 and 2,400. So 550 and 1,500
of the pool carry some other employment label or none.

Count seven, how much of that is really part time: the same with --employment
PART_TIME. It sees 130 and 380. So most of what the FULL_TIME label loses is
labelled CONTRACTOR or TEMPORARY, or carries no label at all. In this field a
contract is often full-time hours on a fixed term, and temporary often means
a leave cover or a contract that becomes permanent, so a pull carrying
--employment FULL_TIME would lose about a third of the pool to get rid of
under a tenth. That decides that the pull carries no employment label and
that the agent reads each title instead, because a posting that is part time
almost always says so in its title.

Count eight, the postings whose title says legal assistant but whose text
says paralegal: the word paralegal in the body rather than the title, with
--posted-after set to a month ago because a count on body words reaches back
one month. It sees 610 and 1,700 over that one month, against the 520 and
1,400 that carry paralegal in the title over six months. A month of body
mentions outnumbers six months of title mentions, because lawyer postings say
"works with paralegals", legal assistant postings say "paralegal experience
an asset", and law firm reception postings mention the paralegal team. That
is far too loose to pull on. What it confirms is that postings titled legal
assistant which are paralegal work underneath do exist in numbers, which is
why legal assistant stays in the title words rather than being dropped as too
wide.

Eight counts. If the day's counts are short, count seven goes first and count
five second, because counts six and four already show how much each label
loses and the two extra counts only say where it went.

The pull is built from what the counts taught: --in title "paralegal OR legal
assistant OR law clerk OR litigation assistant" --country Canada --from
"career sites" --posted-after six months ago, no category, no employment
label, --limit 5. Career sites first because those postings come straight
from the employer's own hiring page; the job boards hold nearly three times
as many, and that is said so the person can ask for them. The agent reads
every title before showing it, and one that says part time, casual or student
is reported as a miss rather than shown as a fit.

What the agent says, before the pull: "Pinloop has about 1,450 paralegal,
law clerk, legal assistant and litigation assistant postings in Canada on
employers' own careers pages from the last six months, and about 3,900 on
job boards. I counted all four titles because the same work is posted under
each of them; say so if you want your own title only. Want five from the
careers pages?"

After the pull: the five, each with employer, title, location and how long
ago it was posted, then one sentence: "Those are five of about 1,450. About a
third of them are labelled contract or temporary rather than full time, and
in this field that is often full-time hours on a term, so I kept them in and
read each title. Say the word and I'll get some from the job boards too."
Nothing about Legal versus Administrative, because it changes nothing the
person can act on.

3. A CITY, WHICH PINLOOP CANNOT FILTER ON

The person says: "Nursing jobs in Chicago. I'm an RN."

The working. Three things were asked for: nursing, registered nurse, Chicago.
Location in Pinloop is --country only, so Chicago does not map onto a
condition. A city can only be typed as a word, and a word with no --in title
is matched loosely over the whole posting, so Chicago also matches a hospital
chain's posting in Iowa whose boilerplate names a Chicago head office, and a
posting in a suburb that says "twenty minutes from Chicago". There is one
words condition per command, so the agent cannot ask for nurse in the title
and Chicago in the body at the same time. The better way in is through the
employers whose hospitals are in the city, and that is a choice made on the
person's behalf, so it is said before a posting is spent. Every count below
carries --country "United States"; the title-word counts carry --posted-after
set to six months ago.

Count one, the field, to learn what the title words catch across the whole
country: --category Healthcare --in title "registered nurse OR RN OR staff
nurse OR clinical nurse". It sees 48,000 from career sites and 95,000 from
job boards. Nursing is posted in numbers that large, so any Chicago answer is
a small slice of it, and a Chicago count in the low hundreds is a query to
fix rather than an answer to report.

Count two, what the two letters RN add: the same without RN, --category
Healthcare --in title "registered nurse OR staff nurse OR clinical nurse". It
sees 19,000 and 38,000. So RN alone accounts for 29,000 and 57,000, and that
number is two things mixed. Most of it is titles written "RN, Med Surg" or
"RN - ICU Nights" that never spell out registered nurse, which is how nursing
titles are usually written. Some of it is titles that merely contain those
two letters inside another word: Overnight, Intern, PRN, Journey. RN stays in
the title words because it catches most of the pool, and every title is read
before it is shown.

Count three, the category off: the title words of count one with no category.
It sees 52,000 and 104,000. The gap, about 4,000 and 9,000, is nurse postings
filed under Education, Government & Public Sector or Social Services, under a
tenth of the pool. Keeping --category Healthcare loses that tenth and in
return drops every title outside healthcare that only contains the letters
RN, like an overnight security officer, so the pull keeps the category.

Count four, the employment label: the title words of count one, --category
Healthcare, --employment FULL_TIME. It sees 30,000 and 61,000. Count five, the
same with --employment PART_TIME, sees 6,000 and 12,000. So about 12,000 and
22,000 carry neither label: per diem, PRN, travel and contract nursing, and
postings the reading left unlabelled. The person said nothing about hours, so
the pull carries no employment label, and hours are read off the title, where
nursing postings almost always write them.

Count six, the city as a word: Chicago on its own with no --in title,
--category Healthcare, --posted-after set to a month ago because a count on
body words reaches back one month. It sees 2,100 and 4,600. That is every
healthcare posting in the country from the last month that mentions Chicago
anywhere: nurses among medical assistants, therapists and technicians, some
of them in the suburbs and some of them nowhere near the city. It cannot be
pulled on as it stands, but it is the number the employer route is measured
against.

Count seven, the employers. --company on pull takes a name and goes out with
it exactly as typed, so each hospital system's most common name —
Northwestern, Rush, UChicago, Advocate, Loyola, Cook County, Lurie, Endeavor,
Sinai, Ascension, UI Health — is tried as written rather than looked up first.
About fifteen names survive that, and --company takes all of them at once, so
one count covers the whole list: the title words of count one, --category
Healthcare, --posted-after six months ago, and every name on --company. It
sees 1,900 and 900. Those are registered nurse postings at employers whose
hospitals are in the city, which is closer to what was asked than a word
match, and the job boards hold fewer of them than the career sites because
hospital systems post on their own pages first.

Count eight, how the two routes overlap: the same fifteen names on --company
with Chicago as a body word instead of the title words, --category
Healthcare, --posted-after a month ago. It sees 1,300 and 520, against count
six's 2,100 and 4,600 over the same month. So on career sites the fifteen
systems account for most of everything healthcare that mentions Chicago, and
what they do not account for is smaller employers, clinics and nursing homes,
and out-of-town postings that merely name the city. On job boards they
account for about a tenth, because the boards' Chicago nursing postings come
mostly from staffing and travel nurse agencies. That decides that the pull
goes through the employers and comes from career sites, and that the agencies
get one clause in what the agent says.

Eight counts in all. If the day's counts are short, count two goes first and count five second,
because neither changes the pull: RN stays in the title words either way,
and the employment label stays off either way.

The pull: --company with the fifteen names, --category Healthcare --in title
"registered nurse OR RN OR staff nurse OR clinical nurse" --country "United
States" --from "career sites" --posted-after six months ago, no employment
label, --limit 5. The agent reads every title before showing it, for the
letters RN inside another word and for hours the person may not want, and
reads the location on each card, because a large system also posts for its
suburban hospitals and one of the five may be in Lake Forest or Naperville.

What the agent says, before the pull: "Pinloop has about 1,900 registered
nurse postings from the last six months on the careers pages of the hospital
systems in Chicago, Northwestern Medicine, Rush, UChicago Medicine, Advocate,
Loyola, Cook County Health, Lurie Children's, Endeavor Health and seven more,
some of them at their suburban hospitals, and about 900 more on job boards. I
went in through the hospital systems because Pinloop narrows by country
rather than by city; say so if you want the list or want one added. Want
five from the careers pages?"

After the pull: the five, then one sentence: "Those are five of about 1,900.
I kept part time and per diem out only by reading the titles, so say if you
want full time only or nights only, and the job boards also hold a few
thousand Chicago nursing postings from staffing and travel agencies if you
want those."

4. A NAMED EMPLOYER WITH NOTHING ON ITS OWN PAGE

The person says: "Is Shopify hiring backend engineers in Canada right now?"

The working. One employer, one kind of job, one country, and a yes or no
question. This one takes four counts rather than ten, because every number is
small enough to read whole, and there are only two things to learn: where
Shopify's postings reach Pinloop from, and whether the words or the country
are throwing any of them away. Every count below carries --company Shopify
and --posted-after set to six months ago, because none of them puts words in
the body of a posting.

Count one, the employer alone, no other condition. It sees 0 from career
sites and 210 from job boards. A zero with no condition on it cannot be a
condition's fault: Shopify's own careers page is not one of the places
Pinloop receives postings from, and the 210 on job boards are Shopify's
postings all the same. The zero says nothing about whether Shopify is
hiring, so the agent never says "not hiring". Every count after this one is
a count of the job boards.

Count two, the kind of job as a label: --category Software. It sees 0 and
120. About half of what Shopify puts on the boards is software work; the
other half is sales, support, finance and the rest.

Count three, the kind of job as title words: --in title "backend OR back-end
OR server OR platform OR infrastructure OR API", no category. It sees 0 and
64. So about half of the software postings are backend-shaped, and the rest
are front end, mobile, data and machine learning, which the person did not
ask for.

Count four, the country: the title words of count three with --country
Canada. It sees 0 and 19. The gap, about 45, is the part to read carefully.
Shopify posts many roles as remote with no country on the posting at all, and
a posting with no country matches no --country, so some of those 45 could be
worked from Canada. The person asked for Canada, so the pull carries the
country and spends postings only on the 19, and the 45 get one clause.

Four counts. Nothing about employment or experience, because 19 is small
enough that the five newest can be read whole and the titles say what they
are. If the day's counts are short, count two goes, because it changes
nothing about the pull.

The pull: --company Shopify --in title "backend OR back-end OR server OR
platform OR infrastructure OR API" --country Canada --from "job boards"
--posted-after six months ago --limit 5. The postings are on the job boards,
so that is where the pull goes.

What the agent says, before the pull: "Yes. Pinloop has about 19 backend
Shopify postings in Canada from the last six months, plus about 45 more
Shopify backend postings with no country listed, which is often how remote
roles are posted. Want the five newest of the 19?"

After the pull: the five, then one sentence: "Those are five of 19. Say if
you want the remote ones with no country too; Shopify's own careers page is
not one of Pinloop's sources, so anything posted only there is not here."
That last clause is the one mention of the careers page the person hears,
after the number and after what they can do next.

WHAT THE FOUR HAVE IN COMMON

A group of employers becomes names before a count, and all the names go on
one count rather than one count each. A label is counted and then the shapes
it misses are counted beside it, with the names a job goes by packed into one
title value with OR so the checking fits inside about ten counts, and the
counts that would go first on a short day are the ones that change nothing
about the pull. When the person asked for two things at once, both go in the
title value as two bracketed groups joined with AND, so a five-posting pull
never spends one of the five on a posting that fits half the request. A city
becomes employers whose hospitals are there. A zero is explained rather than
concluded from. In all four, every sentence the person hears leads with what
Pinloop has, the number and where it is, in their own words as what was
counted and never as a fact about the world. A place Pinloop does not receive
postings from, such as an employer's own careers page, is said once, in one
short clause after the number, and only when it changes what the person
should do next; it is never the opening, never a paragraph, and never phrased
as Pinloop failing. Any choice made for the person is said in one sentence
before a posting is spent. Then the postings, each title read before it is
shown, and never a set of five that do not fit with an offer to fix it
afterwards. The tuning in between stays with the agent.`,

  asking: `Things the person can say to you, when they do not know what to ask for. Read
these back to them.

  "Find me remote backend internships in Canada posted this week."
  "Go and get me nursing jobs in Ireland from the last week."
  "Store my resume and a paragraph about what I am looking for."
  "Go through these and tell me which ones are worth applying to, and why."
  "Keep a list of the ones you thought were strong."
  "Keep checking for new postings that match, and add them to that list."
  "Show me the postings you have already found for me."
  "Show me what you have on file about me."`,

  json: `Every command that hands back rows will print machine-readable output instead of
readable lines when you add --json. The shape is nearly always the same: one JSON
object on standard output, holding a "rows" list, plus a "cursor" where there is
another page to ask for. Nothing else goes to standard output, so the output of
one command can be piped straight into the next one. "pinloop count" is the one
that hands back no rows: its object holds the number that matched, and the
stretch of time it counted over when it counted every posting available.

Anything a person needs to read but the next command must not swallow goes to
standard error instead: the report of what a search actually looked for, the line
saying how many postings a search or a pull used and how many are left, what a
filter dropped, warnings, and refusals.

Two of those cross back into the JSON, because a machine reading the output has
to be able to tell them from an empty answer. A command refused for want of
postings prints an object whose "rows" list is empty and whose "refused" field
holds the sentence saying why. A pull or a count Pinloop could not finish prints
an object whose "error" field holds that sentence, and the command ends in
failure. A search and a pull also carry a "postings" field holding the same
numbers the printed line says out loud.

Six commands take no --json, because they hand back no rows: login, logout,
billing, account, profile put and profile delete. Three more take none because
they print prose: welcome, skill and guide.`,

  limits: `One page is at most 100 postings, and a page nobody gives a size to is twenty.
When you want everything rather than one page, add --all and the command follows
every page itself and prints the whole thing at once. --limit and --all cannot be
given together.

A set of posting ids named in one request may hold up to 10,000 of them. More
than about 3,000 will not fit on a command line at all, because a shell cannot
carry that much text as one argument.

--within takes its ids two ways, and the second one is the one to use with a
pipe: either the ids themselves separated by commas, or a single dash, which
means read them from the JSON piped in. So "pinloop tab get shortlist --all
--json | pinloop viewed --within - --unjudged" reads a tab and keeps only what is
still unjudged. Without the dash the command asks for an argument and stops.
"pinloop fetch" is the other one that reads a piped set, and it needs no dash:
give it ids or give it none and pipe the JSON in. Everything else that takes
posting ids, "pinloop judgment delete" and "pinloop judgment get" among them,
takes them as words on the command line only and reads nothing from a pipe.

One account may make 3 tabs of its own, each holding up to 1,000 postings. An
account that already held more than 3 keeps them all and makes no more until it
is below 3. Every account also has one built-in tab named new, which does not
count toward the 3: Pinloop fills it with the postings judged a fit in the chat
on Pinloop's web app and takes a posting out when the person applies to it, and nobody can
rename it, delete it, or put postings in or take them out by hand. A routine
may hold up to 20 steps; those hold whether or not the account pays. An account
that pays may also hold three timed routines, counting its schedules and its
watches together; an account that does not pay may hold none of either.

One judge run judges up to 100 postings. One quick screening run takes up to
1,000 postings and sends them to the model in groups of up to 100.

One typed command may hand over at most ${PULL_CEILING.toLocaleString('en-US')} postings, and that one ceiling
covers "pinloop search --all" and "pinloop pull --all" alike. A --all run over
conditions matching more than that is refused before it hands anything over, in a
sentence naming how many postings matched, so narrow the conditions or walk the
pages yourself with --limit and --cursor.

An account may make up to ${RATE_LIMIT_REQUESTS} requests a minute. Past that the server refuses
and says how long to wait; with --all the command waits it out for you rather
than skipping a page.

Three things an account may only do so much of. The first is job postings: every
account has a number of them it may be handed, counted over a month if the
account pays for a subscription and over a day if it does not. The second is
judging, counted over a month. The third is searching by meaning, which is
"pinloop viewed --semantic", also counted over a month. No number for any of the
three is written here on purpose: a number written into these instructions is
compiled into the copy of Pinloop somebody installed weeks ago and would be wrong
by the time they read it. Type "pinloop" on its own and it prints how much of
each is left, the day each one returns to full and, for an account that is not
paying, what each of those numbers becomes on Pro and what Pro costs a month.

Some lines Pinloop prints end with a paragraph of their own that begins "Tell the
person now, word for word:" followed by a sentence in double quotes. That
sentence is for the person, not for you. Say it to them exactly as printed, with
every number in it unchanged, before you run anything else and before you retry
the command a different way. Do not shorten it, do not round the numbers, do not
fold it into a summary of what you were doing, and do not decide on the person's
behalf that it is not worth mentioning. A person whose search came back short and
who is never told why concludes that Pinloop has little for them, which is untrue
and is the one thing they cannot find out on their own. Everything outside those
double quotes is written for you and is never read aloud, including the command
names, which the person does not need to know: they talk to you and you type.

With --json the line carrying that paragraph is not printed at all. The same
sentence comes back instead under a field named "tell_the_person", and it is
read out the same way.

The one exception is the ordered first steps in "pinloop welcome", which say
plainly where a cost line is skipped on purpose. Follow those steps where they
say so.

A posting counts the first time it reaches this account, whatever brought it: a
card on a page of "pinloop search" or "pinloop pull", a complete record from
"pinloop fetch", a card read back from a tab, a result inside a routine's stored
results, or the record a judge preview prints. From that moment the posting is
this account's for good. Reading it again counts against nothing, however often
and by whatever command, and it stays this account's if the subscription is
cancelled or runs out. In practice a tab, a stored verdict and a preview only
ever hold postings this account already has, so reading them back is always free.

"pinloop pull" is the one command that counts a posting it has counted before,
because a pull goes out and collects rather than reading what Pinloop already
holds. Every row a pull brings back counts, including a row this account was
handed last week.

A request that would take more postings than this account has left is refused
whole, before anything at all is handed over, in a sentence naming how many it
could have taken, how many are left, and the --limit to add instead. Nothing is
ever half-filled. There is one softening: a search nobody gave a --limit to, on
an account with fewer left than an ordinary page, hands back what is left rather
than being refused. A --limit somebody typed is still refused whole when it is
larger than what is left.

"pinloop search" and "pinloop viewed" go out to collect nothing, so neither has
a limit of its own on how many times a day it may be run; the requests a minute
above are the only ceiling over them. "pinloop pull" and "pinloop count" do go
out, and each has its own limit on how many times a day one account may run it.
Type "pinloop" on its own to read how many of each are left today.

A judge run that asks for more postings than the month's judging usage limit
covers judges as many as it covers and then stops, and it ends by saying how
many postings it did not attempt and why, rather than failing. Once nothing is
left, judge and "pinloop viewed --semantic" are refused in a sentence saying when
the usage resets. Reading back a verdict this account already holds takes nothing
out of the month's judging, and neither does --preview.`,

  examples: `Six runs from start to finish. Each line that starts with a $ is what was typed.

Four of the six carry the output Pinloop really printed, and where that output
has been cut short the text says so. Those four were run before an account had a
number of job postings, so a run today prints one line more than they show: after
every search and every pull, a line saying how many postings matched, how many of
the page this account already had, how many postings the run used and how many
are left. The two runs with no output under them are described instead of pasted,
because the commands in them did not exist when the others were run.

1. FIND POSTINGS, THEN READ ONE OF THEM WHOLE

$ pinloop search backend intern --posted-after 2026-07-01 --limit 3

100/3,719 postings that matched came back. This search hands back the best 100 and no more.
searched for postings carrying any one of these words: backend (backend, backends); intern (intern, interns, internship, internships)
Software Engineer Intern, Fullstack - 12 Month Internship
Bitpanda
Vienna, Vienna, Austria
2026-07-15
https://job-boards.eu.greenhouse.io/bitpanda/jobs/4918465101

Internship - Search Backend Infra Engineer
Perplexity
Belgrade
2026-07-01
https://jobs.ashbyhq.com/Perplexity/be94e89b-89d5-4f2a-a58b-7929c8d97f92

FP&A Intern (12-month Internship)
feedzai
Portugal
2026-07-21
https://careers.feedzai.com/job_description?gh_jid=8076564

The first two lines went to standard error rather than standard output, so a
following command never swallows them. The third posting shows why judging
exists: the words matched, the job is a finance internship.

A search result carries no description text. Take an id from --json and fetch
that one posting to read all of it:

$ pinloop fetch 154a6760-e853-4a2f-bf25-5e1fc5d59fc7

id: 154a6760-e853-4a2f-bf25-5e1fc5d59fc7
company_id: 2cbb8ed9-8789-4812-aec1-706e91e45bfe
external_id: 4918465101
title: Software Engineer Intern, Fullstack - 12 Month Internship
company: Bitpanda
locations: ["Vienna, Vienna, Austria","Barcelona"]
workplace_type: 
employment_type: []
description_text: Who we are&nbsp;
We simplify wealth creation. Founded in 2014 in Vienna, Austria by Eric Demuth,

That run printed 53 lines; the description text carries on for another 40 and is
cut off here. Description text is stored as the job board wrote it, so HTML
pieces like &nbsp; appear in it. Two fields on this posting are empty, which is
ordinary: not every posting says whether it is on-site, and not every posting
says whether it is full time.

2. STORE WHAT PINLOOP JUDGES AGAINST, THEN JUDGE

$ pinloop profile put background < background.txt

stored your 'background' document (389 bytes)

$ pinloop search backend intern --posted-after 2026-07-01 --limit 3 --json | pinloop judge

judging 3 postings with openai/gpt-5.6-luna via OpenAI
verdict for 44894d98: no (1 of 3 done)
verdict for 154a6760: weak (2 of 3 done)
verdict for 4f188c1e: strong (3 of 3 done)
3/3 postings you named were judged.
1/4 profile documents were stored and sent to the model.
no constraints document is stored, so nothing could rule a posting out on its own
no preferences document is stored, so the model judged these postings without being told what this person wants
no resume is stored, so the model read no resume
judged 3 postings with openai/gpt-5.6-luna
weak  154a6760-e853-4a2f-bf25-5e1fc5d59fc7
This is a 12-month fullstack internship requiring Vue.js frontend work plus Java/PHP backend, based in Vienna or Barcelona. Your background is backend-focused (Python/Postgres, Go) and you are explicitly looking for a summer 2027 backend or infrastructure internship, remote or in Europe.

Each verdict is followed by its reasoning, and the reasoning of the other two
postings is cut off here. Read the four lines in the middle: this account had
stored one document out of the four judging can use, and every missing one is
named along with what the model therefore could not do. Storing a resume and a
preferences document changes the verdicts, so store them before trusting a run.

3. COUNT FIRST, THEN GO AND COLLECT (described, not pasted)

$ pinloop count nurse --country Ireland

That asks how many nursing postings in Ireland exist over the last thirty days,
or since the day --posted-after names when it names one. With no --from it counts
both places a posting can come from and prints both numbers on one line, like
"3,978 from career sites and 8,428 from job boards in the last month."; adding
--from "career sites" or --from "job boards" narrows it to that one place and
prints the one number. It still hands over no posting and counts none against the
account, but it does go out to ask, so an account may only run so many of these
in a day.

$ pinloop pull nurse --country Ireland --from "career sites" --limit 5

That goes out and collects the newest five, stores them, hands them over, and
counts five postings out of this account whether or not it had any of them
before. The line it ends with names the day to pass back as --posted-after next
time, so the next pull over the same conditions brings back only what is newer.
Those five are now this account's for good, free to read, judge and put in a tab
from here on.

4. LOOK AGAIN AT WHAT THIS ACCOUNT ALREADY HAS (described, not pasted)

$ pinloop viewed --semantic --from-profile --top 5 --limit 3

Nothing is typed to say what to look for. --from-profile builds the text to rank
against out of the account's own stored documents, and the answer names any
document that was not there to use. Every posting it can rank is a posting this
account was already handed, so nothing is counted against this account's
postings, and the result carries a match strength from 0 to 1 on each card. This
is the one kind of run counted against the month's searches by meaning.

5. KEEP THE GOOD ONES IN A NAMED LIST

$ pinloop tab create strong-2027 --description "backend internships worth applying to"

created your 'strong-2027' tab

$ pinloop search backend intern --posted-after 2026-07-01 --limit 3 --json | pinloop judge --keep strong --json | pinloop tab add strong-2027

added 1 posting to your 'strong-2027' tab

$ pinloop tab get strong-2027

Internship - Search Backend Infra Engineer
Perplexity
Belgrade
2026-07-01
https://jobs.ashbyhq.com/Perplexity/be94e89b-89d5-4f2a-a58b-7929c8d97f92
item af0c4b11-3b71-4314-96e5-11311bea2ffc

Three postings went into judge and one came out, because --keep strong hands on
only the postings judged strong. That second run judged nothing new: all three
verdicts were already stored from the run above, so they were read back.
The item id on the last line is what "pinloop tab remove" takes, and it names
the posting's place in this tab rather than the posting.

6. SET IT RUNNING WITH NOBODY AT THE KEYBOARD

$ pinloop routine put nightly-backend --description "new backend internships, judged, strong ones kept" --steps '[{"command":"search","args":{"q":"backend intern","posted_after":"2026-07-01","limit":3}},{"command":"judge","args":{"keep":"strong"}},{"command":"tab add","args":{"name":"strong-2027"}}]'

stored your 'nightly-backend' routine (3 steps)

$ pinloop routine run nightly-backend

running your 'nightly-backend' routine, 3 steps, this can take a few minutes
step 1 (search): 3 postings came out, none were handed in
step 2 (judge): 1/3 postings handed in came out
  3 reused the judgment this account already had
  dropped 154a6760-e853-4a2f-bf25-5e1fc5d59fc7: judged weak, below strong
  dropped 44894d98-c3a8-4c05-a7e3-6abf48df6b6c: judged no, below strong
step 3 (tab add): 1/1 postings handed in came out
  0/1 postings handed in were put in the tab

$ pinloop watch put new-backend --routine nightly-backend

stored your 'new-backend' watch: runs your 'nightly-backend' routine every six hours over the postings that arrive after 2026-07-23T08:00:15.709Z, first run 2026-08-22T01:19:08.315Z

Every step says what it was handed and what it passed on, so a run that produced
nothing tells you which step stopped it. Two lines here report work that was not
done rather than hiding it: the judge step judged nothing new because all three
verdicts were already stored, and the tab step put in 0 of the 1 posting it was
handed because that posting was already in the tab.

Storing a watch needs an account that pays for a subscription; this account
does, which is why the command above succeeded rather than being refused. The
watch has no cadence you set: it looks every six hours.

Read the routine above carefully before copying it, because its first step is a
search. A watch on a search-first routine collects nothing of its own. It can
only ever see postings already in Pinloop, and every line
Pinloop prints about such a watch carries a sentence saying so. To have the watch
go out and collect, store the routine again with a pull as its first step, and
leave --posted-after off that step: the watch sets that day itself, to the day of
its own last look. Storing a routine with a pull step that something already
fires, and storing a watch or a schedule over such a routine, both take two calls,
because that is the one moment somebody is at the keyboard before the thing starts
running on its own.`,

  // -------------------------------------------------------------------------
  // The account commands
  // -------------------------------------------------------------------------

  login: `Signs in, and saves the pass this machine will use in a file only its owner can
read. There is no password anywhere in Pinloop, and there is no separate command
for creating an account: the first time an email address signs in, the account is
created at that moment, and every later sign-in opens the same one.

Run it and it prints a web address and waits. The person opens that address in a
browser, on any machine, and signs in there with Google, with GitHub, or with a
6-digit code Pinloop emails them. The browser then hands the pass back to the
waiting terminal by itself and the command prints one line saying who is signed
in. Read the address out to the person; on a machine that has a browser the
command also opens it.

When the browser is on a different machine from the terminal, which is what
happens over SSH, the page shows a short code instead. Paste that code into the
terminal that is waiting and the sign-in finishes there. The wait ends after ten
minutes with one line saying so.

The pass is good for about an hour, and when it runs out the same file's renewal
token gets a new one automatically, so a person only ever signs in by hand once
per machine.`,

  logout: `Deletes the saved login on this machine and prints one line saying it worked.
It contacts no server: that file is the whole of what being signed in on a
machine means, so deleting it is the whole of signing out. Run on a machine that
has no saved login, it says so and reports success. It signs out this machine
only; a pass saved on another machine is untouched.`,

  account: `Opens the page on pinloop.ai where the person downloads everything Pinloop holds
about them as one file, and where they delete their account. It takes no option.

It prints that web address and exits at once, and on a machine that has a browser
it opens the address as well as printing it. Read the address out to the person,
because on a machine with no browser printing it is the whole of what happens.

The command itself does nothing to the account. It downloads nothing, it deletes
nothing, it sends nothing to the Pinloop server, and it works when nobody is
signed in at this terminal. Everything happens on the page, after the person
signs in there in the browser, and there is no command anywhere that deletes an
account: deleting one acts on a browser sign-in the person made minutes earlier,
which a terminal has no way to stand in for.

Nothing more is printed in the terminal afterwards, whatever the person does on
the page. An account that has been deleted is gone along with everything stored
in it, and a paid subscription is cancelled at the same moment.`,

  billing: `Opens the page where the person sets up, changes or cancels their Pinloop
subscription. "pinloop upgrade" is a second name for the same command and prints
the same thing. Neither name takes any option.

It prints a web address and exits at once. It does not wait and it does not
watch for a payment to go through, so there is nothing to keep open. On a
machine that has a browser it opens the address as well as printing it. Read the
address out to the person, because on a machine with no browser printing it is
the whole of what happens.

Where the address leads depends on the account. An account with no subscription
gets Pinloop's payment page, and the address carries a one-time code that stops
working after ten minutes, so run the command again for a fresh one rather than
reusing an old address. An account that already subscribes gets a one-time
address into Stripe's own page, which is where a card is replaced, past charges
are read, and the subscription is cancelled.

It prints no numbers, for any account. What the free plan gives and what Pro
gives are printed by "pinloop" typed on its own, so read those out when the
person is deciding, and run this command only to open the page.

Nothing more is printed in the terminal afterwards, whatever the person does in
the browser. A subscription that starts raises every one of this account's limits
from the next command onwards: the job postings it may be handed, which also
stops being counted over a day and starts being counted over a month, the
judging, the searches by meaning, the collecting runs a day and the match counts
a day. It also lets the account store schedules and watches, up to three of them
counting both kinds together, which is what lets a saved routine run with nobody
at the keyboard.

When somebody asks what the free plan gives and what paying adds, do not answer
from memory and do not answer in words like "higher limits". Type "pinloop" on
its own. It prints this account's own numbers and, for an account that is not
paying, a block saying what the free plan gives, what Pro gives and
what Pro costs a month. Read that block out to the person as it is printed, both
sides, and when they say they want Pro, run "pinloop upgrade", which only opens
the page. Say what each number counts rather than the bare figure. Read out the number the command printed and then say what it is
a number of, which is job postings a day they have not seen before, and add that
anything they have already been shown stays free to read however often. A bare
figure with no noun on it reads as though the whole product handed over that many
things a day. A person deciding whether to pay needs both sides
in front of them; a sentence about limits being raised tells them nothing they
can decide on. A cancelled subscription keeps the raised usage limits, and keeps its
schedules and watches firing, until the last day already paid for; after that day
the usage limits return to the free ones and the schedules and watches stop
firing. Every job posting the account has already been handed stays its own,
free to read for good, whatever happens to the subscription. A cancelled
subscription
deletes no schedule and no watch: "pinloop" typed on its own still lists every
schedule and watch the account stored, with a line saying they are not running
because the subscription ended, and they fire again if the person subscribes
again. A renewal whose card fails changes nothing while the card is retried over
about two weeks; if it is never paid the account returns to the free usage
limits and its schedules and watches stop firing, in the same way as a
cancellation.`,

  // -------------------------------------------------------------------------
  // The five that take postings and hand postings on
  // -------------------------------------------------------------------------

  search: `Looks through the postings Pinloop has already collected and hands back a page of
them. It never goes out to collect anything, so the only postings it can find are
postings already in Pinloop. When a search turns up less than the
person hoped for, "pinloop pull" is what goes and gets more.

The words are optional. With words, whole words are matched, widened by plural
rules and a small list of paired words, and the best matches come first. With no
words the page is the newest postings by the date they were posted, because there
is nothing to rank. --match all requires every word rather than any one of them,
--order newest puts the newest first even when words were typed, --in title looks
at the title only, and --top says how many postings the server may consider
before it stops.

Narrow the result with --country, --workplace, --employment, --posted-after,
--company, --experience, --education, --category and --from. Those ten conditions,
counting the words themselves as one of them, are the same ten "pinloop viewed",
"pinloop pull" and "pinloop count" take, so a condition learned once works
everywhere.

Six of them take fixed values and it is worth knowing them exactly. --workplace
is one of Remote Solely, Remote OK, Hybrid or On-site. --employment is one of
FULL_TIME, PART_TIME, CONTRACTOR, INTERN or TEMPORARY. --experience is the years
of experience the job asks for and is one of 0-2, 2-5, 5-10 or 10+. --education
is the degree the job asks for and is one of high school, associate degree,
bachelor degree, professional certificate or postgraduate degree; a posting
carries every degree it will accept, so asking for one finds a posting that
accepts it alongside others, and a posting that names no degree at all is found
only by leaving --education off. --category is the kind of job itself rather than
the employer's line of business, written the way Pinloop labels it: Software,
Healthcare, Sales and thirty more. --from is either "career sites", meaning
postings taken off employers' own hiring pages, or "job boards". A value outside
one of those six lists is refused in a sentence listing every real value for that
condition, so a wrong guess is loud rather than silent.

--country is different and quieter: it takes the country's full name as the
posting carries it, like Canada or United States, and a two-letter code such as
CA is not refused at all, it simply matches nothing and comes back empty.
--country holds one country per run. Typing it twice does not search both; the
last one silently wins, so run one country at a time. A posting may carry several
countries, so a posting matched on Germany can well be listed under Portugal too.
--company on "pinloop search" takes one employer's name, matched against
Pinloop's own stored companies; --company-id takes their ids directly,
separated by commas, bypassing that matching. --company on "pinloop viewed"
takes employer ids separated by commas. On "pinloop pull" and "pinloop
count", the same option takes employers' names instead.

--company takes one or more employers wherever it appears, and a posting matches
when it is from any one of them rather than from all of them. Give several by
separating them with commas, as in --company "Google,Microsoft,Amazon", or by
writing the option again for each one, as in --company Google --company
Microsoft. The two forms mean the same thing and may be mixed. Spaces around each
name are ignored, the same employer written twice is counted once, and a name may
not itself contain a comma, because the comma is what separates one name from the
next. One command takes at most 200 employers; more than that is refused in a
sentence saying so. This is how a hundred employers are asked about in one count
and one pull rather than in a hundred of each.

One trap worth knowing about --experience, --education, --category and --from.
They are newer than the postings Pinloop was already holding when they arrived,
and those older postings carry none of the four fields, so a search using one of
the four will not find an older posting however well it fits. That is why adding
one of those four can turn a full page into an empty one.

--semantic, --from-profile, --min-match, --preview, --within and --unjudged do
not belong to this command. All six only make sense over postings an account
already has, so they live on "pinloop viewed". Typing one of them here is refused
before anything is sent, in a sentence that prints the whole command to run
instead.

--limit and --cursor page through the answer, --all follows every page at once,
and --json prints rows a following command can read.

A search counts one posting for each result on the page this account has never
been handed, and nothing at all for the rest. The line printed after it says how
many postings matched, how many of the page this account already had, how many
postings the search used, and how many are left. A page made entirely of postings
this account already holds uses nothing and still prints that line.

A search takes two calls when it is bigger than an ordinary page: a --limit above
twenty, or --all. It also takes two calls whatever its size when this account has
been handed a great many postings in the past hour, which is how an agent walking
page after page is stopped and the person asked. An ordinary page with no --limit
goes through on one call.

${CONFIRM_EXPLANATION}

A search runs perfectly well with no words at all, as long as a condition
narrows it. "pinloop search --company <employer id> --all" hands back every
posting Pinloop holds for that employer, and a search in date order has no
scoring ceiling, so --top does not apply and it pages on until the conditions run
out or this account's postings do. This is the way to read one employer's whole
set out of what Pinloop already holds.

Every answer also reports what the search actually looked for: which match mode
it used, how many postings it was willing to score, and which spellings of each
word it looked for. A wordless search says so in that line, naming what it
narrowed by instead.`,

  viewed: `Searches the postings this account has already been handed, and nothing else. It
takes the same words, the same ten conditions and the same paging options
"pinloop search" takes, and answers in the same shape, so anything that reads a
search reads this too.

Six things belong to this command rather than to search, because all six only
make sense over postings an account already has. --semantic ranks by meaning
rather than by words, --from-profile builds the text it ranks against out of the
account's own stored documents, --min-match sets a strength cutoff from 0 to 1,
and --preview prints the text that would be sent without contacting anybody.
--within stays inside a set of posting ids and --unjudged leaves out everything
this account has already judged.

Nothing here counts against the number of postings this account may be handed:
every posting it can hand back was counted once already, on the day the account
first saw it. So --all follows every page to the end without asking first,
however many pages that is, and the line printed afterwards says no postings were
used. It goes out to collect nothing either, so it has no limit of its own on how
many times a day it may be run.

The one thing it is counted for is meaning. "pinloop viewed --semantic" is the
search by meaning an account may only run so many of in a month; searching here
by words is not counted at all. Asking for a later page of a meaning search you
have already run counts against nothing; only the first page of each one is
counted.

This is the command to reach for when you want to look again at what you have
already seen: everything a pull brought in, everything an overnight routine
found, everything a judge run read, everything sitting in a tab. Reach for it
before "pinloop pull" as well, because collecting a posting this account already
holds counts all over again.`,

  pull: `Goes out and collects the newest postings matching your conditions right now, and
hands them over. Search reads postings Pinloop already has; only postings new to
this account use its allowance. Pull can collect more matching postings, and every
posting it returns uses allowance, including a posting this account already has.
Every row it brings back is written onto this
account's own permanent list of postings, which is what makes that row free from
then on to "pinloop viewed", "pinloop fetch", judging and tabs.

It takes the same ten conditions a search takes, with the same fixed values the
searching part of these instructions lists. The words are the one thing that does
not behave the way a search's words behave. A pull takes no --match at all, and
every word you give it has to appear in the same posting before that posting comes
back, which is what --match all does on a search. So a pull carrying six words
finds only the postings carrying all six, and six words that worked on a search,
where any one of them is enough, can match nothing at all here. There is no option
that turns several words back into "any one of these will do". The one way to ask
for that on a pull is to hold the words to the title and write them as a bracketed
group with OR between them, as in --in title "(intern OR internship)". The part of
these instructions on how the words you type are matched spells those brackets
out. --company is the one condition that differs. On a pull it takes employers'
names, written the way the employers
write them, rather than the employer ids a search takes. It takes one or more of
them: separate several with commas, as in --company "Google,Microsoft", or write
--company again for each one. A posting matches when it is from any one of them,
a name may not contain a comma, and one pull takes at most 200 names. So a
hundred employers are one pull rather than a hundred pulls.

--from is required on a pull and says which of the two places a posting can come
from to collect from: "career sites", meaning employers' own hiring pages, or
"job boards". A pull with no --from is refused before anything leaves this
machine, in a sentence naming both values. The two hold different postings and
neither is a subset of the other, so which one you ask for changes the answer
completely. Ask both by running two pulls, and remember that each of the two
counts its own rows against this account.

The window is the last seven days unless --posted-after names a day, and no
window may reach back further than six months. That is the pull's window; a count
covers the last thirty days when nobody names a day, so the two defaults differ.
The line printed after a pull names the day to pass back as --posted-after next
time, so the next pull over the same conditions brings back only what is newer.

--limit says how many to bring back, twenty when nothing says otherwise.
--cursor asks for the page after the one you have; a later page asks for the same
list again and skips the rows already handed out, so nothing hides between two
pages. --all brings back everything that matches. --json prints rows a following
command can read, each one saying whether this account had already been handed
it.

Before anything leaves this machine, a pull compares the page it is about to ask
for against what this account has left. A page that does not fit is refused
whole: nothing is collected, nothing is counted, and the sentence names the
--limit to use instead. A pull asking for more than twenty in one page, or asking
for everything with --all, takes two calls.

${CONFIRM_EXPLANATION}

Do these four things before you pull, in this order, because a pull is the one
command here that counts a posting this account already holds.

First, look at what this account already has, with "pinloop viewed" and the
words you were going to pull on. Reading postings this account has already been
handed takes nothing out of it at all, and a pull that brings back a posting the
account already has still counts against it.

Second, ask "pinloop count" how many postings exist over the last thirty days.
Leave --from off that count and it prints both places on one line, which is how
you decide which --from the pull itself gets. The count hands over no posting and
takes nothing out of the account.

Third, narrow the conditions before you run the pull. Every row a pull brings
back is one posting out of this account's number of them, so the conditions
decide how many it takes. --limit and --all are the two flags that settle that
number: --limit says exactly how many rows to take, and --all takes every row
the conditions match.

Fourth, pass --posted-after with the day the last pull over the same conditions
printed, so this pull brings back only what is newer than the last one and the
same postings do not come out of this account twice.

One thing that rule misses, so do this as well. A posting is indexed some time
after the employer put it up, and that can be days. A pull that always asks for
what is newer than last time never sees a posting indexed late, whatever day the
employer wrote on it. So every so often run a pull over the whole window with no
--posted-after at all and let the overlap come back once, to catch what the
day-by-day runs went past.

When Pinloop cannot finish a pull it stops and says so, rather than answering
with something older. Nothing comes back, nothing is counted, and the sentence
says four things: the fault is Pinloop's and not the person's, it has been
recorded and Andrew told about it, this account's postings are untouched, and
trying again in a few minutes is the whole of what there is to do. With --json
that same sentence is the "error" field of the one object printed, and the
command ends in failure, so a pull that broke can be told apart from a pull that
found nothing.

How many pulls this account may run a day, and how many postings it may be
handed in a month, are not written here: type "pinloop" on its own and it prints
what is left and the day each one returns to full.`,

  count: `Says how many postings match your conditions, and hands none of them over.
It counts every posting available over the last thirty days, or since the day
--posted-after names when it names one. It takes nothing out of this account's
postings either, but it does go out to ask, so it has a limit of its own on how
many times a day one account may run it, separate from the day's pulls and the
same whether or not the account pays; typing "pinloop" on its own prints how many
are left today. The count a pull runs for its own line is part of that pull and is
not one of them.

--from is optional on a count, unlike on a pull. A count with no --from counts
both places a posting can come from and prints both numbers on one line, like
"3,978 from career sites and 8,428 from job boards in the last month." That is
the line to read before deciding which --from to put on the pull that follows.
Adding --from "career sites" or --from "job boards" narrows the count to that one
place and prints the one number in the usual "1,592 match in the last month."
shape. Counting both still counts as one of the day's counts, because it is one
command.

The conditions are the ten a pull takes. --company takes employers' names, one
or more separated by commas or written as --company again for each one, and a
posting counts when it is from any one of them. One count takes at most 200 of
them, so a hundred employers are one count rather than a hundred counts.

--json prints one object holding the number, and
the window as well when the count covered every posting available; a count that
asked both places carries career_sites and job_boards beside matching, which is
the two added together.

A count that Pinloop cannot finish stops in the same words a pull does, takes
nothing out of the account, and ends in failure.`,

  list: `This command is retired: run "pinloop search" instead, which takes the same
conditions and the same flags with no words after it and hands back the same
postings, newest first.`,

  fetch: `Prints the complete stored record behind each posting id, description text and
all, which is far more than a search result carries. Give the ids on the command
line, or pipe in the JSON another command printed and give none. A large set has
to be piped in rather than typed, because ten thousand ids do not fit on a
command line. --json prints one JSON object holding the records.

Fetching a posting this account has already been handed counts nothing, and that
is the ordinary case, because the ids you are holding came out of this account's
own runs. An id that came from somewhere else, pasted in by the person or handed
over by another agent, is a posting this account has never been handed, and
fetching it counts one.`,

  filter: `Keeps the postings piped into it that satisfy the conditions you give, and says
on standard error what it dropped and why. It contacts no server at all: it works
on rows another command already printed, so it counts nothing against this
account. --country, --workplace, --employment and --posted-after are the
conditions, and they take the same values the searching part of these
instructions lists; --experience, --education, --category and --from are not among
them, so narrowing by one of those four has to be done by the command that
produced the rows. --json prints the survivors as rows a following command can
read.

There is no region or continent condition of any kind. Keeping the postings in
Europe means naming the countries yourself and running filter once per country,
because --country holds one country at a time.`,

  judge: `Reads postings against this account's stored documents and stores a verdict for
each one, with the reasoning behind it. Give the posting ids, or pipe in the JSON
another command printed. A verdict is one of four words: no, weak, fair or
strong.

A verdict this account already holds for a posting is read back rather than
judged again, and the answer says which ones were reused. --again judges every
posting named again and writes the new verdict over the stored one. --keep hands
on only the postings judged at or above a word, so a following command sees only
those. --preview prints exactly what would be sent without sending it, and takes
nothing out of the month's judging; it does hand the postings' own records over,
so a posting this account has never been handed counts one, exactly as a fetch of
it would. --json prints the verdicts as rows a following command can read.

--quick screens rather than judges: it takes up to 1,000 postings, sends their
plain stored facts without the job description text, in groups of up to 100, and
stores a lighter verdict for each. A full judge run writes over a quick verdict
and says so.

A quick screen sends the model far less about each posting, because it leaves
the job description text out, and it uses far less of this account's month as
well. One posting screened by --quick uses half of what one posting
judged in full uses, because a screening call carries up to 100 postings in a
single request and sends no job description with any of them. That is what makes
screening a large number of postings first, and then fully judging only the few
that survive, far easier on the month than fully judging everything. Narrowing
before judging anything still saves more than either. A judge run and a quick
screen take nothing at all out of this account's number of job postings, whatever
they judge; --preview is the one exception, because it prints each posting's own
record.

Because a quick screen never sees the job description, anything stated only in
the description, such as a security clearance or a degree requirement, cannot be
caught by --quick. Only a full judge run reads that text.

What judge sends the model as its instructions is the document stored under the
name judge-prompt, or the one Pinloop ships when nothing is stored there.
--quick reads quick-judge-prompt the same way.

Judging is one of the three things an account may only do so much of in a month,
counted separately from the job postings it may be handed.
A run bigger than what is left of the month's usage judges as much as that
covers and ends by naming how many postings it did not attempt and why; the same postings are
listed in the machine-readable output with that reason on each one. A verdict
read back rather than judged again counts against nothing. Type "pinloop" on its own
to read how much is left.

${CONFIRM_EXPLANATION}`,

  // -------------------------------------------------------------------------
  // The account's own documents
  // -------------------------------------------------------------------------

  'profile put': `Stores one document under a name, replacing whatever that name held before. The
text is read from standard input, or from a file with --file. Seven names mean
something to Pinloop itself: resume, background, preferences, constraints,
application-instructions, judge-prompt and quick-judge-prompt. Any other name of
lowercase letters, digits and dashes is yours to use.

The resume is a real PDF file rather than text: Pinloop checks that it is a PDF
before storing any of it, keeps the bytes in a private store, and reads the words
out of it once so a meaning-based search can use them. --default, on judge-prompt
or quick-judge-prompt only, removes the stored text so runs go back to the
instructions Pinloop ships.`,

  'profile get': `Prints one stored document. With no name and --all, prints every document, text
included, as one JSON object. --text prints the words read out of a stored file
rather than the file itself, which is how you read the resume as text. Without
--text the resume comes back as the PDF bytes, so send it to a file rather than
to the terminal.`,

  'profile list': `Shows every document this account has stored, with each one's kind, size and
last-updated date. It never prints the text of a document. --json prints one JSON
object holding the documents.`,

  'profile delete': `Removes one document, or every document this account has stored with --all. When
the resume is removed, the stored file's bytes are destroyed with the row.`,

  // -------------------------------------------------------------------------
  // The account's own named lists of postings
  // -------------------------------------------------------------------------

  'tab create': `Makes one named list of postings. The name is lowercase letters, digits and
dashes. --description says what the tab is for. An account may make 3 tabs of
its own, besides the built-in tab named new.`,

  'tab list': `Shows every tab this account has, with how many postings each one holds. --limit
and --cursor page through the answer, --all follows every page at once, and
--json prints one JSON object holding the tabs.`,

  'tab get': `Shows the postings in one tab as Pinloop holds them right now, rather than
as they were when they were added. A posting that has since been taken down comes
back marked as gone rather than quietly disappearing. Every posting in a tab is
one this account was handed before it went in, so reading a tab counts nothing.
--sort orders by when a posting was added or by the date the job was posted,
--order chooses newest or oldest first, --limit and --cursor page through the
answer, --all follows every page, and --json prints rows a following command can
read.`,

  'tab add': `Puts postings into one tab, either by id on the command line or from the JSON
piped into it, which is how the result of a search or a judge run goes straight
into a list. A tab holds up to 1,000 postings, and a posting already in the tab
is not added twice. This is the one command that changes something and can still
be a step inside a routine, so a routine running overnight can fill a tab.`,

  'tab remove': `Takes postings out of one tab, named by the item ids that reading the tab prints.
Nothing about the postings themselves changes.`,

  'tab rename': `Gives one tab a different name, keeping everything in it.`,

  'tab delete': `Removes one tab and everything in it. The postings themselves are untouched; only
the list goes.`,

  // -------------------------------------------------------------------------
  // The stored verdicts
  // -------------------------------------------------------------------------

  'judgment list': `Shows every verdict this account has stored, newest first, each line ending with
who made it. --verdict shows only the verdicts carrying one word, --judged-by
narrows to one source and takes one of three words: "user" for a verdict a person
stored by hand, "pinloop" for one a full judge run produced, and "pinloop-quick"
for one a quick screening run produced. Nothing records whether a judge run was
typed at a keyboard or fired by a schedule or a watch, so both land under
"pinloop" and cannot be told apart. --reasoning prints the reasoning of each one
underneath. --limit,
--cursor and --all page through the answer, and --json prints one JSON object
holding the verdicts.`,

  'judgment get': `Shows one stored verdict whole, the reasoning included, for the posting id you
name.`,

  'judgment delete': `Removes the stored verdicts for the postings you name, so judging them again
produces a fresh verdict.`,

  'judgment put': `Stores a verdict a person made outside Pinloop, so Pinloop counts that posting
judged and leaves it out of later runs. Give one posting id with --verdict and
--reasoning, or pipe in up to 1,000 rows as JSON. Every verdict stored this way
is marked as made by a person, and storing one calls no model and counts against
nothing. A bad row is dropped and named rather than stopping the good ones.

A verdict this account already holds for that posting is written over, whoever
made it, and the answer lists what was replaced and who had made it. There is no
need to delete the old verdict first.`,

  // -------------------------------------------------------------------------
  // The stored pipelines
  // -------------------------------------------------------------------------

  'routine put': `Stores a pipeline of commands under a name, replacing whatever that name held
before. The steps are a JSON list, given with --steps or piped in, of up to 20
steps. A step may name only a command that takes postings and hands postings on:
search, pull, viewed, fetch, filter, judge and tab add. --description says what
the routine is for.

A step's arguments are spelled the way the machine-readable output spells them,
not the way the option is typed at a terminal: the words to search for are "q"
rather than the bare words, and a name of more than one word carries an
underscore, as in "posted_after". An argument a command does not take is refused
when the routine is stored, in a sentence naming the step, the argument and
every argument that command does take, so a wrong name is found once rather than
every night.

A search step and a pull step count job postings exactly as the typed commands
do, one for one, out of the same number this account has. A step is never
half-filled: it runs whole or is refused whole, and a firing refused for want of
postings writes that refusal into its own stored outcome instead of quietly
finding nothing. A pull step may not carry --posted-after at all, and a routine
holding one is refused the moment it is stored: a watch sets that day itself, to
the day of its own last look, and a schedule's pull asks for the last week every
time, so a step naming its own day would fight both.

Storing a routine is stopped and asked about only when a schedule or a watch this
account owns already fires that routine AND the version being stored holds a
judge step, a pull step, or both. A routine nothing fires yet is stored on the
first call, whatever is in it, because nothing can run it until something fires
it.

${CONFIRM_EXPLANATION}`,

  'routine get': `Shows one stored routine and the steps it holds, in order.`,

  'routine list': `Shows every routine this account has stored.`,

  'routine delete': `Removes one routine. A routine a schedule or a watch fires is not removed; the
refusal names what is still pointing at it.`,

  'routine run': `Runs one routine's steps in order on the server and prints what the last step
produced. --within gives the first step a set of posting ids to work inside,
either as ids or as JSON piped in. --json prints rows a following command can
read. Every step's outcome is kept, so a run that stopped part way says which
step stopped it.

A run whose steps reach a judge step is stopped at that step the first time, the
same way a typed "pinloop judge" is. A run of a routine with no judge step in it
runs on the first call as it always has, and that includes a routine holding a
pull step: a pull inside a routine never stops to ask, it runs whole or is
refused whole. So read the routine with "pinloop routine get" before running one
you did not write, because a pull step collects and counts postings the moment
the run reaches it.

${CONFIRM_EXPLANATION}`,

  'routine results': `Shows what the most recent run of one routine produced, read fresh out of what
Pinloop holds rather than from a copy taken at the time. --json prints rows a following command
can read.`,

  // -------------------------------------------------------------------------
  // Running without anybody at the keyboard
  // -------------------------------------------------------------------------

  'schedule put': `Stores a schedule: one routine, run every so many hours with nobody at the
keyboard. --routine names the routine and --every-hours is a whole number of
hours from 6 to 168, both required. --first-due-at fixes when the first run
happens, and the time of day it lands on is the time of day every later run lands
on. Storing a schedule needs an account that pays for a subscription, and
"pinloop upgrade" starts one. An account may hold three timed routines in all,
counting its schedules and its watches together.

Storing a schedule is stopped and asked about when its routine reaches a judge
step, when its routine holds a pull step, or both, because storing the row is the
one moment somebody is at the keyboard before it starts firing on its own. A
routine that collects is reported as the most one firing could take out of this
account's postings; a routine that judges is reported as the most one firing
could judge; a routine that does both is reported as both. Every such call is
asked about, including one that changes nothing but the number of hours between
firings. A schedule for a routine that neither judges nor collects is stored on
the first call as it always has been.

A schedule's pull step asks for the last week every time it fires, so a schedule
is the wrong shape for "tell me what is new": use a watch for that, which asks
only for what has appeared since its own last look.

${CONFIRM_EXPLANATION}`,

  'schedule get': `Shows one schedule, when it next runs, and how its last run went.`,

  'schedule list': `Shows every schedule this account has stored, with the next run and the outcome of
the last one.`,

  'schedule delete': `Removes one schedule, so the routine it ran stops running by itself. The routine
itself stays.`,

  'watch put': `Stores a watch: one routine, run over whatever is new since this watch last
looked. --routine names the routine, whose first step has to be a search or a
pull, and is required. A watch has no cadence of its own; it looks every six
hours. Nothing new means nothing runs. Storing a watch needs an account that pays
for a subscription, and "pinloop upgrade" starts one. An account may hold three
timed routines in all, counting its schedules and its watches together. A routine
whose last step adds to a tab is what fills a list of new finds overnight.

What "new" means depends on the routine's first step, and that difference matters
more than anything else about a watch. A watch whose routine starts with a pull
goes out and collects for itself. Each firing asks how many postings now match
over the stretch it is watching, subtracts the number it counted at its last
look, and collects exactly that difference, newest first. A quiet stretch
collects nothing and counts nothing. One new posting counts one posting. The pull
step's own --limit caps how many a single firing may take, and --all means the
whole difference up to what the account has left. The routine then sees only the
postings Pinloop first saw after the last look, so a job the employer re-posted
last night is never announced as new.

A watch whose routine starts with a search collects nothing at all. It can only
ever see postings already in Pinloop, so a stretch when nothing new showed up
there finds nothing, and every line Pinloop prints
about such a watch carries one sentence saying so and naming what to store
instead. Nothing arrives in Pinloop on its own any more, so this is the mistake
worth checking for: if the person asked to be told about new postings, the
routine's first step has to be a pull.

Storing a watch is stopped and asked about when its routine reaches a judge step,
when its routine holds a pull step, or both, because storing the row is the one
moment somebody is at the keyboard before it starts looking every six hours on
its own. A watch for a routine that neither judges nor collects is stored on the
first call as it always has been.

${CONFIRM_EXPLANATION}`,

  'watch get': `Shows one watch, when it next looks, and how its last firing went, including how
many postings were new and how many of them matched. A watch whose routine starts
with a search rather than a pull collects nothing of its own, and the line for it
carries one sentence saying so and naming what to store instead.`,

  'watch list': `Shows every watch this account has stored, with the outcome of the last firing of
each one, and the same sentence under any watch whose routine collects nothing of
its own.`,

  'watch delete': `Removes one watch, so the routine it ran stops running by itself. The routine
itself stays.`,

  // -------------------------------------------------------------------------
  // Reaching the person who builds Pinloop
  // -------------------------------------------------------------------------

  message: `Sends a message to Andrew (who builds Pinloop) and prints the conversation between
this account and him. Typed with words after it, it sends those words. Typed on
its own, it prints the whole back-and-forth, oldest message first. --json prints
that same conversation as rows you can read.

Use it when something goes wrong: a command failed, an answer looks wrong, the
collection is missing something the person expected, or Pinloop does not do something
they need. Andrew reads these himself and answers.

Never send anything the person has not read. Write the draft yourself, show them
the exact words you are about to send, wait for them to say yes, and only then
run the command. If you are writing about something that broke, paste the command
that failed and the error text it printed into the draft, so the person reads
both before they say yes. Pinloop attaches nothing to the words on its own, which
means an error line holding the path to their resume file goes only if they read
it and left it in.

One message is at most ${inFigures(MAX_MESSAGE_CHARS)} characters, which is long enough for a real
report with a whole error dump pasted into it. One account may send ${inFigures(MESSAGES_PER_DAY)}
messages a day. Going over either one is refused in a sentence saying what the
limit is, and the second of the two also says when the limit lifts.

When a line appears telling you an answer from Andrew is waiting, run this
command and give the person his answer word for word. Once the conversation has
been printed, the line stops appearing.`,

  // -------------------------------------------------------------------------
  // The three that print text
  // -------------------------------------------------------------------------

  welcome: `Prints the text that introduces Pinloop to you: what Pinloop is, the short
instruction file to save into your own skills folder, and the first steps to work
through with the person, in order. It prints the same text whether or not
anybody is signed in, and it contacts no server. It is the first thing to run on
a machine where Pinloop has just been installed.`,

  skill: `Prints the short instruction file, the few sentences you save in your own skills
folder and read at the start of a conversation. It writes no file anywhere:
every agent tool looks in a different folder, and you are the only one who knows
where yours looks. The text carries a version number, and it ends by telling you
to come back and read these full instructions. The text is the body of the
file, not the whole file: if your tool expects a header at the top of a skill
file, such as a name and a description, that header is yours to write, above
the text, and the text below it stays exactly as printed.

Tell the person before you write this text over a file they already have. The
file sits in their own skills folder and they may have edited it themselves, so
replacing it without saying so takes away something of theirs without asking.
When you do replace it, keep the header at the top and write the new text over
the body only. Saving it for the first time needs no such warning. To find out whether the copy
you hold is behind, run "pinloop guide --skill" with the version number written
in your saved copy; the instructions then open with a notice when yours is
older, and print nothing extra when it is current.`,

  guide: `Prints these instructions. With no part named it prints all of them; with the
name of a command after it, like "pinloop guide judge", it prints that command's
part only. It works whether or not anybody is signed in. --skill takes the
version number of the instruction file you have saved, and the output opens with
a notice when your saved copy is older than the one this Pinloop ships.`,
};
