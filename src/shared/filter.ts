/**
 * The filter verb: keep the rows that satisfy every rule, and say why each of
 * the others was dropped.
 *
 * This file deliberately knows nothing about where rows came from. It is handed
 * rows that some other verb already produced, it reads only the fields those
 * rows carry, and it hands back two lists. Nothing here opens a connection,
 * reads a credential, or writes SQL — a run of `pinloop filter` works with the
 * network unplugged.
 *
 * The rules speak the vocabulary a person types on the command line — country,
 * workplace, employment, posted-after — and the rows carry the column names the
 * database stores: countries (a list), workplace_type (one value),
 * employment_type (a list), posted_at (a timestamp).
 *
 * Two promises hold for every run. Each row handed in comes back exactly once,
 * either among the survivors or in the drop report, so a row can never go
 * missing quietly. And when a row is dropped, the report names the rule that
 * dropped it, so a person reading standard error knows which condition to relax.
 * Every run also says how many rows satisfied every rule out of how many were
 * handed in, under `coverage`, and that fraction is the first thing the drop
 * report says (src/shared/coverage.ts).
 * A row that carries nothing at all for the field a rule reads is dropped by
 * that rule, because a rule about countries cannot be satisfied by a row that
 * stores no countries.
 */

import { coverageOf, type Coverage } from './coverage.ts';

/** The conditions a person asked for, in the words they typed them in. */
export type FilterRules = {
  country?: string | undefined;
  workplace?: string | undefined;
  employment?: string | undefined;
  posted_after?: string | undefined;
};

/** One row that did not survive, and the rule it failed. */
export type FilterDrop = {
  id: string;
  reason: string;
};

/** What one run of the filter produced. */
export type FilterAnswer<Row> = {
  survivors: Row[];
  dropped: FilterDrop[];
  /** How many rows satisfied every rule, out of how many were handed in. */
  coverage: Coverage;
};

/** The fields of a row this file reads, all of them optional. */
type StoredFields = {
  id?: unknown;
  countries?: unknown;
  workplace_type?: unknown;
  employment_type?: unknown;
  posted_at?: unknown;
};

/** A list of strings out of a stored field, or undefined when there is no list. */
function storedList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map((one) => String(one));
  if (typeof value === 'string' && value !== '') return [value];
  return undefined;
}

/** A moment in time out of a stored value, or undefined when there is none. */
function storedMoment(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const when = new Date(value as string | number | Date).getTime();
  return Number.isNaN(when) ? undefined : when;
}

/**
 * The moment a posted-after rule compares against, or a refusal in the words a
 * person reads when what they typed is not a date.
 *
 * This is separate from the walk over the rows below because it is the one part
 * of a filter rule that can be wrong on its own, before any row is looked at.
 * The routines feature checks a stored filter step's arguments at the moment the
 * routine is stored, when there are no rows to walk, and it calls this.
 */
export function cutoffInstant(postedAfter: string): number {
  const cutoff = new Date(postedAfter).getTime();
  if (Number.isNaN(cutoff)) {
    throw new Error('posted-after must be a date written as YYYY-MM-DD (for example 2026-06-01)');
  }
  return cutoff;
}

/**
 * The one rule this row fails, or undefined when it passes them all. The rules
 * are checked in a fixed order — country, workplace, employment, posted-after —
 * so a row failing two of them is always reported against the same one, and two
 * runs of the same command say the same thing.
 */
function firstRuleThisRowFails(row: StoredFields, rules: FilterRules): string | undefined {
  if (rules.country !== undefined && rules.country !== '') {
    const countries = storedList(row.countries);
    if (countries === undefined) {
      return `the country rule: this posting stores no countries at all, so it cannot be in ${rules.country}`;
    }
    if (!countries.includes(rules.country)) {
      return `the country rule: this posting's countries are ${countries.join(', ')}, not ${rules.country}`;
    }
  }

  if (rules.workplace !== undefined && rules.workplace !== '') {
    const workplace = row.workplace_type;
    if (workplace === null || workplace === undefined || workplace === '') {
      return `the workplace rule: this posting stores no workplace kind, so it cannot be ${rules.workplace}`;
    }
    if (String(workplace) !== rules.workplace) {
      return `the workplace rule: this posting's workplace is ${String(workplace)}, not ${rules.workplace}`;
    }
  }

  if (rules.employment !== undefined && rules.employment !== '') {
    const employment = storedList(row.employment_type);
    if (employment === undefined) {
      return `the employment rule: this posting stores no employment label at all, so it cannot be ${rules.employment}`;
    }
    if (!employment.includes(rules.employment)) {
      return `the employment rule: this posting's employment labels are ${employment.join(', ')}, not ${rules.employment}`;
    }
  }

  if (rules.posted_after !== undefined && rules.posted_after !== '') {
    const cutoff = cutoffInstant(rules.posted_after);
    const when = storedMoment(row.posted_at);
    if (when === undefined) {
      return `the posted-after rule: this posting stores no posted date, so it cannot be on or after ${rules.posted_after}`;
    }
    if (when < cutoff) {
      return `the posted-after rule: this posting was posted ${String(row.posted_at)}, before ${rules.posted_after}`;
    }
  }

  return undefined;
}

/**
 * Splits the rows into the ones that satisfy every rule and the ones that do
 * not, with a plain sentence for each drop. Takes rows and rules, and nothing
 * else, and returns as soon as it has walked the rows once.
 */
export function runFilter<Row>(rows: readonly Row[], rules: FilterRules): FilterAnswer<Row> {
  const survivors: Row[] = [];
  const dropped: FilterDrop[] = [];

  for (const row of rows) {
    const reason = firstRuleThisRowFails((row ?? {}) as StoredFields, rules);
    if (reason === undefined) {
      survivors.push(row);
    } else {
      dropped.push({ id: String((row as StoredFields | null)?.id ?? ''), reason });
    }
  }

  return { survivors, dropped, coverage: coverageOf(survivors.length, rows.length) };
}
