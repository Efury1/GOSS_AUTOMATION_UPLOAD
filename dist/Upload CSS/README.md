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
    .env                 your settings
    package.json
```

## One-time setup

You need Node.js 20 or newer, and Microsoft Edge.

1. In the `goss-upload` folder, run `npm install`.
2. Copy `.env.example` to `.env` and check the values (sites folder, iCM links,
   browser). Every setting comes from `.env`; the script stops and says which one is
   missing.
3. Make the desktop shortcut:
   1. In cmd, type `where node` and note the path it shows
      (usually `C:\Program Files\nodejs\node.exe`).
   2. Right-click the desktop, choose **New > Shortcut**.
   3. For the location, paste (with your node path and folder):
      ```
      "C:\Program Files\nodejs\node.exe" "C:\Users\eliza.fury\Repos\goss-upload\upload-css.js"
      ```
   4. Click **Next**, name it **Upload CSS**, click **Finish**.
   5. Right-click the new shortcut, choose **Properties**, and set **Start in** to
      `C:\Users\eliza.fury\Repos\goss-upload`. Click **OK**.

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
| `npm run upload:prp -- tolhouse-gaol` | One site to preprod, no picker |
| `npm run upload:prd -- all` | Every site to live (asks you to confirm) |

## If a site fails

- A screenshot called `FAILED-<site>.png` is saved in the `goss-upload` folder.
- "No CSS item in iCM matches" means the iCM name is too different from the
  folder name. Add it to `ALIASES` in `upload-css.js`,
  e.g. `{ recycles: 'Norfolk Recycles' }`.

## Changing the window

The window is ordinary web files in the `picker` folder. To see a change without
running an upload, open `picker/picker.html` straight in Edge: it uses pretend
sites and folders from `preview.js`, and Start just shows what it would send.