# goss-upload

Uploads each site's compiled CSS from `GOSS-skin/global/sites` to GOSS iCM Media.

## Folder layout

```
Repos/
  GOSS-skin/
    global/sites/<site>/<site>.css   built CSS, one folder per site
  goss-upload/
    upload-css.js        does the uploading in iCM
    picker/              the "Upload CSS to iCM" window
      picker.html          the layout
      picker.css           the old-Windows look
      picker.js            how it behaves (buttons, search, Browse…)
      preview.js           pretend data, for opening picker.html on its own
    report/              the failure picture's layout (failure-report.html/.css)
    screenshots/         failure pictures are saved here (made when needed)
    .env                 your settings
    package.json
```

## One-time setup

You need Node.js 20 or newer, and Microsoft Edge.

1. In the `goss-upload` folder, run `npm install`.
2. Open it (`npm start`). The first time, a **Settings** box asks for the sites
   folder, the iCM links and the browser, and saves them in `.env`. Change them later
   with **Settings…** in the window's menu. (Or copy `.env.example` to `.env` by hand.)
3. Make the desktop shortcut:
   1. In cmd, type `where node` and note the path it shows
      (usually `C:\Program Files\nodejs\node.exe`).
   2. Right-click the desktop, choose **New > Shortcut**.
   3. For the location, paste (with your node path and folder):
      ```
      "C:\Program Files\nodejs\node.exe" "C:\Users\<your-username>\Repos\goss-upload\upload-css.js"
      ```
   4. Click **Next**, name it **Upload CSS**, click **Finish**.
   5. Right-click the new shortcut, choose **Properties**, and set **Start in** to
      `C:\Users\<your-username>\Repos\goss-upload`. Click **OK**.

## Every time

1. Build the CSS in GOSS-skin.
2. Double-click **Upload CSS** on the desktop.
3. Edge opens a picker. Click an environment, tick the sites (all are ticked
   to start with), press **Start**. Live (prd) needs a second click to confirm.
4. Log in to iCM. The script presses Continue on the "already logged on"
   warning and OK on the security questions note, then starts by itself.
5. Leave Edge alone while it works. The black window shows OK or FAIL per site.
6. When the summary shows, press Enter in the black window to close Edge.

## From a terminal instead

| Command | What it does |
|---|---|
| `npm start` | Opens the picker |
| `npm run upload:dev -- all` | Every site to dev, no picker |
| `npm run upload:prp -- example-site` | One site to preprod, no picker |
| `npm run upload:prd -- all` | Every site to live (asks you to confirm) |

## If a site fails

- A picture is saved in `goss-upload\screenshots`, named with the date, time and
  site, e.g. `2026-10-30 14-05-09 FAILED example-site.png`. Across the top it says
  what went wrong, the site, environment, which step it was on and when; underneath
  is what Edge was showing at that moment. If the whole run stops (e.g. login),
  the picture is named `... FAILED run.png`.
- "No CSS item in iCM matches" means the iCM name is too different from the
  folder name. Add it to `ALIASES` in `upload-css.js`,
  e.g. `{ 'short-name': 'Full Name In iCM' }`.

## Changing the window

The window is ordinary web files in the `picker` folder. To see a change without
running an upload, open `picker/picker.html` straight in Edge: it uses pretend
sites and folders from `preview.js`, and Start just shows what it would send.

## Making Upload CSS.exe (so others don't need Node.js)

On a Windows PC that has Node.js, in the `goss-upload` folder:

```
npm install
npm run build-exe
```

That makes `dist\Upload CSS\`, with `Upload CSS.exe` and everything it needs beside it
(`picker`, `report`, Playwright in `node_modules`, `.env.example`, this README).
Zip the whole `Upload CSS` folder and hand it out.

People then:

1. Unzip it anywhere, e.g. their Documents.
2. Double-click `Upload CSS.exe`. The first time, the Settings box asks for their
   sites folder, iCM links and browser, and saves `.env` next to the .exe.
3. Optional: right-click `Upload CSS.exe` › Show more options › Send to › Desktop
   (create shortcut).

They still need Microsoft Edge or Google Chrome installed. The .exe isn't signed, so
Windows may warn about an unknown publisher; on work PCs, IT may need to allow it.
Rebuild the .exe after changing `upload-css.js` (changes to the `picker` or `report`
files just need copying into the folder).