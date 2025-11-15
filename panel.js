/* Pop-up UI for AssistMD Ghost Overlay */

// DOM elements
const noteContentTextarea = document.getElementById('noteContent');
const saveNoteButton = document.getElementById('saveNote');
const clearNoteButton = document.getElementById('clearNote');
const statusDiv = document.getElementById('status');

// Storage keys
const STORAGE_KEY = 'assistmd_note_content';

/**
 * Show status message to user
 */
function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${isError ? 'error' : 'success'}`;
    statusDiv.style.display = 'block';

    // Auto-hide after 3 seconds
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}

/**
 * Load saved note content from chrome storage
 */
async function loadNoteContent() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        const savedContent = result[STORAGE_KEY] || '';
        noteContentTextarea.value = savedContent;
    } catch (error) {
        console.error('AssistMD: Failed to load note content', error);
        showStatus('Failed to load saved content', true);
    }
}

/**
 * Save note content to chrome storage
 */
async function saveNoteContent() {
    try {
        const content = noteContentTextarea.value.trim();
        await chrome.storage.local.set({ [STORAGE_KEY]: content });
        showStatus('Note content saved successfully');

        // Notify content script that content was updated
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'NOTE_CONTENT_UPDATED',
                    content: content
                }).catch(() => {
                    // Ignore errors - content script may not be ready
                });
            }
        } catch (error) {
            // Ignore tab messaging errors
            console.log('AssistMD: Tab messaging not available');
        }
    } catch (error) {
        console.error('AssistMD: Failed to save note content', error);
        showStatus('Failed to save content', true);
    }
}

/**
 * Clear note content
 */
async function clearNoteContent() {
    try {
        noteContentTextarea.value = '';
        await chrome.storage.local.set({ [STORAGE_KEY]: '' });
        showStatus('Content cleared');

        // Notify content script that content was cleared
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'NOTE_CONTENT_UPDATED',
                    content: ''
                }).catch(() => {
                    // Ignore errors
                });
            }
        } catch (error) {
            // Ignore tab messaging errors
            console.log('AssistMD: Tab messaging not available');
        }
    } catch (error) {
        console.error('AssistMD: Failed to clear content', error);
        showStatus('Failed to clear content', true);
    }
}

// Event listeners
saveNoteButton.addEventListener('click', saveNoteContent);
clearNoteButton.addEventListener('click', clearNoteContent);

// Auto-save on input change (debounced)
let saveTimeout;
noteContentTextarea.addEventListener('input', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveNoteContent, 1000); // Auto-save after 1 second of no typing
});

// Keyboard shortcuts in popup
noteContentTextarea.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveNoteContent();
    }
    if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        clearNoteContent();
    }
});

// Load content when popup opens
document.addEventListener('DOMContentLoaded', loadNoteContent);
