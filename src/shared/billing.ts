/**
 * The names paying Pinloop twenty dollars a month is written from: the four
 * addresses on the server, the two pages on pinloop.ai, the two names carried
 * inside a web address, how long a one-time code is good for, and the two lines
 * `pinloop billing` prints.
 *
 * Nothing here is implementation. Every name below is an address, a number or a
 * printed sentence that the installed `pinloop` command, the server and the
 * tests all read out of this one file, so that none of the three carries its own
 * copy and drifts from the other two. It is the same arrangement
 * src/shared/sign-in.ts has held since browser sign-in shipped.
 *
 * The feature is specs/feature-subscription.md, DRAFT 2026-08-21, with the
 * architecture approved the same day. In one paragraph: `pinloop billing` asks
 * the server for a web address and opens it. An account that pays nothing is
 * handed Pinloop's own payment page at pinloop.ai/upgrade, carrying a one-time
 * code the server parked in its memory. The page's script trades that code, once,
 * for the secret Stripe's own card form needs, and Stripe's script draws the
 * card form inside a sealed frame on that page. An account that already pays is
 * handed an address at Stripe instead, which is where cancelling a subscription
 * and replacing a card happen.
 *
 * This file lives in src/shared because both the installed command and the
 * server read it: src/cli/package-boundary.test.ts allows the published command
 * to be built out of src/cli and src/shared and nothing else.
 */
import { ADDRESS_INDENT } from './sign-in.ts';

// ---------------------------------------------------------------------------
// The four addresses on the server
// ---------------------------------------------------------------------------

/**
 * Where `pinloop billing` asks for the address a person should open in a
 * browser. It requires a pass, like every other command.
 *
 * The answer is one field, `url`. For an account with no live subscription it is
 * the payment page on pinloop.ai carrying a one-time code; for an account with
 * one it is an address at Stripe.
 */
export const BILLING_PATH = '/billing';

/**
 * Where the payment page's script trades the one-time code, once, for the secret
 * Stripe's card form needs. It takes no pass at all: a browser does the trading,
 * and the browser holds no Pinloop login.
 *
 * The answer carries `client_secret` (what Stripe's script in the browser needs
 * to draw the card form), `publishable_key` (the key that names the Stripe
 * account, which is meant to be public), and `checkout` (the one-time value the
 * finished page asks about below).
 */
export const BILLING_TRADE_PATH = '/billing/trade';

/**
 * Where the page a person lands on after paying asks how the payment stands. It
 * takes no pass either, and answers `{"finished": true|false}`.
 *
 * The value it is handed is NOT Stripe's own identifier for the checkout. It is
 * a one-time value the server invented when it created that checkout and
 * remembers alongside Stripe's identifier for it, and the server answers only
 * for a value it invented itself.
 */
export const BILLING_STATUS_PATH = '/billing/status';

/**
 * Where Stripe delivers its own messages about finished payments, renewals,
 * failed charges and cancellations. It takes no pass: the signature Stripe puts
 * in the `stripe-signature` request header stands in for one, and a body whose
 * signature does not check out is refused.
 */
export const STRIPE_NOTICE_PATH = '/stripe/notice';

/** The request header Stripe puts its signature in. */
export const STRIPE_SIGNATURE_HEADER = 'stripe-signature';

// ---------------------------------------------------------------------------
// The two pages on pinloop.ai
// ---------------------------------------------------------------------------

/** The page a person who pays nothing types their card into. */
export const UPGRADE_PAGE_PATH = '/upgrade';

/** The page Stripe sends the browser back to when the card form is finished. */
export const UPGRADE_DONE_PAGE_PATH = '/upgrade/done';

/** The name in the payment page's own address that carries the one-time code. */
export const BILLING_CODE_PARAMETER = 'code';

/**
 * The name in the finished page's address that carries the one-time value the
 * server invented for one checkout.
 */
export const CHECKOUT_PARAMETER = 'checkout';

// ---------------------------------------------------------------------------
// How long a parked code lives
// ---------------------------------------------------------------------------

/**
 * How long the one-time code in the printed address can be traded for a card
 * form: ten minutes, and once.
 *
 * It is the same ten minutes a sign-in's short code is good for, for the same
 * reason: long enough that a person can walk to another machine and open the
 * page there, short enough that a code read off a screen is worthless by the
 * time anybody could go looking for it.
 */
export const BILLING_CODE_LIFETIME_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// The two lines `pinloop billing` prints
// ---------------------------------------------------------------------------

/**
 * The line printed above the address, with the address on its own indented line
 * under it.
 *
 * It names no price and no amount of money, because nothing this product prints
 * ever does (.claude/skills/printed-message/SKILL.md, rule 1). It is true
 * whichever of the two addresses the server hands back, because the terminal
 * does not know which it got: setting up a subscription happens on Pinloop's own
 * payment page, and changing or cancelling one happens on Stripe's page, and
 * "set up or change" covers both.
 */
export const BILLING_OPEN_LINE =
  'open this address in your browser to set up or change your Pinloop subscription:';

/**
 * The two lines together, ready to be written to standard output: the sentence,
 * then the address alone on an indented line.
 *
 * The address is always printed, even on a machine where the command also opens
 * the browser itself, because the person running the command is often a coding
 * agent while the human is looking at a browser on another screen, and because a
 * rented machine reached over SSH has no browser at all. `pinloop login` prints
 * its address the same way and for the same reasons.
 */
export function billingLines(url: string): string {
  return `${BILLING_OPEN_LINE}\n${ADDRESS_INDENT}${url}\n`;
}
