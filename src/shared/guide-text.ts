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
 * Three things are deliberately not in this file. There is no count of what one
 * account has spent this month, because a number written here would be compiled
 * into a copy of the program somebody installed weeks ago and would be wrong;
 * the guide names `pinloop` typed on its own as the place those numbers are
 * read. There are no dollar amounts anywhere. And there is no instruction
 * telling an agent to ask the person before spending money (Andrew, 2026-08-18,
 * emphatic, reaffirmed 2026-08-19): what protects the person's money is the
 * allowance the server enforces, and a sentence asking permission protects
 * nobody while making every run slower.
 *
 * The two numbers the "limits" section does state — how many requests an
 * account may make in a minute, and the most postings one command may pull —
 * are read from src/shared/limits.ts rather than typed out here, so that a copy
 * of them cannot go on saying 60 after the server has moved to 120
 * (specs/feature-pull-ceiling.md, section 7).
 *
 * Lane L on the pre-launch board wrote every sentence below, finished 2026-08-21
 * once the two lanes that still touched the command surface had settled their
 * shapes: the monthly allowances on branch judging-allowance, and the
 * subscription command on branch subscription. The entry keyed `billing` is
 * written for a command those branches add. Until one of them ships it, the walk
 * finds no such command and the entry is simply never printed, which is why
 * writing it early breaks nothing.
 *
 * The five worked examples in the `examples` section are real runs against
 * https://api.pinloop.ai on 2026-08-21, pasted as they came back. Where output
 * was cut short the text says so. Two mistakes in the draft they replaced were
 * found by running it: the draft told an agent to type `--country CA`, which
 * matches nothing because postings carry a country's full name, and it spelled a
 * routine's search step `words` when the argument is `q`.
 */
import {
  MAX_MESSAGE_CHARS,
  MESSAGES_PER_DAY,
  PULL_CEILING,
  RATE_LIMIT_REQUESTS,
} from './limits.ts';

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
export function allowanceLines(allowances: unknown): string[] {
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
Tell the person their saved Pinloop instruction file is being replaced, then run "pinloop skill" and save the text it prints over the old file.`;
}

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

Pinloop searches postings and judges them. It does not fill application forms in
and it does not submit applications. If the person expects that, say so plainly
rather than letting them find out later.

Everything below is generated from the commands this copy of Pinloop actually
has, so it never describes a command that is not on this machine.`,

  asking: `Things the person can say to you, when they do not know what to ask for. Read
these back to them.

  "Find me remote backend internships in Canada posted this week."
  "Store my resume and a paragraph about what I am looking for."
  "Go through these and tell me which ones are worth applying to, and why."
  "Keep a list of the ones you thought were strong."
  "Check every morning for new postings that match, and add them to that list."
  "Show me what you have on file about me."`,

  json: `Every command that hands back rows will print machine-readable output instead of
readable lines when you add --json. The shape is always the same: one JSON
object on standard output, holding a "rows" list, plus a "cursor" where there is
another page to ask for. Nothing else goes to standard output, so the output of
one command can be piped straight into the next one.

Anything a person needs to read but the next command must not swallow goes to
standard error instead: the report of what a search actually looked for, what a
filter dropped, warnings, and refusals.

Four commands take no --json, because they hand back no rows: login, logout,
profile put and profile delete. Three more take none because they print prose:
welcome, skill and guide.`,

  limits: `One page is at most 100 postings. When you want everything rather than one page,
add --all and the command follows every page itself and prints the whole thing
at once.

A set of posting ids named in one request may hold up to 10,000 of them. More
than about 3,000 will not fit on a command line at all, because a shell cannot
carry that much text as one argument.

--within takes its ids two ways, and the second one is the one to use with a
pipe: either the ids themselves separated by commas, or a single dash, which
means read them from the JSON piped in. So "pinloop tab get shortlist --all
--json | pinloop list --within - --unjudged" reads a tab and keeps only what is
still unjudged. Without the dash the command asks for an argument and stops.
"pinloop fetch" is the other one that reads a piped set, and it needs no dash:
give it ids or give it none and pipe the JSON in. Everything else that takes
posting ids, "pinloop judgment delete" and "pinloop judgment get" among them,
takes them as words on the command line only and reads nothing from a pipe.

One account may hold 100 tabs, each holding up to 1,000 postings, and a routine
may hold up to 20 steps; those hold whether or not the account pays. An account
that pays may also hold 10 schedules and 10 watches; an account that does not
pay may hold none of either.

One judge run judges up to 100 postings. One quick screening run takes up to
1,000 postings and sends them to the model in groups of up to 100.

One command may pull at most ${PULL_CEILING.toLocaleString('en-US')} postings. A --all run over conditions
matching more than that is refused before it fetches anything, in a sentence
naming how many postings matched, so narrow the conditions or walk the pages
yourself with --limit and --cursor.

An account may make up to ${RATE_LIMIT_REQUESTS} requests a minute. Past that the server refuses
and says how long to wait; with --all the command waits it out for you rather
than skipping a page.

Judging and searching by meaning are the two things an account may only do so
much of in a month. Both counts reset at the start of each calendar month. No
number for either one is written here on purpose: a number written into these
instructions is compiled into the copy of Pinloop somebody installed weeks ago
and would be wrong by the time they read it. Type "pinloop" on its own and it
prints how much of each is left and the date they reset.

A judge run that asks for more postings than the month's judging usage limit
covers judges as many as it covers and then stops, and it ends by saying how
many postings it did not attempt and why, rather than failing. Once nothing is
left, judge and a search with --semantic are refused in a sentence saying when
the usage resets. Reading back a verdict this account already holds counts
against nothing, and neither does --preview.`,

  examples: `Five runs from start to finish, with the output Pinloop really printed.
Each line that starts with a $ is what was typed; everything under such a line
is what came back. Where output has been cut short, the text says so.

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

judging 3 postings with anthropic/claude-sonnet-5 via Anthropic
verdict for 44894d98: no (1 of 3 done)
verdict for 154a6760: weak (2 of 3 done)
verdict for 4f188c1e: strong (3 of 3 done)
3/3 postings you named were judged.
1/4 profile documents were stored and sent to the model.
no constraints document is stored, so nothing could rule a posting out on its own
no preferences document is stored, so the model judged these postings without being told what this person wants
no resume is stored, so the model read no resume
judged 3 postings with anthropic/claude-sonnet-5
weak  154a6760-e853-4a2f-bf25-5e1fc5d59fc7
This is a 12-month fullstack internship requiring Vue.js frontend work plus Java/PHP backend, based in Vienna or Barcelona. Your background is backend-focused (Python/Postgres, Go) and you are explicitly looking for a summer 2027 backend or infrastructure internship, remote or in Europe.

Each verdict is followed by its reasoning, and the reasoning of the other two
postings is cut off here. Read the four lines in the middle: this account had
stored one document out of the four judging can use, and every missing one is
named along with what the model therefore could not do. Storing a resume and a
preferences document changes the verdicts, so store them before trusting a run.

3. SEARCH BY MEANING RATHER THAN BY WORDS

$ pinloop search --semantic --from-profile --top 5 --limit 3

mode: semantic
model: voyageai/voyage-4 via OpenRouter
query: profile documents background (updated 2026-08-22T00:16:55.910Z)
searched with background
not stored in this profile: preferences, resume
closest 5
59,124/59,124 postings in the searched set had a vector and were ranked
Internship - Search Backend Infra Engineer
Perplexity
Belgrade
2026-07-01
https://jobs.ashbyhq.com/Perplexity/be94e89b-89d5-4f2a-a58b-7929c8d97f92
match 0.86

Software Engineer Intern
Serval
San Francisco
2026-07-13
https://jobs.ashbyhq.com/Serval/d7fb089c-db8a-4877-a5f3-73a09e67f54b
match 0.86

Nothing was typed to say what to look for. --from-profile built the text out of
the account's own stored documents, and again the answer named the documents
that were not there to use. The third result is cut off here.

4. KEEP THE GOOD ONES IN A NAMED LIST

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
only the postings judged strong. That second run bought no judging at all: all
three verdicts were already stored from the run above, so they were read back.
The item id on the last line is what "pinloop tab remove" takes, and it names
the posting's place in this tab rather than the posting.

5. SET IT RUNNING WITH NOBODY AT THE KEYBOARD

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

stored your 'new-backend' watch: runs your 'nightly-backend' routine every hour over the postings that arrive after 2026-07-23T08:00:15.709Z, first run 2026-08-22T01:19:08.315Z

Every step says what it was handed and what it passed on, so a run that produced
nothing tells you which step stopped it. Two lines here report work that was not
done rather than hiding it: the judge step bought nothing because all three
verdicts were already stored, and the tab step put in 0 of the 1 posting it was
handed because that posting was already in the tab.

Storing a watch needs an account that pays for a subscription; this account
does, which is why the command above succeeded rather than being refused. The
watch has no cadence you set. It looks about once an hour, runs the routine
over only the postings that arrived since it last looked, and does nothing at
all in an hour when nothing arrived.`,

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

Nothing more is printed in the terminal afterwards, whatever the person does in
the browser. A subscription that starts raises this account's monthly judging
and meaning-searching usage limits from the next command onwards, and "pinloop"
typed on its own prints what they have become. A cancelled subscription keeps
the raised usage limits until the last day already paid for and then returns to
the free ones. A renewal whose card fails changes nothing while the card is
retried over about two weeks; if it is never paid the account returns to the
free usage limits.`,

  // -------------------------------------------------------------------------
  // The five that take postings and hand postings on
  // -------------------------------------------------------------------------

  search: `Searches the corpus for postings carrying the words you type. Whole words are
matched, widened by plural rules and a small list of paired words, and the best
matches come first by default. --match all requires every word rather than any
one of them, --order newest puts the newest first, --in title looks at the title
only, and --top says how many postings the server may consider before it stops.

--semantic searches by meaning rather than by words: it ranks postings by how
close they are to a piece of text you give it, closest first, and prints a match
strength from 0 to 1 for each one. With --semantic, --from-profile builds that
text out of the account's own stored documents, --min-match sets a strength
cutoff, and --preview prints the text that would be sent without contacting
anybody.

Narrow the result with --country, --workplace, --employment, --posted-after,
--company, --within (a set of posting ids to stay inside) and --unjudged (leave
out everything this account has already judged).

Three of those take fixed values and it is worth knowing them exactly.
--workplace is one of Remote Solely, Remote OK, Hybrid or On-site, and
--employment is one of FULL_TIME, PART_TIME, CONTRACTOR, INTERN or TEMPORARY;
anything else is refused in a sentence listing the real values, so a wrong guess
is loud rather than silent. --country is different and quieter: it takes the
country's full name as the posting carries it, like Canada or United States, and
a two-letter code such as CA is not refused at all, it simply matches nothing and
comes back empty. --country holds one country per run. Typing it twice does not
search both; the last one silently wins, so run one country at a time. A posting
may carry several countries, so a posting matched on Germany can well be listed
under Portugal too.

--limit and --cursor page through the answer, --all follows every page at once,
and --json prints rows a following command can read.

Searching by meaning is one of the two things an account may only do so much of
in a month, and word searching is not counted at all. Asking for a later page of
a meaning search you have already run counts against nothing; only the first
page of each one is counted.

A search runs perfectly well with no words at all, as long as a condition
narrows it. "pinloop search --company <employer id> --all" hands back every
posting that employer has, and a wordless search has no scoring ceiling, so
--top does not apply and it pages through everything the conditions allow. This
is the way to take one employer's whole set, because list has no company
condition.

Every answer also reports what the search actually looked for: which match mode
it used, how many postings it was willing to score, and which spellings of each
word it looked for. A wordless search says so in that line, naming what it
narrowed by instead.`,

  list: `Lists postings by exact conditions rather than by words, newest first. Nothing is
matched or ranked: --employment, --country, --workplace and --posted-after pick
postings out by the values stored on them, and they take exactly the values the
searching part of these instructions lists: one of Remote Solely, Remote OK,
Hybrid or On-site for --workplace, one of FULL_TIME, PART_TIME, CONTRACTOR,
INTERN or TEMPORARY for --employment, and one country's full name, like Canada or
United States, for --country. --within stays inside a set of posting
ids, --unjudged leaves out everything this account has already judged, --limit
and --cursor page through the answer, --all follows every page at once, and
--json prints rows a following command can read.`,

  fetch: `Prints the complete stored record behind each posting id, description text and
all, which is far more than a search result carries. Give the ids on the command
line, or pipe in the JSON another command printed and give none. A large set has
to be piped in rather than typed, because ten thousand ids do not fit on a
command line. --json prints one JSON object holding the records.`,

  filter: `Keeps the postings piped into it that satisfy the conditions you give, and says
on standard error what it dropped and why. It contacts no server at all: it works
on rows another command already printed. --country, --workplace, --employment and
--posted-after are the conditions, and they take the same values the searching
part of these instructions lists. --json prints the survivors as rows a following
command can read.

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
those. --preview prints exactly what would be sent without sending it. --json
prints the verdicts as rows a following command can read.

--quick screens rather than judges: it takes up to 1,000 postings, sends their
plain stored facts without the job description text, in groups of up to 100, and
stores a lighter verdict for each. A full judge run writes over a quick verdict
and says so.

A quick screen sends the model far less about each posting, because it leaves
the job description text out, and it uses far less of this account's month as
well. One posting screened by --quick uses a fourteenth of what one posting
judged in full uses, because a screening call carries up to 100 postings in a
single request and sends no job description with any of them. That is what makes
screening a large number of postings first, and then fully judging only the few
that survive, cheaper for the month than fully judging everything. Nothing lets
an account look at postings for nothing at all, though: narrowing the search
before judging anything is still what saves the most usage.

Because a quick screen never sees the job description, anything stated only in
the description, such as a security clearance or a degree requirement, cannot be
caught by --quick. Only a full judge run reads that text.

What judge sends the model as its instructions is the document stored under the
name judge-prompt, or the one Pinloop ships when nothing is stored there.
--quick reads quick-judge-prompt the same way.

Judging is one of the two things an account may only do so much of in a month.
A run bigger than what is left of the month's usage judges as much as that
covers and ends by naming how many postings it did not attempt and why; the same postings are
listed in the machine-readable output with that reason on each one. A verdict
read back rather than bought counts against nothing. Type "pinloop" on its own
to read how much is left.`,

  companies: `Finds employers by the words in their name, the one with the most postings first.
It hands back employers rather than postings, and each line carries the employer
id that search's --company option takes. --limit and --cursor page through the
answer, --all follows every page at once, and --json prints one JSON object
holding the rows.`,

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
dashes. --description says what the tab is for. An account may hold 100 tabs.`,

  'tab list': `Shows every tab this account has, with how many postings each one holds. --limit
and --cursor page through the answer, --all follows every page at once, and
--json prints one JSON object holding the tabs.`,

  'tab get': `Shows the postings in one tab as they stand in the corpus right now, rather than
as they were when they were added. A posting that has since been taken down comes
back marked as gone rather than quietly disappearing. --sort orders by when a
posting was added or by the date the job was posted, --order chooses newest or
oldest first, --limit and --cursor page through the answer, --all follows every
page, and --json prints rows a following command can read.`,

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
search, list, fetch, filter, judge and tab add. --description says what the
routine is for.

A step's arguments are spelled the way the machine-readable output spells them,
not the way the option is typed at a terminal: the words to search for are "q"
rather than the bare words, and a name of more than one word carries an
underscore, as in "posted_after". An argument a command does not take is refused
when the routine is stored, in a sentence naming the step, the argument and
every argument that command does take, so a wrong name is found once rather than
every night.`,

  'routine get': `Shows one stored routine and the steps it holds, in order.`,

  'routine list': `Shows every routine this account has stored.`,

  'routine delete': `Removes one routine. A routine a schedule or a watch fires is not removed; the
refusal names what is still pointing at it.`,

  'routine run': `Runs one routine's steps in order on the server and prints what the last step
produced. --within gives the first step a set of posting ids to work inside,
either as ids or as JSON piped in. --json prints rows a following command can
read. Every step's outcome is kept, so a run that stopped part way says which
step stopped it.`,

  'routine results': `Shows what the most recent run of one routine produced, read fresh from the corpus
rather than from a copy taken at the time. --json prints rows a following command
can read.`,

  // -------------------------------------------------------------------------
  // Running without anybody at the keyboard
  // -------------------------------------------------------------------------

  'schedule put': `Stores a schedule: one routine, run every so many hours with nobody at the
keyboard. --routine names the routine and --every-hours is a whole number of
hours from 1 to 168, both required. --first-due-at fixes when the first run
happens, and the time of day it lands on is the time of day every later run lands
on. Storing a schedule needs an account that pays for a subscription, and
"pinloop upgrade" starts one. An account may hold 10 schedules.`,

  'schedule get': `Shows one schedule, when it next runs, and how its last run went.`,

  'schedule list': `Shows every schedule this account has stored, with the next run and the outcome of
the last one.`,

  'schedule delete': `Removes one schedule, so the routine it ran stops running by itself. The routine
itself stays.`,

  'watch put': `Stores a watch: one routine, run over only the postings that arrived in the corpus
since this watch last looked. --routine names the routine, whose first step has to
be a search or a list, and is required. A watch has no cadence of its own; it
looks about once an hour. Nothing arriving means nothing runs. Storing a watch
needs an account that pays for a subscription, and "pinloop upgrade" starts one.
An account may hold 10 watches. A routine whose last step adds to a tab is what
fills a list of new finds overnight.`,

  'watch get': `Shows one watch, when it next looks, and how its last firing went, including how
many postings had arrived and how many of them matched.`,

  'watch list': `Shows every watch this account has stored, with the outcome of the last firing of
each one.`,

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
corpus is missing something the person expected, or Pinloop does not do something
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
to come back and read these full instructions.

Tell the person before you write this text over a file they already have. The
file sits in their own skills folder and they may have edited it themselves, so
replacing it without saying so takes away something of theirs without asking.
Saving it for the first time needs no such warning. To find out whether the copy
you hold is behind, run "pinloop guide --skill" with the version number written
in your saved copy; the instructions then open with a notice when yours is
older, and print nothing extra when it is current.`,

  guide: `Prints these instructions. With no part named it prints all of them; with the
name of a command after it, like "pinloop guide judge", it prints that command's
part only. It works whether or not anybody is signed in. --skill takes the
version number of the instruction file you have saved, and the output opens with
a notice when your saved copy is older than the one this Pinloop ships.`,
};
