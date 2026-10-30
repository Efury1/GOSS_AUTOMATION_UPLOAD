/**
 * preview.js: pretend data, so picker.html can be opened straight in a browser
 * to see and try the window without running upload-css.js.
 *
 * When upload-css.js opens the page it supplies the real data first,
 * so this file does nothing then.
 */
'use strict';

(function () {
  if (window.PICKER_DATA) return; // opened by upload-css.js: use the real data

  const SEP = '\\';
  const SITES = 'C:\\Users\\you\\Repos\\GOSS-skin\\global\\sites';
  const siteNames = [
    'american-library', 'ancient-house', 'apprenticeships-norfolk', 'archives', 'care-careers',
    'collections', 'cromer-museum', 'devolution', 'elizabethan-house', 'fostereast',
    'greater-norwich-development-partnership', 'gressenhall', 'growth-board', 'health-information',
    'ict-solutions', 'intranet', 'lynn-museum', 'museum-of-norwich', 'museums', 'naame', 'norfolk',
    'norfolk-historical-maps', 'norfolk-innovations', 'norfolk-prepared', 'norfolk-recycles',
    'norfolkrecycles', 'norwich-castle', 'recruitment-east', 'schools', 'showcase', 'strangers-hall',
    'time-and-tide', 'tobacco-company', 'tolhouse-gaol',
  ];

  // A small pretend folder tree for the Browse… box
  const tree = {
    '': ['C:\\'],
    'C:\\': ['Program Files', 'Users'],
    'C:\\Users': ['you'],
    'C:\\Users\\you': ['Desktop', 'Documents', 'Repos'],
    'C:\\Users\\you\\Repos': ['GOSS-skin', 'goss-upload'],
    'C:\\Users\\you\\Repos\\GOSS-skin': ['global', 'src'],
    'C:\\Users\\you\\Repos\\GOSS-skin\\global': ['sites'],
    [SITES]: siteNames,
  };
  const join = (folder, name) => (folder.endsWith(SEP) ? folder + name : folder + SEP + name);
  const parentOf = folder => {
    if (!folder) return null;
    if (folder.length <= 3) return '';
    const cut = folder.lastIndexOf(SEP);
    return cut <= 2 ? folder.slice(0, 3) : folder.slice(0, cut);
  };

  window.PICKER_DATA = {
    environments: [
      { name: 'dev', label: 'Development' },
      { name: 'tst', label: 'Test' },
      { name: 'prp', label: 'Preprod' },
      { name: 'prd', label: 'Live' },
    ],
    chosenEnvironment: null,
    startingFolder: { folder: SITES, sites: siteNames },
    chosenSiteNames: null,
    shortcuts: [
      { label: 'Current sites folder', path: SITES },
      { label: 'Repos', path: 'C:\\Users\\you\\Repos' },
      { label: 'Home', path: 'C:\\Users\\you' },
      { label: 'This PC', path: '' },
    ],
    browsers: [
      { channel: 'msedge', label: 'Microsoft Edge', installed: true },
      { channel: 'chrome', label: 'Google Chrome', installed: true },
    ],
    chosenBrowser: 'msedge',
    // Set needsSetup to true to preview the first-time Settings box
    needsSetup: false,
    settings: {
      values: {
        SITES_DIR: SITES,
        ICM_DEV_URL: 'https://ncc1-dev.gosshosted.com/enterprise/icm/admin/index.cfm',
        ICM_TST_URL: 'https://ncc1-tst.gosshosted.com/enterprise/icm/admin/index.cfm',
        ICM_PRP_URL: 'https://ncc1-prp.gosshosted.com/enterprise/icm/admin/index.cfm',
        ICM_PRD_URL: 'https://ncc1-prd.gosshosted.com/enterprise/icm/admin/index.cfm',
        BROWSER: 'msedge',
        LEARN_MODE: 'false',
      },
      missing: [],
      suggestions: {},
      file: 'C:\\Users\\you\\Repos\\goss-upload\\.env',
    },
  };

  window.gossSaveSettings = async form => {
    alert('Preview only, nothing is saved.\n\nSettings would be:\n' + JSON.stringify(form, null, 2));
    return { saved: true };
  };

  window.gossListFolder = async folder => ({
    path: folder,
    parent: parentOf(folder),
    folders: (tree[folder] || []).map(name => ({ name, path: join(folder, name) })),
    siteCount: folder === SITES ? siteNames.length : 0,
  });

  window.gossListSites = async folder => (folder === SITES
    ? { folder, sites: siteNames }
    : { folder, sites: [], error: 'Preview only: pretend sites are only in the sites folder.' });

  // Show what Start would send, instead of uploading
  const watch = setInterval(() => {
    if (!window.__choice) return;
    clearInterval(watch);
    alert('Preview only, nothing is uploaded.\n\nStart would send:\n' + JSON.stringify(window.__choice, null, 2));
    delete window.__choice;
    location.reload();
  }, 300);
})();