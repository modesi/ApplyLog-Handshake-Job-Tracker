# ApplyLog — Job/Internship Application Tracker

A Chrome extension that helps you track job and internship applications and
automatically syncs them to a Google Sheet, so your search stays organized
without a separate spreadsheet you have to update by hand.

## Features

- **Google Sheets sync** — Connect a Google account (OAuth2 via `chrome.identity`) and ApplyLog creates or reuses a dedicated spreadsheet (`ApplyLog - Job Applications`) to store every entry.
- **Auto-styled sheet** — The spreadsheet is automatically formatted on first connect (frozen header row, column widths, status-based conditional coloring, dropdown validation for Status/Type, filters, borders) and re-styled if the format version changes.
- **Add jobs manually** — A quick form (title, company, status, type, location, salary, deadline, link, notes) appends a new row straight to your sheet.
- **Tabs by stage** — Applications are grouped into **Applied**, **Saved**, and **In Progress** (interviewing/offer/rejected), pulled live from the sheet.
- **Search** — Filter the current tab's jobs by title or company.
- **Stats row** — At-a-glance counts of Applied / Saved / In Progress jobs.
- **Import from an old spreadsheet** — Paste a link or ID to a spreadsheet you were already using; ApplyLog fuzzy-matches its columns (title, company, status, etc.) to its own schema, shows you a preview of the mapping, and imports the rows — keeping any columns it doesn't recognize instead of discarding them.
- **Draft auto-save** — See [Form Draft Persistence](#form-draft-persistence-formdraftpersistencejs) below; in-progress form entries survive the popup closing.
- **Disconnect / Clear** — Revoke access and clear cached tokens, or clear applied/saved/in-progress jobs per tab, with a confirmation modal for destructive actions.

## File Structure

| File | Purpose |
|---|---|
| `manifest.json` / `manifest_local.json` | Extension manifest (MV3). `manifest_local.json` is a local/dev variant of the same config. |
| `index.html` | Popup UI markup — header, connect banner, stats, tabs, add-job form, import form. |
| `CSSExtension.css` | All popup styling. |
| `popup.js` | Core popup logic: OAuth flow, connection status, spreadsheet creation/styling, manual entry submission, disconnect flow, confirm/info modals. |
| `SavedAndAppliedJobs.js` | Reads job rows from the sheet, renders them into the Applied/Saved/Progress tabs, handles search filtering and per-tab clearing. |
| `linkSpreadsheet.js` | Import-from-old-spreadsheet feature: header detection/fuzzy-matching, preview UI, and writing matched + unmatched columns into the ApplyLog sheet. |
| `background.js` | MV3 service worker. Brokers `chrome.identity.getAuthToken` requests from the popup (identity APIs aren't directly available in all popup contexts). |
| `formDraftPersistence.js` | **New.** Auto-saves and restores the "Add Job" form so in-progress entries aren't lost when the popup closes. See below. |

## Setup

1. Clone/download this repository.
2. In `manifest.json`, the `oauth2.client_id` must correspond to a Google Cloud OAuth client configured for this extension's ID (the `key` field pins the extension ID so the client ID stays valid across reloads).
3. Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the project folder.
4. Click the ApplyLog icon, hit **Connect**, and sign in with the Google account you want your job tracker synced to.

## Permissions Used

- `identity` — OAuth sign-in via `chrome.identity.getAuthToken`.
- `storage` — Caches the connected spreadsheet ID, sheet formatting version/gid, and (now) form drafts.
- `https://www.googleapis.com/*`, `https://sheets.googleapis.com/*` — Reading/writing the Google Sheet via the Sheets API.