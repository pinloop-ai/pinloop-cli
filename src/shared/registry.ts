/**
 * The reserved document names, the size caps, and the exact words every refusal
 * carries.
 *
 * A profile is a set of named documents. Most names are the user's own
 * invention and mean nothing to Pinloop beyond "the user keeps this here". A
 * short list of names is different: the product itself decides what those names
 * are for, so `constraints` is always the document judge reads for work
 * authorization and `resume` is always the PDF the fill engine attaches. That
 * list is the registry below, and it is data rather than scattered checks so
 * that adding a name is one line in one file.
 *
 * Each reserved name has one fixed kind. `resume` holds an uploaded file; the
 * other five hold text. A name that is not in the registry is a legal text
 * document, and nothing in the product reads it by itself.
 *
 * The two caps and the four refusal sentences live here too, because the tests
 * that pin them and the code that enforces them have to read the same numbers
 * and the same words instead of each keeping a copy.
 */

/** What a document holds: characters in the row, or bytes in file storage. */
export type DocumentKind = 'text' | 'file';

/**
 * The names the product itself gives meaning to, each with the one kind it may
 * hold. Growing this list is a spec change (specs/feature-profile.md), never a
 * code default.
 */
export const RESERVED_NAMES: Readonly<Record<string, DocumentKind>> = Object.freeze({
  resume: 'file',
  'application-instructions': 'text',
  constraints: 'text',
  background: 'text',
  preferences: 'text',
  'judge-prompt': 'text',
  'quick-judge-prompt': 'text',
});

/**
 * The name whose stored text becomes the instructions judge sends the model
 * (specs/feature-judge-prompt.md, AGREED 2026-08-15).
 *
 * What storing a document under this name does, exactly:
 *
 *   - Its text is sent to the model in place of DEFAULT_JUDGE_PROMPT below,
 *     whole. Nothing is added to it and nothing is taken off it.
 *   - It is never sent as one of the labelled profile documents. The model is
 *     handed the posting and the person's other documents, and this text once,
 *     as the instructions.
 *   - A document stored under this name whose text is empty once the spaces and
 *     line breaks are taken off the ends counts as no document at all: judge
 *     sends the shipped default instead. Sending the model no instructions would
 *     still get an answer back, and nobody would ever find out.
 *   - It is not one of the four documents judge needs. An account that has
 *     stored this and nothing else is refused before any model is called,
 *     because there is nothing to judge a posting against.
 */
export const JUDGE_PROMPT_NAME = 'judge-prompt';

/**
 * The instructions judge sends the model when the account has stored none of
 * its own. Andrew approved this text on 2026-08-15, word for word.
 *
 * Changing it is meant to be a deliberate act rather than a tidy-up: this text
 * decides every verdict the product produces. A copy of it sits in
 * src/server/judge-prompt.test.ts, so anyone who edits it here has to edit that
 * copy as well and the change shows up in the diff.
 */
export const DEFAULT_JUDGE_PROMPT =
  'You are judging one job posting against one person, for a product called Pinloop.\n' +
  '\n' +
  'You are given the complete stored posting, then every document this person keeps in ' +
  'their profile, each labelled with the name it is stored under. Four of those names ' +
  'mean something fixed:\n' +
  '\n' +
  '- constraints: rules this person cannot break, such as work authorization, where they ' +
  'can be, and when they are free. If the posting breaks any rule written there, the ' +
  'verdict is `no`, whatever else is true, and your reasoning must name the rule it breaks.\n' +
  '- background: what this person has done and can do.\n' +
  '- preferences: what this person wants and does not want.\n' +
  '- resume: attached as a PDF file with this message, when they have stored one. Read it ' +
  'as part of their profile.\n' +
  '\n' +
  'Judge the posting against the background and the preferences together. Any other ' +
  "document in the profile is part of this person's profile too: read it and take it into " +
  'account.\n' +
  '\n' +
  'Give one verdict, exactly one of these four words:\n' +
  '\n' +
  '- `no`: a constraint is broken, or the posting has nothing to do with this person.\n' +
  '- `weak`: they could apply, but the posting asks mostly for things they do not have or ' +
  'do not want.\n' +
  '- `fair`: a real match on the main things, with clear gaps.\n' +
  '- `strong`: this person is what the posting is asking for, and the posting is what they ' +
  'want.\n' +
  '\n' +
  'Then give your reasoning, in plain sentences, written for this person to read. Say what ' +
  'drove the verdict. Grade honestly: this person wants a judgement they can act on, not ' +
  'encouragement.\n' +
  '\n' +
  'Answer only in the shape you were given.\n';

/**
 * The name whose stored text becomes the instructions a quick screening run
 * sends the model (specs/feature-quick-judge.md, the Architecture section, call
 * 4, approved by Andrew on 2026-08-16).
 *
 * It behaves exactly the way JUDGE_PROMPT_NAME above behaves, and applies to
 * quick screening runs alone: its text replaces DEFAULT_QUICK_JUDGE_PROMPT
 * whole, a document holding nothing but spaces counts as none, it is never sent
 * as one of the labelled profile documents, and it is not one of the four
 * documents a run needs before it will judge anything. An ordinary judge run
 * never reads it, and a quick screening run never reads `judge-prompt`.
 */
export const QUICK_JUDGE_PROMPT_NAME = 'quick-judge-prompt';

/**
 * The instructions a quick screening run sends the model when the account has
 * stored none of its own.
 *
 * It is not the ordinary judge prompt and cannot be: a quick screening run
 * sends up to a hundred postings in one request and sends none of their job
 * description text, so the model is being asked for something weaker than a
 * judgement and has to be told so in as many words. The four verdict words are
 * the same four, because `--keep fair` has to mean the same thing on both kinds
 * of run.
 */
export const DEFAULT_QUICK_JUDGE_PROMPT =
  'You are screening job postings against one person, for a product called Pinloop.\n' +
  '\n' +
  'You get up to a hundred postings in this one message, and for each posting you see only ' +
  'the plain facts stored about it: the job title, the employer, the locations and the ' +
  'countries, the employment labels such as intern or full time, the workplace kind such as ' +
  'remote or on site, the pay when any pay is stored, and the date it was posted. You are ' +
  'not given the job description, so the requirements written in it are not in front of you. ' +
  'Screen on the facts you have and do not guess at what a description you cannot read might ' +
  'say. Your ratings decide which of these postings get read properly later, description and ' +
  'all. So you are deciding what deserves a real look, not what deserves an application.\n' +
  '\n' +
  'After the postings comes the list of posting ids you must answer for, and then this ' +
  "person's profile: every document they keep, each labelled with the name it is stored " +
  'under. Four of those names mean something fixed:\n' +
  '\n' +
  '- constraints: rules this person cannot break, such as work authorization, where they can ' +
  'be, and when they are free. If a posting breaks a rule written there, its verdict is `no`, ' +
  'whatever else is true, and your reasoning must name the rule it breaks.\n' +
  '- background: what this person has done and can do.\n' +
  '- preferences: what this person wants and does not want.\n' +
  '- resume: attached as a PDF file with this message, when they have stored one. Read it as ' +
  "part of this person's profile.\n" +
  '\n' +
  'Any other document in the profile is part of this person too: read it and take it into ' +
  'account.\n' +
  '\n' +
  'Give one verdict for every posting id you were given, and for no other id. A verdict is ' +
  'exactly one of these four words:\n' +
  '\n' +
  '- `no`: a constraint is broken, or the posting has nothing to do with this person.\n' +
  '- `weak`: nothing rules it out, but the facts you can see point away from this person.\n' +
  '- `fair`: worth reading properly. The facts you can see line up, and the description would ' +
  'settle the rest.\n' +
  '- `strong`: the facts you can see line up well, and this looks like the kind of role this ' +
  'person is asking for.\n' +
  '\n' +
  '`fair` means "worth a real look", not "apply to this one". What settles that is the job ' +
  'description, and you have not read it.\n' +
  '\n' +
  'With each verdict give one or two sentences of reasoning, written for this person to read, ' +
  'saying what drove it. Grade honestly: a screen that calls everything strong has told this ' +
  'person nothing.\n' +
  '\n' +
  'Answer for every posting id you were given, including the ones whose facts are thin. A ' +
  'posting you say nothing about is reported to this person as one that could not be ' +
  'screened.\n';

/** The kind a reserved name must hold, or undefined for a name the user invented. */
export function reservedKind(name: string): DocumentKind | undefined {
  return Object.prototype.hasOwnProperty.call(RESERVED_NAMES, name)
    ? RESERVED_NAMES[name]
    : undefined;
}

/**
 * What a legal document name looks like: lowercase letters, digits and dashes,
 * one to forty characters. The same rule is written as a CHECK constraint on
 * the table in supabase/migrations/20260813184000_profiles.sql, so a name that
 * somehow got past this one would still be refused by the database.
 */
export const NAME_RULE = /^[a-z0-9-]{1,40}$/;

/** The most bytes one text document may hold. */
export const PER_DOCUMENT_CAP = 65_536;

/**
 * The most bytes all of one account's TEXT documents may hold together. An
 * uploaded file's bytes never live in the row, so they are not counted here;
 * a file is held to FILE_CAP on its own instead.
 */
export const WHOLE_PROFILE_CAP = 262_144;

/** The most bytes one uploaded file may hold. */
export const FILE_CAP = 10 * 1024 * 1024;

/** The one content type an uploaded file may arrive as, today. */
export const FILE_CONTENT_TYPE = 'application/pdf';

/** The filename a file gets when it was piped in and had no name of its own. */
export const DEFAULT_FILE_NAME = 'resume.pdf';

/** The five characters every PDF begins with. */
const PDF_HEADER = '%PDF-';

/**
 * True when these bytes start the way every PDF starts.
 *
 * Two places ask this and they ask it for different reasons. The server asks
 * before it stores anything, because a file that does not begin like a PDF is
 * refused. The command line asks so that a person who points a PDF at a document
 * name that holds text gets the server's refusal about that name, instead of
 * having their PDF quietly mangled into characters and stored as text.
 */
export function beginsLikeAPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, PDF_HEADER.length).toString('latin1') === PDF_HEADER;
}

/** The one document name that takes a file, named in the refusals below. */
const THE_FILE_NAME = 'resume';

/** How a person is told to store the resume, repeated by several refusals. */
const HOW_TO_STORE_A_FILE =
  `"pinloop profile put ${THE_FILE_NAME} --file <path to the PDF>"`;

/** What a person is told when the name they chose is not a legal name. */
export function nameRuleRefusal(name: string): string {
  return (
    `${JSON.stringify(name)} is not a document name. A name is made of ` +
    `lowercase letters, digits, and dashes, up to 40 characters.`
  );
}

/** What a person is told when they hand plain text to a name that holds a file. */
export function wrongKindRefusal(name: string): string {
  if (name === 'resume') {
    return (
      'the resume holds a PDF file, not text. Store it with ' +
      '"pinloop profile put resume --file <path to the PDF>".'
    );
  }
  return `the document named ${name} holds a file, not text.`;
}

/** What a person is told when they upload a file to a name that holds text. */
export function holdsTextRefusal(name: string): string {
  return (
    `the document named ${name} holds text, not a file. ` +
    `The ${THE_FILE_NAME} is the only document that takes a file: store it with ` +
    `${HOW_TO_STORE_A_FILE}.`
  );
}

/** What a person is told when the file they uploaded is bigger than the cap. */
export function overFileCapRefusal(size: number): string {
  return (
    `that file is ${size} bytes, which is over the 10 MB cap for a file ` +
    `(${FILE_CAP} bytes).`
  );
}

/**
 * What a person is told when the file they uploaded does not start with the
 * five characters every PDF starts with. This is what somebody handing over a
 * text file, a Word document or a screenshot sees, so it also says in as many
 * words that the resume takes a PDF file rather than typed-out text.
 */
export function notAPdfRefusal(): string {
  return (
    'that file does not begin like a PDF: every PDF starts with the characters ' +
    `%PDF-, and this one does not. The ${THE_FILE_NAME} holds a PDF file, not text, ` +
    `so store the PDF itself with ${HOW_TO_STORE_A_FILE}.`
  );
}

/** What a person is told when a PDF-looking file turns out not to open. */
export function willNotOpenRefusal(said: string): string {
  return (
    `that file starts like a PDF but could not be opened as a PDF (${said}). ` +
    'Open it on your own machine, and if it opens there, save it again from the ' +
    'program that opened it and upload the saved copy.'
  );
}

/** What a person is told when one document on its own is too big. */
export function perDocumentRefusal(size: number): string {
  return (
    `that document is ${size} bytes, and the cap per document is 64 KB ` +
    `(${PER_DOCUMENT_CAP} bytes).`
  );
}

/** What a person is told when storing a document would take the profile over. */
export function wholeProfileRefusal(wouldBe: number): string {
  return (
    `storing that document would put this profile at ${wouldBe} bytes, which is ` +
    `over the profile's 256 KB cap (${WHOLE_PROFILE_CAP} bytes).`
  );
}
