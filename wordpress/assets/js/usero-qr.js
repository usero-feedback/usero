/* global QRCode */
(function () {
	function init() {
		var el = document.querySelector('[data-usero-qr]');
		if (!el || typeof QRCode === 'undefined') return;
		var url = el.getAttribute('data-usero-qr');
		try {
			// eslint-disable-next-line no-new
			new QRCode(el, {
				text: url,
				width: 124,
				height: 124,
				colorDark: '#1d2327',
				colorLight: '#ffffff',
				correctLevel: QRCode.CorrectLevel.M,
			});
		} catch (e) {
			el.textContent = '';
		}
	}
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
