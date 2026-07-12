let statusEl;

document.addEventListener('DOMContentLoaded', () => {
	statusEl = document.getElementById('status');
	document.getElementById('save-btn').addEventListener('click', saveSettings);
	document.getElementById('test-btn').addEventListener('click', testConnection);
	document.getElementById('toggle-key').addEventListener('click', toggleKeyVisibility);
	loadSettings();
});

function showStatus(message, type) {
	statusEl.textContent = message;
	statusEl.className = `status visible ${type}`;
}

function hideStatus() {
	statusEl.className = 'status';
}

function toggleKeyVisibility() {
	const input = document.getElementById('api-key');
	const btn = document.getElementById('toggle-key');
	if (input.type === 'password') {
		input.type = 'text';
		btn.innerHTML = '&#128064;';
	} else {
		input.type = 'password';
		btn.innerHTML = '&#128065;';
	}
}

async function loadSettings() {
	const { atlasUrl, atlasApiKey } = await browser.storage.local.get(['atlasUrl', 'atlasApiKey']);
	document.getElementById('server-url').value = atlasUrl || '';
	document.getElementById('api-key').value = atlasApiKey || '';
}

async function saveSettings() {
	const url = document.getElementById('server-url').value.trim();
	const apiKey = document.getElementById('api-key').value.trim();

	if (!url || !apiKey) {
		showStatus('Please fill in both fields', 'error');
		return;
	}

	try {
		await browser.runtime.sendMessage({
			type: 'atlasSaveSettings',
			url,
			apiKey
		});
		showStatus('Settings saved', 'success');
		setTimeout(hideStatus, 2000);
	} catch (err) {
		showStatus(`Save failed: ${err.message}`, 'error');
	}
}

async function testConnection() {
	const url = document.getElementById('server-url').value.trim();
	const apiKey = document.getElementById('api-key').value.trim();

	if (!url || !apiKey) {
		showStatus('Please fill in both fields first', 'error');
		return;
	}

	showStatus('Testing connection...', 'info');

	try {
		const response = await browser.runtime.sendMessage({ type: 'atlasTestConnection' });
		if (response?.ok) {
			showStatus('Connection successful!', 'success');
		} else {
			showStatus(`Connection failed: ${response?.reason || 'Unknown error'}`, 'error');
		}
	} catch (err) {
		showStatus(`Connection failed: ${err.message}`, 'error');
	}
}