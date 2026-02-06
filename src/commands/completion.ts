import { Command } from 'commander';

/**
 * Walk a Commander program tree and extract all command paths
 */
function getCommandTree(cmd: Command, prefix = ''): Array<{ path: string; description: string; subcommands: string[] }> {
  const results: Array<{ path: string; description: string; subcommands: string[] }> = [];

  for (const sub of cmd.commands) {
    const fullPath = prefix ? `${prefix} ${sub.name()}` : sub.name();
    const childNames = sub.commands.map((c: Command) => c.name());

    results.push({
      path: fullPath,
      description: sub.description() || '',
      subcommands: childNames,
    });

    // Recurse into subcommands
    results.push(...getCommandTree(sub, fullPath));
  }

  return results;
}

/**
 * Generate bash completion script
 */
function generateBashCompletion(program: Command): string {
  const tree = getCommandTree(program);
  const topLevel = program.commands.map((c) => c.name()).join(' ');

  // Build a case statement for each command path
  const cases: string[] = [];
  for (const entry of tree) {
    if (entry.subcommands.length > 0) {
      cases.push(`    ${entry.path}) COMPREPLY=($(compgen -W "${entry.subcommands.join(' ')}" -- "$cur")) ;;`);
    }
  }

  return `# Bash completion for ulu CLI
# Add to ~/.bashrc: eval "$(ulu completion bash)"
_ulu_completions() {
  local cur prev words cword
  _init_completion || return

  # Build the command path from words
  local cmd_path=""
  local i
  for (( i=1; i < cword; i++ )); do
    case "\${words[i]}" in
      -*) continue ;;
      *) cmd_path="\${cmd_path:+$cmd_path }\${words[i]}" ;;
    esac
  done

  case "$cmd_path" in
${cases.join('\n')}
    "") COMPREPLY=($(compgen -W "${topLevel}" -- "$cur")) ;;
    *) COMPREPLY=() ;;
  esac

  return 0
}

complete -o default -F _ulu_completions ulu
`;
}

/**
 * Generate zsh completion script
 */
function generateZshCompletion(program: Command): string {
  const tree = getCommandTree(program);
  const topLevel = program.commands.map((c) => `'${c.name()}:${(c.description() || '').replace(/'/g, "''")}'`).join('\n      ');

  // Build subcmd functions
  const functions: string[] = [];
  for (const entry of tree) {
    if (entry.subcommands.length > 0) {
      const fnName = `_ulu_${entry.path.replace(/ /g, '_')}`;
      const subTree = tree.filter((t) => {
        const parent = entry.path;
        return t.path.startsWith(parent + ' ') && !t.path.slice(parent.length + 1).includes(' ');
      });
      const subArgs = subTree.map((s) => {
        const name = s.path.split(' ').pop()!;
        return `'${name}:${s.description.replace(/'/g, "''")}'`;
      }).join('\n      ');

      functions.push(`${fnName}() {
  local -a subcmds
  subcmds=(
      ${subArgs}
  )
  _describe 'subcommand' subcmds
}`);
    }
  }

  return `#compdef ulu
# Zsh completion for ulu CLI
# Add to ~/.zshrc: eval "$(ulu completion zsh)"

_ulu() {
  local -a subcmds
  subcmds=(
      ${topLevel}
  )

  _arguments -C \\
    '--api-key[API key]:key:' \\
    '--profile[Config profile]:profile:' \\
    '--base-url[API base URL]:url:' \\
    '--json[Output in JSON format]' \\
    '--debug[Enable debug output]' \\
    '-q[Suppress spinners]' \\
    '1:command:->cmd' \\
    '*::arg:->args'

  case "$state" in
    cmd) _describe 'command' subcmds ;;
    args)
      case "\${words[1]}" in
${program.commands.map((c) => {
    const subs = c.commands.map((s: Command) => s.name()).join(' ');
    return subs ? `        ${c.name()}) compadd ${subs} ;;` : '';
  }).filter(Boolean).join('\n')}
        *) _default ;;
      esac
    ;;
  esac
}

_ulu "$@"
`;
}

/**
 * Generate fish completion script
 */
function generateFishCompletion(program: Command): string {
  const lines: string[] = [
    '# Fish completion for ulu CLI',
    '# Save to: ~/.config/fish/completions/ulu.fish',
    '',
    '# Disable file completions by default',
    'complete -c ulu -f',
    '',
  ];

  // Top-level commands
  for (const cmd of program.commands) {
    const desc = (cmd.description() || '').replace(/'/g, "\\'");
    lines.push(`complete -c ulu -n '__fish_use_subcommand' -a '${cmd.name()}' -d '${desc}'`);
  }
  lines.push('');

  // Subcommands
  for (const cmd of program.commands) {
    for (const sub of cmd.commands) {
      const desc = (sub.description() || '').replace(/'/g, "\\'");
      lines.push(`complete -c ulu -n '__fish_seen_subcommand_from ${cmd.name()}' -a '${sub.name()}' -d '${desc}'`);
    }
  }

  // Global options
  lines.push('');
  lines.push("# Global options");
  lines.push("complete -c ulu -l api-key -d 'API key'");
  lines.push("complete -c ulu -l profile -d 'Config profile'");
  lines.push("complete -c ulu -l base-url -d 'API base URL'");
  lines.push("complete -c ulu -l json -d 'Output in JSON format'");
  lines.push("complete -c ulu -l debug -d 'Enable debug output'");
  lines.push("complete -c ulu -s q -l quiet -d 'Suppress spinners'");

  return lines.join('\n') + '\n';
}

/**
 * Register completion command.
 * Requires the fully-built program so it can introspect the command tree.
 */
export function registerCompletionCommands(program: Command): void {
  const completion = program
    .command('completion')
    .description('Generate shell completion scripts');

  completion
    .command('bash')
    .description('Output bash completion script')
    .action(() => {
      process.stdout.write(generateBashCompletion(program));
    });

  completion
    .command('zsh')
    .description('Output zsh completion script')
    .action(() => {
      process.stdout.write(generateZshCompletion(program));
    });

  completion
    .command('fish')
    .description('Output fish completion script')
    .action(() => {
      process.stdout.write(generateFishCompletion(program));
    });
}
