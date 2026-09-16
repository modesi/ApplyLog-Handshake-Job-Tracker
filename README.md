# ApplyLog - Job/Internship Application Tracker

[![Available in the Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/applylog-job-tracker/hllegimodgdopppnmichhfcbnnendoli)

A Chrome extension that helps you track job and internship applications and automatically syncs them to a Google Sheet. This helps your search stay organized without a separate spreadsheet you have to update by hand.

**[Install ApplyLog from the Chrome Web Store](https://chromewebstore.google.com/detail/applylog-job-tracker/hllegimodgdopppnmichhfcbnnendoli)**

## Features

- **Google Sheets sync:**  Connect a Google account (OAuth2 via `chrome.identity`) and ApplyLog creates or reuses a dedicated spreadsheet (`ApplyLog - Job Applications`) to store every entry.
- **Auto-styled sheet:**  The spreadsheet is automatically formatted on first connect (frozen header row, column widths, status-based conditional coloring, dropdown validation for Status/Type, filters, borders) and re-styled if the format version changes.
- **Add jobs manually:**  A quick form (title, company, status, type, location, salary, deadline, link, notes) appends a new row straight to your sheet.
- **Tabs by stage:**  Applications are grouped into **Applied**, **Saved**, and **In Progress** (interviewing/offer/rejected), pulled live from the sheet.
- **Search:**  Filter the current tab's jobs by title or company.
- **Stats row:**  At-a-glance counts of Applied / Saved / In Progress jobs.
- **Import from an old spreadsheet:**  Pick a spreadsheet you were already using via Google's file picker (opens in a new tab, so ApplyLog only ever gets access to the file you choose); ApplyLog fuzzy-matches its columns (title, company, status, etc.) to its own schema, shows you a preview of the mapping, and imports the rows keeping any columns it doesn't recognize instead of discarding them.
- **Draft auto-save:**  See `Form Draft Persistence below`; in-progress form entries survive the popup closing.
- **Disconnect / Clear:**  Revoke access and clear cached tokens, or clear applied/saved/in-progress jobs per tab, with a confirmation modal for destructive actions.

## File Structure

| File | Purpose |
|---|---|
| `manifest.json` | Extension manifest (MV3): permissions, OAuth2 config, and the extension `key` (keeps the extension ID stable across unpacked reloads). |
| `popup.html` | Extension popup UI markup - header, connect banner, stats, tabs, add-job form, import form. |
| `index.html` | Landing/marketing page (GitHub Pages), not part of the packaged extension. |
| `CSSExtension.css` | All popup styling. |
| `landing.css` | Styling for `index.html`. |
| `popup.js` | Core popup logic: OAuth flow, connection status, spreadsheet creation/styling, manual entry submission, disconnect flow, confirm/info modals. |
| `SavedAndAppliedJobs.js` | Reads job rows from the sheet, renders them into the Applied/Saved/Progress tabs, handles search filtering and per-tab clearing. |
| `linkSpreadsheet.js` | Import-from-old-spreadsheet feature: opens the hosted Picker, header detection/fuzzy-matching, preview UI, and writing matched + unmatched columns into the ApplyLog sheet. |
| `picker.html` | Hosted (GitHub Pages) page that runs the Google Picker UI. Runs outside the extension's CSP so it can load `apis.google.com`; relays the chosen file back via `externally_connectable`. |
| `background.js` | MV3 service worker. Brokers `chrome.identity.getAuthToken` requests from the popup, and relays the Picker's result from `picker.html` into storage for the popup to pick up. |
| `formDraftPersistence.js` | Auto-saves and restores the "Add Job" form so in-progress entries aren't lost when the popup closes. See below. |

## Setup

### Option 1: Install from the Chrome Web Store (recommended)

1. Get it here: **[ApplyLog on the Chrome Web Store](https://chromewebstore.google.com/detail/applylog-job-tracker/hllegimodgdopppnmichhfcbnnendoli)**
2. Click **Add to Chrome**.
3. Click the ApplyLog icon, hit **Connect**, and sign in with the Google account you want your job tracker synced to.

### Option 2: Run from source (for contributors/development)

1. Clone/download this repository.
2. In `manifest.json`, the `oauth2.client_id` must correspond to a Google Cloud OAuth client configured for this extension's ID (the `key` field pins the extension ID so the client ID stays valid across reloads). Both the `key` and `client_id` are public identifiers, not secrets - it's safe for them to live in the committed manifest.
3. Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the project folder.
4. Click the ApplyLog icon, hit **Connect**, and sign in with the Google account you want your job tracker synced to.

## Permissions Used

- `identity` - OAuth sign-in via `chrome.identity.getAuthToken`, requesting only the `drive.file` scope (per-file access to spreadsheets ApplyLog creates or that you pick via Google's file picker).
- `storage` - Caches the connected spreadsheet ID, sheet formatting version/gid, form drafts, and (briefly) the result of a Picker selection.
- `https://www.googleapis.com/*`, `https://sheets.googleapis.com/*` - Reading/writing the Google Sheet via the Sheets API.
- `externally_connectable` - Lets `picker.html`, hosted on this project's GitHub Pages domain, send the picked file back to the extension.

## AI Assistance

Parts of this project (including code, debugging, and documentation) were developed with the assistance of AI tools.