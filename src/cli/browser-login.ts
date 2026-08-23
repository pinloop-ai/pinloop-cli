/**
 * The terminal half of signing in through a browser: the small web server
 * `pinloop login` starts inside its own process, and the web address it prints.
 *
 * The feature is specs/feature-browser-sign-in.md, agreed 2026-08-19. In one
 * paragraph. `pinloop login` starts listening on 127.0.0.1, which is the address
 * a machine uses to talk to itself and which no other machine can reach. It
 * listens on whatever port is free at that moment, and it invents a one-time
 * secret. It then prints the web address of the sign-in page with that port and
 * that secret written into it, and waits. A person opens that address in a
 * browser and signs in with Google, with GitHub, or with a 6-digit code Pinloop
 * emails them. The script inside the page then sends the pass to 127.0.0.1 on
 * the port the terminal named, carrying the secret the terminal invented, and
 * this file hands that pass back to the command, which saves it.
 *
 * Two things here are not obvious and are the point of the file.
 *
 * The secret. Without it, anything at all running on the machine could hand this
 * terminal a pass, and a sign-in page still open in another window from an
 * earlier `pinloop login` could hand a pass to the wrong terminal. A delivery
 * carrying the wrong secret, or none, is refused and the terminal keeps waiting
 * for the page it actually sent.
 *
 * The browser's question. A browser will not let a page at pinloop.ai send
 * anything to 127.0.0.1 until it has asked the listener whether that is allowed.
 * That question arrives as an OPTIONS request, before the delivery. If it goes
 * unanswered the browser drops the delivery without a word, the terminal waits
 * its whole ten minutes, and nothing anywhere says why. So it is answered.
 *
 * This file imports from src/cli and src/shared only, which is the rule
 * src/cli/package-boundary.test.ts enforces: the published `pinloop` package is
 * built out of those two folders and nothing else.
 */
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { platform } from 'node:process';

import {
  GAVE_UP_LINE,
  LOOPBACK_CALLBACK_PATH,
  PORT_PARAMETER,
  SECRET_PARAMETER,
  SIGN_IN_PAGE_PATH,
  SIGN_IN_SITE_URL,
  SIGN_IN_SITE_URL_ENV_VAR,
  WAIT_FOR_SIGN_IN_MS,
  type DeliveredPass,
} from '../shared/sign-in.ts';

/** A terminal that is listening for a browser to hand it a pass. */
export type WaitingForSignIn = {
  /** The whole web address to print: the sign-in page, the port and the secret. */
  pageUrl: string;
  /** The port the small web server is listening on, on 127.0.0.1. */
  port: number;
  /** The one-time secret this terminal invented. */
  secret: string;
  /**
   * The pass the browser delivered. It fails, with GAVE_UP_LINE as its message,
   * when nothing was delivered inside the wait.
   */
  pass: Promise<DeliveredPass>;
  /** Stops listening and drops the clock. Doing it twice is safe. */
  stop(): Promise<void>;
};

export type WaitOptions = {
  /**
   * Where the sign-in page lives, without a trailing slash. Absent means the
   * environment variable named in src/shared/sign-in.ts, and the hosted site
   * when that is unset too.
   */
  pageBaseUrl?: string;
  /** How long to wait before giving up. Absent means WAIT_FOR_SIGN_IN_MS. */
  giveUpAfterMs?: number;
};

/** Where the sign-in page lives for this run. */
export function signInPageBaseUrl(): string {
  const chosen = process.env[SIGN_IN_SITE_URL_ENV_VAR];
  const url = chosen && chosen.trim() !== '' ? chosen.trim() : SIGN_IN_SITE_URL;
  return url.replace(/\/+$/, '');
}

/**
 * How long a secret is: 32 characters of hexadecimal, which is 16 bytes of
 * randomness out of the operating system's own source of it. Guessing one inside
 * the ten minutes a terminal waits is not a thing that happens.
 */
const SECRET_BYTES = 16;

/** The largest delivery this listener will read, in bytes. */
const LARGEST_DELIVERY = 16 * 1024;

/** Whether two strings are the same, without taking longer for a closer guess. */
function sameSecret(mine: string, theirs: unknown): boolean {
  if (typeof theirs !== 'string') return false;
  const a = Buffer.from(mine, 'utf8');
  const b = Buffer.from(theirs, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Reads a request body, keeping no more than LARGEST_DELIVERY of it. */
function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((done) => {
    const chunks: Buffer[] = [];
    let kept = 0;
    request.on('data', (chunk: Buffer) => {
      if (kept > LARGEST_DELIVERY) return;
      kept += chunk.length;
      chunks.push(Buffer.from(chunk));
    });
    request.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
    request.on('error', () => done(''));
  });
}

/**
 * The headers that tell the browser a page from somewhere else may talk to this
 * listener.
 *
 * They say "any page", which sounds broader than it is: this listener answers
 * only 127.0.0.1, it takes nothing but a delivery carrying the one-time secret
 * it invented a moment ago, it hands nothing back but the word ok, and it stops
 * listening the instant one arrives. Naming one site instead would mean this
 * file having to know which site the person was sent to, and getting that wrong
 * shows up as a sign-in that hangs with no message anywhere.
 */
function browserHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '600',
  };
}

function answer(reply: ServerResponse, status: number, body: Record<string, unknown>): void {
  reply.writeHead(status, { 'content-type': 'application/json', ...browserHeaders() });
  reply.end(JSON.stringify(body));
}

/**
 * Starts listening on 127.0.0.1 and hands back the address to print, the port,
 * the secret, and a promise of the pass.
 *
 * Nothing here opens a browser. Opening one is `openInBrowser` below, which the
 * command calls separately, because the address has to be printed whether or not
 * this machine has a browser at all: the person running the command is often a
 * coding agent, and the human does the browser part on their own screen.
 */
export async function waitForBrowserSignIn(
  options: WaitOptions = {},
): Promise<WaitingForSignIn> {
  const secret = randomBytes(SECRET_BYTES).toString('hex');
  const giveUpAfterMs = options.giveUpAfterMs ?? WAIT_FOR_SIGN_IN_MS;
  const pageBaseUrl = (options.pageBaseUrl ?? signInPageBaseUrl()).replace(/\/+$/, '');

  let handOver: (pass: DeliveredPass) => void = () => undefined;
  let giveUpWith: (why: Error) => void = () => undefined;
  const pass = new Promise<DeliveredPass>((delivered, failed) => {
    handOver = delivered;
    giveUpWith = failed;
  });
  // Nothing else may ever see this rejection as unhandled: the command attaches
  // to it straight away, but a caller that stops early has not.
  pass.catch(() => undefined);

  const server: Server = createServer((request: IncomingMessage, reply: ServerResponse) => {
    const path = (request.url ?? '/').split('?')[0];

    // The browser's question, asked before it will send the delivery at all.
    if (request.method === 'OPTIONS') {
      reply.writeHead(204, browserHeaders());
      reply.end();
      return;
    }

    if (request.method !== 'POST' || path !== LOOPBACK_CALLBACK_PATH) {
      answer(reply, 404, { error: 'this is the terminal waiting for a Pinloop sign-in' });
      return;
    }

    void readBody(request).then((text) => {
      let delivered: Partial<DeliveredPass> = {};
      try {
        delivered = JSON.parse(text) as Partial<DeliveredPass>;
      } catch {
        answer(reply, 400, { error: 'that was not a sign-in' });
        return;
      }

      if (!sameSecret(secret, delivered.secret)) {
        // Refused, and the wait goes on. This terminal is still waiting for the
        // page it sent somebody to, and something else knocked.
        answer(reply, 403, { error: 'this terminal did not send that sign-in' });
        return;
      }
      if (typeof delivered.access_token !== 'string' || delivered.access_token === '') {
        answer(reply, 400, { error: 'that sign-in carried no pass' });
        return;
      }

      answer(reply, 200, { ok: true });
      handOver({
        secret,
        access_token: delivered.access_token,
        ...(typeof delivered.refresh_token === 'string'
          ? { refresh_token: delivered.refresh_token }
          : {}),
        ...(typeof delivered.email === 'string' ? { email: delivered.email } : {}),
      });
    });
  });

  await new Promise<void>((listening, failed) => {
    server.once('error', failed);
    server.listen(0, '127.0.0.1', () => listening());
  });
  const port = (server.address() as AddressInfo).port;

  const clock = setTimeout(() => giveUpWith(new Error(GAVE_UP_LINE)), giveUpAfterMs);

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    clearTimeout(clock);
    await new Promise<void>((closed) => server.close(() => closed()));
  };

  const pageUrl =
    `${pageBaseUrl}${SIGN_IN_PAGE_PATH}` +
    `?${PORT_PARAMETER}=${port}&${SECRET_PARAMETER}=${secret}`;

  return { pageUrl, port, secret, pass, stop };
}

/**
 * Opens one web address in this machine's browser, if this machine has one.
 *
 * Best effort and never required. It is started and forgotten: nothing waits for
 * it, nothing reads what it printed, and a machine with no browser at all — a
 * rented one reached over SSH, which is where the short code exists for — simply
 * has nothing happen. The address is always printed as well, so the person can
 * open it themselves wherever their browser actually is.
 */
export function openInBrowser(url: string): void {
  const opener = browserOpener();
  if (opener === undefined) return;
  try {
    const started = spawn(opener.command, [...opener.before, url], {
      detached: true,
      stdio: 'ignore',
    });
    // A machine where the opener is not installed raises an error on the object
    // rather than throwing, and an unheard error event on a child process ends
    // the whole program.
    started.on('error', () => undefined);
    started.unref();
  } catch {
    // Whatever went wrong, the address is printed and the person can open it.
  }
}

/** The program that opens a web address on this machine, if there is one. */
function browserOpener(): { command: string; before: string[] } | undefined {
  if (platform === 'darwin') return { command: 'open', before: [] };
  if (platform === 'win32') return { command: 'cmd', before: ['/c', 'start', ''] };
  // On Linux, a machine with no screen attached has no browser to open a page
  // in, and every terminal reached over SSH is such a machine. Asking whether a
  // screen exists is what keeps this from starting a program that cannot
  // possibly do anything on exactly the machines the short code exists for.
  const hasAScreen =
    (process.env['DISPLAY'] ?? '') !== '' || (process.env['WAYLAND_DISPLAY'] ?? '') !== '';
  if (!hasAScreen) return undefined;
  return { command: 'xdg-open', before: [] };
}
