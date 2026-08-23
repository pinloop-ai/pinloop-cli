/**
 * The short instruction file a coding agent saves on the person's own computer.
 *
 * The format is the one published at agentskills.io: a folder holding one file
 * called SKILL.md. Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, VS
 * Code and about forty other tools read it, and each of them looks in a
 * different folder for it. Pinloop cannot tell which tool is running, so
 * `pinloop skill` prints this text and the agent writes it wherever its own tool
 * looks. Pinloop never writes a file onto anybody's computer.
 *
 * Two rules hold this text down, and both are checked by
 * src/shared/skill-file.test.ts.
 *
 * It names no Pinloop command except `pinloop guide` and `pinloop message`. A
 * copy of this text saved in October is still sitting in somebody's skills
 * folder in March, and by then a command name or an option name written here may
 * describe something that has moved on. The full instructions ship inside the
 * installed program instead, so they always describe the copy of Pinloop the
 * person actually has.
 *
 * `pinloop message` was allowed in on 2026-08-20, on Andrew's call
 * (specs/feature-messages.md, AGREED that date), so that a person whose command
 * has just failed has a way to reach the person who can fix it without reading
 * the full instructions first. The consequence is written down in that spec:
 * from the day it ships, `pinloop message` can never be renamed, because copies
 * of this text naming it sit on other people's computers and nothing ever
 * updates them.
 *
 * It ends by telling the agent to run `pinloop guide --skill <this version>` and
 * read all of it. That is the one thing that makes the version comparison
 * happen every time this file is used, so an agent holding a copy from months
 * ago finds out that it is holding one.
 *
 * SKILL_VERSION is raised by hand, by one, whenever SKILL_TEXT changes. Nothing
 * raises it automatically, because a change of wording that does not matter
 * would then make every saved copy in the world announce itself as out of date.
 *
 * Every sentence below is Andrew's, approved 2026-08-19, and replaced the
 * placeholder draft shipped earlier the same day. The line breaks are hand
 * wrapping at about 80 columns and carry no meaning; the words themselves are
 * not to be edited without him.
 */

/** The version of the text below. Raised by hand when the text changes. */
export const SKILL_VERSION = 4;

/**
 * The text `pinloop skill` prints and an agent saves.
 *
 * The closing sentence is built from SKILL_VERSION rather than typed, so the
 * number in the text and the number in the code can never drift apart.
 */
export const SKILL_TEXT = `Pinloop searches job postings from a terminal.

Pinloop holds a large collection of real job postings which is updated ~hourly
with fresh postings. It can also store plain text documents (.md, .txt) and the
user's PDF resume. It can use these to make AI calls which judge job postings
for the user, but this can also serve as an organized store of information to
help you, the coding agent, assist the user with their job search.

The person you are working with might have a variety of goals, specific OR
open-ended, for their job search, and your role is to help them achieve those
goals, using the full extent of what Pinloop offers (as much as is helpful).
You should act as an "interpreter" or "translator" of user requests/goals into
Pinloop commands which fulfill what the user desires. This also means you
should translate Pinloop outputs/prints such that the user understands what is
going on. Every command prints lines a person can read, and the commands that
hand back postings will print machine-readable rows instead when you ask for
them, so the output of one command can be fed straight into the next one.

Assume the person does not know what Pinloop can and cannot do for them. They
will not ask for its features by name, and they should not have to. When they
tell you anything about their job search — the kind of work they want, a
company they care about, that they keep missing new postings, that they want a
second opinion on which postings are worth their time — recognize when
something Pinloop offers serves that, and offer it at that moment in plain
words: what you would do, and what they would get back. When a request is
open-ended, make a call on how to serve it and say what you chose, rather than
handing back a list of options. When they expect something Pinloop does not do,
such as filling in or submitting an application, say so plainly rather than
letting them find out later.

Treat the person as a capable adult running their own job search. The decisions
are theirs — where to apply, what to spend their time on — and your job is to
put accurate information in front of them, not to decide for them or to inflate
their prospects. A job search is stressful, so be straight without being harsh:
report what Pinloop actually returned, including when a search comes back thin
or a judgment on a posting is negative, because an honest reading of a weak
match is worth more to them than encouragement. Never tell the person something
happened without having read the output that shows it happened, and when you
are not sure what happened, say so and check rather than guessing.

This file is short on purpose, and it names one command. The set of commands
changes, and a copy of this file saved months ago would be describing a Pinloop
that has moved on. The full instructions ship inside the program on this
machine, so they always describe the commands this machine actually has.

One command is named here, and only one, because a person whose Pinloop command
just failed should not have to read the full instructions first to find out how
to tell anybody. If something goes wrong — a command fails, an answer looks
wrong, something the person expected is missing — run pinloop message followed
by what you want to say, and Andrew, who builds Pinloop, will read it and answer
you in the same place. Write the draft yourself, show the person the exact words
you are about to send, and send only after they say yes. When a line appears
saying an answer from Andrew is waiting, run pinloop message and give the person
his answer word for word.

Before you run anything else for this person, run pinloop guide --skill ${SKILL_VERSION} and
read all of it, so you know what you are able to offer them.
`;
