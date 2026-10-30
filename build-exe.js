'use strict';

/**
 * build-exe.js: makes "Upload CSS.exe", so people can run the tool without
 * installing Node.js or typing any commands.
 *
 * Run it once on a Windows PC that has Node.js, from the goss-upload folder:
 *   npm install
 *   npm run build-exe
 *
 * It makes this folder, ready to zip up and hand out:
 *   dist\Upload CSS\
 *     Upload CSS.exe     double-click this
 *     picker\            the window
 *     report\            the failure picture's layout
 *     node_modules\      Playwright (the .exe can't carry it inside, so it sits next to it)
 *     .env.example       example settings
 *     README.md
 *
 * There's no .env in it on purpose: the first time someone opens Upload CSS.exe,
 * the Settings box asks for their sites folder, iCM links and browser, and saves .env
 * next to the .exe. screenshots\ appears there too when something fails.
 *
 * How it works: Node's "single executable application" feature copies node.exe and
 * puts upload-css.js inside it. https://nodejs.org/api/single-executable-applications.html
 */

const fileSystem = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'dist', 'Upload CSS');
const EXE_NAME = process.platform === 'win32' ? 'Upload CSS.exe' : 'Upload CSS';
const EXE_PATH = path.join(OUT_DIR, EXE_NAME);
const BLOB_PATH = path.join(ROOT, 'dist', 'upload-css.blob');
const SEA_CONFIG = path.join(ROOT, 'dist', 'sea-config.json');

// Node's marker for where the script goes inside the .exe (from Node's documentation)
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

/** Files and folders copied next to the .exe. */
const COPY = ['picker', 'report', '.env.example', 'README.md'];
/** The packages the .exe needs at run time, copied into its node_modules. */
const PACKAGES = ['playwright', 'playwright-core'];

function step(text) {
  console.log(`\n> ${text}`);
}

function copy(from, to) {
  fileSystem.cpSync(from, to, { recursive: true });
}

async function build() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 20) throw new Error(`Node.js 20 or newer is needed to build the .exe (this is ${process.version}).`);
  for (const name of PACKAGES) {
    if (!fileSystem.existsSync(path.join(ROOT, 'node_modules', name))) {
      throw new Error(`node_modules\\${name} is missing. Run "npm install" first.`);
    }
  }

  step('Starting from an empty dist\\Upload CSS folder');
  fileSystem.rmSync(OUT_DIR, { recursive: true, force: true });
  fileSystem.mkdirSync(OUT_DIR, { recursive: true });

  step('Packing upload-css.js for the .exe');
  fileSystem.writeFileSync(SEA_CONFIG, JSON.stringify({
    main: path.join(ROOT, 'upload-css.js'),
    output: BLOB_PATH,
    disableExperimentalSEAWarning: true,
  }, null, 2));
  execFileSync(process.execPath, ['--experimental-sea-config', SEA_CONFIG], { stdio: 'inherit' });

  step(`Copying Node.js to ${EXE_NAME}`);
  fileSystem.copyFileSync(process.execPath, EXE_PATH);

  step(`Putting upload-css.js inside ${EXE_NAME}`);
  const { inject } = require('postject');
  await inject(EXE_PATH, 'NODE_SEA_BLOB', fileSystem.readFileSync(BLOB_PATH), {
    sentinelFuse: SEA_FUSE,
    overwrite: true,
  });

  step('Copying the window, report layout, example settings and README');
  for (const item of COPY) {
    const from = path.join(ROOT, item);
    if (fileSystem.existsSync(from)) copy(from, path.join(OUT_DIR, item));
  }

  step('Copying Playwright');
  for (const name of PACKAGES) {
    copy(path.join(ROOT, 'node_modules', name), path.join(OUT_DIR, 'node_modules', name));
  }

  fileSystem.rmSync(BLOB_PATH, { force: true });
  fileSystem.rmSync(SEA_CONFIG, { force: true });

  console.log(`\nDone: ${EXE_PATH}`);
  console.log('Zip up the whole "Upload CSS" folder to hand it out. People unzip it and double-click Upload CSS.exe.');
  if (process.platform === 'win32') {
    console.log('Windows may warn that the .exe is from an unknown publisher, because it isn\'t signed.');
  }
}

build().catch(error => {
  console.error(`\nBuild failed: ${error.message}`);
  process.exitCode = 1;
});