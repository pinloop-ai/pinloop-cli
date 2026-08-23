# Pinloop CLI

Pinloop is a job search tool built for your coding agent to run from a terminal.

It holds a large collection of frequently updated job postings, can hold your
resume and any other preferences, and calls AI models to evaluate postings
against what it knows about you.

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
month, and `pinloop upgrade` opens the page to raise those limits. Keyword
search, filtering, saved lists, stored documents, and routines cost nothing.

## License

MIT. See [LICENSE](LICENSE).

The license covers this command line program. It is not permission to use the
Pinloop name, the servers, or the job postings the servers hold.

## Links

- Home: https://pinloop.ai
- Privacy: https://pinloop.ai/privacy
- Terms: https://pinloop.ai/terms
