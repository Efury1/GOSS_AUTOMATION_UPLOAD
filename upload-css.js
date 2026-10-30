'use strict';

/**
 * upload-css.js
 *
 * Uploads each site's compiled CSS from GOSS-skin/global/sites to GOSS iCM Media.
 *
 * ---------------------------------------------------------------------------
 * SETUP (once)
 * ---------------------------------------------------------------------------
 *   1. In the goss-upload folder:  npm install
 *   2. Copy .env.example to .env and check the values. Every setting comes
 *      from .env (there are no built-in defaults); it stops and says which
 *      one is missing:
 *        SITES_DIR      where the built CSS is
 *        ICM_*_URL      the iCM login page for each environment
 *        BROWSER        msedge or chrome; optional: leave it out and pick it in the window
 *        LEARN_MODE     true = do one site only, for testing
 *   3. Make the "Upload CSS" desktop shortcut (see README.md).
 *
 * ---------------------------------------------------------------------------
 * EVERY TIME
 * ---------------------------------------------------------------------------
 *   1. Build the CSS in GOSS-skin, so each <site>/<site>.css is fresh.
 *   2. Double-click "Upload CSS" on the desktop (or run "npm start").
 *   3. A window opens (picker/picker.html): check the sites folder (Browse… to change it; it's
 *      remembered in .env), click an environment, tick the sites, press Start.
 *   4. Log in to iCM. It deals with the "already logged on" warning and the
 *      security questions note, then starts by itself.
 *   5. Leave Edge alone while it works. Each site prints OK or FAIL.
 *   6. When the summary shows, press Enter to close Edge.
 *
 * From a terminal, anything given on the command line skips that part of the picker:
 *   npm run upload:dev -- all                    every site to dev
 *   npm run upload:prp -- tolhouse-gaol          one site to preprod
 *   node upload-css.js --env tst devolution      the same, without npm
 *   add --browser chrome to use Chrome for that run
 *
 * If a site fails:
 *   - A picture is saved in the screenshots folder (goss-upload\screenshots),
 *     named with the date, time and site. The top of it says what went wrong
 *     and at which step; underneath is what Edge was showing at that moment.
 *   - "No CSS item in iCM matches" means the iCM name is too different from the
 *     folder name. Add it to ALIASES below, e.g. { recycles: 'Norfolk Recycles' }.
 */

const { chromium } = require('playwright');
const fileSystem = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');
const { pathToFileURL } = require('url');

// ============================================================================
// Settings from .env
// ============================================================================

const ENV_FILE = path.join(__dirname, '.env');

// Filled in by loadSettings(), the first thing main() does. Loading them there
// (not here at the top) means a missing setting shows a message and waits for
// Enter, instead of the desktop shortcut's window flashing shut.
let ENVIRONMENTS; // iCM login page for each environment
let CONFIG;       // sitesDir, browserChannel, learnMode
/** The environments, in the order the window shows them. */
const environmentNames = ['dev', 'tst', 'prp', 'prd'];
/** Which .env setting holds each environment's iCM link. */
const ENVIRONMENT_SETTINGS = { dev: 'ICM_DEV_URL', tst: 'ICM_TST_URL', prp: 'ICM_PRP_URL', prd: 'ICM_PRD_URL' };
/** Settings .env is missing, when the window is allowed to ask for them (first-time setup). */
let missingSettings = [];

/** Every setting .env must have. */
const REQUIRED_SETTINGS = [
  'SITES_DIR', 'ICM_DEV_URL', 'ICM_TST_URL', 'ICM_PRP_URL', 'ICM_PRD_URL', 'LEARN_MODE',
];
// BROWSER is not on the list: it can be left out and picked in the window instead
// (the window then saves the choice to .env). Without the window it's needed.

/** Characters you can't see that sometimes sneak in when text is copied and pasted. */
const INVISIBLE_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

/** The settings from .env, as { NAME: value }. */
let envValues = {};

/** Read .env's text, whatever encoding Notepad saved it in (UTF-16, UTF-8 with or without BOM). */
function readEnvText(filePath) {
  const bytes = fileSystem.readFileSync(filePath);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return Buffer.from(bytes.subarray(2)).swap16().toString('utf16le');
  return bytes.toString('utf8').replace(/^\uFEFF/, '');
}

/**
 * Read .env's settings. Copes with Windows line endings, spaces around "=" and
 * quotes around values. Lines starting with # are notes and are skipped.
 */
function readEnvFile(filePath) {
  const text = readEnvText(filePath);

  const values = {};
  const unreadable = []; // lines that aren't notes but don't look like NAME=value
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(INVISIBLE_CHARACTERS, '').trim();
    if (!line || line.startsWith('#')) return;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[=:]\s*(.*)$/);
    if (!match) {
      unreadable.push(`line ${index + 1}: ${rawLine.trim()}`);
      return;
    }
    let value = match[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (value) values[match[1].toUpperCase()] = value;
  });
  return { values, unreadable };
}

/**
 * Load .env. Every setting comes from there: if the file or any setting is
 * missing, it stops and says exactly what to add.
 * With `allowMissing`, it doesn't stop: the window's Settings box asks for them instead.
 */
function loadEnv({ allowMissing = false } = {}) {
  if (!fileSystem.existsSync(ENV_FILE)) {
    if (allowMissing) return { values: {}, missing: [...REQUIRED_SETTINGS] };
    throw new Error(`No .env file in ${__dirname}.\n`
      + 'Run it without naming sites to fill in the settings in the window, '
      + 'or copy .env.example to .env (same folder) and check the values in it.');
  }

  const { values, unreadable } = readEnvFile(ENV_FILE);
  const unreadableNote = unreadable.length
    ? `These lines couldn't be read (they should look like NAME=value):\n  ${unreadable.join('\n  ')}\n`
    : '';

  const missing = REQUIRED_SETTINGS.filter(name => !values[name]);
  if (missing.length && allowMissing) {
    if (unreadable.length) console.log(unreadableNote.trim());
    return { values, missing };
  }
  if (missing.length) {
    const found = Object.keys(values);
    throw new Error(`${ENV_FILE} is missing: ${missing.join(', ')}\n`
      + (found.length ? `It does have: ${found.join(', ')}\n` : 'No settings were found in it. Is it empty?\n')
      + unreadableNote
      + 'See .env.example for what each one should be.');
  }
  if (unreadable.length) console.log(unreadableNote.trim());

  if (values.BROWSER && !['msedge', 'chrome'].includes(values.BROWSER.toLowerCase())) {
    throw new Error(`BROWSER in .env is "${values.BROWSER}". It should be msedge or chrome, `
      + 'or leave it out and pick the browser in the window.');
  }
  return { values, missing: [] };
}

/** The values in .env.example, used to fill in the Settings box the first time. */
function exampleSettings() {
  const examplePath = path.join(__dirname, '.env.example');
  return fileSystem.existsSync(examplePath) ? readEnvFile(examplePath).values : {};
}

/**
 * Check what the Settings box sends before saving it.
 * Returns a list of problems, each { field, message }; empty means it's fine.
 */
function checkSettingsForm(form) {
  const problems = [];
  const looksLikeLink = text => /^https?:\/\/\S+$/i.test(text);
  if (!form.SITES_DIR) problems.push({ field: 'SITES_DIR', message: 'Choose the sites folder.' });
  else if (!fileSystem.existsSync(path.resolve(__dirname, form.SITES_DIR))) {
    problems.push({ field: 'SITES_DIR', message: "That sites folder doesn't exist." });
  }
  for (const name of environmentNames) {
    const setting = ENVIRONMENT_SETTINGS[name];
    if (!looksLikeLink(form[setting] || '')) {
      problems.push({ field: setting, message: `${ENVIRONMENT_LABELS[name]}: put the iCM login page's full link, starting https://` });
    }
  }
  if (form.BROWSER && !['msedge', 'chrome'].includes(form.BROWSER)) {
    problems.push({ field: 'BROWSER', message: 'Pick Microsoft Edge or Google Chrome.' });
  }
  return problems;
}

/**
 * Write all the settings to .env, with notes explaining each one.
 * Any other lines already in .env that this doesn't know about are kept at the end.
 */
function writeEnvFile(form) {
  const known = [...REQUIRED_SETTINGS, 'BROWSER'];
  const existing = fileSystem.existsSync(ENV_FILE) ? readEnvFile(ENV_FILE).values : {};
  const others = Object.entries(existing).filter(([name]) => !known.includes(name));

  const lines = [
    '# Settings for upload-css.js. Change them in the window (Settings), or here.',
    "# Don't put passwords here: you log in yourself in the browser.",
    '',
    '# Where the built CSS lives: the folder holding one folder per site, each with <site>.css inside.',
    '# A full path, or relative to the goss-upload folder.',
    `SITES_DIR=${form.SITES_DIR}`,
    '',
    '# iCM login page for each environment',
    ...environmentNames.map(name => `${ENVIRONMENT_SETTINGS[name]}=${form[ENVIRONMENT_SETTINGS[name]]}`),
    '',
    '# Which browser to use: msedge or chrome. Leave empty to pick it in the window.',
    `BROWSER=${form.BROWSER || ''}`,
    '',
    '# true = upload the first ticked site only and save extra pictures, for testing changes',
    `LEARN_MODE=${form.LEARN_MODE === 'true' ? 'true' : 'false'}`,
    ...(others.length ? ['', '# Other settings', ...others.map(([name, value]) => `${name}=${value}`)] : []),
    '',
  ];
  fileSystem.writeFileSync(ENV_FILE, lines.join('\n'));
}

/**
 * Save a setting to .env, so it's remembered next time (the sites folder or browser
 * picked in the window). Changes that setting's line, or adds one if there isn't one.
 */
function saveSettingToEnv(name, value) {
  const text = readEnvText(ENV_FILE);
  const line = `${name}=${value}`;
  const settingLine = new RegExp(`^\\s*${name}\\s*=.*$`, 'm');
  const updated = settingLine.test(text)
    ? text.replace(settingLine, () => line)
    : `${text.replace(/\s*$/, '')}\n\n${line}\n`;
  fileSystem.writeFileSync(ENV_FILE, updated);
}

/** Read .env into ENVIRONMENTS and CONFIG. `allowMissing`: see loadEnv. */
function loadSettings({ allowMissing = false } = {}) {
  const loaded = loadEnv({ allowMissing });
  envValues = loaded.values;
  missingSettings = loaded.missing;

  ENVIRONMENTS = Object.fromEntries(environmentNames.map(name => [name, envValues[ENVIRONMENT_SETTINGS[name]]]));

  CONFIG = {
    // full path, or relative to goss-upload; null until it's set
    sitesDir: envValues.SITES_DIR ? path.resolve(__dirname, envValues.SITES_DIR) : null,
    browserChannel: envValues.BROWSER ? envValues.BROWSER.toLowerCase() : null, // null: pick it in the window
    learnMode: (envValues.LEARN_MODE || '').toLowerCase() === 'true',
  };
}

// ============================================================================
// Fixed settings (how iCM is laid out; these don't change between PCs)
// ============================================================================

/** Environments that need confirming before uploading, because they're live. */
const CONFIRM_ENVIRONMENTS = ['prd'];

/** Folders to click through in Media to reach the CSS items. */
const TREE_PATH = ['Shared resources', 'Developer', 'Front end - CSS-JS', 'dynamic'];

const VIEWPORT = { width: 1400, height: 900 };

/** Only needed if a site's GOSS name is nothing like its folder name. */
const ALIASES = {};

const TIMEOUT = {
  login: 5 * 60_000, // how long to wait for you to log in
  find: 10_000,
  siteListQuick: 5_000,
  okNote: 5_000,
  optional: 3_000,
  update: 5_000,
  fileChooser: 8_000,
  pollEvery: 300,
};

const PAUSE = {
  afterTreeClick: 1_000,
  afterMediaOpen: 2_000,
  afterOpenItem: 3_000,
  afterOkNote: 1_000,
  afterFilesTab: 1_500,
  afterUpload: 5_000,
  afterSave: 2_000,
  afterSpellCheck: 1_500,
  afterUpdate: 3_000,
  betweenSites: 2_000,
};

const SAVE_BUTTON = /save this media/i;

// ============================================================================
// Small utilities
// ============================================================================

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
/**
 * Is it really on screen? iCM (ExtJS) "hides" closed popups by moving them far
 * off the page (left: -10000px), which still counts as visible to the browser.
 * So also check that the element's box is actually inside the page.
 */
async function isVisible(locator) {
  if (!(await locator.isVisible().catch(() => false))) return false;
  const box = await locator.boundingBox().catch(() => null);
  return Boolean(box && box.width > 0 && box.height > 0
    && box.x + box.width > 0 && box.y + box.height > 0);
}
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeName = name => name.toLowerCase()
  .replace(/\b(dev|tst|prp|prd|css)\b/g, '')
  .replace(/[^a-z0-9]/g, '');

function framesOf(target) {
  return typeof target.pages === 'function'
    ? target.pages().flatMap(window => window.frames())
    : target.frames();
}

async function poll(check, timeout) {
  const deadline = Date.now() + timeout;
  do {
    const result = await check();
    if (result) return result;
    await sleep(TIMEOUT.pollEvery);
  } while (Date.now() < deadline);
  return null;
}

// ============================================================================
// Questions in the terminal
// ============================================================================

function ask(question) {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => prompt.question(question, answer => {
    prompt.close();
    resolve(answer.trim());
  }));
}

const waitForEnter = message => ask(message);

function checkEnvironment(environment) {
  if (!environmentNames.includes(environment)) {
    throw new Error(`Unknown environment "${environment}". Use one of: ${environmentNames.join(', ')}`);
  }
}

function parseArguments(argumentList) {
  let environment = null;
  let note = '';
  let significant = false;
  let browser = null;
  const siteNames = [];

  for (let index = 0; index < argumentList.length; index++) {
    const argument = argumentList[index];
    if (argument === '--env') {
      environment = argumentList[++index] || '';
    } else if (argument.startsWith('--env=')) {
      environment = argument.slice('--env='.length);
    } else if (argument === '--note') {
      note = argumentList[++index] || '';
    } else if (argument.startsWith('--note=')) {
      note = argument.slice('--note='.length);
    } else if (argument === '--significant') {
      significant = true;
    } else if (argument === '--browser') {
      browser = (argumentList[++index] || '').toLowerCase();
    } else if (argument.startsWith('--browser=')) {
      browser = argument.slice('--browser='.length).toLowerCase();
    } else {
      siteNames.push(argument);
    }
  }

  if (environment !== null) {
    environment = environment.toLowerCase();
    checkEnvironment(environment);
  }
  if (browser !== null && !BROWSERS.some(known => known.channel === browser)) {
    throw new Error(`Unknown browser "${browser}". Use one of: ${BROWSERS.map(known => known.channel).join(', ')}`);
  }
  return { environment, siteNames, note: note.trim(), significant, browser };
}

// ============================================================================
// Picker page in Edge: click an environment, tick sites, press Start
// ============================================================================

const ENVIRONMENT_LABELS = { dev: 'Development', tst: 'Test', prp: 'Preprod', prd: 'Live' };

/** Browsers that can be picked in the window. `channel` is what BROWSER in .env holds. */
const BROWSERS = [
  { channel: 'msedge', label: 'Microsoft Edge' },
  { channel: 'chrome', label: 'Google Chrome' },
];

/** Is this browser installed? Checks where Windows normally puts it. (Elsewhere, assume yes.) */
function isBrowserInstalled(channel) {
  if (process.platform !== 'win32') return true;
  const folders = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const relativePaths = {
    msedge: ['Microsoft\\Edge\\Application\\msedge.exe'],
    chrome: ['Google\\Chrome\\Application\\chrome.exe'],
  }[channel] || [];
  return folders.some(folder => relativePaths.some(relative => fileSystem.existsSync(path.join(folder, relative))));
}

const browserLabel = channel => (BROWSERS.find(browser => browser.channel === channel) || {}).label || channel;

/**
 * Open a browser, trying the one asked for first. If it won't start (e.g. not
 * installed), says so clearly instead of Playwright's long message.
 */
async function launchBrowser(launch, channel) {
  try {
    return await launch(channel);
  } catch (error) {
    throw new Error(`Couldn't start ${browserLabel(channel)}. Is it installed? `
      + `Pick the other browser in the window, or change BROWSER in .env.\n(${error.message.split('\n')[0]})`);
  }
}

/** Where failure pictures (and learn-mode dumps) are saved. */
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

/** The page used to make a failure picture: the message on top, the screenshot below. */
const FAILURE_REPORT_PAGE = path.join(__dirname, 'report', 'failure-report.html');

/** The picker window's files: picker.html, with picker.css and picker.js beside it. */
const PICKER_PAGE = path.join(__dirname, 'picker', 'picker.html');

const PICKER_WINDOW = { width: 860, height: 880 };

/**
 * Show the picker in a window of its own, like a program's window: no address
 * bar, tabs or web page around it. Edge's "app" mode does this. It's a separate,
 * throwaway Edge window, closed once Start is pressed; iCM then opens in the
 * normal one. Returns { environment, sites }, or null if closed without starting.
 */
async function pickInBrowser(chosenEnvironment, chosenSiteNames) {
  if (!fileSystem.existsSync(PICKER_PAGE)) {
    throw new Error(`Can't find ${PICKER_PAGE}. The picker folder (picker.html, picker.css, picker.js) must be next to upload-css.js.`);
  }

  console.log('Choose the environment and sites in the "Upload CSS to iCM" window, then press Start.');

  const profileFolder = fileSystem.mkdtempSync(path.join(os.tmpdir(), 'goss-upload-picker-'));
  const openPickerWindow = channel => chromium.launchPersistentContext(profileFolder, {
    headless: false,
    channel,
    viewport: null, // the page fills the window
    args: ['--app=about:blank', `--window-size=${PICKER_WINDOW.width},${PICKER_WINDOW.height}`],
  });
  // The window itself opens in .env's browser; if that one isn't installed, in another one
  const windowChannel = [CONFIG.browserChannel, ...BROWSERS.map(browser => browser.channel)]
    .filter(Boolean)
    .find(channel => isBrowserInstalled(channel)) || BROWSERS[0].channel;
  const pickerWindow = await launchBrowser(openPickerWindow, windowChannel);

  // What the window shows; picker.js reads it as window.PICKER_DATA
  const pickerData = () => ({
    environments: environmentNames.map(name => ({ name, label: ENVIRONMENT_LABELS[name] || name })),
    chosenEnvironment: chosenEnvironment || null,
    startingFolder: CONFIG.sitesDir
      ? describeFolder(CONFIG.sitesDir)
      : { folder: '', sites: [], error: 'Choose the sites folder in Settings.' },
    chosenSiteNames: chosenSiteNames || null,
    shortcuts: folderShortcuts(),
    browsers: BROWSERS.map(browser => ({ ...browser, installed: isBrowserInstalled(browser.channel) })),
    chosenBrowser: CONFIG.browserChannel, // null: nothing picked yet, the window asks
    // For the Settings box. needsSetup: .env is missing or incomplete, so it opens first.
    needsSetup: missingSettings.length > 0,
    settings: {
      values: envValues,
      missing: missingSettings,
      suggestions: exampleSettings(),
      file: ENV_FILE,
    },
  });

  let choice = null;
  try {
    const page = pickerWindow.pages()[0] ?? await pickerWindow.newPage();
    // Let the page ask this script for a folder's sites, and for the folders inside a folder
    await page.exposeFunction('gossListSites', folder => describeFolder(folder));
    await page.exposeFunction('gossListFolder', folder => listFolder(folder));
    // Settings box: check and save to .env, then reload the window with the new settings
    await page.exposeFunction('gossSaveSettings', form => {
      const problems = checkSettingsForm(form);
      if (problems.length) return { problems };
      writeEnvFile(form);
      loadSettings();
      console.log(`Settings saved to ${ENV_FILE}`);
      // The newest PICKER_DATA wins when the page reloads
      page.addInitScript(data => { window.PICKER_DATA = data; }, pickerData())
        .then(() => page.reload())
        .catch(() => {});
      return { saved: true };
    });
    await page.addInitScript(data => { window.PICKER_DATA = data; }, pickerData());
    await page.goto(pathToFileURL(PICKER_PAGE).href);
    await page.bringToFront().catch(() => {});
    await page.waitForFunction(() => window.__choice, undefined, { timeout: 0, polling: 300 });
    choice = await page.evaluate(() => window.__choice);
  } catch {
    choice = null; // the window was closed
  } finally {
    await pickerWindow.close().catch(() => {});
    fileSystem.rmSync(profileFolder, { recursive: true, force: true });
  }

  if (!choice || choice.cancelled) return null;

  // Remember a newly chosen folder and browser in .env for next time
  if (!CONFIG.sitesDir || path.resolve(choice.folder) !== path.resolve(CONFIG.sitesDir)) {
    CONFIG.sitesDir = choice.folder;
    saveSettingToEnv('SITES_DIR', choice.folder);
    console.log(`Sites folder is now ${choice.folder} (saved in .env)`);
  }
  if (choice.browser && choice.browser !== CONFIG.browserChannel) {
    CONFIG.browserChannel = choice.browser;
    saveSettingToEnv('BROWSER', choice.browser);
    console.log(`Browser is now ${browserLabel(choice.browser)} (saved in .env)`);
  }

  const allSites = getAllSites(choice.folder);
  return {
    environment: choice.environment,
    sites: choice.sites.map(chosen => ({
      ...allSites.find(site => site.name === chosen.name),
      note: chosen.note,
      significant: chosen.significant,
    })),
  };
}

// ============================================================================
// Finding and clicking things on screen
// ============================================================================

function findVisible(target, makeLocators, timeout = TIMEOUT.find) {
  return poll(async () => {
    for (const frame of framesOf(target)) {
      for (const locator of [].concat(makeLocators(frame))) {
        // Check the first few matches, not just the first: iCM keeps hidden
        // copies of menus and buttons off the page, and one may come first.
        const count = Math.min(await locator.count().catch(() => 0), 5);
        for (let index = 0; index < count; index++) {
          const match = locator.nth(index);
          if (await isVisible(match)) return match;
        }
      }
    }
    return null;
  }, timeout);
}

async function requireVisible(target, makeLocators, description, timeout = TIMEOUT.find) {
  const locator = await findVisible(target, makeLocators, timeout);
  if (!locator) throw new Error(`Could not find ${description} on screen`);
  return locator;
}

const textOrButton = text => frame => [
  typeof text === 'string' ? frame.getByText(text, { exact: true }) : frame.getByText(text),
  frame.getByRole('button', { name: text }),
];

async function clickText(context, text, timeout = TIMEOUT.find) {
  const locator = await requireVisible(context, textOrButton(text), `"${text}"`, timeout);
  await locator.click();
}

async function isShowing(context, text) {
  return Boolean(await findVisible(context, textOrButton(text), 0));
}

async function clickButtonIfShown(context, name, timeout = TIMEOUT.optional) {
  const button = await findVisible(
    context, frame => frame.getByRole('button', { name, exact: true }), timeout);
  if (!button) return false;
  await button.click();
  return true;
}

const clickOkIfShown = (context, timeout = TIMEOUT.okNote) =>
  clickButtonIfShown(context, 'OK', timeout);

async function finishSpellCheckIfShown(context, timeout = TIMEOUT.optional) {
  const button = await findVisible(
    context,
    frame => frame.locator('#spellCheck').getByRole('button', { name: 'Finish', exact: true }),
    timeout);
  if (!button) return false;
  await button.click();
  return true;
}

// ============================================================================
// iCM-specific steps
// ============================================================================

async function openTreeNode(page, folderName) {
  const exactName = new RegExp(`^\\s*${escapeRegExp(folderName)}\\s*$`, 'i');
  const row = await requireVisible(
    page,
    frame => frame.locator('.x-tree-node-el').filter({ has: frame.getByText(exactName) }),
    `tree folder "${folderName}"`);

  const toggle = row.locator('.x-tree-ec-icon');
  const toggleClass = (await toggle.getAttribute('class').catch(() => '')) || '';
  if (/plus/.test(toggleClass)) await toggle.click();

  await row.locator('.x-tree-node-anchor').click();
  await page.waitForTimeout(PAUSE.afterTreeClick);
}

async function openCssFolder(page) {
  for (const folderName of TREE_PATH) {
    console.log(`Opening: ${folderName}`);
    await openTreeNode(page, folderName);
  }
}

async function findSiteItem(page, siteName, timeout = TIMEOUT.find) {
  const target = normalizeName(ALIASES[siteName] || siteName);

  const match = await poll(async () => {
    for (const frame of page.frames()) {
      const items = frame.getByText(/css/i);
      const itemTexts = await items.allInnerTexts().catch(() => []);
      const index = itemTexts.findIndex(itemText => normalizeName(itemText) === target);
      if (index >= 0 && await isVisible(items.nth(index))) {
        return { element: items.nth(index), label: itemTexts[index].trim() };
      }
    }
    return null;
  }, timeout);

  if (!match) throw new Error(`No CSS item in iCM matches "${siteName}". Add it to ALIASES.`);
  return match;
}

async function findFileInput(context, timeout = TIMEOUT.find) {
  const input = await poll(async () => {
    let hiddenFallback = null;
    for (const frame of framesOf(context)) {
      const allInputs = frame.locator('input[type=file][name=sourceimage], input[type=file]');
      const count = await allInputs.count().catch(() => 0);
      for (let index = 0; index < count; index++) {
        const locator = allInputs.nth(index);
        if (await isVisible(locator)) return locator;
        hiddenFallback ??= locator;
      }
    }
    return hiddenFallback;
  }, timeout);

  if (!input) throw new Error('No file input found after opening Files');
  return input;
}

async function chooseFile(context, filePath) {
  const input = await findFileInput(context);

  if (!(await isVisible(input))) {
    console.log('Choose file box is hidden, setting the file directly');
    await input.setInputFiles(filePath);
    return;
  }

  console.log('Clicking Choose file');
  const chooserPromise = Promise.race(context.pages().map(window =>
    window.waitForEvent('filechooser', { timeout: TIMEOUT.fileChooser }).catch(() => null)));
  await input.click({ force: true });
  const chooser = await chooserPromise;

  if (chooser) {
    await chooser.setFiles(filePath);
  } else {
    await input.setInputFiles(filePath);
  }
}

/** The inside of the Version Control box is a page of its own (dsp_versionnotes.cfm). */
const isVersionNotesFrame = frame => /dsp_versionnotes\.cfm/i.test(frame.url());

/**
 * Tick or untick "Significant change" in the Version Control box.
 * Looks for a tick box labelled "significant", or named/id'd with "signific";
 * if the box has only one tick box, uses that.
 */
async function setSignificantChange(context, significant) {
  const tickBox = await findVisible(context, frame => isVersionNotesFrame(frame)
    ? [
      frame.getByRole('checkbox', { name: /significant/i }),
      frame.locator('input[type=checkbox][name*="signific" i], input[type=checkbox][id*="signific" i]'),
    ]
    : [], TIMEOUT.optional)
    ?? await (async () => {
      // Fallback: the only tick box in the Version Control box
      for (const frame of framesOf(context).filter(isVersionNotesFrame)) {
        const all = frame.locator('input[type=checkbox]');
        if (await all.count().catch(() => 0) === 1 && await isVisible(all.first())) return all.first();
      }
      return null;
    })();

  if (!tickBox) {
    if (significant) console.log('Could not find the Significant change box, so it was not ticked');
    return;
  }
  await tickBox.setChecked(significant, { force: true });
  console.log(significant ? 'Ticked Significant change' : 'Left Significant change unticked');
}

/**
 * iCM's "Version Control" box, which shows after saving. Types the note into its
 * box (only if there is one), ticks Significant change if asked, then presses Update.
 * Returns true if the box showed and was updated, false if it never showed.
 */
async function updateVersionControl(context, note, significant) {
  step('Filling in the Version Control box and pressing Update');
  const updateButton =
    await findVisible(context, frame => frame.locator('#versionNotes').getByRole('button', { name: 'Update', exact: true }), TIMEOUT.update)
    ?? await findVisible(context, frame => frame.getByRole('button', { name: 'Update', exact: true }), 0);
  if (!updateButton) return false;

  if (note) {
    const noteBox = await findVisible(
      context,
      frame => isVersionNotesFrame(frame)
        ? [frame.locator('textarea'), frame.locator('input[type=text]')]
        : [],
      TIMEOUT.find);
    if (noteBox) {
      await noteBox.fill(note);
      console.log(`Typed version note: "${note}"`);
    } else {
      console.log('Could not find the version note box, so updating without the note');
    }
  }

  // After the note: Significant change
  await setSignificantChange(context, Boolean(significant));

  await updateButton.click();
  console.log('Pressed Update');

  // Check the Version Control box went away. If iCM wants something else filled in,
  // it stays open: cancel it, so the next site isn't blocked, and report it.
  const closed = await poll(async () => !(await isVisible(updateButton)), TIMEOUT.update);
  if (!closed) {
    await clickButtonIfShown(context, 'Cancel', TIMEOUT.optional);
    throw new Error('The Version Control box stayed open after Update. iCM may need a note or another box filled in.');
  }
  return true;
}

async function saveMedia(context, page, note, significant) {
  step('Pressing Save this media');
  await clickText(context, SAVE_BUTTON);
  console.log('Clicked Save this media');
  await page.waitForTimeout(PAUSE.afterSave);

  const hadSpellCheck = await finishSpellCheckIfShown(context);
  if (hadSpellCheck) {
    console.log('Pressed Finish on Spell Checker');
    await page.waitForTimeout(PAUSE.afterSpellCheck);
  }

  let updated = await updateVersionControl(context, note, significant);

  if (!updated && hadSpellCheck && await isShowing(context, SAVE_BUTTON)) {
    await clickText(context, SAVE_BUTTON);
    console.log('Clicked Save this media again');
    await page.waitForTimeout(PAUSE.afterSpellCheck);
    updated = await updateVersionControl(context, note, significant);
  }

  await page.waitForTimeout(PAUSE.afterUpdate);
  if (await clickOkIfShown(context, TIMEOUT.optional)) console.log('Clicked OK after saving');
}

async function uploadSite(context, page, site) {
  step('Finding the site\'s CSS item in iCM Media');
  let found;
  try {
    found = await findSiteItem(page, site.name, TIMEOUT.siteListQuick);
  } catch {
    console.log('List not showing, re-opening the dynamic folder');
    await openCssFolder(page);
    found = await findSiteItem(page, site.name);
  }

  const { element, label } = found;
  console.log(`Matched ${site.name} -> "${label}"`);
  step(`Opening "${label}" in iCM`);
  await element.dblclick();
  await page.waitForTimeout(PAUSE.afterOpenItem);

  if (await clickOkIfShown(context)) console.log('Clicked OK on the image format note');
  await page.waitForTimeout(PAUSE.afterOkNote);

  step('Opening the Files tab');
  await clickText(context, 'Files');
  await page.waitForTimeout(PAUSE.afterFilesTab);
  step('Choosing the CSS file to upload');
  await chooseFile(context, site.file);
  console.log(`Chose file: ${site.file}`);
  await page.waitForTimeout(PAUSE.afterUpload);

  if (await clickOkIfShown(context, TIMEOUT.optional)) console.log('Clicked OK on the note');
  if (await finishSpellCheckIfShown(context)) console.log('Pressed Finish on Spell Checker');

  await saveMedia(context, page, site.note, site.significant);
  return label;
}

// ============================================================================
// Failure pictures
// ============================================================================

/** What the run is doing right now, so a failure picture can say which step it was on. */
let currentStep = 'Starting';
function step(description) {
  currentStep = description;
}

/** 2026-10-30 14-05-09 (no colons: Windows doesn't allow them in file names). */
function fileTimestamp(date = new Date()) {
  const twoDigits = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} `
    + `${twoDigits(date.getHours())}-${twoDigits(date.getMinutes())}-${twoDigits(date.getSeconds())}`;
}

/**
 * Save a picture of a failure in the screenshots folder: what went wrong, the
 * site, environment, step and time across the top, and underneath, what Edge
 * was showing. Returns the picture's path, or null if it couldn't be saved.
 */
async function saveFailurePicture(context, page, { title, message, site, environment }) {
  try {
    fileSystem.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const when = new Date();
    const fileName = `${fileTimestamp(when)} FAILED ${site ? site.name : 'run'}.png`
      .replace(/[<>:"/\\|?*]/g, '-');
    const picturePath = path.join(SCREENSHOTS_DIR, fileName);

    // 1. What Edge was showing
    const screenshot = page && !page.isClosed()
      ? await page.screenshot({ fullPage: true }).catch(() => null)
      : null;

    // 2. Put the details and the screenshot together on the report page, and photograph that
    if (!context || !fileSystem.existsSync(FAILURE_REPORT_PAGE)) {
      if (!screenshot) return null;
      fileSystem.writeFileSync(picturePath, screenshot); // no report page: just the screenshot
      return picturePath;
    }
    const reportPage = await context.newPage();
    try {
      await reportPage.setViewportSize(VIEWPORT);
      await reportPage.goto(pathToFileURL(FAILURE_REPORT_PAGE).href);
      await reportPage.evaluate(details => {
        const fill = (id, text) => { document.getElementById(id).textContent = text || '-'; };
        fill('title', details.title);
        fill('message', details.message);
        fill('site', details.site);
        fill('environment', details.environment);
        fill('step', details.step);
        fill('when', details.when);
        fill('file', details.file);
        const image = document.getElementById('screenshot');
        if (details.screenshot) {
          image.src = 'data:image/png;base64,' + details.screenshot;
          return new Promise(resolve => { image.onload = resolve; image.onerror = resolve; });
        }
        image.hidden = true;
        document.getElementById('no-shot').hidden = false;
        return null;
      }, {
        title: title || 'Upload failed',
        message,
        site: site ? site.name : '',
        environment: environment ? environment.toUpperCase() : '',
        step: currentStep,
        when: when.toLocaleString('en-GB'),
        file: site ? site.file : '',
        screenshot: screenshot ? screenshot.toString('base64') : null,
      });
      await reportPage.screenshot({ path: picturePath, fullPage: true });
    } finally {
      await reportPage.close().catch(() => {});
    }
    return picturePath;
  } catch (error) {
    console.log(`Couldn't save a failure picture: ${error.message}`);
    return null;
  }
}

// ============================================================================
// Local files and debugging
// ============================================================================

/** Every folder in `folder` that has <name>.css inside. Empty if the folder doesn't exist. */
function getAllSites(folder = CONFIG.sitesDir) {
  if (!fileSystem.existsSync(folder)) return [];
  return fileSystem.readdirSync(folder, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      name: entry.name,
      file: path.join(folder, entry.name, `${entry.name}.css`),
    }))
    .filter(site => fileSystem.existsSync(site.file));
}

/** What the picker shows for a folder: its sites, or why there aren't any. */
function describeFolder(folder) {
  const fullPath = path.resolve(__dirname, String(folder || '').trim() || '.');
  if (!fileSystem.existsSync(fullPath) || !fileSystem.statSync(fullPath).isDirectory()) {
    return { folder: fullPath, sites: [], error: "That folder doesn't exist." };
  }
  const sites = getAllSites(fullPath).map(site => site.name);
  return sites.length
    ? { folder: fullPath, sites }
    : { folder: fullPath, sites, error: 'No sites here. It needs folders that each have a built <name>.css inside, like american-library\\american-library.css.' };
}

const isWindows = process.platform === 'win32';

/**
 * For the picker's own "Browse for Folder" box: the folders inside `folder`.
 * An empty `folder` means the top: the drives (This PC) on Windows, / elsewhere.
 * Returns { path, parent, folders: [{ name, path }], siteCount } or { error }.
 */
function listFolder(folder) {
  const wanted = String(folder || '').trim();

  if (!wanted && isWindows) {
    const drives = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
      .map(letter => `${letter}:\\`)
      .filter(drive => { try { return fileSystem.existsSync(drive); } catch { return false; } });
    return { path: '', parent: null, folders: drives.map(drive => ({ name: drive, path: drive })), siteCount: 0 };
  }

  const fullPath = path.resolve(__dirname, wanted || '/');
  let entries;
  try {
    entries = fileSystem.readdirSync(fullPath, { withFileTypes: true });
  } catch {
    return { error: "Can't open that folder. Check it exists and you're allowed to open it." };
  }

  const folders = entries
    .filter(entry => entry.isDirectory() && !/^[.$]/.test(entry.name))
    .map(entry => ({ name: entry.name, path: path.join(fullPath, entry.name) }))
    .sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: 'base' }));

  const atTop = path.dirname(fullPath) === fullPath;
  return {
    path: fullPath,
    parent: atTop ? (isWindows ? '' : null) : path.dirname(fullPath),
    folders,
    siteCount: getAllSites(fullPath).length,
  };
}

/** Handy places to jump to in the Browse box. */
function folderShortcuts() {
  const home = os.homedir();
  return [
    { label: 'Current sites folder', path: CONFIG.sitesDir },
    { label: 'Repos', path: path.resolve(__dirname, '..') },
    { label: 'Home', path: home },
    { label: 'Desktop', path: path.join(home, 'Desktop') },
    ...(isWindows ? [{ label: 'This PC', path: '' }] : []),
  ].filter(shortcut => shortcut.path === '' || fileSystem.existsSync(shortcut.path));
}

function selectSites(allSites, requestedNames) {
  return {
    selected: allSites.filter(site => requestedNames.includes(site.name)),
    unknownNames: requestedNames.filter(name => !allSites.some(site => site.name === name)),
  };
}

async function dumpAll(context, label) {
  fileSystem.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const report = [];

  for (const [windowIndex, window] of context.pages().entries()) {
    await window.screenshot({ path: path.join(SCREENSHOTS_DIR, `${label}-window${windowIndex}.png`), fullPage: true }).catch(() => {});

    for (const frame of window.frames()) {
      const info = await frame.evaluate(() => {
        const describe = element => ({
          tag: element.tagName.toLowerCase(),
          type: element.type || '',
          id: element.id || '',
          name: element.getAttribute('name') || '',
          className: element.className || '',
          text: (element.innerText || element.value || '').trim().slice(0, 60),
        });
        return {
          title: document.title,
          fileInputs: [...document.querySelectorAll('input[type=file]')].map(describe),
          buttons: [...document.querySelectorAll('button, input[type=submit], input[type=button]')]
            .map(describe)
            .filter(button => button.text),
        };
      }).catch(() => null);

      if (info && (info.fileInputs.length || info.buttons.length)) {
        report.push({ window: windowIndex, frameName: frame.name(), frameUrl: frame.url(), ...info });
      }
    }
  }

  fileSystem.writeFileSync(path.join(SCREENSHOTS_DIR, `${label}.json`), JSON.stringify(report, null, 2));
}

// ============================================================================
// Main
// ============================================================================

/**
 * Wait until you've logged in. The login page and iCM share the same web address,
 * so instead of checking the address, it watches for the iCM menu ("Content" and
 * the Media tab). Those only exist after login, once iCM has finished loading.
 */
async function waitForLogin(page) {
  console.log('Log in in Edge. It carries on by itself once iCM has loaded.');

  // iCM must look ready, with no note showing, for this long before it starts.
  // The security questions note can pop up a moment after iCM appears.
  const READY_FOR = 4_000;
  let readySince = null;
  let okPresses = 0; // stop pressing OK if it never goes away, so it can't loop forever

  const loggedIn = await poll(async () => {
    if (page.isClosed()) throw new Error('Edge was closed before logging in');

    // First deal with any note, in any frame
    for (const frame of page.frames()) {
      // "You are already registered as being logged on to iCM on this machine"
      const continueButton = frame.locator('#extIcmButtonRender-btnContinue button').first();
      if (await isVisible(continueButton)) {
        console.log('Pressed Continue on the "already logged on" warning');
        await continueButton.click({ timeout: 2_000 }).catch(() => {});
        readySince = null;
        return false;
      }

      // "You must specify 3 security questions..." note
      const okButton = frame.getByRole('button', { name: 'OK', exact: true }).first();
      if (okPresses < 3 && await isVisible(okButton)) {
        okPresses++;
        console.log('Pressed OK on the security questions note');
        await okButton.click({ timeout: 2_000 }).catch(() => {});
        await sleep(1_000); // give the note time to close
        readySince = null;
        return false;
      }
    }

    // Then check iCM has loaded: the "Content" menu is showing in some frame.
    // (The Media tab only appears after Content is clicked, so don't wait for it here.)
    const ready = Boolean(await findVisible(
      page, frame => frame.getByText('Content', { exact: true }), 0));

    if (!ready) { readySince = null; return false; }
    readySince ??= Date.now();
    return Date.now() - readySince >= READY_FOR;
  }, TIMEOUT.login);

  if (!loggedIn) throw new Error('Gave up waiting for login after 5 minutes');
  console.log('Logged in, starting');
}

async function openMediaLibrary(page) {
  const okButton = await findVisible(
    page, frame => frame.getByRole('button', { name: 'OK', exact: true }), TIMEOUT.optional);
  if (okButton) await okButton.click();

  await (await requireVisible(page, frame => frame.getByText('Content', { exact: true }), '"Content"')).click();
  await (await requireVisible(page, frame => frame.locator('#qh-topnav-media'), 'the Media tab')).click();
  await page.waitForTimeout(PAUSE.afterMediaOpen);
}

async function main() {
  const commandLine = parseArguments(process.argv.slice(2));
  // When the window will open (sites not named on the command line), missing settings
  // are filled in there, in its Settings box. Otherwise they must already be in .env.
  loadSettings({ allowMissing: !commandLine.siteNames.length });
  if (commandLine.browser) CONFIG.browserChannel = commandLine.browser; // this run only

  const allSites = getAllSites();
  const folderProblem = !fileSystem.existsSync(CONFIG.sitesDir)
    ? `Sites folder not found: ${CONFIG.sitesDir}`
    : !allSites.length
      ? `No <site>/<site>.css files found in ${CONFIG.sitesDir}. Build the CSS in GOSS-skin first.`
      : null;
  // Sites named on the command line need a good folder; the picker lets you choose one
  if (commandLine.siteNames.length && folderProblem) throw new Error(folderProblem);

  // Anything given on the command line is used; anything missing is picked in Edge
  let environment = commandLine.environment;
  let sites = null;
  if (commandLine.siteNames.some(name => name.toLowerCase() === 'all')) {
    sites = allSites;
  } else if (commandLine.siteNames.length) {
    const { selected, unknownNames } = selectSites(allSites, commandLine.siteNames);
    if (unknownNames.length) console.warn(`No built CSS found for: ${unknownNames.join(', ')}`);
    if (!selected.length) throw new Error('None of the named sites have built CSS.');
    sites = selected;
  }

  const usePicker = !environment || !sites;

  // The picker asks for its own live confirmation; the command line asks here
  if (!usePicker && CONFIRM_ENVIRONMENTS.includes(environment)) {
    await waitForEnter(
      `\nThis uploads to ${environment.toUpperCase()} (live). Press Enter to go ahead, or Ctrl+C to stop... `);
  }

  if (usePicker) {
    const picked = await pickInBrowser(environment, sites && sites.map(site => site.name));
    if (!picked) {
      console.log('Closed without uploading.');
      return;
    }
    ({ environment, sites } = picked);
  } else {
    sites = sites.map(site => ({ ...site, note: commandLine.note, significant: commandLine.significant }));
  }

  if (!CONFIG.browserChannel) {
    throw new Error('No browser chosen. Add --browser msedge (or chrome), or put BROWSER=msedge in .env, '
      + 'or run it without naming sites so the window opens and you can pick one.');
  }
  console.log(`Opening iCM in ${browserLabel(CONFIG.browserChannel)}`);
  const browser = await launchBrowser(
    channel => chromium.launch({ headless: false, channel }), CONFIG.browserChannel);
  const results = [];
  let context = null;
  let page = null;

  try {
    context = await browser.newContext({ viewport: VIEWPORT });
    context.on('page', window => window.on('dialog', dialog => dialog.accept().catch(() => {})));

    page = await context.newPage();

    const loginUrl = ENVIRONMENTS[environment];
    console.log(`\nEnvironment: ${environment.toUpperCase()}  (${loginUrl})`);
    console.log(`Uploading ${sites.length} site(s): ${sites.map(site => site.name).join(', ')}`);

    step('Opening the iCM login page');
    await page.goto(loginUrl);
    step('Waiting for you to log in to iCM');
    await waitForLogin(page);

    step('Opening Content > Media');
    await openMediaLibrary(page);
    step('Opening the CSS folder in Media');
    await openCssFolder(page);

    for (const site of sites) {
      console.log(`\n--- ${site.name} ---`);
      try {
        const label = await uploadSite(context, page, site);
        results.push({ succeeded: true, text: `OK    ${site.name}  ->  "${label}"` });
        console.log(`Done: ${site.name}`);
      } catch (error) {
        const picture = await saveFailurePicture(context, page,
          { title: `Upload failed: ${site.name}`, message: error.message, site, environment });
        if (picture) console.log(`Saved a picture of what went wrong: ${picture}`);
        results.push({ succeeded: false, text: `FAIL  ${site.name}: ${error.message}` });
      }

      if (CONFIG.learnMode) {
        await dumpAll(context, 'upload-learn');
        console.log('\nTest mode: stopped after one site. Check in iCM that it updated (date or size).');
        break;
      }

      await page.waitForTimeout(PAUSE.betweenSites);
    }
  } catch (error) {
    console.error(`\nStopped: ${error.message || error}`);
    const picture = await saveFailurePicture(context, page,
      { title: 'The upload stopped', message: error.message || String(error), environment });
    if (picture) console.log(`Saved a picture of what went wrong: ${picture}`);
    process.exitCode = 1;
  } finally {
    if (results.length) console.log('\n' + results.map(result => result.text).join('\n'));
    if (results.some(result => !result.succeeded)) process.exitCode = 1;

    await waitForEnter('\nPress Enter to close Edge... ');
    await browser.close().catch(() => {});
  }
}

main().catch(async error => {
  console.error(error.message || error);
  process.exitCode = 1;
  // Keep the window open when started from the desktop shortcut, so the message can be read
  await waitForEnter('\nPress Enter to close this window... ');
});