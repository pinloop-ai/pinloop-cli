/**
 * Builds the instructions `pinloop guide` prints.
 *
 * Nothing here is typed out by hand as one long document. The builder walks the
 * real command tree the installed program builds, and for each command it finds
 * it looks up the paragraph written for that one command in
 * src/shared/guide-text.ts. Two things follow from that. The instructions always
 * describe the copy of Pinloop the person actually installed, never a newer or
 * older one. And a command added to the program with no paragraph written for it
 * stops the build with that command named, which src/shared/guide.test.ts turns
 * into a failing test, so nobody ships an undocumented command by accident.
 *
 * A node in the command tree with children under it — `profile`, `tab`,
 * `routine` — groups commands rather than being one, so the walk goes into it
 * rather than counting it. The words of a command are joined by single spaces,
 * which is exactly how src/core/catalog.ts spells them and how the written text
 * is keyed: `search`, `profile put`, `tab add`.
 *
 * Three things change what comes out:
 *
 *   - A part name. With none, the whole thing prints. With one, only that part
 *     prints, so `pinloop guide judge` is the judging part and nothing else. A
 *     name that matches neither a command nor one of the fixed non-command parts
 *     is refused, and the refusal names the word that was typed and lists every
 *     name that would have worked.
 *   - The version number of the instruction file the agent has saved. When it is
 *     older than the newest one, the output opens with a notice saying so. When
 *     it is the newest, or higher than any that has ever existed, no notice
 *     appears, because a notice that shows when nothing is out of date teaches an
 *     agent to ignore every notice.
 *   - Whether anybody is signed in. When nobody is, the last thing printed is the
 *     sentence naming the command that creates an account, set apart by a blank
 *     line, because somebody who has just run the guide is looking at the bottom
 *     of their screen rather than the top.
 *
 * The guide carries no welcome text of any kind. `pinloop welcome` is its own
 * command and prints the same text for everybody, so nothing here has to work
 * out whether an account is new.
 */
import type { Command } from 'commander';

import { GUIDE_TEXT, SIGNED_OUT_SENTENCE, staleSkillNotice } from './guide-text.ts';

/**
 * The part names a person may ask for that are not commands.
 *
 * This is the one short list of part names kept by hand. Every other part name
 * comes from the command tree itself, so nobody anywhere keeps a second list of
 * command names.
 */
export const NON_COMMAND_PARTS: readonly string[] = Object.freeze([
  'overview',
  'asking',
  'json',
  'limits',
  'examples',
]);

/** What a caller hands the builder. */
export type GuideOptions = {
  /** The real command tree, as buildProgram() hands it back. */
  program: Command;
  /** One part name, or absent for the whole thing. */
  part?: string;
  /** Whether this machine holds a saved login. */
  signedIn: boolean;
  /** The newest version of the instruction file, as the server answered. */
  newestSkillVersion: number;
  /** The version the agent typed after --skill, or absent when it typed none. */
  savedSkillVersion?: number;
  /**
   * The written text to build from. Absent means the text this program ships.
   * It is an argument so a test can hand in a copy with one command's paragraph
   * removed and watch the build refuse.
   */
  text?: Record<string, string>;
};

/**
 * Every command a person can type, with the words joined by single spaces.
 *
 * A node with children under it groups commands rather than being one, so the
 * walk goes into it and never counts it.
 */
export function commandsIn(program: Command): string[] {
  const found: string[] = [];
  const walk = (node: Command, words: string[]): void => {
    for (const child of node.commands) {
      const path = [...words, child.name()];
      if (child.commands.length === 0) found.push(path.join(' '));
      else walk(child, path);
    }
  };
  walk(program, []);
  return found;
}

/** One part, printed under a heading a person can find by eye. */
function section(name: string, text: Record<string, string>, isCommand: boolean): string {
  const heading = isCommand ? `pinloop ${name}` : name;
  const underline = '-'.repeat(heading.length);
  return `${heading}\n${underline}\n\n${text[name]!.trim()}`;
}

/** The whole of the instructions, or one part of them. */
export function buildGuide(options: GuideOptions): string {
  const text = options.text ?? GUIDE_TEXT;
  const commands = commandsIn(options.program);

  // The completeness check comes first, so a command with no paragraph written
  // for it stops the build whatever else was asked for.
  const undocumented = [...NON_COMMAND_PARTS, ...commands].filter((name) => {
    const written = text[name];
    return typeof written !== 'string' || written.trim() === '';
  });
  if (undocumented.length > 0) {
    throw new Error(
      `the instructions have nothing written for ${undocumented.join(', ')}. ` +
        `Every command a person can type needs a paragraph in src/shared/guide-text.ts, ` +
        `keyed by the name the catalog spells.`,
    );
  }

  const blocks: string[] = [];

  if (
    options.savedSkillVersion !== undefined &&
    options.savedSkillVersion < options.newestSkillVersion
  ) {
    blocks.push(staleSkillNotice(options.savedSkillVersion, options.newestSkillVersion));
  }

  if (options.part !== undefined && options.part !== '') {
    const wanted = options.part;
    const isCommand = commands.includes(wanted);
    if (!isCommand && !NON_COMMAND_PARTS.includes(wanted)) {
      throw new Error(
        `there is no part of these instructions called "${wanted}". ` +
          `The parts you can ask for are: ${[...NON_COMMAND_PARTS, ...commands].join(', ')}.`,
      );
    }
    blocks.push(section(wanted, text, isCommand));
  } else {
    for (const name of NON_COMMAND_PARTS) blocks.push(section(name, text, false));
    blocks.push('The commands, one at a time.');
    for (const name of commands) blocks.push(section(name, text, true));
  }

  if (!options.signedIn) blocks.push(SIGNED_OUT_SENTENCE.trim());

  return `${blocks.join('\n\n')}\n`;
}
