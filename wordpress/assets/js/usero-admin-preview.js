/* global jQuery */
(function () {
	function init() {
		var root = document.querySelector('[data-usero-preview-root]');
		if (!root) return;

		var bubble = root.querySelector('.usero-preview__bubble');
		var accentInput = document.querySelector('input[name="usero_settings[accent_color]"]');
		var positionSelect = document.querySelector('select[name="usero_settings[position]"]');
		var picker = document.querySelector('[data-usero-position-picker]');

		function applyAccent(val) {
			if (!val) return;
			root.style.setProperty('--usero-accent', val);
		}

		function applyPosition(val) {
			if (!bubble) return;
			bubble.setAttribute('data-position', val === 'left' ? 'left' : 'right');
			if (picker) {
				picker.querySelectorAll('.usero-position-picker__dot').forEach(function (d) {
					d.classList.toggle(
						'usero-position-picker__dot--active',
						d.getAttribute('data-corner') === (val === 'left' ? 'bl' : 'br'),
					);
				});
			}
		}

		// Initial
		if (accentInput) applyAccent(accentInput.value);
		if (positionSelect) applyPosition(positionSelect.value);

		// WP color picker fires through jQuery; vanilla `input` event still fires too.
		if (accentInput) {
			accentInput.addEventListener('input', function () { applyAccent(accentInput.value); });
			if (window.jQuery) {
				jQuery(accentInput).wpColorPicker({
					change: function (_event, ui) {
						applyAccent(ui.color.toString());
					},
					clear: function () {
						applyAccent('#7B5BFF');
					},
				});
			}
		}

		if (positionSelect) {
			positionSelect.addEventListener('change', function () { applyPosition(positionSelect.value); });
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
