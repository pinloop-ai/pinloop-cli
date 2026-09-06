# Pinloop CLI

[![npm version](https://img.shields.io/npm/v/pinloop)](https://www.npmjs.com/package/pinloop)
[![license: MIT](https://img.shields.io/npm/l/pinloop)](LICENSE)
[![node >= 22](https://img.shields.io/node/v/pinloop)](https://nodejs.org)
[![website](https://img.shields.io/badge/pinloop.ai-website-blue)](https://pinloop.ai)

Pinloop is a job search tool built for your coding agent to run from a terminal.

It holds a large collection of frequently updated job postings, can hold your
resume and any other preferences, and calls AI models to evaluate postings
against what it knows about you.

![Pinloop judging postings against a resume in a terminal](demo.gif)

## Try it

You don't run anything yourself. Paste this sentence into your coding agent
(Claude Code, Codex, Cursor, or similar) and it installs Pinloop and walks you
through setup:

```
Run npm install -g pinloop, then run pinloop welcome and follow the instructions.
```

## Install

Needs Node 22 or newer.

```
npm install -g pinloop
```

## Start

```
pinloop
```

Run on its own, `pinloop` prints instructions written for a coding agent.
`pinloop welcome` gets your coding agent to walk you through a more structured
onboarding flow, and `pinloop guide` gives it the full usage instructions.

## Accounts and payments

Run `pinloop login` to make an account.

The commands talk to Pinloop's servers, so everything except the guide needs an
account. Login goes through a browser, with no password.

A free account gets a limited number of judged postings and semantic searches per
month. You can use your own coding agent subscription of choice to instead have the
agent judge postings and upload those judgments to Pinloop for free.
Run `pinloop upgrade` to raise the free plan's limits and gain access
to scheduled routines and watches which run unattended to review postings even when
your laptop is closed. Keyword search, filtering, saved lists of postings,
stored profile documents (e.g., resumes), and non-scheduled routines cost nothing.

## License

MIT. See [LICENSE](LICENSE).

The license covers the CLI only.

## Links

- Home: https://pinloop.ai
- Privacy: https://pinloop.ai/privacy
- Terms: https://pinloop.ai/terms
