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

// ---------------------------------------------------------------------------
// Country names
// ---------------------------------------------------------------------------

/**
 * Countries by their full English name, spelled the way the company Pinloop
 * buys postings from spells them and the way the postings table stores them
 * ("United States", "United Kingdom"). The list is the one
 * src/normalize/contract.ts reads old location text with, plus Georgia, which
 * that file leaves out because there a bare "Georgia" could be the US state.
 * Here it is a whole country filter, so it can only mean the country.
 *
 * It is typed out here rather than imported because the installed `pinloop`
 * command runs this file and may import only from src/cli/ and src/shared/
 * (src/cli/package-boundary.test.ts). src/shared/filter.test.ts checks that
 * every name the other list holds is also in this one.
 */
const FULL_COUNTRY_NAMES: readonly string[] = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina',
  'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados',
  'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina',
  'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia',
  'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia',
  'Comoros', 'Congo', 'Democratic Republic of the Congo', 'Costa Rica', "Côte d'Ivoire", 'Croatia',
  'Cuba', 'Cyprus', 'Czechia', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador',
  'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece',
  'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq',
  'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati',
  'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya',
  'Liechtenstein', 'Lithuania', 'Luxembourg', 'Macau', 'Madagascar', 'Malawi', 'Malaysia',
  'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico',
  'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria',
  'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama',
  'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Puerto Rico',
  'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia',
  'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe',
  'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia',
  'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain',
  'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan',
  'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia',
  'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City',
  'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
];

/**
 * Short forms and other ways of writing three countries, each written in lower
 * case, with the full name each one stands for.
 *
 * The company Pinloop buys postings from matches a country by its full name
 * only (developer.fantastic.jobs/api: "Use United States, not US. Use United
 * Kingdom, not UK."), and the postings table stores the same full names. So
 * "US" matched nothing anywhere: on 2026-09-30 a count of US internships on
 * career sites came back 0 with "US" and 962 with "United States". Only whole
 * values are turned into a full name. Anything else — "New York, United
 * States", or two countries joined by OR — is sent on as typed.
 */
const COUNTRY_SHORT_FORMS: Readonly<Record<string, string>> = {
  us: 'United States',
  'u.s.': 'United States',
  'u.s': 'United States',
  usa: 'United States',
  'u.s.a.': 'United States',
  'u.s.a': 'United States',
  'united states of america': 'United States',
  'the united states': 'United States',
  'the united states of america': 'United States',
  america: 'United States',
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  'u.k': 'United Kingdom',
  gb: 'United Kingdom',
  'great britain': 'United Kingdom',
  britain: 'United Kingdom',
  england: 'United Kingdom',
  scotland: 'United Kingdom',
  wales: 'United Kingdom',
  'northern ireland': 'United Kingdom',
  'the united kingdom': 'United Kingdom',
  uae: 'United Arab Emirates',
  'u.a.e.': 'United Arab Emirates',
  'u.a.e': 'United Arab Emirates',
  'the united arab emirates': 'United Arab Emirates',
};

/** Every full name and every short form, looked up by its lower-case spelling. */
const COUNTRY_BY_LOWER_CASE: ReadonlyMap<string, string> = new Map([
  ...FULL_COUNTRY_NAMES.map((name): [string, string] => [name.toLowerCase(), name]),
  ...Object.entries(COUNTRY_SHORT_FORMS),
]);

/**
 * The full name of the country a person or an agent wrote, such as "United
 * States" for "US", "usa" or "united states", or what they wrote with the
 * spaces around it removed when it is not a country this file knows.
 *
 * Every place a country condition enters Pinloop runs it through this first:
 * a search, a list, a count, a collection, a saved search's run, and the
 * filter below. So the same word finds the same postings whichever of them it
 * was typed into, whether it came from the chat, the connector or the command
 * line.
 */
export function fullCountryName(said: string): string {
  const trimmed = said.trim();
  return COUNTRY_BY_LOWER_CASE.get(trimmed.toLowerCase()) ?? trimmed;
}

// ---------------------------------------------------------------------------
// Workplace kinds
// ---------------------------------------------------------------------------

/**
 * Everyday ways of saying where a job is done, each written in lower case with
 * hyphens and underscores read as spaces, with the stored value each one stands
 * for.
 *
 * The postings table stores exactly four workplace values, "Remote Solely",
 * "Remote OK", "Hybrid" and "On-site" (ALLOWED_WORKPLACE in
 * src/normalize/contract.ts), and a search, list, count or collection refuses
 * any other spelling. The published description of the field used to say
 * "Remote, hybrid or on-site", so an AI's first try ("remote") was refused
 * (found by the chat abilities page on branch user-testing-tool, 2026-09-30).
 * "Remote Solely" is a job done fully remotely; "Remote OK" is a job that
 * allows remote work, so a plain "remote" means "Remote Solely".
 *
 * The four stored values are typed out here rather than imported for the same
 * reason the country names above are: the installed `pinloop` command runs this
 * file and may import only from src/cli/ and src/shared/.
 * src/shared/filter.test.ts checks that every value this list hands back is one
 * of the stored ones.
 */
const WORKPLACE_WORDS: Readonly<Record<string, string>> = {
  'remote solely': 'Remote Solely',
  remote: 'Remote Solely',
  'remote only': 'Remote Solely',
  'only remote': 'Remote Solely',
  'fully remote': 'Remote Solely',
  'full remote': 'Remote Solely',
  'all remote': 'Remote Solely',
  '100% remote': 'Remote Solely',
  'remote first': 'Remote Solely',
  wfh: 'Remote Solely',
  'work from home': 'Remote Solely',
  'working from home': 'Remote Solely',
  'from home': 'Remote Solely',
  'remote ok': 'Remote OK',
  'remote okay': 'Remote OK',
  'remote friendly': 'Remote OK',
  'remote optional': 'Remote OK',
  'remote possible': 'Remote OK',
  'remote allowed': 'Remote OK',
  'remote eligible': 'Remote OK',
  'remote available': 'Remote OK',
  'open to remote': 'Remote OK',
  hybrid: 'Hybrid',
  'hybrid remote': 'Hybrid',
  'partly remote': 'Hybrid',
  'partially remote': 'Hybrid',
  'part remote': 'Hybrid',
  'on site': 'On-site',
  onsite: 'On-site',
  'in person': 'On-site',
  inperson: 'On-site',
  'in office': 'On-site',
  'in the office': 'On-site',
  office: 'On-site',
  'office based': 'On-site',
  'on premises': 'On-site',
  'on premise': 'On-site',
  'on prem': 'On-site',
  onprem: 'On-site',
};

/**
 * The stored workplace value a person or an agent meant, such as "Remote
 * Solely" for "remote", "fully remote" or "WFH", "On-site" for "onsite" or "in
 * person", and "Hybrid" for "hybrid", in any capitals. Anything else comes back
 * as it was written with the spaces around it removed, so the check that
 * refuses an unknown workplace still names every value it takes.
 *
 * Every place a workplace condition enters Pinloop runs it through this first,
 * the same places fullCountryName above runs: a search, a list, a count, a
 * collection, a saved search's run, and the filter below.
 */
export function workplaceValue(said: string): string {
  const trimmed = said.trim();
  const key = trimmed.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  return WORKPLACE_WORDS[key] ?? trimmed;
}

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
  const country = rules.country === undefined ? '' : fullCountryName(rules.country);
  if (country !== '') {
    const countries = storedList(row.countries);
    if (countries === undefined) {
      return `the country rule: this posting stores no countries at all, so it cannot be in ${country}`;
    }
    if (!countries.some((stored) => fullCountryName(stored) === country)) {
      return `the country rule: this posting's countries are ${countries.join(', ')}, not ${country}`;
    }
  }

  const wantedWorkplace = rules.workplace === undefined ? '' : workplaceValue(rules.workplace);
  if (wantedWorkplace !== '') {
    const workplace = row.workplace_type;
    if (workplace === null || workplace === undefined || workplace === '') {
      return `the workplace rule: this posting stores no workplace kind, so it cannot be ${wantedWorkplace}`;
    }
    if (workplaceValue(String(workplace)) !== wantedWorkplace) {
      return `the workplace rule: this posting's workplace is ${String(workplace)}, not ${wantedWorkplace}`;
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
