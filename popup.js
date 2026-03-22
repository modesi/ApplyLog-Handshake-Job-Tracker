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
});

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
        chrome.storage.local.get(['spreadsheetId'], (result) => {
            if (result.spreadsheetId) {
                // If a spreadsheet ID exists, use it
                console.log('Existing spreadsheet found:', result.spreadsheetId);
                updateStatus('Connected');
                makeApiRequest(result.spreadsheetId, token);
            } else {
                // If no spreadsheet ID is found, create a new one
                copyTemplateAndGetId(token);
            }
        });
    });
}

// Function to copy the template sheet and get the user's individualized spreadsheet ID
function copyTemplateAndGetId(oauthToken) {
    const templateSheetId = '1rsb0REuWD_yioG376ioYOLijzdHM-I1ROdKiNr7mvbE'; // Your template sheet ID

    const url = `https://www.googleapis.com/drive/v3/files/${templateSheetId}/copy`;

    fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${oauthToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: 'User Specific Sheet' // You can customize the sheet name for the user
        })
    })
    .then(response => {
        if (!response.ok) {
            // Log the response body if the request fails
            return response.json().then(error => {
                throw new Error(`Error copying sheet: ${JSON.stringify(error)}`);
            });
        }
        return response.json();
    })
    .then(data => {
        // The copied sheet's ID
        const newSpreadsheetId = data.id;
        console.log('New user-specific sheet created with ID:', newSpreadsheetId);

        // Store this ID for future use (e.g., in chrome.storage.local)
        chrome.storage.local.set({ spreadsheetId: newSpreadsheetId }, () => {
            console.log('User-specific spreadsheet ID stored.');
            updateStatus('Connected');
        });

        // Now you can interact with this user's sheet using the new spreadsheet ID
        makeApiRequest(newSpreadsheetId, oauthToken); // Example API request
    })
    .catch(error => console.error('Error copying the sheet:', error));
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
    if (status === 'Connected') {
        statusText.textContent = 'Connected';
        statusIndicator.querySelector('.status-dot').style.backgroundColor = 'green';
    } else {
        statusText.textContent = 'Not connected';
        statusIndicator.querySelector('.status-dot').style.backgroundColor = 'red';
    }
}