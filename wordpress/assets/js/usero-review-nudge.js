/* global useroReviewNudgeData */
(function () {
	var data = window.useroReviewNudgeData || {};
	var nudge = document.getElementById('usero-review-nudge');
	if (!nudge) {
		return;
	}
	document.querySelectorAll('[data-usero-review-action]').forEach(function (b) {
		b.addEventListener('click', function () {
			var fd = new FormData();
			fd.append('action', 'usero_review_dismiss');
			fd.append('nonce', data.nonce);
			fd.append('mode', b.getAttribute('data-usero-review-action'));
			fetch(data.ajaxUrl, { method: 'POST', body: fd, credentials: 'same-origin' });
			nudge.style.display = 'none';
		});
	});
})();
