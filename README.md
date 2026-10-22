<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/pinloop-wordmark-dark.svg">
    <img src="assets/pinloop-wordmark.svg" width="450" alt="Pinloop">
  </picture>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/pinloop"><img alt="npm version" src="https://img.shields.io/npm/v/pinloop?label=npm&labelColor=2A2B30&color=5D5E66"></a>
  <a href="LICENSE"><img alt="license: MIT" src="https://img.shields.io/badge/license-MIT-5D5E66?labelColor=2A2B30"></a>
  <a href="https://pinloop.ai"><img alt="pinloop.ai website" src="https://img.shields.io/badge/pinloop.ai-website-5D5E66?labelColor=2A2B30"></a>
</p>

<p align="center">
  <a href="https://pinloop.ai/discord"><img alt="Join our Discord" src="https://img.shields.io/badge/Discord-Join%20the%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white"></a>
</p>

<p align="center">
  Pinloop is a job board built for your coding agent, run entirely from a terminal.
</p>

<p align="center">
  It pulls in millions of postings a month, worldwide, across every white-collar<br>
  field, refreshed hourly from company hiring systems and from job boards like<br>
  LinkedIn. It can also hold your resume and any other preference files and make<br>
  LLM calls to judge every posting against what it knows about you.
</p>

<br>

https://github.com/user-attachments/assets/3657dcdc-4cac-4778-8cc6-5ca3b40e5fed

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

## License

MIT. See [LICENSE](LICENSE).

The license covers the CLI only.

## Links

- Home: https://pinloop.ai
- Discord: https://pinloop.ai/discord
- Privacy: https://pinloop.ai/privacy
- Terms: https://pinloop.ai/terms
