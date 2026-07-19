document.addEventListener("DOMContentLoaded", () => {
      document.querySelectorAll('.tab').forEach(tabBtn => {
          tabBtn.addEventListener('click', () => switchToTab(tabBtn.getAttribute('data-tab')));
      });

      // Clear All button — only clears jobs in whichever tab is currently active
      const clearBtn = document.getElementById("clearBtn");
      if (clearBtn) {
          clearBtn.addEventListener("click", clearActiveTabJobs);
      }
    });

    const TABS = ['applied', 'saved', 'progress'];

    function switchToTab(tabName) {
        TABS.forEach(name => {
            const isActive = name === tabName;
            document.getElementById(`${name}-content`).classList.toggle('active', isActive);
            document.querySelector(`.tab[data-tab="${name}"]`).classList.toggle('active', isActive);
        });
        updateClearButtonLabel();
    }

    function updateClearButtonLabel() {
        const clearBtn = document.getElementById("clearBtn");
        if (!clearBtn) return;
        const labels = { applied: 'Clear Applied', saved: 'Clear Saved', progress: 'Clear Progress' };
        clearBtn.textContent = `🗑️ ${labels[getActiveTab()] || 'Clear'}`;
    }

    // Column layout written by popup.js's addHeaderRow — keep these in sync
    const SHEET_COLUMNS = ['title', 'company', 'status', 'type', 'date', 'location', 'salary', 'deadline', 'link', 'notes'];

    // Which tab a job's status belongs in. 'saved' and 'applied' are exact
    // matches; anything else (Interviewing, Offer, Rejected, or any future
    // status) falls into 'progress'.
    function tabForStatus(status) {
        const s = (status || '').toLowerCase();
        if (s === 'saved') return 'saved';
        if (s === 'applied') return 'applied';
        return 'progress';
    }

    // Pull all rows from the connected sheet and render them into the three lists
    function loadJobsFromSheet() {
        chrome.storage.sync.get(['spreadsheetId'], (result) => {
            if (!result.spreadsheetId) return;

            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                if (chrome.runtime.lastError || !token) return;

                const range = 'Sheet1!A2:J';
                const url = `https://sheets.googleapis.com/v4/spreadsheets/${result.spreadsheetId}/values/${range}`;

                fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
                .then(response => response.json())
                .then(data => {
                    const rows = data.values || [];
                    const jobs = rows
                        .map((row, i) => {
                            const job = { sheetRow: i + 2 }; // +2: skip header row, 1-indexed sheet rows
                            SHEET_COLUMNS.forEach((key, colIndex) => { job[key] = row[colIndex] || ''; });
                            return job;
                        })
                        .filter(job => job.title); // skip blank rows

                    const applied = jobs.filter(j => tabForStatus(j.status) === 'applied');
                    const saved = jobs.filter(j => tabForStatus(j.status) === 'saved');
                    const inProgress = jobs.filter(j => tabForStatus(j.status) === 'progress');

                    renderJobList('appliedJobs', applied, 'applied', 'No applied jobs yet', 'When you apply to a job on Handshake, click "Yes" to track it here.');
                    renderJobList('savedJobs', saved, 'saved', 'No saved jobs yet', 'Save jobs on Handshake to track them here.');
                    renderJobList('progressJobs', inProgress, 'progress', 'No jobs in progress', 'Interviewing, offer, and rejected jobs will show up here.');
                })
                .catch(error => console.error('Error loading jobs from sheet:', error));
            });
        });
    }

    // Reset all three tabs back to their empty-state placeholders (e.g. after disconnect)
    function resetJobLists() {
        renderJobList('appliedJobs', [], 'applied', 'No applied jobs yet', 'When you apply to a job on Handshake, click "Yes" to track it here.');
        renderJobList('savedJobs', [], 'saved', 'No saved jobs yet', 'Save jobs on Handshake to track them here.');
        renderJobList('progressJobs', [], 'progress', 'No jobs in progress', 'Interviewing, offer, and rejected jobs will show up here.');
    }

    // Render a list of {title, company, sheetRow} jobs into the given container,
    // or fall back to an empty-state message if there are none. listType is
    // 'applied' or 'saved' — saved cards additionally get a "Move to Applied" button.
    function renderJobList(containerId, jobs, listType, emptyTitle, emptySubtext) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (jobs.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>${escapeHtml(emptyTitle)}</p>
                    <small>${escapeHtml(emptySubtext)}</small>
                </div>
            `;
            return;
        }

        const listHtml = jobs.map(job => `
            <div class="job-card" data-row="${job.sheetRow}">
                <div class="job-card-top">
                    <div class="job-title">${escapeHtml(job.title)}</div>
                    <div class="job-card-buttons">
                        ${listType === 'saved' ? `<button class="job-move-btn" data-row="${job.sheetRow}" title="Move to Applied">→ Applied</button>` : ''}
                        <button class="job-delete-btn" data-row="${job.sheetRow}" title="Delete">🗑️</button>
                    </div>
                </div>
                <div class="job-company">${escapeHtml(job.company)}</div>
            </div>
        `).join('');

        container.innerHTML = `<div class="jobs-list">${listHtml}</div>`;

        // Wire up delete buttons for this render
        container.querySelectorAll('.job-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = parseInt(btn.getAttribute('data-row'), 10);
                if (confirm('Delete this job? This removes it from your spreadsheet too.')) {
                    deleteJobRow(row);
                }
            });
        });

        // Wire up "move to applied" buttons (saved list only)
        container.querySelectorAll('.job-move-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = parseInt(btn.getAttribute('data-row'), 10);
                moveJobToApplied(row);
            });
        });
    }

    // Escape user-supplied text before dropping it into innerHTML
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    // Delete a specific row from the spreadsheet, then reload the list
    function deleteJobRow(sheetRow) {
        chrome.storage.sync.get(['spreadsheetId'], (result) => {
            if (!result.spreadsheetId) return;

            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) {
                    console.error('Auth error:', chrome.runtime.lastError);
                    return;
                }

                getSheetGid(result.spreadsheetId, token, (gid) => {
                    if (gid === null) {
                        console.error('Could not determine sheet ID for deletion.');
                        return;
                    }

                    const url = `https://sheets.googleapis.com/v4/spreadsheets/${result.spreadsheetId}:batchUpdate`;
                    fetch(url, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            requests: [{
                                deleteDimension: {
                                    range: {
                                        sheetId: gid,
                                        dimension: 'ROWS',
                                        startIndex: sheetRow - 1, // 0-indexed
                                        endIndex: sheetRow
                                    }
                                }
                            }]
                        })
                    })
                    .then(response => {
                        if (!response.ok) {
                            return response.json().then(err => { throw new Error(JSON.stringify(err)); });
                        }
                        return response.json();
                    })
                    .then(() => loadJobsFromSheet())
                    .catch(error => console.error('Error deleting row:', error));
                });
            });
        });
    }

    // Change a job's Status cell (column C) from Saved to Applied, then reload
    function moveJobToApplied(sheetRow) {
        chrome.storage.sync.get(['spreadsheetId'], (result) => {
            if (!result.spreadsheetId) return;

            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) {
                    console.error('Auth error:', chrome.runtime.lastError);
                    return;
                }

                const url = `https://sheets.googleapis.com/v4/spreadsheets/${result.spreadsheetId}/values/Sheet1!C${sheetRow}?valueInputOption=USER_ENTERED`;
                fetch(url, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ values: [['Applied']] })
                })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(err => { throw new Error(JSON.stringify(err)); });
                    }
                    return response.json();
                })
                .then(() => loadJobsFromSheet())
                .catch(error => console.error('Error moving job to Applied:', error));
            });
        });
    }

    // Get the numeric grid ID of "Sheet1" (needed for row deletion), caching it locally
    function getSheetGid(spreadsheetId, token, callback) {
        chrome.storage.sync.get(['sheetGid'], (result) => {
            if (result.sheetGid !== undefined && result.sheetGid !== null) {
                callback(result.sheetGid);
                return;
            }

            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
            fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(response => response.json())
            .then(data => {
                const sheet = (data.sheets || []).find(s => s.properties.title === 'Sheet1') || (data.sheets || [])[0];
                const gid = sheet ? sheet.properties.sheetId : null;
                if (gid !== null) {
                    chrome.storage.sync.set({ sheetGid: gid });
                }
                callback(gid);
            })
            .catch(error => {
                console.error('Error fetching sheet ID:', error);
                callback(null);
            });
        });
    }

    // Which tab ('applied' or 'saved') is currently showing
    function getActiveTab() {
        const activeTabBtn = document.querySelector('.tab.active');
        return activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'applied';
    }

    // Clear every job in whichever tab is currently active — deletes those rows
    // from the spreadsheet, leaving the other section untouched
    function clearActiveTabJobs() {
        const activeTab = getActiveTab(); // 'applied' or 'saved'

        chrome.storage.sync.get(['spreadsheetId'], (result) => {
            if (!result.spreadsheetId) return;

            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) {
                    console.error('Auth error:', chrome.runtime.lastError);
                    return;
                }

                const range = 'Sheet1!A2:J';
                const url = `https://sheets.googleapis.com/v4/spreadsheets/${result.spreadsheetId}/values/${range}`;

                fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
                .then(response => response.json())
                .then(data => {
                    const rows = data.values || [];
                    const jobs = rows
                        .map((row, i) => {
                            const job = { sheetRow: i + 2 };
                            SHEET_COLUMNS.forEach((key, colIndex) => { job[key] = row[colIndex] || ''; });
                            return job;
                        })
                        .filter(job => job.title);

                    const matching = jobs.filter(j => tabForStatus(j.status) === activeTab);

                    const tabDisplayNames = { applied: 'applied', saved: 'saved', progress: 'in-progress' };
                    const tabLabel = tabDisplayNames[activeTab] || activeTab;

                    if (matching.length === 0) {
                        alert(`No ${tabLabel} jobs to clear.`);
                        return;
                    }

                    const confirmed = confirm(`Delete all ${matching.length} ${tabLabel} job(s)? This removes them from your spreadsheet too.`);
                    if (!confirmed) return;

                    getSheetGid(result.spreadsheetId, token, (gid) => {
                        if (gid === null) {
                            console.error('Could not determine sheet ID for clearing.');
                            return;
                        }

                        // Delete highest row number first so earlier deletions don't shift later indices
                        const rowNumbers = matching.map(j => j.sheetRow).sort((a, b) => b - a);
                        const requests = rowNumbers.map(rowNum => ({
                            deleteDimension: {
                                range: {
                                    sheetId: gid,
                                    dimension: 'ROWS',
                                    startIndex: rowNum - 1,
                                    endIndex: rowNum
                                }
                            }
                        }));

                        const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${result.spreadsheetId}:batchUpdate`;
                        fetch(batchUrl, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ requests })
                        })
                        .then(response => {
                            if (!response.ok) {
                                return response.json().then(err => { throw new Error(JSON.stringify(err)); });
                            }
                            return response.json();
                        })
                        .then(() => loadJobsFromSheet())
                        .catch(error => console.error('Error clearing jobs:', error));
                    });
                })
                .catch(error => console.error('Error loading jobs to clear:', error));
            });
        });
    }