/**
 * picker.js: how the "Upload CSS to iCM" window works.
 *
 * upload-css.js opens picker.html and gives it:
 *   window.PICKER_DATA          what to show first (see below)
 *   window.gossListSites(path)  the sites in a folder
 *   window.gossListFolder(path) the folders in a folder (for Browse…)
 * When Start is pressed, the choice is put in window.__choice for upload-css.js to read.
 *
 * Opening picker.html straight in a browser uses preview.js's pretend data instead.
 */
'use strict';

const DATA = window.PICKER_DATA;
// DATA = {
//   environments:      [{ name: 'dev', label: 'Development' }, ...],
//   chosenEnvironment: 'dev' or null,
//   startingFolder:    { folder, sites: [names], error? },
//   chosenSiteNames:   [names] or null for all,
//   shortcuts:         [{ label, path }] for the Browse box,
//   browsers:          [{ channel: 'msedge', label: 'Microsoft Edge', installed: true }, ...],
//   chosenBrowser:     'msedge' or 'chrome', from .env,
// }

let environment = DATA.chosenEnvironment || null;
let liveConfirmed = false;
const start = document.getElementById('start');
const startText = document.getElementById('start-text');
// The sites list is drawn here, so it can be re-drawn when a different folder is chosen
const startingFolder = DATA.startingFolder;
const preselected = DATA.chosenSiteNames || null;
let loadedFolder = '';
let boxes = [], significantBoxes = [], notes = [];
const significantFor = name => significantBoxes.find(box => box.dataset.site === name).checked;
const noteFor = name => notes.find(input => input.dataset.site === name).value.trim();
/** A fresh copy of one of picker.html's <template>s. */
const fromTemplate = id => document.getElementById(id).content.firstElementChild.cloneNode(true);

// Environment buttons and Browse shortcuts, from DATA
document.querySelector('.envs').replaceChildren(...DATA.environments.map(env => {
  const button = fromTemplate('env-template');
  button.dataset.env = env.name;
  button.classList.toggle('live', env.name === 'prd');
  button.querySelector('.env-label').textContent = env.label;
  button.querySelector('.env-name').textContent = env.name;
  return button;
}));
// Browser options: the one from .env is chosen to start with; ones not installed are greyed out
document.querySelector('.browsers').replaceChildren(...DATA.browsers.map(browser => {
  const option = fromTemplate('browser-template');
  const radio = option.querySelector('.browser-choice');
  radio.value = browser.channel;
  radio.disabled = !browser.installed;
  option.classList.toggle('unavailable', !browser.installed);
  option.querySelector('.browser-name').textContent = browser.label;
  option.querySelector('.browser-note').textContent = browser.installed ? '' : '(not installed)';
  return option;
}));
const browserChoices = [...document.querySelectorAll('.browser-choice')];
const usableBrowser = browserChoices.find(radio => radio.value === DATA.chosenBrowser && !radio.disabled)
  || browserChoices.find(radio => !radio.disabled);
if (usableBrowser) usableBrowser.checked = true;
const chosenBrowser = () => (browserChoices.find(radio => radio.checked) || {}).value || null;
const chosenBrowserLabel = () => {
  const radio = browserChoices.find(choice => choice.checked);
  return radio ? radio.closest('.browser-option').querySelector('.browser-name').textContent : '';
};
browserChoices.forEach(radio => radio.addEventListener('change', () => refresh()));

document.querySelector('.shortcuts').replaceChildren(...DATA.shortcuts.map(shortcut => {
  const button = fromTemplate('shortcut-template');
  button.dataset.path = shortcut.path;
  button.querySelector('.shortcut-label').textContent = shortcut.label;
  return button;
}));

function drawSites(names, ticked) {
  // Keep what was already ticked or typed for sites that are in the new list too
  const before = new Map(boxes.map(box => [box.value,
    { ticked: box.checked, note: noteFor(box.value), significant: significantFor(box.value) }]));

  document.getElementById('site-rows').replaceChildren(...names.map(name => {
    const kept = before.get(name);
    const row = fromTemplate('site-row-template');
    const pick = row.querySelector('.pick');
    pick.value = name;
    pick.checked = kept ? kept.ticked : (!ticked || ticked.includes(name));
    row.querySelector('.site-name').textContent = name;
    const note = row.querySelector('.note');
    note.dataset.site = name;
    note.value = kept ? kept.note : '';
    note.setAttribute('aria-label', 'Version history note for ' + name);
    const significant = row.querySelector('.sig');
    significant.dataset.site = name;
    significant.checked = kept ? kept.significant : false;
    return row;
  }));
  boxes = [...document.querySelectorAll('.sites input.pick')];
  significantBoxes = [...document.querySelectorAll('.sites input.sig')];
  notes = [...document.querySelectorAll('.sites input.note')];
  boxes.forEach(box => box.addEventListener('change', refresh));
}

function showFolder(result, ticked) {
  loadedFolder = result.error ? '' : result.folder;
  document.getElementById('folder').value = result.folder;
  const message = document.getElementById('folder-msg');
  message.textContent = result.error || ('Found ' + result.sites.length + ' site(s) with built CSS.');
  message.classList.toggle('problem', Boolean(result.error));
  drawSites(result.sites, ticked);
  applyFind();
  refresh();
}

async function loadFolder(folder) {
  const message = document.getElementById('folder-msg');
  message.classList.remove('problem');
  message.textContent = 'Looking in the folder...';
  showFolder(await window.gossListSites(folder));
}

function refresh() {
  boxes.forEach(box => box.closest('.site-row').classList.toggle('off', !box.checked));
  const ticked = boxes.filter(box => box.checked).length;
  document.getElementById('count').textContent = ticked + ' of ' + boxes.length + ' site(s) selected';
  document.getElementById('status').textContent = environment && chosenBrowser()
    ? 'Environment: ' + environment.toUpperCase() + '   ·   Browser: ' + chosenBrowserLabel()
    : environment
    ? 'Environment: ' + environment.toUpperCase() : 'Choose an environment';
  document.querySelectorAll('.env').forEach(button =>
    button.classList.toggle('selected', button.dataset.env === environment));
  const live = environment === 'prd';
  document.getElementById('warning').style.display = live ? 'flex' : 'none';
  start.classList.toggle('live', live);
  start.disabled = !environment || !ticked || !loadedFolder;
  startText.textContent = !loadedFolder ? 'Choose a sites folder'
    : !environment ? 'Choose an environment'
    : !ticked ? 'Tick at least one site'
    : live && liveConfirmed ? 'Click again to upload to LIVE'
    : 'Start upload: ' + ticked + ' site(s) to ' + environment.toUpperCase();
}

document.querySelectorAll('.env').forEach(button => button.addEventListener('click', () => {
  environment = button.dataset.env;
  liveConfirmed = false;
  refresh();
}));
// Find: hides the sites that don't match what's typed. Select all / none and
// Fill blanks then only act on the sites that are showing.
const findBox = document.getElementById('find');
const shown = box => !box.closest('.site-row').classList.contains('hidden');
function applyFind() {
  const words = findBox.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let showing = 0;
  boxes.forEach(box => {
    const match = words.every(word => box.value.toLowerCase().includes(word));
    box.closest('.site-row').classList.toggle('hidden', !match);
    if (match) showing++;
  });
  document.getElementById('find-count').textContent =
    words.length ? showing + ' of ' + boxes.length + ' shown' : '';
  document.getElementById('no-match').style.display = showing ? 'none' : 'block';
}
findBox.addEventListener('input', applyFind);
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault(); findBox.focus(); findBox.select();
  }
});

document.getElementById('all').onclick = () => { boxes.filter(shown).forEach(box => box.checked = true); refresh(); };
document.getElementById('none').onclick = () => { boxes.filter(shown).forEach(box => box.checked = false); refresh(); };
// Sites folder: Browse opens Windows' folder box; or type/paste a path and press Enter
const folderBox = document.getElementById('folder');
folderBox.addEventListener('keydown', event => { if (event.key === 'Enter') loadFolder(folderBox.value); });
folderBox.addEventListener('change', () => { if (folderBox.value.trim() !== loadedFolder) loadFolder(folderBox.value); });
// Browse… opens this window's own "Browse for Folder" box
const browseBox = document.getElementById('browse-box');
const folderList = document.getElementById('folder-list');
const browseStatus = document.getElementById('browse-status');
const browsePathBox = document.getElementById('browse-path');
let browsePath = '', browseParent = null, browseSelected = null;

function setBrowseStatus(text, kind) {
  browseStatus.textContent = text;
  browseStatus.className = 'browse-status' + (kind ? ' ' + kind : '');
}

async function browseTo(target) {
  setBrowseStatus('Opening...');
  const view = await window.gossListFolder(target);
  if (view.error) { setBrowseStatus(view.error, 'problem'); return; }
  browsePath = view.path;
  browseParent = view.parent;
  browseSelected = null;
  browsePathBox.value = view.path || 'This PC';
  document.getElementById('browse-up').disabled = view.parent === null;
  folderList.replaceChildren(...(view.folders.length
    ? view.folders.map(folder => {
      const item = fromTemplate('folder-template');
      item.dataset.path = folder.path;
      item.querySelector('.folder-name').textContent = folder.name;
      return item;
    })
    : [fromTemplate('no-folders-template')]));
  folderList.querySelectorAll('.folder-item').forEach(item => {
    item.addEventListener('click', () => {
      folderList.querySelectorAll('.folder-item').forEach(other => other.classList.toggle('selected', other === item));
      browseSelected = item.dataset.path;
      document.getElementById('browse-ok').disabled = false;
    });
    item.addEventListener('dblclick', () => browseTo(item.dataset.path));
    item.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); browseTo(item.dataset.path); } });
  });
  document.getElementById('browse-ok').disabled = !view.path;
  if (!view.path) setBrowseStatus('Choose a drive.');
  else if (view.siteCount) setBrowseStatus('This folder has ' + view.siteCount + ' site(s) with built CSS. Click OK to use it.', 'good');
  else setBrowseStatus('No sites with built CSS directly in this folder. Open the folder that has the site folders in it.');
}

function openBrowse() {
  browseBox.classList.add('open');
  browseTo(folderBox.value.trim() || loadedFolder);
  browsePathBox.focus();
}
function closeBrowse() {
  browseBox.classList.remove('open');
  document.getElementById('browse').focus();
}
document.getElementById('browse').onclick = openBrowse;
document.getElementById('browse-up').onclick = () => { if (browseParent !== null) browseTo(browseParent); };
document.getElementById('browse-cancel').onclick = closeBrowse;
document.getElementById('browse-x').onclick = closeBrowse;
browseBox.addEventListener('click', event => { if (event.target === browseBox) closeBrowse(); });
browsePathBox.addEventListener('keydown', event => { if (event.key === 'Enter') browseTo(browsePathBox.value); });
document.querySelectorAll('.shortcuts .button').forEach(button =>
  button.addEventListener('click', () => browseTo(button.dataset.path)));
document.getElementById('browse-ok').onclick = () => {
  const chosen = browseSelected || browsePath;
  if (!chosen) return;
  closeBrowse();
  loadFolder(chosen);
};

start.addEventListener('click', () => {
  if (environment === 'prd' && !liveConfirmed) { liveConfirmed = true; refresh(); return; }
  start.disabled = true;
  startText.textContent = 'Opening iCM...';
  document.getElementById('status').textContent = 'Please wait...';
  document.body.style.cursor = 'wait';
  window.__choice = {
    environment,
    browser: chosenBrowser(),
    folder: loadedFolder,
    sites: boxes.filter(box => box.checked).map(box => ({
      name: box.value, note: noteFor(box.value), significant: significantFor(box.value),
    })),
  };
});

// × in the title bar: close without uploading
document.getElementById('quit').onclick = () => { window.__choice = { cancelled: true }; };

// "Same note for all": copies the note into every ticked site's box that's still blank
// and, if its Significant box is ticked, ticks Significant on those sites too
document.getElementById('note-fill').onclick = () => {
  const text = document.getElementById('note-all').value.trim();
  const markSignificant = document.getElementById('sig-all').checked;
  boxes.filter(box => box.checked && shown(box)).forEach(box => {
    const input = notes.find(note => note.dataset.site === box.value);
    if (text && !input.value.trim()) input.value = text;
    if (markSignificant) significantBoxes.find(sig => sig.dataset.site === box.value).checked = true;
  });
};
document.getElementById('note-all').addEventListener('keydown', event => {
  if (event.key === 'Enter') document.getElementById('note-fill').click();
});

// Help window: opens from the Help menu or F1, closes with OK, × or Escape
const help = document.getElementById('help');
// Help topics: the Contents list on the left shows one topic at a time
const helpPane = help.querySelector('.help');
function showTopic(name) {
  help.querySelectorAll('.topic').forEach(topic => { topic.hidden = topic.dataset.topic !== name; });
  help.querySelectorAll('.topic-link').forEach(link => link.classList.toggle('selected', link.dataset.topic === name));
  helpPane.scrollTop = 0;
}
help.querySelectorAll('.topic-link').forEach(link => link.addEventListener('click', () => showTopic(link.dataset.topic)));
help.querySelectorAll('.topic-jump').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  showTopic(link.dataset.topic);
}));
showTopic('what');

const openHelp = () => { help.classList.add('open'); document.getElementById('help-ok').focus(); };
const closeHelp = () => { help.classList.remove('open'); document.getElementById('help-open').focus(); };
document.getElementById('help-open').onclick = openHelp;
document.getElementById('help-ok').onclick = closeHelp;
document.getElementById('help-x').onclick = closeHelp;
help.addEventListener('click', event => { if (event.target === help) closeHelp(); });
document.addEventListener('keydown', event => {
  if (event.key === 'F1') { event.preventDefault(); openHelp(); }
  if (event.key === 'Escape' && help.classList.contains('open')) closeHelp();
  else if (event.key === 'Escape' && browseBox.classList.contains('open')) closeBrowse();
});

showFolder(startingFolder, preselected);