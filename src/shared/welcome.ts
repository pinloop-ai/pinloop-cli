/**
 * What `pinloop welcome` prints.
 *
 * `pinloop welcome` is the first thing a coding agent runs. It prints the same
 * text whether or not anybody is signed in, and it contacts no server at all:
 * every word of it ships inside the installed program. It is written for the
 * agent, not for the person.
 *
 * It prints five parts, always in this order:
 *
 *   1. WHAT_PINLOOP_IS       one sentence saying what Pinloop is and who it is
 *                            for, so the agent can explain it in its own words.
 *   2. SKILL_PART            the short instruction file's text, with a line
 *                            telling the agent to save it into its own skills
 *                            folder now.
 *   3. HOSTING_PARAGRAPHS    what a good host does with the person in front of
 *                            it.
 *   4. FIRST_STEPS_OPENING   the paragraph that introduces the ordered steps.
 *   5. FIRST_STEPS           the ordered first steps themselves.
 *
 * The steps are records rather than lines of prose. Each one carries a `kind`
 * saying what the step is for, an `explanation` holding the step's words, and an
 * optional `ask` for a step whose request to the person is a separate closing
 * sentence. The order of the kinds is fixed and is checked by
 * src/shared/welcome.test.ts: the full instructions are read first, then the
 * person is signed in, then given the peek, then asked for their resume, then
 * shown Pinloop judging the peek's postings against that resume, and then told
 * what they might do next. None of the six steps shipping today carries a
 * separate `ask`, because in Andrew's approved text every request to the person
 * sits inside the step's own paragraph. The field and printStep's ask-last
 * behaviour stay because later wording may use them again.
 *
 * `pinloop login` used to end by printing a second block of onboarding text: a
 * conditional opening sentence, the email address, and the steps that remained.
 * Andrew removed it on 2026-08-19. Somebody who opens a second terminal and
 * signs in again got a paragraph of instructions printed at them, which reads
 * badly, and an agent that ran the login command itself already knows the person
 * just signed in, so the paragraph told it nothing it did not have. `pinloop
 * login` now prints only the plain confirmation of the sign-in. Nothing in this
 * file is printed on sign-in any more, and src/shared/welcome.test.ts fails if
 * that block comes back.
 *
 * Every printed sentence below is Andrew's, approved 2026-08-19, and replaced
 * the placeholder draft shipped earlier the same day. The line breaks are hand
 * wrapping at about 80 columns and carry no meaning; the words themselves are
 * not to be edited without him.
 *
 * Amended 2026-08-22 (specs/feature-welcome-first-steps.md), every word of the
 * amendment approved by Andrew that day: the four ordered steps became six.
 * The 'profile' step, which gets the person's resume stored, and the 'judge'
 * step, which shows Pinloop judging the peek's postings against that resume,
 * are new. The 'closing' step was replaced. The paragraph introducing the steps
 * gained the sentence telling the agent that the person may leave the steps at
 * any point, and the 'guide' step gained the announcement the agent makes to
 * the person before anything else happens.
 */
import { SKILL_TEXT } from './skill-file.ts';

/** One step of the ordered first steps. */
export type WelcomeStep = {
  /**
   * What the step is for: 'guide', 'login', 'peek', 'profile', 'judge',
   * 'closing', and more later.
   */
  kind: string;
  /** Why the agent is doing this step, and what doing it looks like. */
  explanation: string;
  /** The one sentence that asks the person for something, when there is one. */
  ask?: string;
};

/** Part one: what Pinloop is and who it is for. */
export const WHAT_PINLOOP_IS = `Pinloop is a job search tool driven from a terminal, and it is built for people
who already work with a coding agent like you.`;

/** Part two: the instruction file's text, and the line telling the agent to save it. */
export const SKILL_PART = `Save the text between the lines below into your own skills folder now, as a file
called SKILL.md inside a folder of its own. Save it before you do anything else,
because it is what tells you to come back and read the full instructions later.

----------------------------------------------------------------------
${SKILL_TEXT.trim()}
----------------------------------------------------------------------`;

/** Part three: how to look after the person in front of you. */
export const HOSTING_PARAGRAPHS = `Explain what you are about to do before you do it, in one or two plain
sentences, and say what it will cost the person in time or in effort. When a
request is open-ended, make a call on how to serve it with Pinloop and say what
you chose, rather than handing back a list of options.`;

/**
 * Part four: the paragraph that introduces the ordered steps.
 *
 * It holds the rule about never ending a turn without giving the person
 * something to say next, which is why it is a paragraph rather than the one
 * short line it used to be.
 */
export const FIRST_STEPS_OPENING = `For the following first steps, don't end a turn without giving the person
something they can say next: if you have just shown them something, say what
you can do with it, and if you are waiting on them, say exactly what you need.
The person can leave these steps at any point: if they say they want to skip
the onboarding, stop the steps right there and go where they point. The first
steps, in order:`;

/** Part five: the ordered first steps, printed once by `pinloop welcome`. */
export const FIRST_STEPS: readonly WelcomeStep[] = Object.freeze([
  {
    kind: 'guide',
    explanation: `Before anything else, tell the person this, in these words or close to them:
"We'll start the Pinloop onboarding now (~10 minutes) to get you set up. It's
just a back and forth conversation, and nothing gets run without you knowing.
If at any point you want to skip it, just let me know."

Then read Pinloop's full instructions before you run any other command: run
pinloop guide and read all of it. It works signed out. It covers every command,
every option, the shape of the machine-readable output, the limits and worked
examples, and it is generated from the copy of Pinloop installed on this
machine, so it matches the commands this machine actually has. This costs the
person nothing — read it yourself, without making them wait on a summary of it,
so that everything you run from here on is a command you actually understand.`,
  },
  {
    kind: 'login',
    explanation: `Nothing else works until the person has a Pinloop account. Direct the user to
run the login command(s) the guide names. Tell them what will happen when they
run it, and ask them to sign in. Be very concise here.`,
  },
  {
    kind: 'peek',
    explanation: `Once the person has signed in, before you ask the person for anything else,
show them that Pinloop holds real jobs for them. This is just a throwaway peek,
not the description Pinloop will work from: nothing from their answer is stored
anywhere or used by Pinloop long-term. Say that it is a quick look, so nobody
thinks that this sentence has to stand in for their whole job search. Be
concise here too. Ask them for a job title, or a few words describing the work
they do. Decide whether a semantic search or a normal keyword search would be
best based on what the user says. Then search them up and show them eight or
ten *recent* postings, each with the company, the title, the location and how
long ago it was posted.`,
  },
  {
    kind: 'profile',
    explanation: `After the peek, get the person's resume into Pinloop. This is the one quick
step that lets Pinloop judge postings against them properly, so frame it that
way: a resume is all it needs to get started, and there's more they can add
later, which you'll come back to at the end. Don't ask them for anything else
here, and don't interview them about what they want. Offer the three ways this
can happen in one sentence: they can drag the file into the terminal, or tell
you the file path, or you can find it on their computer if they want you to.
Never go looking on their computer unless they say yes. Once you have the file,
store it with pinloop profile put and confirm it's in. Be concise here too.`,
  },
  {
    kind: 'judge',
    explanation: `Once the resume is stored, show the person what Pinloop actually does: take the
postings from the peek and judge them against the resume they just gave you.
Tell them what's about to happen in a sentence first, and say roughly how long
each part will take before you start it, so they're not sitting there wondering
if anything is happening. Run pinloop judge --quick over all of the peek's
postings, which screens each one on its plain facts in a single pass and
usually comes back within a minute, and show them the verdicts. Then take the
one that screened strongest and judge it fully with pinloop judge, which reads
the whole posting against their resume and explains itself, taking about a
minute or so, and show them that verdict with its reasoning. This is the first
real judgment they've seen, so don't bury it: put the verdict and the reasoning
in front of them plainly and let them read it before you say anything else.
Don't tell them how much of their usage this spent or what they have left;
that comes at the close, read from their account.`,
  },
  {
    kind: 'closing',
    explanation: `To close the first steps, after the person has read the verdict, give them the
lay of the land in plain words so they know what is in the room, then let them
pick. Say exactly this:

"That verdict was made against your resume. Anything else you tell me about
what you want (e.g., a written description of the job you're after, or the
things that would rule a posting out for you) goes into your profile and makes
every future verdict sharper. Tell me whenever.

Finding jobs from here is open ended. Describe what you want in plain English,
a job title, a paragraph about the work you're looking for, a company, a list
of conditions, and I'll work out how to get it out of Pinloop.

Judging comes in two sizes. A quick screen takes a big batch of postings at
once and judges each one on its plain facts, the title, the company, the
location and so on, without reading the full job description, so it covers a
lot of ground quickly. A full judgment reads the whole posting against your
profile and gives you the reasoning, like the one you just saw.

Anything Pinloop finds can go into a tab, which is just a named list you keep
postings in, so the good ones don't get lost.

Once we've worked out a way of finding and judging jobs that you like, I can
save it as a routine and run it again with one command. A schedule runs that
routine every few hours on its own. A watch runs it only over the postings that
have arrived since the last time it looked. All of that lives on Pinloop's
servers, so it keeps going while you're away and the results are waiting when
you come back.

If something is wrong or you want to ask for anything, I can run pinloop
message to tell Andrew about it (he builds Pinloop). He'd love to get your
feedback, and you'll get his response straight through this CLI.

I've read the full instructions for Pinloop, so if you want to explore anything
further, just say so and we'll go deeper."

Then tell the person where they stand: read how much of this month's usage
they have left back from their account rather than working it out, and say it
plainly. Then say: "If you upgrade, you get over 5,000 quickly judged postings
a month, or 400 full judgments, plus unlimited plain-English searches (if
you're not spamming hundreds per minute). I can run pinloop upgrade if you want
to learn more."

Don't name a price yourself. Leave all of this as things they can pick from,
not a list to follow, and go where they point.`,
  },
]);

/** One step as it appears on the terminal: the explanation, then the ask last. */
export function printStep(step: WelcomeStep): string {
  const explanation = step.explanation.trim();
  const ask = step.ask?.trim() ?? '';
  return ask === '' ? explanation : `${explanation}\n\n${ask}`;
}

/** The parts of the welcome, each one replaceable so a test can find the slot. */
export type WelcomeParts = {
  whatPinloopIs?: string;
  skillPart?: string;
  hostingParagraphs?: string;
  firstStepsOpening?: string;
  firstSteps?: readonly WelcomeStep[];
};

/** The whole of what `pinloop welcome` prints: five parts, in order. */
export function printWelcome(parts: WelcomeParts = {}): string {
  const whatPinloopIs = parts.whatPinloopIs ?? WHAT_PINLOOP_IS;
  const skillPart = parts.skillPart ?? SKILL_PART;
  const hostingParagraphs = parts.hostingParagraphs ?? HOSTING_PARAGRAPHS;
  const firstStepsOpening = parts.firstStepsOpening ?? FIRST_STEPS_OPENING;
  const firstSteps = parts.firstSteps ?? FIRST_STEPS;

  const blocks: string[] = [whatPinloopIs.trim(), skillPart.trim()];
  if (hostingParagraphs.trim() !== '') blocks.push(hostingParagraphs.trim());
  blocks.push(firstStepsOpening.trim());
  for (const step of firstSteps) blocks.push(printStep(step));

  return `${blocks.filter((block) => block !== '').join('\n\n')}\n`;
}
