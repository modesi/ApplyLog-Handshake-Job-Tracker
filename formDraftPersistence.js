// formDraftPersistence.js
//
// Problem this solves:
// The Chrome popup (index.html) is destroyed every time it loses focus -
// including when the user clicks a job link to open a new tab and read
// more details. Anything typed into the "Add Job" form is lost the moment
// that happens, forcing the user to retype everything.
//
// Fix:
// Mirror the form's field values into chrome.storage.local on every
// keystroke (debounced), restore them the next time the popup opens, and
// clear the saved draft once the entry is actually submitted (or the user
// explicitly discards it). chrome.storage.local (not .sync) is used since
// drafts are device-local, transient, and we don't want them fighting with
// synced job data or counting against the smaller sync quota.

(function () {
    const DRAFT_STORAGE_KEY = 'jobFormDraft';
    const SAVE_DEBOUNCE_MS = 250;

    // Keep this in sync with the fields inside #manualEntryForm in index.html
    const DRAFT_FIELD_IDS = [
        'jobTitleInput',
        'companyInput',
        'statusInput',
        'typeInput',
        'locationInput',
        'salaryInput',
        'deadlineInput',
        'linkInput',
        'notesInput'
    ];

    let saveTimeout = null;

    function getForm() {
        return document.getElementById('manualEntryForm');
    }

    function getFieldElements() {
        return DRAFT_FIELD_IDS
            .map((id) => document.getElementById(id))
            .filter(Boolean);
    }

    function readFormIntoDraft() {
        const draft = {};
        getFieldElements().forEach((el) => {
            draft[el.id] = el.value;
        });
        return draft;
    }

    function draftHasContent(draft) {
        return Object.values(draft).some((value) => (value || '').trim() !== '');
    }

    function saveDraftNow() {
        const draft = readFormIntoDraft();
        if (draftHasContent(draft)) {
            chrome.storage.local.set({ [DRAFT_STORAGE_KEY]: draft });
        } else {
            // Nothing worth keeping - don't leave stale empty drafts around
            chrome.storage.local.remove(DRAFT_STORAGE_KEY);
        }
    }

    function scheduleSave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveDraftNow, SAVE_DEBOUNCE_MS);
    }

    function clearDraft() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }
        chrome.storage.local.remove(DRAFT_STORAGE_KEY);
    }

    function applyDraftToForm(draft) {
        if (!draft) return;
        getFieldElements().forEach((el) => {
            if (Object.prototype.hasOwnProperty.call(draft, el.id) && draft[el.id]) {
                el.value = draft[el.id];
            }
        });
    }

    function showRestoredBanner(form) {
        const feedbackEl = document.getElementById('manualFeedback');
        if (feedbackEl) {
            feedbackEl.textContent = 'Restored your unsaved entry.';
            feedbackEl.className = 'manual-feedback';
        }
    }

    function restoreDraftIfAny() {
        chrome.storage.local.get([DRAFT_STORAGE_KEY], (result) => {
            const draft = result[DRAFT_STORAGE_KEY];
            if (!draft || !draftHasContent(draft)) return;

            const form = getForm();
            if (!form) return;

            applyDraftToForm(draft);

            // Open the form (it starts hidden) so the restored info is visible
            form.style.display = 'flex';
            showRestoredBanner(form);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        const form = getForm();
        if (!form) return;

        restoreDraftIfAny();

        // Save on every change while the user is typing
        getFieldElements().forEach((el) => {
            el.addEventListener('input', scheduleSave);
            el.addEventListener('change', scheduleSave);
        });

        // popup.js calls manualEntryForm.reset() after a successful submit,
        // which fires this native 'reset' event - piggyback on it to clear
        // the draft without needing to touch popup.js's submit logic.
        form.addEventListener('reset', clearDraft);

        // Also save immediately right before the popup is torn down (e.g.
        // user clicks a link/opens a new tab), so nothing is lost even if
        // the debounce timer hasn't fired yet.
        window.addEventListener('pagehide', saveDraftNow);
        window.addEventListener('blur', saveDraftNow);
    });
})();
