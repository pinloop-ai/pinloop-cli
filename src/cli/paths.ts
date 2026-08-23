/**
 * STUB. The CLI does not exist yet.
 *
 * The names below are not implementation — they are the contract the CLI tests
 * pin: which environment variables point the CLI at a server and at a config
 * directory, and what the saved-login file is called inside that directory.
 */

/**
 * Environment variable holding the base URL of the Pinloop server the CLI talks
 * to. The tests set it to the locally started server.
 */
export const SERVER_URL_ENV_VAR = 'PINLOOP_SERVER_URL';

/**
 * The hosted server every installed copy of this command talks to when the
 * environment variable above is not set. This is compiled into every published
 * copy, so a copy already installed on somebody's machine keeps using whatever
 * address was in it at install time. Changing it therefore strands every
 * installed copy unless the old address keeps answering, which is why the value
 * is pinned by a test rather than left as a string anyone can edit quietly.
 */
export const DEFAULT_SERVER_URL = 'https://api.pinloop.ai';

/**
 * Environment variable overriding where the CLI keeps its config. Without it the
 * CLI uses the usual per-user location; the tests point it at a throwaway
 * directory so a test run never touches Andrew's real login.
 */
export const CONFIG_DIR_ENV_VAR = 'PINLOOP_CONFIG_DIR';

/**
 * The file inside the config directory that holds the signed pass after a
 * successful login. Owner-read/write only, like an ssh private key.
 */
export const CREDENTIALS_FILENAME = 'credentials.json';

/** The file mode the saved-login file must carry: owner read+write, nothing else. */
export const CREDENTIALS_FILE_MODE = 0o600;
