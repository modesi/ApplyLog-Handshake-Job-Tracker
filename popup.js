// Column layout for the sheet — keep in sync with SHEET_COLUMNS in SavedAndAppliedJobs.js
const SHEET_HEADERS = ['Job Title', 'Company', 'Status', 'Type', 'Date Added', 'Location', 'Salary', 'Deadline', 'Link', 'Notes'];
const STATUS_OPTIONS = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];
const TYPE_OPTIONS = ['Internship', 'Full-Time', 'Part-Time'];

// Bump this whenever styleSpreadsheet's visuals change — any spreadsheet stored
// with an older version gets automatically re-styled next time the popup opens.
const SPREADSHEET_STYLE_VERSION = 2;

// Style (or re-style) a spreadsheet if it isn't already on the current look.
// Handles both brand-new sheets and ones that were created before a style update.
function ensureSpreadsheetStyled(spreadsheetId, oauthToken, onDone) {
    chrome.storage.sync.get(['sheetGid', 'styleVersion'], (result) => {
        if (result.styleVersion === SPREADSHEET_STYLE_VERSION && result.sheetGid !== undefined && result.sheetGid !== null) {
            onDone();
            return;
        }

        const applyWithGid = (gid) => {
            styleSpreadsheet(spreadsheetId, gid, oauthToken, () => {
                chrome.storage.sync.set({ sheetGid: gid, styleVersion: SPREADSHEET_STYLE_VERSION }, onDone);
            });
        };

        if (result.sheetGid !== undefined && result.sheetGid !== null) {
            applyWithGid(result.sheetGid);
            return;
        }

        // No cached gid (e.g. an older/reused spreadsheet) — look up the first sheet's gid
        fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
            headers: { 'Authorization': `Bearer ${oauthToken}` }
        })
        .then(response => response.json())
        .then(meta => {
            const firstSheet = meta.sheets && meta.sheets[0];
            if (!firstSheet) { onDone(); return; }
            applyWithGid(firstSheet.properties.sheetId);
        })
        .catch(error => {
            console.error('Error looking up sheet gid for styling:', error);
            onDone();
        });
    });
}

document.addEventListener("DOMContentLoaded", function() {
    // Ensure the connect button exists
    const connectBtn = document.getElementById("connectBtn");
    if (connectBtn) {
        connectBtn.addEventListener("click", () => {
            console.log("Connect button clicked");
            authenticateUser();
        });
    } else {
        console.error('Connect button not found');
    }

    // Check whether we're already connected (e.g. popup was reopened)
    checkConnectionStatus();

    // Manual entry toggle + form
    const manualToggle = document.getElementById("manualEntryToggle");
    const manualForm = document.getElementById("manualEntryForm");
    if (manualToggle && manualForm) {
        manualToggle.addEventListener("click", () => {
            const isOpen = manualForm.style.display !== "none";
            manualForm.style.display = isOpen ? "none" : "flex";
        });
        manualForm.addEventListener("submit", addManualEntry);
    }

    // Disconnect button — clears the stored sheet and revokes the token so the
    // user can reconnect with a different Google account if they want to
    const disconnectBtn = document.getElementById("disconnectBtn");
    if (disconnectBtn) {
        disconnectBtn.addEventListener("click", () => {
            const confirmed = confirm(
                'Disconnect Google Sheets? You\'ll need to reconnect (and can choose a different account) to sync again.'
            );
            if (confirmed) {
                disconnectAccount();
            }
        });
    }
});

// Check on popup open whether we already have a stored spreadsheet + valid token
function checkConnectionStatus() {
    chrome.storage.sync.get(['spreadsheetId'], (result) => {
        if (result.spreadsheetId) {
            // Try to get a token silently (no popup) to confirm we're still authorized
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                if (chrome.runtime.lastError || !token) {
                    updateStatus('Not connected');
                } else {
                    updateStatus('Connected');
                    showSpreadsheetLink(result.spreadsheetId);
                    ensureSpreadsheetStyled(result.spreadsheetId, token, () => {});
                }
            });
            return;
        }

        // No cached ID — if we're still silently authorized, check Drive for a
        // spreadsheet this app created previously (e.g. before a reinstall)
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (chrome.runtime.lastError || !token) {
                updateStatus('Not connected');
                return;
            }
            findExistingSpreadsheet(token);
        });
    });
}

// Reveal the "Open Google Sheets" link once we know the spreadsheet ID
function showSpreadsheetLink(spreadsheetId) {
    const spreadsheetLink = document.getElementById('spreadsheetLink');
    const openSpreadsheet = document.getElementById('openSpreadsheet');
    if (spreadsheetLink && openSpreadsheet) {
        openSpreadsheet.href = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
        spreadsheetLink.style.display = 'block';
    }
}

// Grab form values, validate, and append a row to the connected sheet
function addManualEntry(event) {
    event.preventDefault();

    const title = document.getElementById('jobTitleInput').value.trim();
    const company = document.getElementById('companyInput').value.trim();
    const status = document.getElementById('statusInput').value;
    const type = document.getElementById('typeInput').value;
    const location = document.getElementById('locationInput').value.trim();
    const salary = document.getElementById('salaryInput').value.trim();
    const deadline = document.getElementById('deadlineInput').value;
    const link = document.getElementById('linkInput').value.trim();
    const notes = document.getElementById('notesInput').value.trim();

    if (!title || !company) {
        setFeedback(document.getElementById('manualFeedback'), 'Please fill in job title and company.', 'error');
        return;
    }

    chrome.storage.sync.get(['spreadsheetId', 'sheetGid'], (result) => {
        if (!result.spreadsheetId) {
            setFeedback(document.getElementById('manualFeedback'), 'Connect Google Sheets first.', 'error');
            return;
        }

        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError || !token) {
                console.error('Auth error:', chrome.runtime.lastError);
                setFeedback(document.getElementById('manualFeedback'), 'Authentication failed. Try reconnecting.', 'error');
                return;
            }

            const dateAdded = new Date().toLocaleDateString();
            const row = [title, company, status, type, dateAdded, location, salary, deadline, link, notes];

            setFeedback(document.getElementById('manualFeedback'), 'Adding…', '');
            appendRowToSheet(result.spreadsheetId, result.sheetGid, token, row);
        });
    });
}

// Force a just-appended row to plain white background + black text. Needed
// because Sheets' values.append with INSERT_ROWS copies formatting from the
// row directly above the new one — for the first entry, that's the black
// header row. `updatedRange` is the A1 range returned by the append call
// (e.g. "Sheet1!A2:J2"); `columnCount` is how many columns wide to reset.
function resetAppendedRowFormatting(spreadsheetId, gid, token, updatedRange, columnCount, onDone) {
    if (gid === null || gid === undefined) { onDone(); return; }

    const match = updatedRange.match(/![A-Z]+(\d+):[A-Z]+(\d+)/);
    if (!match) { onDone(); return; }

    const startRowIndex = parseInt(match[1], 10) - 1;
    const endRowIndex = parseInt(match[2], 10);

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requests: [{
                repeatCell: {
                    range: { sheetId: gid, startRowIndex, endRowIndex, startColumnIndex: 0, endColumnIndex: columnCount },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 1, green: 1, blue: 1 },
                            textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 }, bold: false }
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat.foregroundColor,textFormat.bold)'
                }
            }]
        })
    })
    .then(response => response.json())
    .catch(error => console.error('Error resetting appended row formatting:', error))
    .finally(() => onDone());
}

// Append a row to Sheet1 via the Sheets API values.append endpoint
function appendRowToSheet(spreadsheetId, gid, token, rowValues) {
    const range = 'Sheet1!A1';
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [rowValues] })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(JSON.stringify(err)); });
        }
        return response.json();
    })
    .then((data) => {
        // values.append with INSERT_ROWS copies formatting from the row above the
        // new one — for the first job that's the black header row. Force the
        // newly written row back to a plain white background + black text.
        const updatedRange = data.updates && data.updates.updatedRange;
        const finish = () => {
            setFeedback(document.getElementById('manualFeedback'), '✅ Added to spreadsheet!', 'success');
            document.getElementById('manualEntryForm').reset();
            loadJobsFromSheet();
        };
        if (updatedRange && gid !== undefined && gid !== null) {
            resetAppendedRowFormatting(spreadsheetId, gid, token, updatedRange, SHEET_HEADERS.length, finish);
        } else {
            finish();
        }
    })
    .catch(error => {
        console.error('Error adding row:', error);
        setFeedback(document.getElementById('manualFeedback'), '❌ Failed to add — see console.', 'error');
    });
}

// Disconnect the current Google account: revoke the OAuth token so it's no longer
// valid, remove it from Chrome's token cache, and forget the stored spreadsheet.
// This lets the person reconnect with a different Google account afterward.
function disconnectAccount() {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) {
            // No token to revoke — just clear local state
            finishDisconnect();
            return;
        }

        // Revoke server-side so Google forgets this app's grant for the account
        fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' })
        .catch(error => console.error('Error revoking token:', error))
        .finally(() => {
            // Remove it from Chrome's local cache regardless of whether revoke succeeded
            chrome.identity.removeCachedAuthToken({ token }, () => {
                finishDisconnect();
            });
        });
    });
}

// Clear stored spreadsheet + reset the UI back to "Not connected"
function finishDisconnect() {
    chrome.storage.sync.remove(['spreadsheetId', 'sheetGid'], () => {
        const spreadsheetLink = document.getElementById('spreadsheetLink');
        if (spreadsheetLink) spreadsheetLink.style.display = 'none';
        updateStatus('Not connected');
        console.log('Disconnected. Ready to reconnect with a different account if needed.');
    });
}

// Generic feedback helper (used by both manual entry and link-existing forms)
function setFeedback(el, message, type) {
    if (!el) return;
    el.textContent = message;
    el.className = 'manual-feedback' + (type ? ` ${type}` : '');
}

// Authenticate the user using Chrome Identity API
function authenticateUser() {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
            // Improved logging to show the actual error message
            console.error('OAuth authentication failed:', chrome.runtime.lastError);
            updateStatus('Connection failed');
            return;
        }

        // If token is received, proceed to check if the user has an existing sheet
        console.log('Token received:', token);

        // Check if the user already has a spreadsheet
        chrome.storage.sync.get(['spreadsheetId'], (result) => {
            if (result.spreadsheetId) {
                // If a spreadsheet ID exists, use it
                console.log('Existing spreadsheet found:', result.spreadsheetId);
                updateStatus('Connected');
                showSpreadsheetLink(result.spreadsheetId);
                makeApiRequest(result.spreadsheetId, token);
            } else {
                // No cached ID — check Drive for a spreadsheet this app already created
                // for this user before falling back to creating a brand new one
                findExistingSpreadsheet(token);
            }
        });
    });
}

// Name used both when creating a new spreadsheet and when searching Drive for an existing one
const APPLYLOG_SHEET_NAME = 'ApplyLog - Job Applications';

// Search the user's Drive (scoped to files this app created, via drive.file) for a
// spreadsheet we made previously — e.g. after a reinstall wiped local storage.
function findExistingSpreadsheet(oauthToken) {
    const query = encodeURIComponent(
        `name='${APPLYLOG_SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
    );
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&orderBy=createdTime desc`;

    fetch(url, {
        headers: { 'Authorization': `Bearer ${oauthToken}` }
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(error => {
                throw new Error(`Error searching Drive: ${JSON.stringify(error)}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.files && data.files.length > 0) {
            // Found a previously created sheet — reuse the most recent one
            const existingId = data.files[0].id;
            console.log('Found existing spreadsheet:', existingId);
            chrome.storage.sync.set({ spreadsheetId: existingId }, () => {
                chrome.storage.sync.remove(['sheetGid', 'styleVersion']); // stale/old — force a fresh style pass
                updateStatus('Connected');
                showSpreadsheetLink(existingId);
                ensureSpreadsheetStyled(existingId, oauthToken, () => {});
            });
        } else {
            // Nothing found — this is a genuinely new user
            createNewSpreadsheet(oauthToken);
        }
    })
    .catch(error => {
        console.error('Error searching for existing spreadsheet:', error);
        // Fall back to creating one so the user isn't stuck
        createNewSpreadsheet(oauthToken);
    });
}

// Create a brand-new spreadsheet for this user via the Sheets API (no Drive scope needed)
function createNewSpreadsheet(oauthToken) {
    const url = 'https://sheets.googleapis.com/v4/spreadsheets';

    fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${oauthToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            properties: { title: APPLYLOG_SHEET_NAME },
            sheets: [{ properties: { title: 'Sheet1' } }]
        })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(error => {
                throw new Error(`Error creating sheet: ${JSON.stringify(error)}`);
            });
        }
        return response.json();
    })
    .then(data => {
        const newSpreadsheetId = data.spreadsheetId;
        const newSheetGid = data.sheets && data.sheets[0] ? data.sheets[0].properties.sheetId : null;
        console.log('New user-specific sheet created with ID:', newSpreadsheetId);

        // Write headers, then style the sheet, before storing/using it
        addHeaderRow(newSpreadsheetId, oauthToken, () => {
            styleSpreadsheet(newSpreadsheetId, newSheetGid, oauthToken, () => {
                chrome.storage.sync.set({ spreadsheetId: newSpreadsheetId, sheetGid: newSheetGid, styleVersion: SPREADSHEET_STYLE_VERSION }, () => {
                    console.log('User-specific spreadsheet ID stored.');
                    updateStatus('Connected');
                    showSpreadsheetLink(newSpreadsheetId);
                });
            });
        });
    })
    .catch(error => {
        console.error('Error creating the sheet:', error);
        updateStatus('Connection failed');
    });
}

// Write the header row into a freshly created spreadsheet
function addHeaderRow(spreadsheetId, oauthToken, onDone) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1?valueInputOption=USER_ENTERED`;

    fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${oauthToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [SHEET_HEADERS] })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(error => {
                throw new Error(`Error writing headers: ${JSON.stringify(error)}`);
            });
        }
        return response.json();
    })
    .then(() => onDone())
    .catch(error => {
        console.error('Error writing header row:', error);
        // Still proceed — the sheet exists even if the header write failed
        onDone();
    });
}

// Decorate a sheet: frozen header row, bold header styling, sized columns,
// colored Status text (no cell fill), and built-in dropdowns for Status/Type.
// Only the header row gets a background color — data rows stay on the sheet's
// normal white background.
function styleSpreadsheet(spreadsheetId, gid, oauthToken, onDone) {
    if (gid === null || gid === undefined) { onDone(); return; }

    // First, look up any conditional-format rules or banded (zebra-striped) ranges
    // already on this sheet so we can remove them before reapplying — otherwise
    // re-styling an already-styled sheet would stack duplicate rules.
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties.sheetId,conditionalFormats,bandedRanges.bandedRangeId)`;

    fetch(metaUrl, { headers: { 'Authorization': `Bearer ${oauthToken}` } })
    .then(response => response.json())
    .then(meta => {
        const sheet = (meta.sheets || []).find(s => s.properties && s.properties.sheetId === gid);
        const ruleCount = sheet && sheet.conditionalFormats ? sheet.conditionalFormats.length : 0;
        const bandedRangeIds = sheet && sheet.bandedRanges ? sheet.bandedRanges.map(b => b.bandedRangeId) : [];

        // Deleting index 0 repeatedly removes every rule, since each deletion shifts the rest down
        const cleanupRequests = [
            ...Array.from({ length: ruleCount }, () => ({ deleteConditionalFormatRule: { sheetId: gid, index: 0 } })),
            ...bandedRangeIds.map(bandedRangeId => ({ deleteBanding: { bandedRangeId } }))
        ];

        applyStyleRequests(spreadsheetId, gid, oauthToken, cleanupRequests, onDone);
    })
    .catch(error => {
        console.error('Error reading existing sheet formatting, styling anyway:', error);
        applyStyleRequests(spreadsheetId, gid, oauthToken, [], onDone);
    });
}

function applyStyleRequests(spreadsheetId, gid, oauthToken, cleanupRequests, onDone) {
    const rgb = (hex) => ({
        red: parseInt(hex.slice(0, 2), 16) / 255,
        green: parseInt(hex.slice(2, 4), 16) / 255,
        blue: parseInt(hex.slice(4, 6), 16) / 255
    });

    const columnWidths = [190, 150, 110, 110, 100, 130, 100, 105, 190, 220];

    // Built from UMD's official palette (brand.umd.edu/colors): Maryland Red,
    // Maryland Gold, Black, Dark Gray, and Bronze Testudo. Only affects the
    // Status column's text — no cell background fill.
    const statusColors = [
        { value: 'Saved',        text: 'ad7231' }, // Bronze Testudo
        { value: 'Applied',      text: '454545' }, // Dark Gray
        { value: 'Interviewing', text: 'e21833' }, // Maryland Red
        { value: 'Offer',        text: '8a6d00' }, // Maryland Gold (darkened for legibility)
        { value: 'Rejected',     text: '000000' }  // Black
    ];

    const requests = [
        ...cleanupRequests,
        // Freeze the header row + give the tab an accent color
        {
            updateSheetProperties: {
                properties: {
                    sheetId: gid,
                    gridProperties: { frozenRowCount: 1 },
                    tabColor: rgb('e21833')
                },
                fields: 'gridProperties.frozenRowCount,tabColor'
            }
        },
        // Header row only: black background, bold white centered text
        {
            repeatCell: {
                range: { sheetId: gid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: SHEET_HEADERS.length },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: rgb('000000'),
                        textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
                        verticalAlignment: 'MIDDLE',
                        horizontalAlignment: 'CENTER'
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment)'
            }
        },
        // Slightly taller header row
        {
            updateDimensionProperties: {
                range: { sheetId: gid, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
                properties: { pixelSize: 34 },
                fields: 'pixelSize'
            }
        },
        // Column widths
        ...columnWidths.map((width, i) => ({
            updateDimensionProperties: {
                range: { sheetId: gid, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
                properties: { pixelSize: width },
                fields: 'pixelSize'
            }
        })),
        // Data rows: plain white background, explicitly (in case an older style left banding/fills behind)
        {
            repeatCell: {
                range: { sheetId: gid, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: SHEET_HEADERS.length },
                cell: { userEnteredFormat: { backgroundColor: rgb('ffffff') } },
                fields: 'userEnteredFormat.backgroundColor'
            }
        },
        // Center-align Status, Type, Date Added, Deadline columns
        {
            repeatCell: {
                range: { sheetId: gid, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 5 },
                cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
            }
        },
        {
            repeatCell: {
                range: { sheetId: gid, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 7, endColumnIndex: 8 },
                cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
            }
        },
        // Built-in dropdown for Status
        {
            setDataValidation: {
                range: { sheetId: gid, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 3 },
                rule: {
                    condition: { type: 'ONE_OF_LIST', values: STATUS_OPTIONS.map(v => ({ userEnteredValue: v })) },
                    showCustomUi: true,
                    strict: false
                }
            }
        },
        // Built-in dropdown for Type
        {
            setDataValidation: {
                range: { sheetId: gid, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 3, endColumnIndex: 4 },
                rule: {
                    condition: { type: 'ONE_OF_LIST', values: TYPE_OPTIONS.map(v => ({ userEnteredValue: v })) },
                    showCustomUi: true,
                    strict: false
                }
            }
        },
        // Color-coded Status text (bold, no background fill) via conditional formatting
        ...statusColors.map(({ value, text }) => ({
            addConditionalFormatRule: {
                rule: {
                    ranges: [{ sheetId: gid, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 3 }],
                    booleanRule: {
                        condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: value }] },
                        format: { textFormat: { foregroundColor: rgb(text), bold: true } }
                    }
                },
                index: 0
            }
        })),
        // Wrap long text instead of overflowing into neighboring cells
        {
            repeatCell: {
                range: { sheetId: gid, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 1 },
                cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)'
            }
        },
        {
            repeatCell: {
                range: { sheetId: gid, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 9, endColumnIndex: 10 },
                cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)'
            }
        },
        // Thin grid borders for a clean, printable look
        {
            updateBorders: {
                range: { sheetId: gid, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: SHEET_HEADERS.length },
                top: { style: 'SOLID', width: 1, color: rgb('e6e6e6') },
                bottom: { style: 'SOLID', width: 1, color: rgb('e6e6e6') },
                left: { style: 'SOLID', width: 1, color: rgb('e6e6e6') },
                right: { style: 'SOLID', width: 1, color: rgb('e6e6e6') },
                innerHorizontal: { style: 'SOLID', width: 1, color: rgb('e6e6e6') },
                innerVertical: { style: 'SOLID', width: 1, color: rgb('e6e6e6') }
            }
        },
        // Built-in filter on the header row so the sheet is easy to sort/filter directly in Sheets
        {
            setBasicFilter: {
                filter: {
                    range: { sheetId: gid, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: SHEET_HEADERS.length }
                }
            }
        }
    ];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${oauthToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(error => {
                throw new Error(`Error styling sheet: ${JSON.stringify(error)}`);
            });
        }
        return response.json();
    })
    .then(() => onDone())
    .catch(error => {
        console.error('Error styling spreadsheet:', error);
        // Still proceed — an unstyled sheet is better than a stuck connect flow
        onDone();
    });
}

// Function to make an API request to the user's personalized sheet
function makeApiRequest(spreadsheetId, oauthToken) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1`;

    fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${oauthToken}`
        }
    })
    .then(response => response.json())
    .then(data => console.log('Data from user-specific sheet:', data))
    .catch(error => console.error('Error fetching data:', error));
}

// Function to update the UI to show connection status
function updateStatus(status) {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = statusIndicator.querySelector('.status-text');
    const statusDot = statusIndicator.querySelector('.status-dot');
    const connectBanner = document.getElementById('connectBanner');
    const connectBtn = document.getElementById('connectBtn');

    if (status === 'Connected') {
        statusText.textContent = 'Connected';
        statusDot.classList.add('connected');
        statusDot.style.backgroundColor = '';
        if (connectBanner) connectBanner.style.display = 'none';
        loadJobsFromSheet();
    } else {
        statusText.textContent = 'Not connected';
        statusDot.classList.remove('connected');
        statusDot.style.backgroundColor = '';
        if (connectBanner) connectBanner.style.display = 'flex';
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect';
        }
        resetJobLists();
    }
}