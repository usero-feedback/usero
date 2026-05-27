/* global useroConnectData */
(function () {
	var data = window.useroConnectData || {};
	var btn = document.getElementById('usero-connect-button');
	var input = document.getElementById('usero-connect-email');
	var display = document.getElementById('usero-connect-email-display');
	var label = document.getElementById('usero-connect-email-label');
	var status = document.getElementById('usero-connect-status');
	if (!btn || !input) {
		return;
	}
	var nonce = data.nonce;
	var ajaxUrl = data.ajaxUrl;
	var pollMax = 90; // 90 * 2s = 180s
	var pollCount = 0;
	var pollTimer = null;

	input.addEventListener('input', function () {
		if (display) display.textContent = input.value;
		if (label) label.textContent = input.value;
	});

	function setStatus(msg) {
		status.textContent = msg;
	}

	function startPolling(token) {
		pollCount = 0;
		var consecutiveErrors = 0;
		var maxConsecutiveErrors = 3;
		pollTimer = setInterval(function () {
			pollCount += 1;
			if (pollCount > pollMax) {
				clearInterval(pollTimer);
				setStatus('Connection cancelled or timed out. Click Connect to try again.');
				btn.disabled = false;
				return;
			}
			var fd = new FormData();
			fd.append('action', 'usero_connect_poll');
			fd.append('nonce', nonce);
			fd.append('handshakeToken', token);
			fetch(ajaxUrl, { method: 'POST', body: fd, credentials: 'same-origin' })
				.then(function (r) {
					if (!r.ok) {
						throw new Error('HTTP ' + r.status);
					}
					return r.json();
				})
				.then(function (j) {
					consecutiveErrors = 0;
					if (!j || !j.success) return;
					if (j.data && j.data.status === 'confirmed') {
						clearInterval(pollTimer);
						setStatus('Connected. Reloading...');
						setTimeout(function () {
							window.location.reload();
						}, 600);
					} else if (j.data && j.data.status === 'expired') {
						clearInterval(pollTimer);
						setStatus('This connection link expired. Click Connect to start a new one.');
						btn.disabled = false;
					}
				})
				.catch(function () {
					consecutiveErrors += 1;
					if (consecutiveErrors >= maxConsecutiveErrors) {
						clearInterval(pollTimer);
						setStatus('Connection lost. Click Connect to retry.');
						btn.disabled = false;
					}
				});
		}, 2000);
	}

	btn.addEventListener('click', function () {
		var email = input.value.trim();
		if (!email) {
			setStatus('Enter an email first.');
			return;
		}
		btn.disabled = true;
		setStatus('Sending a one-click sign-in link to ' + email + '...');
		var fd = new FormData();
		fd.append('action', 'usero_connect_start');
		fd.append('nonce', nonce);
		fd.append('email', email);
		fetch(ajaxUrl, { method: 'POST', body: fd, credentials: 'same-origin' })
			.then(function (r) {
				return r.json();
			})
			.then(function (j) {
				if (!j || !j.success) {
					var msg = j && j.data && j.data.message ? j.data.message : 'Could not start the connection.';
					setStatus(msg);
					btn.disabled = false;
					return;
				}
				setStatus('Check your inbox at ' + email + ' and click the link to finish. This page will update automatically.');
				startPolling(j.data.handshakeToken);
			})
			.catch(function (err) {
				setStatus('Network error: ' + err.message);
				btn.disabled = false;
			});
	});
})();
