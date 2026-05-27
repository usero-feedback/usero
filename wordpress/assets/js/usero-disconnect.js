/* global useroDisconnectData */
(function () {
	var data = window.useroDisconnectData || {};
	var btn = document.getElementById('usero-disconnect');
	if (!btn) {
		return;
	}
	btn.addEventListener('click', function () {
		if (!window.confirm('Disconnect this site from Usero? Your feedback stays in your dashboard. You can reconnect any time.')) {
			return;
		}
		var fd = new FormData();
		fd.append('action', 'usero_disconnect');
		fd.append('nonce', data.nonce);
		fetch(data.ajaxUrl, { method: 'POST', body: fd, credentials: 'same-origin' }).then(function () {
			window.location.reload();
		});
	});
})();
