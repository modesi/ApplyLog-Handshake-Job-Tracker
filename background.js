chrome.runtime.onInstalled.addListener(() => {
  console.log('Handshake Job Tracker Extension Installed');
});

// Optional: Handle events or token refresh in the background (not needed for OAuth directly)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'refreshToken') {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      sendResponse({ token });
    });
    return true; // Indicates the response is async
  }
});