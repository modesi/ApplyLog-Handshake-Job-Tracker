# Handshake Job Tracker - Chrome Extension

Track your job applications from Handshake and automatically sync them to Google Sheets!

## Features

- ✅ **Auto-Track**: When you apply to a job on Handshake, the extension asks if you want to track it
- ✅ **Google Sheets Sync**: All jobs automatically sync to your Google Sheets
- ✅ **Applied & Saved**: Track both jobs you've applied to AND jobs you've saved for later
- ✅ **Quick Access**: Click any job in the popup to open it in a new tab
- ✅ **Local Backup**: Jobs are also stored locally as backup

## Installation

### Step 1: Set up Google Cloud (Required for Sheets sync)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project called "Handshake Job Tracker"
3. Go to **APIs & Services** → **Library**
4. Enable **Google Sheets API**
5. Go to **APIs & Services** → **Credentials**
6. Click **Create Credentials** → **OAuth client ID**
7. Choose **Web application**
8. Under **Authorized redirect URIs**, add:
   ```
   https://<your-extension-id>.chromiumapp.org/
   ```
   (You'll replace `<your-extension-id>` after loading the extension)
9. Click **Create** and copy your **Client ID**

### Step 2: Update manifest.json

Edit `manifest.json` and replace `YOUR_CLIENT_ID_HERE` with your actual Client ID:
```json
"oauth2": {
  "client_id": "your-actual-client-id.apps.googleusercontent.com",
  "scopes": ["https://www.googleapis.com/auth/spreadsheets"]
}
```

### Step 3: Load in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right corner)
3. Click **Load unpacked**
4. Select the `handshake-job-tracker` folder

### Step 4: Connect Google Sheets

1. Click the extension icon in Chrome
2. Click **"Connect Google Sheets"**
3. Sign in with your Google account
4. Allow the requested permissions


## How It Works

- **Applied Jobs Sheet**: Jobs you mark as "applied" go here
- **Saved Jobs Sheet**: Jobs you mark as "saved" go here
- Each entry includes: Date, Job Title, Company, Location, Status, URL, Description, Salary

## Troubleshooting

### Extension not detecting Apply button?
- Make sure you're on the correct Handshake domain
- Try refreshing the page after clicking Apply
- You can manually add jobs from the popup

### Not getting the confirmation popup?
- Check that the extension has permissions for Handshake
- Try removing and re-loading the extension

### Google Sheets not connecting?
- Make sure you created the OAuth credentials correctly
- Check that the redirect URI matches exactly

## Files

- `manifest.json` - Extension configuration
- `background.js` - Handles Google Sheets API
- `content.js` - Detects job applications and scrapes data
- `popup.html` - User interface
- `popup.js` - Popup logic
- `styles.css` - Styling
- `instructions.html` - Setup guide
- `README.md` - This file

##Contacts
- Make sure to contact mmbow@terpmail.umd.edu & for any questions / concerns,
or additions to add onto our extention, thank you for reading! 

## License

MIT

