import { Command } from 'commander';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { GlobalOptions } from '../context.js';
import { writeFileAtomic } from '../utils.js';

/**
 * Config file paths
 */
const CONFIG_DIR = join(homedir(), '.uluops');
const PROFILES_PATH = join(CONFIG_DIR, 'profiles.json');
const CREDENTIALS_PATH = join(CONFIG_DIR, 'credentials.json');

/**
 * Valid config keys and their types
 */
const CONFIG_KEYS = {
  opsBaseUrl: 'string',
  registryBaseUrl: 'string',
  defaultProject: 'string',
  json: 'boolean',
  quiet: 'boolean',
  debug: 'boolean',
} as const;

type ConfigKey = keyof typeof CONFIG_KEYS;
type ProfileConfig = Partial<Record<ConfigKey, string | boolean>>;

interface ProfilesFile {
  _active: string;
  [profile: string]: ProfileConfig | string;
}

/**
 * Load the profiles file (or return defaults)
 */
function loadProfiles(): ProfilesFile {
  if (!existsSync(PROFILES_PATH)) {
    return { _active: 'default' };
  }
  try {
    return JSON.parse(readFileSync(PROFILES_PATH, 'utf-8'));
  } catch {
    return { _active: 'default' };
  }
}

/**
 * Save profiles file
 */
function saveProfiles(profiles: ProfilesFile): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileAtomic(PROFILES_PATH, JSON.stringify(profiles, null, 2) + '\n');
}

/**
 * Get the active profile name
 */
function getActiveProfile(profiles: ProfilesFile, override?: string): string {
  return override ?? (profiles._active as string) ?? 'default';
}

/**
 * Coerce a string value to the correct type for a config key
 */
function coerceValue(key: ConfigKey, value: string): string | boolean {
  if (CONFIG_KEYS[key] === 'boolean') {
    return value === 'true' || value === '1' || value === 'yes';
  }
  return value;
}

/**
 * Register config commands
 */
export function registerConfigCommands(program: Command): void {
  const config = program
    .command('config')
    .description('Manage CLI configuration and profiles');

  // ulu config list
  config
    .command('list')
    .description('Show resolved configuration for the active profile')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const profiles = loadProfiles();
      const profileName = getActiveProfile(profiles, globalOpts.profile);
      const profileConfig = (profiles[profileName] as ProfileConfig) ?? {};

      if (globalOpts.json) {
        console.log(JSON.stringify({
          activeProfile: profileName,
          config: profileConfig,
          envOverrides: getEnvOverrides(),
        }, null, 2));
        return;
      }

      console.log(`Profile: ${profileName}\n`);

      // Show config values with source indicators
      const envOverrides = getEnvOverrides();
      for (const key of Object.keys(CONFIG_KEYS) as ConfigKey[]) {
        const envVal = envOverrides[key];
        const profileVal = profileConfig[key];
        if (envVal !== undefined) {
          console.log(`  ${key}: ${envVal} (env)`);
        } else if (profileVal !== undefined) {
          console.log(`  ${key}: ${profileVal}`);
        } else {
          console.log(`  ${key}: (not set)`);
        }
      }

      // Show auth status
      const hasCredentials = existsSync(CREDENTIALS_PATH);
      console.log(`\n  Auth: ${hasCredentials ? 'credentials stored' : 'not configured'}`);
    });

  // ulu config get <key>
  config
    .command('get <key>')
    .description('Get a config value')
    .action(async (key: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;

      if (!(key in CONFIG_KEYS)) {
        console.error(`Unknown config key: ${key}`);
        console.error(`Valid keys: ${Object.keys(CONFIG_KEYS).join(', ')}`);
        process.exit(1);
      }

      const profiles = loadProfiles();
      const profileName = getActiveProfile(profiles, globalOpts.profile);
      const profileConfig = (profiles[profileName] as ProfileConfig) ?? {};

      // Check env override first
      const envOverrides = getEnvOverrides();
      const envVal = envOverrides[key as ConfigKey];
      const profileVal = profileConfig[key as ConfigKey];
      const value = envVal ?? profileVal;

      if (globalOpts.json) {
        console.log(JSON.stringify({ key, value: value ?? null, source: envVal !== undefined ? 'env' : profileVal !== undefined ? 'profile' : 'unset' }));
      } else if (value !== undefined) {
        console.log(String(value));
      }
    });

  // ulu config set <key> <value>
  config
    .command('set <key> <value>')
    .description('Set a config value in the active profile')
    .action(async (key: string, value: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;

      if (!(key in CONFIG_KEYS)) {
        console.error(`Unknown config key: ${key}`);
        console.error(`Valid keys: ${Object.keys(CONFIG_KEYS).join(', ')}`);
        process.exit(1);
      }

      const profiles = loadProfiles();
      const profileName = getActiveProfile(profiles, globalOpts.profile);

      if (!profiles[profileName] || typeof profiles[profileName] === 'string') {
        profiles[profileName] = {};
      }

      const coerced = coerceValue(key as ConfigKey, value);
      (profiles[profileName] as ProfileConfig)[key as ConfigKey] = coerced;
      saveProfiles(profiles);

      if (globalOpts.json) {
        console.log(JSON.stringify({ key, value: coerced, profile: profileName }));
      } else {
        console.log(`Set ${key} = ${coerced} (profile: ${profileName})`);
      }
    });

  // ulu config unset <key>
  config
    .command('unset <key>')
    .description('Remove a config value from the active profile')
    .action(async (key: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;

      if (!(key in CONFIG_KEYS)) {
        console.error(`Unknown config key: ${key}`);
        console.error(`Valid keys: ${Object.keys(CONFIG_KEYS).join(', ')}`);
        process.exit(1);
      }

      const profiles = loadProfiles();
      const profileName = getActiveProfile(profiles, globalOpts.profile);
      const profileConfig = profiles[profileName] as ProfileConfig | undefined;

      if (profileConfig && key in profileConfig) {
        delete profileConfig[key as ConfigKey];
        saveProfiles(profiles);
      }

      if (globalOpts.json) {
        console.log(JSON.stringify({ key, profile: profileName, removed: true }));
      } else {
        console.log(`Unset ${key} (profile: ${profileName})`);
      }
    });

  // ulu config profiles
  config
    .command('profiles')
    .description('List available profiles')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const profiles = loadProfiles();
      const activeProfile = profiles._active as string;

      const profileNames = Object.keys(profiles).filter((k) => k !== '_active');

      if (globalOpts.json) {
        console.log(JSON.stringify({ active: activeProfile, profiles: profileNames }));
        return;
      }

      if (profileNames.length === 0) {
        console.log('No profiles configured. Use "ulu config set <key> <value>" to create one.');
        return;
      }

      console.log('Profiles:\n');
      for (const name of profileNames) {
        const marker = name === activeProfile ? ' *' : '';
        const config = profiles[name] as ProfileConfig;
        const keys = Object.keys(config).filter((k) => config[k as ConfigKey] !== undefined);
        const summary = keys.length > 0 ? ` (${keys.join(', ')})` : '';
        console.log(`  ${name}${marker}${summary}`);
      }
      console.log(`\n  * = active profile`);
    });

  // ulu config use <profile>
  config
    .command('use <profile>')
    .description('Switch the active profile')
    .action(async (profile: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const profiles = loadProfiles();

      profiles._active = profile;
      // Ensure the profile entry exists
      if (!profiles[profile]) {
        profiles[profile] = {};
      }
      saveProfiles(profiles);

      if (globalOpts.json) {
        console.log(JSON.stringify({ active: profile }));
      } else {
        console.log(`Switched to profile: ${profile}`);
      }
    });

  // ulu config path
  config
    .command('path')
    .description('Show config file locations')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;

      const paths = {
        configDir: CONFIG_DIR,
        profiles: PROFILES_PATH,
        credentials: CREDENTIALS_PATH,
        localEnv: join(process.cwd(), '.env'),
      };

      if (globalOpts.json) {
        console.log(JSON.stringify(paths, null, 2));
        return;
      }

      console.log('Config paths:\n');
      console.log(`  Config dir:   ${paths.configDir} ${existsSync(paths.configDir) ? '' : '(not created)'}`);
      console.log(`  Profiles:     ${paths.profiles} ${existsSync(paths.profiles) ? '' : '(not created)'}`);
      console.log(`  Credentials:  ${paths.credentials} ${existsSync(paths.credentials) ? '' : '(not created)'}`);
      console.log(`  Local .env:   ${paths.localEnv} ${existsSync(paths.localEnv) ? '' : '(not found)'}`);
    });
}

/**
 * Get config values that are overridden by environment variables
 */
function getEnvOverrides(): Partial<Record<ConfigKey, string>> {
  const overrides: Partial<Record<ConfigKey, string>> = {};
  if (process.env.ULUOPS_BASE_URL) overrides.opsBaseUrl = process.env.ULUOPS_BASE_URL;
  if (process.env.ULUOPS_REGISTRY_URL) overrides.registryBaseUrl = process.env.ULUOPS_REGISTRY_URL;
  if (process.env.ULUOPS_DEBUG) overrides.debug = process.env.ULUOPS_DEBUG;
  return overrides;
}
