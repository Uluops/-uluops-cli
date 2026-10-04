/**
 * Hint for names that start with "-".
 *
 * Projects here are named after their repos (`-uluops-cli`), so `ulu log -uluops-cli` is the
 * natural thing to type — and commander reads the name as an option: "unknown option
 * '-uluops-cli'", followed by the command's help, with nothing saying what to do. Quoting does not
 * help; the shell strips the quotes before the CLI sees them. Reported 2026-10-04 on 0.33.0, the
 * day after the README gained a note on it — a note nobody reads at the moment of the error.
 *
 * The workaround is commander's own: put the name after `--`, or hand it to a value-taking flag
 * (`-p -uluops-cli`, `--project=-uluops-cli`). This module only recognises the error and prints
 * the exact command to run.
 */

/** A token that looks like a name rather than an option: one dash, then 2+ characters, a letter among them, no "=". */
const NAME_LIKE = /^-(?!-)[^=\s]{2,}$/;

/**
 * The hint to print under commander's "unknown option" error, or undefined when the error is
 * something else or the token does not look like a name.
 *
 * @param errorText - The error text commander writes (e.g. "error: unknown option '-uluops-cli'\n").
 * @param argv - The user's arguments after the binary (process.argv.slice(2)).
 * @returns Lines to append under the error, or undefined.
 */
export function dashNameHint(
  errorText: string,
  argv: readonly string[],
): string | undefined {
  const token = /unknown option '([^']+)'/.exec(errorText)?.[1];
  if (!token || !NAME_LIKE.test(token) || !/[a-z]/i.test(token))
    return undefined;
  if (argv.includes('--')) return undefined; // already separated; something else is wrong
  const rest = argv.filter((a) => a !== token);
  const suggestion = ['ulu', ...rest, '--', token].join(' ');
  return (
    `\nIf '${token}' is a name (a project, definition, …) rather than an option, it was read as an option ` +
    `because it starts with "-". Put it after "--":\n` +
    `  ${suggestion}\n` +
    `A flag that takes the name accepts it attached with "=" (e.g. --project=${token}). ` +
    `Quoting does not help: the shell removes the quotes.\n`
  );
}
