// All on-page UI for the user-test plugin: the floating indicator/control bar,
// the tasks panel, the mic chip state machine, the notes popover, the mute /
// resumed toasts, and the finished-screen overlays (complete, ended-early,
// session-ended). Shadow-DOM scoped so host CSS can't leak in. No React, no
// network: every function here reads/writes the DOM and the shared store.

import {
	CLOCK_ICON_SVG,
	FLAG_ICON_SVG,
	type IndicatorCallbacks,
	MIC_ICON_SVG,
	MIC_MUTED_ICON_SVG,
	NOTE_ICON_SVG,
	type RecorderStore,
	SPARK_ICON_SVG,
	TASKS_PANEL_OPEN_STORAGE_KEY,
	type ThanksOptions,
	TICK_ICON_SVG,
	TICK_SM_SVG,
} from './shared'

export function buildIndicator(host: HTMLElement, store: RecorderStore, callbacks: IndicatorCallbacks): ShadowRoot {
	const root = host.attachShadow({ mode: 'closed' })
	const style = document.createElement('style')
	// Compact, glassy dark pill. Mic chip is now a real button with three
	// states (recording / muted / no-mic). Notes button sits beside it.
	style.textContent = `
		:host { all: initial; }
		.anchor {
			position: fixed;
			bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
			left: 50%; transform: translateX(-50%);
			display: flex; flex-direction: column; align-items: center; gap: 8px;
			z-index: 2147483646; max-width: calc(100vw - 32px);
			font: 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
			color: #fff;
		}
		.bar {
			display: inline-flex; align-items: center; gap: 6px;
			padding: 6px 8px 6px 6px;
			background: rgba(17,17,17,0.82);
			border: 1px solid rgba(255,255,255,0.08);
			border-radius: 999px;
			box-shadow: 0 8px 24px rgba(0,0,0,0.22);
			backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
			max-width: 100%;
		}
		.panel {
			background: rgba(17,17,17,0.92);
			border: 1px solid rgba(255,255,255,0.08);
			border-radius: 14px; padding: 12px 14px 12px 8px;
			line-height: 1.45;
			box-shadow: 0 12px 32px rgba(0,0,0,0.32);
			max-height: min(60vh, 480px);
			max-width: min(420px, calc(100vw - 32px));
			width: max-content; overflow-y: auto;
		}
		.panel[hidden] { display: none; }
		.panel ol { margin: 0; padding-left: 26px; }
		.panel li { margin: 0 0 8px; }
		.panel li:last-child { margin: 0; }

		/* Mic chip: pill-within-pill with dot + label, doubles as mute toggle. */
		.mic {
			display: inline-flex; align-items: center; gap: 7px;
			min-height: 32px; min-width: 44px;
			padding: 0 11px 0 10px;
			border-radius: 999px;
			background: rgba(255,255,255,0.06);
			border: 1px solid rgba(255,255,255,0.06);
			color: #fff; font: inherit;
			cursor: pointer; appearance: none;
			transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
		}
		.mic:hover { background: rgba(255,255,255,0.12); }
		.mic:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
		.mic[data-mic-state="muted"] {
			background: rgba(251, 191, 36, 0.18);
			border-color: rgba(251, 191, 36, 0.45);
			color: #fcd34d;
		}
		.mic[data-mic-state="muted"]:hover { background: rgba(251, 191, 36, 0.26); }
		/* Connecting: getUserMedia pending. Steady amber tint reads as "working",
		   distinct from the live red pulse and the failed state below. The icon
		   gets a gentle non-pulsing breathe so it feels alive without alarming. */
		.mic[data-mic-state="connecting"] {
			background: rgba(251, 191, 36, 0.14);
			border-color: rgba(251, 191, 36, 0.32);
			color: #fcd34d;
			cursor: default;
		}
		.mic[data-mic-state="connecting"]:hover { background: rgba(251, 191, 36, 0.14); }
		.mic[data-mic-state="connecting"] .mic-icon {
			color: #fbbf24;
			animation: micBreathe 1.4s ease-in-out infinite;
		}
		/* Failed terminal state, actionable. Tappable affordance: clearer border,
		   pointer cursor, brightens on hover/focus to invite the retry tap. */
		.mic[data-mic-state="none"] {
			background: rgba(255,255,255,0.05);
			border-color: rgba(255,255,255,0.14);
			color: rgba(255,255,255,0.72);
			cursor: pointer;
		}
		.mic[data-mic-state="none"]:hover {
			background: rgba(255,255,255,0.12);
			border-color: rgba(255,255,255,0.24);
			color: #fff;
		}
		@keyframes micBreathe {
			0%, 100% { opacity: 0.55; }
			50% { opacity: 1; }
		}
		.mic-icon { width: 13px; height: 13px; display: inline-block; flex-shrink: 0; }
		.mic-label { font-weight: 500; letter-spacing: 0.01em; white-space: nowrap; }

		.dot {
			width: 7px; height: 7px; border-radius: 50%;
			background: #ef4444;
			box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
			animation: pulse 1.6s ease-out infinite;
			flex-shrink: 0;
		}
		.dot[data-state="no-audio"] { background: #fbbf24; animation: none; }
		.dot[data-state="finishing"] { background: #fbbf24; animation: none; }
		.dot[data-state="done"] { background: #10b981; animation: none; }
		.dot[data-state="error"] { background: #ef4444; animation: none; }

		.btn {
			appearance: none; border: 0; background: rgba(255,255,255,0.10);
			color: #fff; font: inherit; font-weight: 600;
			padding: 6px 12px; min-height: 32px; border-radius: 999px; cursor: pointer;
			transition: background 0.15s ease, transform 0.06s ease;
			display: inline-flex; align-items: center; gap: 6px;
		}
		.btn:hover { background: rgba(255,255,255,0.20); }
		.btn:active { transform: scale(0.97); }
		.btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
		.btn[disabled] { opacity: 0.5; cursor: progress; }
		.tasks-btn[aria-expanded="true"] { background: rgba(255,255,255,0.24); }

		/* Note button: icon-only, matches mic chip footprint */
		.note-btn {
			width: 32px; min-height: 32px; padding: 0;
			background: rgba(255,255,255,0.06);
			border: 1px solid rgba(255,255,255,0.06);
			border-radius: 999px;
			display: inline-flex; align-items: center; justify-content: center; gap: 4px;
			color: #fff; font: inherit; cursor: pointer; appearance: none;
			transition: background 0.15s ease, border-color 0.15s ease, width 0.18s ease;
			overflow: hidden;
		}
		.note-btn:hover { background: rgba(255,255,255,0.14); }
		.note-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
		.note-btn[data-has-notes="true"] { width: auto; padding: 0 10px 0 9px; gap: 6px; }
		.note-btn[aria-expanded="true"] { background: rgba(255,255,255,0.22); border-color: rgba(255,255,255,0.18); }
		.note-icon { width: 14px; height: 14px; display: inline-block; }
		.note-count { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }

		.spacer { width: 1px; height: 18px; background: rgba(255,255,255,0.14); margin: 0 1px; }

		@media (max-width: 480px) {
			.bar { gap: 4px; padding: 5px 6px 5px 5px; }
			.btn { padding: 7px 12px; min-height: 38px; }
			.mic, .note-btn { min-height: 38px; }
			.note-btn { width: 38px; }
			.note-btn[data-has-notes="true"] { width: auto; }
		}

		/* First-mute helper toast: sits above the pill, auto-dismisses */
		.toast {
			background: rgba(17,17,17,0.92);
			border: 1px solid rgba(251, 191, 36, 0.45);
			color: #fff;
			padding: 9px 14px; border-radius: 12px;
			max-width: min(340px, calc(100vw - 32px));
			box-shadow: 0 12px 28px rgba(0,0,0,0.28);
			text-align: center; line-height: 1.4;
			animation: toast-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
		}
		.toast[data-leaving="true"] { animation: toast-out 0.24s ease forwards; }
		.toast strong { color: #fcd34d; font-weight: 600; }
		@keyframes toast-in {
			from { opacity: 0; transform: translateY(6px); }
			to   { opacity: 1; transform: translateY(0); }
		}
		@keyframes toast-out {
			to { opacity: 0; transform: translateY(4px); }
		}

		/* "Recording resumed" confirmation: same pill footprint as the mute toast,
		   but carries the live-record red accent (not the amber warning treatment)
		   so it reads as reassurance, not a problem. Compact, inline, auto-dismisses.
		   Leads with the same pulsing record dot used on the bar's mic chip. */
		.resume-toast {
			display: inline-flex; align-items: center; gap: 8px;
			background: rgba(17,17,17,0.92);
			border: 1px solid rgba(239, 68, 68, 0.42);
			color: #fff; font-weight: 500; letter-spacing: 0.01em;
			padding: 8px 13px; border-radius: 999px;
			box-shadow: 0 12px 28px rgba(0,0,0,0.28);
			white-space: nowrap;
			animation: toast-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
		}
		.resume-toast[data-leaving="true"] { animation: toast-out 0.24s ease forwards; }
		.resume-toast .dot {
			width: 7px; height: 7px; border-radius: 50%;
			background: #ef4444; flex-shrink: 0;
			box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
			animation: pulse 1.6s ease-out infinite;
		}

		/* Notes popover */
		.note-popover {
			background: rgba(17,17,17,0.94);
			border: 1px solid rgba(255,255,255,0.10);
			border-radius: 14px; padding: 12px;
			width: min(340px, calc(100vw - 32px));
			box-shadow: 0 18px 40px rgba(0,0,0,0.36);
			display: flex; flex-direction: column; gap: 10px;
			animation: pop-in 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
		}
		.note-popover[hidden] { display: none; }
		@keyframes pop-in {
			from { opacity: 0; transform: translateY(6px) scale(0.98); }
			to   { opacity: 1; transform: translateY(0) scale(1); }
		}
		.note-head {
			color: rgba(255,255,255,0.7); font-size: 12px;
			font-weight: 500; letter-spacing: 0.02em;
		}
		.note-textarea {
			width: 100%; box-sizing: border-box;
			min-height: 80px; resize: vertical;
			padding: 10px 11px;
			background: rgba(0,0,0,0.35);
			border: 1px solid rgba(255,255,255,0.10);
			border-radius: 10px;
			color: #fff; font: inherit; font-size: 13.5px;
			line-height: 1.45;
			transition: border-color 0.15s ease;
		}
		.note-textarea:focus { outline: none; border-color: rgba(255,255,255,0.32); }
		.note-textarea::placeholder { color: rgba(255,255,255,0.42); }
		.note-actions {
			display: flex; align-items: center; justify-content: space-between; gap: 8px;
		}
		.note-actions .hint {
			color: rgba(255,255,255,0.45); font-size: 11px;
		}
		.note-actions .group { display: inline-flex; gap: 6px; }
		.note-actions .btn { padding: 6px 12px; font-size: 12.5px; min-height: 32px; }
		.btn-primary { background: #fff !important; color: #111; }
		.btn-primary:hover { background: rgba(255,255,255,0.85) !important; }
		.btn-ghost { background: transparent; color: rgba(255,255,255,0.7); }
		.btn-ghost:hover { background: rgba(255,255,255,0.10); color: #fff; }

		/* ---- Finished screen (complete + ended-early). Usero warm-stone palette,
		   shadow-DOM scoped so host CSS can't leak in. Scrollable so the primary
		   action stays reachable on a short phone with the keyboard open. ---- */
		.thanks {
			position: fixed; inset: 0;
			display: flex; align-items: flex-start; justify-content: center;
			background: rgba(28, 25, 23, 0.62);
			backdrop-filter: blur(8px);
			-webkit-backdrop-filter: blur(8px);
			color: #1c1917;
			font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
			z-index: 2147483647;
			padding: 24px 16px calc(env(safe-area-inset-bottom, 0px) + 24px);
			overflow-y: auto;
			-webkit-overflow-scrolling: touch;
		}
		.thanks-card {
			background: #fff; color: #1c1917;
			border-radius: 22px; padding: 30px 24px 24px;
			max-width: 400px; width: 100%;
			margin: auto 0;
			box-shadow: 0 24px 60px rgba(28, 25, 23, 0.28), 0 2px 8px rgba(28, 25, 23, 0.12);
			text-align: left;
			animation: thanks-in 0.34s cubic-bezier(0.16, 1, 0.3, 1);
		}
		@keyframes thanks-in {
			from { opacity: 0; transform: translateY(14px) scale(0.985); }
			to   { opacity: 1; transform: translateY(0) scale(1); }
		}
		.thanks-card .head { text-align: center; }
		.thanks h2 {
			margin: 0 0 7px; font-size: 22px; line-height: 1.2;
			font-weight: 600; letter-spacing: -0.018em; color: #1c1917;
		}
		.thanks .lede {
			margin: 0 auto 22px; font-size: 14.5px; line-height: 1.5;
			color: #57534e; text-align: center; max-width: 30ch;
		}

		/* Status medallion: green tick when complete, warm ring when ended early */
		.thanks .check {
			width: 56px; height: 56px; border-radius: 50%;
			display: grid; place-items: center;
			margin: 0 auto 16px;
		}
		.thanks .check.ok {
			background: #ecfdf5;
			box-shadow: inset 0 0 0 1px rgba(16,185,129,0.22);
			color: #059669;
		}
		.thanks .check.ok svg { width: 26px; height: 26px; }
		.thanks .check.early {
			background: #fff7ed;
			box-shadow: inset 0 0 0 1px rgba(234,88,12,0.20);
			color: #ea580c;
		}
		.thanks .check.early svg { width: 24px; height: 24px; }
		.thanks .check.ended {
			background: #f5f5f4;
			box-shadow: inset 0 0 0 1px rgba(120,113,108,0.20);
			color: #78716c;
		}
		.thanks .check.ended svg { width: 24px; height: 24px; }

		/* Verified-checks list (complete) / progress list (ended early) */
		.thanks .checks {
			list-style: none; margin: 0 0 4px; padding: 0;
			border: 1px solid #f0eeec; border-radius: 14px;
			background: #fafaf9; overflow: hidden;
		}
		.thanks .checks li {
			display: flex; align-items: center; gap: 11px;
			padding: 12px 14px; font-size: 14px; color: #292524;
			border-top: 1px solid #f0eeec;
		}
		.thanks .checks li:first-child { border-top: 0; }
		.thanks .checks .ic {
			width: 20px; height: 20px; border-radius: 50%;
			display: grid; place-items: center; flex-shrink: 0;
		}
		.thanks .checks .ic.done { background: #d1fae5; color: #059669; }
		.thanks .checks .ic.todo { background: #f5f5f4; color: #a8a29e; box-shadow: inset 0 0 0 1px #e7e5e4; }
		.thanks .checks .ic svg { width: 12px; height: 12px; }
		.thanks .checks li.muted-row { color: #78716c; }

		/* Payout block (complete) */
		.thanks .payout { margin-top: 20px; }
		.thanks .payout-q {
			font-size: 12px; font-weight: 600; letter-spacing: 0.04em;
			text-transform: uppercase; color: #a8a29e;
			margin: 0 0 10px;
		}
		.thanks .pay-primary {
			width: 100%; box-sizing: border-box;
			appearance: none; border: 0; cursor: pointer;
			background: #ea580c; color: #fff;
			padding: 15px 18px; border-radius: 14px;
			font: inherit; font-weight: 600; font-size: 15.5px;
			line-height: 1.3; text-align: center;
			box-shadow: 0 6px 16px rgba(234, 88, 12, 0.28);
			transition: background 0.15s ease, transform 0.07s ease, box-shadow 0.15s ease;
		}
		.thanks .pay-primary:hover { background: #c2410c; }
		.thanks .pay-primary:active { transform: scale(0.985); }
		.thanks .pay-primary:focus-visible { outline: 2px solid #ea580c; outline-offset: 2px; }
		.thanks .pay-primary[disabled] { opacity: 0.6; cursor: progress; box-shadow: none; }
		.thanks .pay-primary .amt { font-variant-numeric: tabular-nums; }
		.thanks .pay-alt {
			display: block; width: 100%;
			margin-top: 12px; padding: 4px;
			background: none; border: 0; cursor: pointer;
			font: inherit; font-size: 13px; font-weight: 500;
			color: #78716c; text-align: center;
			text-decoration: underline; text-underline-offset: 2px;
			transition: color 0.15s ease;
		}
		.thanks .pay-alt:hover { color: #44403c; }
		.thanks .pay-alt:focus-visible { outline: 2px solid #ea580c; outline-offset: 2px; border-radius: 6px; }
		.thanks [hidden] { display: none !important; }

		/* Alternate-email expander */
		.thanks .pay-edit { margin-top: 14px; animation: pop-in 0.2s cubic-bezier(0.2,0.8,0.2,1); }
		.thanks .pay-edit[hidden] { display: none; }
		.thanks .pay-label {
			display: block; margin: 0 0 7px;
			font-size: 13px; font-weight: 500; color: #44403c;
		}
		.thanks .pay-input {
			width: 100%; box-sizing: border-box;
			padding: 12px 13px;
			background: #fff; border: 1px solid #e7e5e4; border-radius: 11px;
			font: inherit; font-size: 15px; color: #1c1917;
			transition: border-color 0.15s ease, box-shadow 0.15s ease;
		}
		.thanks .pay-input:focus {
			outline: none; border-color: #ea580c;
			box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.16);
		}
		.thanks .pay-input::placeholder { color: #a8a29e; }
		.thanks .pay-eta {
			margin: 14px 0 0; font-size: 12px; line-height: 1.45;
			color: #a8a29e; text-align: center;
		}

		/* Ended-early "what unlocks the reward" note */
		.thanks .early-note {
			display: flex; align-items: flex-start; gap: 10px;
			margin-top: 18px; padding: 13px 14px;
			background: #fff7ed; border: 1px solid #fed7aa; border-radius: 13px;
			font-size: 13.5px; line-height: 1.45; color: #9a3412;
		}
		.thanks .early-note svg { width: 17px; height: 17px; flex-shrink: 0; margin-top: 1px; color: #ea580c; }
		.thanks .early-actions { margin-top: 18px; display: flex; flex-direction: column; gap: 10px; }
		.thanks .resume-btn {
			width: 100%; box-sizing: border-box;
			appearance: none; border: 0; cursor: pointer;
			background: #ea580c; color: #fff;
			padding: 15px 18px; border-radius: 14px;
			font: inherit; font-weight: 600; font-size: 15.5px;
			box-shadow: 0 6px 16px rgba(234, 88, 12, 0.28);
			transition: background 0.15s ease, transform 0.07s ease;
		}
		.thanks .resume-btn:hover { background: #c2410c; }
		.thanks .resume-btn:active { transform: scale(0.985); }
		.thanks .resume-btn:focus-visible { outline: 2px solid #ea580c; outline-offset: 2px; }
		.thanks .exit-btn {
			width: 100%; box-sizing: border-box;
			appearance: none; border: 0; background: none; cursor: pointer;
			padding: 4px; font: inherit; font-size: 13px; line-height: 1.45;
			color: #78716c; text-align: center;
		}
		.thanks .exit-btn:hover { color: #44403c; }
		.thanks .exit-btn:focus-visible { outline: 2px solid #ea580c; outline-offset: 2px; border-radius: 6px; }

		/* End-of-test note (shown after payout is set, complete path only) */
		.thanks .note-section {
			margin-top: 22px; padding-top: 20px;
			border-top: 1px solid #f0eeec;
		}
		.thanks .end-label {
			display: block; margin: 0 0 8px;
			font-size: 13px; font-weight: 500; color: #44403c;
		}
		.thanks .end-textarea {
			width: 100%; box-sizing: border-box;
			min-height: 84px; resize: vertical;
			padding: 12px 13px;
			background: #fafaf9;
			border: 1px solid #e7e5e4;
			border-radius: 12px;
			font: inherit; font-size: 14.5px; line-height: 1.5;
			color: #1c1917;
			transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
		}
		.thanks .end-textarea:focus {
			outline: none; border-color: #ea580c; background: #fff;
			box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.14);
		}
		.thanks .end-textarea::placeholder { color: #a8a29e; }
		.thanks .end-actions {
			display: flex; gap: 10px; margin-top: 14px;
		}
		.thanks .end-actions button {
			flex: 1;
			appearance: none; border: 1px solid #e7e5e4;
			background: #fff; color: #44403c;
			padding: 12px 14px; border-radius: 12px;
			font: inherit; font-weight: 600; font-size: 14px;
			cursor: pointer;
			transition: background 0.15s ease, border-color 0.15s ease;
		}
		.thanks .end-actions button:hover { background: #fafaf9; border-color: #d6d3d1; }
		.thanks .end-actions button.primary {
			background: #1c1917; color: #fff; border-color: #1c1917; flex: 1.4;
		}
		.thanks .end-actions button.primary:hover { background: #292524; border-color: #292524; }
		.thanks .end-actions button:focus-visible { outline: 2px solid #ea580c; outline-offset: 2px; }
		.thanks .end-hint {
			margin: 11px 0 0; font-size: 11.5px; color: #a8a29e; text-align: center;
		}
		.thanks .end-sent {
			margin-top: 16px; text-align: center; color: #57534e; font-size: 13.5px; line-height: 1.45;
		}
		@media (prefers-reduced-motion: reduce) {
			.thanks-card, .thanks .pay-edit { animation: none; }
		}

		@keyframes pulse {
			0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); }
			70% { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
			100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
		}
		@media (prefers-reduced-motion: reduce) {
			.dot { animation: none; }
			.toast, .note-popover, .resume-toast { animation: none; }
			.resume-toast[data-leaving="true"] { opacity: 0; }
		}
	`
	const anchor = document.createElement('div')
	anchor.className = 'anchor'

	const panel = document.createElement('div')
	panel.className = 'panel'
	panel.hidden = true

	// Toast slot: helper messages render here above the bar.
	const toastSlot = document.createElement('div')
	toastSlot.className = 'toast-slot'

	// Notes popover slot: rendered above the bar when open.
	const notePopover = document.createElement('div')
	notePopover.className = 'note-popover'
	notePopover.hidden = true

	const bar = document.createElement('div')
	bar.className = 'bar'
	bar.setAttribute('role', 'status')
	bar.setAttribute('aria-live', 'polite')

	// Mic chip = real button. Three states driven by data-mic-state.
	const micBtn = document.createElement('button')
	micBtn.type = 'button'
	micBtn.className = 'mic'
	micBtn.setAttribute('data-mic-state', 'recording')
	micBtn.setAttribute('aria-pressed', 'false')
	micBtn.setAttribute('aria-label', 'Mute microphone')

	const dot = document.createElement('span')
	dot.className = 'dot'
	dot.setAttribute('data-state', store.indicatorState)

	const micIcon = document.createElement('span')
	micIcon.className = 'mic-icon'
	micIcon.innerHTML = MIC_ICON_SVG
	micIcon.setAttribute('aria-hidden', 'true')

	const micLabel = document.createElement('span')
	micLabel.className = 'mic-label'
	micLabel.textContent = 'Recording'

	micBtn.appendChild(dot)
	micBtn.appendChild(micIcon)
	micBtn.appendChild(micLabel)
	micBtn.addEventListener('click', callbacks.onToggleMute)
	bar.appendChild(micBtn)

	// Notes button: icon-only by default, grows to show count once notes exist.
	const noteBtn = document.createElement('button')
	noteBtn.type = 'button'
	noteBtn.className = 'note-btn'
	noteBtn.setAttribute('aria-label', 'Add a timestamped note')
	noteBtn.setAttribute('aria-expanded', 'false')
	noteBtn.setAttribute('data-has-notes', 'false')
	noteBtn.innerHTML = `<span class="note-icon" aria-hidden="true">${NOTE_ICON_SVG}</span><span class="note-count" hidden></span>`
	noteBtn.addEventListener('click', callbacks.onOpenNote)
	bar.appendChild(noteBtn)

	const spacer = document.createElement('span')
	spacer.className = 'spacer'
	bar.appendChild(spacer)

	const btn = document.createElement('button')
	btn.type = 'button'
	btn.className = 'btn finish-btn'
	btn.textContent = 'Finish'
	btn.addEventListener('click', callbacks.onFinish)
	bar.appendChild(btn)

	if (store.tasks.length > 0) installTasksToggle(bar, btn, store, callbacks.onToggleTasks)

	anchor.appendChild(panel)
	anchor.appendChild(toastSlot)
	anchor.appendChild(notePopover)
	anchor.appendChild(bar)

	root.appendChild(style)
	root.appendChild(anchor)
	return root
}

export function installTasksToggle(bar: HTMLElement, finishBtn: HTMLElement, store: RecorderStore, onToggleTasks: () => void): void {
	const tasksBtn = document.createElement('button')
	tasksBtn.type = 'button'
	tasksBtn.className = 'btn tasks-btn'
	tasksBtn.textContent = `Tasks (${store.tasks.length})`
	tasksBtn.setAttribute('aria-expanded', store.tasksPanelOpen ? 'true' : 'false')
	tasksBtn.addEventListener('click', onToggleTasks)
	bar.insertBefore(tasksBtn, finishBtn)
}

export function renderTasksPanel(store: RecorderStore): void {
	const root = store.indicatorRoot
	if (!root) return
	const panel = root.querySelector('.panel')
	if (!(panel instanceof HTMLElement)) return
	// Build content once.
	if (!panel.firstChild && store.tasks.length > 0) {
		const ol = document.createElement('ol')
		for (const task of store.tasks) {
			const li = document.createElement('li')
			li.textContent = task.prompt
			ol.appendChild(li)
		}
		panel.appendChild(ol)
	}
	panel.hidden = !store.tasksPanelOpen
	const tasksBtn = root.querySelector('.tasks-btn')
	if (tasksBtn instanceof HTMLElement) {
		tasksBtn.setAttribute('aria-expanded', store.tasksPanelOpen ? 'true' : 'false')
	}
}

export function readTasksPanelOpen(): boolean {
	try { return window.sessionStorage?.getItem(TASKS_PANEL_OPEN_STORAGE_KEY) === '1' } catch { return false }
}
export function writeTasksPanelOpen(open: boolean): void {
	try { window.sessionStorage?.setItem(TASKS_PANEL_OPEN_STORAGE_KEY, open ? '1' : '0') } catch { /* ignore */ }
}

export function micChipState(store: RecorderStore): 'recording' | 'muted' | 'none' | 'connecting' | 'silent' | 'inactive' {
	if (store.indicatorState === 'finishing' || store.indicatorState === 'done' || store.indicatorState === 'error') {
		return 'inactive'
	}
	if (!store.hasMicPermission) {
		// Pending getUserMedia: show "connecting" so granted users never flash
		// the failure copy. Once startRecording resolves or rejects it clears
		// micAcquiring, and we fall through to the terminal "none" state.
		if (store.micAcquiring) return 'connecting'
		return 'none'
	}
	if (store.muted) return 'muted'
	// Permission granted and not muted, but the live track is reading digital
	// silence (dead mic or a virtual silent input device). Warn, non-blocking:
	// recording continues, this just prompts the participant to check their mic.
	if (store.micSilent) return 'silent'
	return 'recording'
}

export function renderIndicatorState(store: RecorderStore): void {
	const root = store.indicatorRoot
	if (!root) return
	const dot = root.querySelector('.dot')
	const mic = root.querySelector<HTMLButtonElement>('.mic')
	const micIcon = root.querySelector('.mic-icon')
	const micLabel = root.querySelector('.mic-label')
	const btn = root.querySelector<HTMLButtonElement>('.finish-btn')
	if (!(dot instanceof HTMLElement) || !mic || !(micIcon instanceof HTMLElement) || !(micLabel instanceof HTMLElement) || !btn) return

	dot.setAttribute('data-state', store.indicatorState)
	const chipState = micChipState(store)
	// The silent-mic warning reuses the existing "none" warning treatment
	// (muted-grey, tappable retry affordance) rather than inventing a new visual
	// — same as the "Mic blocked, tap to retry" failed state, just different copy.
	const micStateAttr = chipState === 'inactive' || chipState === 'silent' ? 'none' : chipState
	mic.setAttribute('data-mic-state', micStateAttr)
	// Distinguish "acquiring" (genuinely failed, actionable) from "connecting"
	// at the attribute level so the dot/visuals key off the right state. The
	// failed terminal chip is a retry affordance; mark it so CSS can style it.
	mic.removeAttribute('data-mic-fail')
	if (chipState === 'none') mic.setAttribute('data-mic-fail', store.micFailReason ?? 'blocked')

	// Finish-button copy is driven by the indicatorState (network / lifecycle).
	switch (store.indicatorState) {
		case 'recording':
		case 'no-audio':
			btn.textContent = 'Finish'
			btn.disabled = false
			break
		case 'finishing':
			btn.textContent = 'Saving'
			btn.disabled = true
			break
		case 'done':
			btn.textContent = 'Done'
			btn.disabled = true
			break
		case 'error':
			btn.textContent = 'Retry'
			btn.disabled = false
			break
	}

	// Mic chip copy + icon. Replay continues in all states; the chip only
	// describes the audio track.
	switch (chipState) {
		case 'recording':
			micIcon.innerHTML = MIC_ICON_SVG
			micLabel.textContent = 'Recording'
			mic.setAttribute('aria-label', 'Mute microphone')
			mic.setAttribute('aria-pressed', 'false')
			mic.removeAttribute('tabindex')
			break
		case 'muted':
			micIcon.innerHTML = MIC_MUTED_ICON_SVG
			micLabel.textContent = 'Muted'
			mic.setAttribute('aria-label', 'Unmute microphone')
			mic.setAttribute('aria-pressed', 'true')
			mic.removeAttribute('tabindex')
			break
		case 'connecting':
			// getUserMedia still pending. Granted users sit here briefly instead
			// of flashing the failure copy. Not yet a toggle, so unfocusable.
			micIcon.innerHTML = MIC_ICON_SVG
			micLabel.textContent = 'Connecting mic'
			mic.setAttribute('aria-label', 'Connecting microphone')
			mic.setAttribute('aria-pressed', 'false')
			mic.setAttribute('tabindex', '-1')
			break
		case 'silent':
			// Permission granted, recording live, but the input is digital
			// silence (dead mic or a virtual silent device). Warn, non-blocking:
			// recording continues. Tappable so the participant can re-acquire the
			// mic after switching their input device. Auto-clears when real audio
			// returns (the monitor flips store.micSilent back to false).
			micIcon.innerHTML = MIC_MUTED_ICON_SVG
			micLabel.textContent = "We can't hear you, tap to recheck"
			mic.setAttribute('aria-label', "We can't hear your microphone. Check your input device, then tap to recheck. Recording continues.")
			mic.setAttribute('aria-pressed', 'false')
			mic.removeAttribute('tabindex')
			break
		case 'none': {
			// Genuinely failed terminal state. Actionable: the chip is a button
			// that re-attempts mic acquisition. Keyboard-focusable (no tabindex
			// -1). Replay keeps recording regardless.
			micIcon.innerHTML = MIC_MUTED_ICON_SVG
			const failLabel =
				store.micFailReason === 'not-found' ? 'No mic found, tap to retry' :
				'Mic blocked, tap to retry'
			const failAria =
				store.micFailReason === 'not-found'
					? 'No microphone found, tap to retry. Replay continues.'
					: 'Microphone blocked, tap to retry. Replay continues.'
			micLabel.textContent = failLabel
			mic.setAttribute('aria-label', failAria)
			mic.setAttribute('aria-pressed', 'false')
			mic.removeAttribute('tabindex')
			break
		}
		case 'inactive':
			micIcon.innerHTML = MIC_ICON_SVG
			micLabel.textContent =
				store.indicatorState === 'finishing' ? 'Saving' :
				store.indicatorState === 'done' ? 'Saved' :
				'Save failed'
			mic.setAttribute('aria-label', 'Recording stopped')
			mic.setAttribute('aria-pressed', 'false')
			mic.setAttribute('tabindex', '-1')
			break
	}
}

export function renderNotesCount(store: RecorderStore): void {
	const root = store.indicatorRoot
	if (!root) return
	const noteBtn = root.querySelector('.note-btn')
	const count = root.querySelector('.note-count')
	if (!(noteBtn instanceof HTMLElement) || !(count instanceof HTMLElement)) return
	const n = store.notes.length
	noteBtn.setAttribute('data-has-notes', n > 0 ? 'true' : 'false')
	if (n > 0) {
		count.textContent = String(n)
		count.hidden = false
		noteBtn.setAttribute('aria-label', `Add a timestamped note (${n} so far)`)
	} else {
		count.textContent = ''
		count.hidden = true
		noteBtn.setAttribute('aria-label', 'Add a timestamped note')
	}
}

export function showMuteToast(store: RecorderStore): void {
	if (store.muteToastShown) return
	store.muteToastShown = true
	const root = store.indicatorRoot
	if (!root) return
	const slot = root.querySelector('.toast-slot')
	if (!(slot instanceof HTMLElement)) return
	slot.innerHTML = ''
	const toast = document.createElement('div')
	toast.className = 'toast'
	toast.setAttribute('role', 'status')
	toast.innerHTML = `<strong>Mic off.</strong> Screen is still recording. Tap to unmute.`
	slot.appendChild(toast)
	const outer = window.setTimeout(() => {
		if (!toast.isConnected) return
		toast.setAttribute('data-leaving', 'true')
		const inner = window.setTimeout(() => {
			if (toast.isConnected) toast.remove()
		}, 260)
		store.muteToastTimers.push(inner)
	}, 3000)
	store.muteToastTimers.push(outer)
}

// Brief, unobtrusive confirmation that recording picked back up after the
// participant returned from a hard navigation (e.g. an OAuth round-trip). It
// reuses the toast slot above the bar and the shared toast-in/out animations,
// but with the live-record red accent so it reassures rather than warns. Shows
// once, then auto-dismisses; clears store.resumed so a later render can't
// re-fire it. Reduced-motion is handled in CSS (no slide, instant fade).
export function showResumedToast(store: RecorderStore): void {
	if (!store.resumed) return
	store.resumed = false
	// Only show the reassuring "Recording resumed" pill when the mic genuinely
	// came back live. If getUserMedia rejected on resume (blocked / no device /
	// unsupported -> hasMicPermission false, indicatorState 'no-audio'), a green
	// pill claiming we're recording would be a lie while audio is dead. Bail and
	// let the existing mic-blocked affordance (the mic chip in its failed state)
	// carry the message instead. Same signal the mic chip gates on (line ~1119).
	if (!store.hasMicPermission || store.indicatorState === 'no-audio') return
	const root = store.indicatorRoot
	if (!root) return
	const slot = root.querySelector('.toast-slot')
	if (!(slot instanceof HTMLElement)) return
	slot.innerHTML = ''
	const toast = document.createElement('div')
	toast.className = 'resume-toast'
	toast.setAttribute('role', 'status')
	const dot = document.createElement('span')
	dot.className = 'dot'
	dot.setAttribute('aria-hidden', 'true')
	const label = document.createElement('span')
	label.textContent = 'Recording resumed'
	toast.appendChild(dot)
	toast.appendChild(label)
	slot.appendChild(toast)
	const outer = window.setTimeout(() => {
		if (!toast.isConnected) return
		toast.setAttribute('data-leaving', 'true')
		const inner = window.setTimeout(() => {
			if (toast.isConnected) toast.remove()
		}, 260)
		store.resumeToastTimers.push(inner)
	}, 3200)
	store.resumeToastTimers.push(outer)
}

export function openNotePopover(store: RecorderStore, onSave: (text: string) => void, onCancel: () => void): void {
	const root = store.indicatorRoot
	if (!root) return
	const pop = root.querySelector('.note-popover')
	const noteBtn = root.querySelector('.note-btn')
	if (!(pop instanceof HTMLElement) || !(noteBtn instanceof HTMLElement)) return

	store.notesPopoverOpen = true
	store.notePopoverAtMs = Date.now() - store.startedAt
	noteBtn.setAttribute('aria-expanded', 'true')

	pop.innerHTML = ''
	const head = document.createElement('div')
	head.className = 'note-head'
	head.innerHTML = `<span>Add a note</span>`

	const form = document.createElement('form')
	form.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin:0;'
	form.noValidate = true

	const ta = document.createElement('textarea')
	ta.className = 'note-textarea'
	ta.placeholder = 'What just happened? Confusing? Surprising? Broken?'
	ta.rows = 3
	ta.setAttribute('aria-label', 'Note text')

	const actions = document.createElement('div')
	actions.className = 'note-actions'
	const hint = document.createElement('span')
	hint.className = 'hint'
	hint.innerHTML = '<kbd style="font-family:inherit">Cmd</kbd>+Enter to save'
	const group = document.createElement('div')
	group.className = 'group'
	const cancelBtn = document.createElement('button')
	cancelBtn.type = 'button'
	cancelBtn.className = 'btn btn-ghost'
	cancelBtn.textContent = 'Cancel'
	const saveBtn = document.createElement('button')
	saveBtn.type = 'submit'
	saveBtn.className = 'btn btn-primary'
	saveBtn.textContent = 'Save'
	group.appendChild(cancelBtn)
	group.appendChild(saveBtn)
	actions.appendChild(hint)
	actions.appendChild(group)

	form.appendChild(ta)
	form.appendChild(actions)

	pop.appendChild(head)
	pop.appendChild(form)
	pop.hidden = false

	const submit = (): void => {
		const text = ta.value.trim()
		if (!text) { onCancel(); return }
		onSave(text)
	}
	form.addEventListener('submit', e => { e.preventDefault(); submit() })
	cancelBtn.addEventListener('click', () => onCancel())
	ta.addEventListener('keydown', e => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault()
			submit()
		} else if (e.key === 'Escape') {
			e.preventDefault()
			onCancel()
		}
	})

	// Autofocus on next frame so animation can finish without scroll jank.
	window.requestAnimationFrame(() => { ta.focus({ preventScroll: true }) })
}

export function closeNotePopover(store: RecorderStore): void {
	const root = store.indicatorRoot
	if (!root) return
	const pop = root.querySelector('.note-popover')
	const noteBtn = root.querySelector('.note-btn')
	if (pop instanceof HTMLElement) {
		pop.hidden = true
		pop.innerHTML = ''
	}
	if (noteBtn instanceof HTMLElement) noteBtn.setAttribute('aria-expanded', 'false')
	store.notesPopoverOpen = false
	store.notePopoverAtMs = null
}

// Escape user-controlled strings before they touch innerHTML. The payout email
// comes from our own DB, but it originated as participant input, so treat it as
// untrusted and never interpolate it raw into markup.
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

function isValidEmail(value: string): boolean {
	// Pragmatic check; the server re-validates with zod .email().
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function showThanksScreen(root: ShadowRoot, opts: ThanksOptions): void {
	const overlay = document.createElement('div')
	overlay.className = 'thanks'
	overlay.setAttribute('role', 'dialog')
	overlay.setAttribute('aria-modal', 'true')

	const card = document.createElement('div')
	card.className = 'thanks-card'
	overlay.appendChild(card)
	root.appendChild(overlay)

	// Ended-early branch: warmer, non-punishing, keep Resume primary.
	if (opts.payment && !opts.payment.qualified) {
		renderEndedEarly(card, opts)
		return
	}

	// Complete branch (also the fallback when payment is null: a clean "saved"
	// confirmation with the wrap-up note, no payout block since we have no data).
	renderComplete(card, opts)
}

// Terminal notice shown when a resume attempt finds the session already closed
// (server returned 409/410 on adopt, e.g. the participant took too long on a
// third-party sign-in and the stale sweep finalised it). Reuses the ended-early
// screen's overlay + card so it matches the recorder's visual language exactly,
// but renders a single calm, honest message with no actions: the test is over,
// there is nothing to resume. Copy does not over-promise: it says earlier
// responses were saved, which is true because the session was finalised
// server-side, so any recording already uploaded is intact.
export function showSessionEndedScreen(root: ShadowRoot): void {
	// Don't stack a second overlay if a thanks/ended screen is already up.
	if (root.querySelector('.thanks')) return

	const overlay = document.createElement('div')
	overlay.className = 'thanks'
	overlay.setAttribute('role', 'dialog')
	overlay.setAttribute('aria-modal', 'true')

	const card = document.createElement('div')
	card.className = 'thanks-card'
	const head = document.createElement('div')
	head.className = 'head'
	head.innerHTML = `
		<div class="check ended" aria-hidden="true">${FLAG_ICON_SVG}</div>
		<h2>This test session ended</h2>
		<p class="lede">Thanks for taking part. Your earlier responses were saved. You can close this tab.</p>
	`
	card.appendChild(head)
	overlay.appendChild(card)
	root.appendChild(overlay)
}

// Builds the verified-checks list. `done` rows get the green tick; an unfinished
// tasks row (ended-early) gets the hollow todo dot.
function checksList(rows: Array<{ label: string; done: boolean; muted?: boolean }>): string {
	const items = rows
		.map(r => {
			const icClass = r.done ? 'ic done' : 'ic todo'
			const icon = r.done ? TICK_SM_SVG : ''
			const liClass = r.muted ? ' class="muted-row"' : ''
			return `<li${liClass}><span class="${icClass}" aria-hidden="true">${icon}</span><span>${escapeHtml(r.label)}</span></li>`
		})
		.join('')
	return `<ul class="checks">${items}</ul>`
}

function renderComplete(card: HTMLElement, opts: ThanksOptions): void {
	const payment = opts.payment
	const reward = payment?.reward ?? null
	const defaultEmail = payment?.payoutEmail ?? null
	const tasksTotal = payment?.tasksTotal ?? 0

	const head = document.createElement('div')
	head.className = 'head'
	const lede = reward
		? `We have your recording. Confirm where to send your ${escapeHtml(reward)} and the team will review it shortly.`
		: 'We have your recording. Thanks for taking the time to walk us through it.'
	head.innerHTML = `
		<div class="check ok" aria-hidden="true">${TICK_ICON_SVG}</div>
		<h2>You're done.</h2>
		<p class="lede">${lede}</p>
		${tasksTotal > 0
			? checksList([
					{ label: tasksTotal === 1 ? '1 task completed' : `All ${tasksTotal} tasks completed`, done: true },
					{ label: 'Voice recording captured', done: true },
					{ label: 'Screen replay uploaded', done: true },
				])
			: checksList([
					{ label: 'Voice recording captured', done: true },
					{ label: 'Screen replay uploaded', done: true },
				])}
	`
	card.appendChild(head)

	// If we have no payment data (older server) skip payout entirely and go
	// straight to the wrap-up note.
	if (!payment) {
		appendNoteSection(card, opts, 'Your session was saved. Anything you would add?')
		return
	}

	renderPayout(card, opts, reward, defaultEmail)
}

// Payout capture: one-tap default to the sign-up email, with a quieter expander
// to use a different email. Progressive disclosure (the default path is not a form).
function renderPayout(card: HTMLElement, opts: ThanksOptions, reward: string | null, defaultEmail: string | null): void {
	const wrap = document.createElement('div')
	wrap.className = 'payout'

	const rewardLabel = reward ?? 'my reward'
	const haveDefault = !!defaultEmail && isValidEmail(defaultEmail)

	wrap.innerHTML = `
		<p class="payout-q">Where should we send ${escapeHtml(reward ?? 'your reward')}?</p>
		<button type="button" class="pay-primary" ${haveDefault ? '' : 'hidden'}>
			Send <span class="amt">${escapeHtml(rewardLabel)}</span>${haveDefault ? ` to ${escapeHtml(defaultEmail as string)}` : ''}
		</button>
		<button type="button" class="pay-alt">${haveDefault ? 'Use a different email' : 'Add your payout email'}</button>
		<div class="pay-edit" ${haveDefault ? 'hidden' : ''}>
			<label class="pay-label" for="usero-payout-email">Payout email</label>
			<input id="usero-payout-email" class="pay-input" type="email" inputmode="email"
				autocomplete="email" placeholder="you@example.com" value="${haveDefault ? '' : escapeHtml(defaultEmail ?? '')}" />
		</div>
		<p class="pay-eta">Reward arrives within about 2 days of the team reviewing it.</p>
	`
	card.appendChild(wrap)

	const primary = wrap.querySelector<HTMLButtonElement>('.pay-primary')
	const altLink = wrap.querySelector<HTMLButtonElement>('.pay-alt')
	const editBox = wrap.querySelector<HTMLElement>('.pay-edit')
	const emailInput = wrap.querySelector<HTMLInputElement>('.pay-input')
	if (!primary || !altLink || !editBox || !emailInput) return

	const confirm = async (destination: string | null): Promise<void> => {
		primary.disabled = true
		altLink.style.pointerEvents = 'none'
		const ok = await opts.onPayout(destination)
		// Whatever the network outcome, the session is payable (server defaults to
		// the sign-up email). Move the participant forward rather than trapping them.
		wrap.remove()
		const confirmedTo = destination ?? defaultEmail
		const sentMsg = confirmedTo
			? `${reward ? `${reward} is` : "Your reward is"} set to go to ${confirmedTo}.`
			: 'Your reward is on its way.'
		const note = ok ? sentMsg : `${sentMsg} (We will retry sending the details.)`
		appendNoteSection(card, opts, `${note} Anything you would add before you go?`)
	}

	// One-tap default path.
	primary.addEventListener('click', () => { void confirm(null) })

	// Expander: reveal the email field, focus it, submit on Enter.
	const openEditor = (): void => {
		primary.hidden = true
		altLink.hidden = true
		editBox.hidden = false
		// Append a confirm button under the input on first open.
		if (!editBox.querySelector('.pay-confirm')) {
			const btn = document.createElement('button')
			btn.type = 'button'
			btn.className = 'pay-primary pay-confirm'
			btn.style.marginTop = '12px'
			btn.textContent = reward ? `Send ${reward} here` : 'Use this email'
			editBox.appendChild(btn)
			btn.addEventListener('click', () => void submitEmail())
		}
		window.requestAnimationFrame(() => emailInput.focus({ preventScroll: true }))
	}

	const submitEmail = async (): Promise<void> => {
		const value = emailInput.value.trim().toLowerCase()
		if (!isValidEmail(value)) {
			emailInput.focus()
			emailInput.style.borderColor = '#dc2626'
			return
		}
		await confirm(value)
	}

	altLink.addEventListener('click', openEditor)
	emailInput.addEventListener('input', () => { emailInput.style.borderColor = '' })
	emailInput.addEventListener('keydown', e => {
		if (e.key === 'Enter') { e.preventDefault(); void submitEmail() }
	})
}

function renderEndedEarly(card: HTMLElement, opts: ThanksOptions): void {
	const payment = opts.payment
	const done = payment?.tasksDone ?? 0
	const total = payment?.tasksTotal ?? 0
	const reward = payment?.reward ?? null

	const head = document.createElement('div')
	head.className = 'head'
	const lede = total > 0
		? `We saw ${done} of ${total} ${total === 1 ? 'task' : 'tasks'} finished. No worries, you can pick up right where you left off.`
		: 'It looks like the session ended before you finished. No worries, you can pick up where you left off.'
	head.innerHTML = `
		<div class="check early" aria-hidden="true">${CLOCK_ICON_SVG}</div>
		<h2>Looks like you stopped early</h2>
		<p class="lede">${lede}</p>
	`
	card.appendChild(head)

	// Per-task progress when we know the counts: done rows ticked, the rest hollow.
	if (total > 0) {
		const rows: Array<{ label: string; done: boolean }> = []
		for (let i = 0; i < total; i += 1) {
			rows.push({ label: `Task ${i + 1}`, done: i < done })
		}
		const list = document.createElement('div')
		list.innerHTML = checksList(rows)
		const ul = list.firstElementChild
		if (ul) card.appendChild(ul)
	}

	const note = document.createElement('div')
	note.className = 'early-note'
	note.innerHTML = `${SPARK_ICON_SVG}<span><strong style="font-weight:600">Resume the test.</strong> ${
		reward ? `Your ${escapeHtml(reward)} reward unlocks` : 'The reward unlocks'
	} once all ${total > 0 ? total : 'the'} ${total === 1 ? 'task is' : 'tasks are'} done.</span>`
	card.appendChild(note)

	const actions = document.createElement('div')
	actions.className = 'early-actions'
	const resume = document.createElement('button')
	resume.type = 'button'
	resume.className = 'resume-btn'
	resume.textContent = 'Resume where I left off'
	const exit = document.createElement('button')
	exit.type = 'button'
	exit.className = 'exit-btn'
	exit.textContent = "Thanks for trying. No reward this time since the tasks weren't finished."
	actions.appendChild(resume)
	actions.appendChild(exit)
	card.appendChild(actions)

	resume.addEventListener('click', () => {
		const overlay = card.closest('.thanks')
		if (overlay instanceof HTMLElement) overlay.remove()
		opts.onResume()
	})
	exit.addEventListener('click', () => {
		card.innerHTML = ''
		const sent = document.createElement('p')
		sent.className = 'end-sent'
		sent.textContent = 'Thanks for giving it a go. You can close this tab now.'
		card.appendChild(sent)
	})
}

// The wrap-up note section, shared by the complete path (after payout) and the
// older-server fallback. Mirrors the prior behaviour: Cmd/Ctrl+Enter to send,
// retry on failure, skip allowed.
function appendNoteSection(card: HTMLElement, opts: ThanksOptions, prompt: string): void {
	const section = document.createElement('div')
	section.className = 'note-section'

	const form = document.createElement('form')
	form.noValidate = true
	form.innerHTML = `
		<label class="end-label" for="usero-end-note">${escapeHtml(prompt)}</label>
		<textarea
			id="usero-end-note"
			class="end-textarea"
			rows="3"
			placeholder="Confusing bits, things you liked, what you'd change..."
		></textarea>
		<div class="end-actions">
			<button type="button" class="skip">Skip</button>
			<button type="submit" class="primary">Send feedback</button>
		</div>
		<p class="end-hint">Cmd or Ctrl plus Enter to send. Either button is fine.</p>
	`
	section.appendChild(form)
	card.appendChild(section)

	const ta = form.querySelector<HTMLTextAreaElement>('#usero-end-note')
	const skipBtn = form.querySelector<HTMLButtonElement>('button.skip')
	if (!ta || !skipBtn) return

	const swapToSent = (message: string): void => {
		section.remove()
		const sent = document.createElement('p')
		sent.className = 'end-sent'
		sent.textContent = message
		card.appendChild(sent)
	}

	const ERROR_CLASS = 'end-error'
	const showError = (message: string): void => {
		const prior = form.querySelector(`.${ERROR_CLASS}`)
		if (prior) prior.remove()
		const err = document.createElement('p')
		err.className = ERROR_CLASS
		err.textContent = message
		err.setAttribute('role', 'alert')
		err.style.cssText = 'margin:10px 0 0;font-size:12.5px;color:#b91c1c;text-align:center;'
		form.appendChild(err)
	}

	const submit = async (): Promise<void> => {
		const text = ta.value.trim()
		ta.disabled = true
		skipBtn.disabled = true
		const submitBtn = form.querySelector<HTMLButtonElement>('button.primary')
		if (submitBtn) submitBtn.disabled = true
		if (text) {
			try {
				await Promise.race([
					Promise.resolve(opts.onSubmitNote(text)),
					new Promise<never>((_, reject) => {
						window.setTimeout(() => reject(new Error('timeout')), 30000)
					}),
				])
				swapToSent('Thanks. You can close this tab.')
			} catch {
				ta.disabled = false
				skipBtn.disabled = false
				if (submitBtn) submitBtn.disabled = false
				showError("Couldn't save your note. Try again?")
			}
		} else {
			opts.onSkip()
			swapToSent('All set. You can close this tab.')
		}
	}

	form.addEventListener('submit', e => { e.preventDefault(); void submit() })
	skipBtn.addEventListener('click', () => { ta.value = ''; void submit() })
	ta.addEventListener('keydown', e => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault()
			void submit()
		}
	})

	window.requestAnimationFrame(() => { ta.focus({ preventScroll: true }) })
}
