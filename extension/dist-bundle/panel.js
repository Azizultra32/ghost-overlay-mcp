/**
 * Anchor Controls Popup Logic
 */

const statusEl = document.getElementById('status');

function setStatus(msg, type = 'normal') {
    statusEl.textContent = msg;
    statusEl.style.color = type === 'error' ? '#dc3545' : type === 'success' ? '#198754' : '#6c757d';
}

async function sendMessage(type) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            setStatus('No active tab', 'error');
            return;
        }

        // Check if we can talk to the tab
        try {
            await chrome.tabs.sendMessage(tab.id, { type });
            setStatus(`Sent: ${type}`, 'success');
            setTimeout(() => setStatus('Ready'), 2000);
        } catch (err) {
            setStatus('Anchor not active on page', 'error');
            console.error(err);
        }
    } catch (err) {
        setStatus('Error finding tab', 'error');
        console.error(err);
    }
}

document.getElementById('btnToggle').addEventListener('click', () => sendMessage('TOGGLE_OVERLAY'));
document.getElementById('btnMap').addEventListener('click', () => sendMessage('MAP'));
document.getElementById('btnSend').addEventListener('click', () => sendMessage('SEND_MAP'));
document.getElementById('btnFill').addEventListener('click', () => sendMessage('FILL_DEMO'));

// Initial check
setStatus('Ready');
