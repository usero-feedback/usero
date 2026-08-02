// CSS used by both entry points.
//
// React entry injects it once into <head> via injectFeedbackCSS().
// Vanilla entry injects it inside a shadow root, so host page styles
// can't bleed in and our class names can't collide with the host.

export const FEEDBACK_CSS = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.fb-es {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding-bottom: 8px;
}

.fb-ec {
  border-radius: 16px;
  padding: 0 5px;
  transition: all 300ms cubic-bezier(0.68, -0.55, 0.265, 1.55);
  border: 3px solid transparent;
  cursor: pointer;
  text-align: center;
}

.fb-ec--sel {
  border-color: #2563eb;
  transform: scale(1.05);
  box-shadow: 0 4px 15px rgba(37, 99, 235, 0.2);
}

.fb-ec--hov:not(.fb-ec--sel) {
  transform: scale(1.05);
}

.fb-eb {
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: 0;
  transition: all 200ms ease;
}

.fb-ei {
  font-size: 36px;
  transition: transform 200ms ease;
}

.fb-ei--hov {
  transform: scale(1.1);
}

.fb-el {
  font-size: 13px;
  font-weight: 600;
  color: currentColor;
  line-height: 1.2;
}

.fb-hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 4px;
  margin-bottom: 10px;
}

.fb-msg {
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  margin-bottom: 8px;
  border-radius: 6px;
}

.fb-msg--header {
  font-size: 12px;
  padding: 4px 8px;
  margin-bottom: 0;
  margin-left: auto;
  margin-right: 8px;
}

.fb-msg--ok {
  background-color: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #16a34a;
}

.fb-msg--err {
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
}

.fb-sub {
  width: 100%;
  padding: 12px 24px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.fb-sub--dis {
  cursor: not-allowed;
  opacity: 0.5;
}

.fb-spin {
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.fb-cnt {
  padding: 20px 24px 16px;
  overflow: auto;
  max-height: calc(90vh - 48px);
}

.fb-ttl {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.fb-ta {
  width: 100%;
  min-height: 80px;
  padding: 10px;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  resize: vertical;
  transition: border-color 150ms ease;
  margin-bottom: 2px;
  box-sizing: border-box;
}

.fb-toolrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.fb-charcount {
  font-size: 12px;
  margin-left: auto;
  text-align: right;
}

.fb-charcount--low {
  color: #dc2626;
}

.fb-email {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.fb-email-lbl {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.fb-email-cb {
  margin: 0;
  cursor: pointer;
}

.fb-email-inp {
  width: 100%;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  transition: border-color 150ms ease;
  box-sizing: border-box;
}

.fb-btn {
  position: fixed;
  width: 50px;
  height: 50px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all 300ms cubic-bezier(0.68, -0.55, 0.265, 1.55);
  z-index: 9998;
  color: #ffffff;
  top: 50%;
  transform: translateY(-50%);
  box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  box-sizing: border-box;
}

.fb-btn--right {
  right: -25px;
  border-radius: 40px 0 0 40px;
  padding-right: 8px;
  box-shadow: -4px 0 15px rgba(37, 99, 235, 0.3);
}

.fb-btn--left {
  left: -25px;
  border-radius: 0 40px 40px 0;
  padding-left: 8px;
  box-shadow: 4px 0 15px rgba(37, 99, 235, 0.3);
}

.fb-btn--right.fb-btn--open {
  right: -15px;
  transform: translateY(-50%) scale(1.05);
}

.fb-btn--left.fb-btn--open {
  left: -15px;
  transform: translateY(-50%) scale(1.05);
}

.fb-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.3);
  transition: opacity 300ms ease;
  z-index: 9999;
  backdrop-filter: blur(8px);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  box-sizing: border-box;
}

.fb-pnl-base {
  position: fixed;
  top: 10vh;
  width: 400px;
  max-width: 90vw;
  max-height: 60vh;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  transition: transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  border-radius: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  box-sizing: border-box;
}

.fb-pnl--right { right: 0; }
.fb-pnl--right.fb-pnl--open { transform: translateX(0px); }
.fb-pnl--right.fb-pnl--closed { transform: translateX(100%); }

.fb-pnl--left { left: 0; }
.fb-pnl--left.fb-pnl--open { transform: translateX(0px); }
.fb-pnl--left.fb-pnl--closed { transform: translateX(-100%); }

.fb-close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  opacity: 0.7;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 150ms ease;
}

.fb-up {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.fb-upb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 8px 12px;
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 150ms ease, opacity 150ms ease;
  font-family: inherit;
}

.fb-upb:hover:not(.fb-upb--dis) {
  background-color: rgba(37, 99, 235, 0.06);
}

.fb-upb--dis {
  cursor: not-allowed;
  opacity: 0.5;
}

.fb-ups {
  width: 12px;
  height: 12px;
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  display: inline-block;
}

.fb-up-extras {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fb-upe {
  font-size: 12px;
  color: #dc2626;
}

.fb-ss {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fb-sp {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.fb-si {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.fb-sr {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.fb-sr:hover {
  background: rgba(0, 0, 0, 0.85);
}

.fb-sl {
  font-size: 11px;
  opacity: 0.6;
}

/* Visually hidden, kept for screen readers (dialog label in tabbed views). */
.fb-vh {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* What's new: launcher unread dot. Anchored to the visible half of the
   half-offscreen launcher (right-positioned buttons show their left edge
   and vice versa). White keyline separates it from the launcher gradient
   in both themes; a slow ping halo draws the eye without nagging. */
@keyframes fb-wn-ping {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.45); }
  70%, 100% { box-shadow: 0 0 0 7px rgba(239, 68, 68, 0); }
}
.fb-wn-dot {
  position: absolute;
  top: 8px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid #ffffff;
  box-sizing: content-box;
  animation: fb-wn-ping 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.fb-btn--right .fb-wn-dot { left: 7px; }
.fb-btn--left .fb-wn-dot { right: 7px; }
@media (prefers-reduced-motion: reduce) {
  .fb-wn-dot { animation: none; }
}

/* What's new: panel tabs. Underline style so the row reads as one header;
   the active tab's 2px underline overlaps the row's 1px hairline. */
.fb-tabs {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 14px;
}
.fb-tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  padding: 2px 1px 10px;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  font-family: inherit;
  opacity: 0.55;
  display: inline-flex;
  align-items: center;
  transition: opacity 150ms ease;
}
.fb-tab:hover {
  opacity: 0.85;
}
.fb-tab--active,
.fb-tab--active:hover {
  opacity: 1;
}
.fb-tabs .fb-close-btn {
  margin-left: auto;
  margin-bottom: 7px;
}
.fb-tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  margin-left: 7px;
  border-radius: 9px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

/* What's new: entries view */
.fb-wn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 6px;
}

/* Shipped for you: the hero card. Primary-tinted surface so it inherits
   the client's accent color in any theme. */
.fb-wn-yours {
  border-radius: 12px;
  padding: 14px 16px 13px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 10px;
}
.fb-wn-sec-ttl {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.fb-wn-sec-ttl svg {
  flex: none;
}
.fb-wn-yours-item {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.fb-wn-quote {
  font-size: 13px;
  font-style: italic;
  line-height: 1.5;
  padding-left: 10px;
  opacity: 0.9;
}
.fb-wn-pr {
  font-size: 11.5px;
  opacity: 0.7;
  line-height: 1.4;
  word-break: break-word;
}
.fb-wn-pr-title {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 500;
}
.fb-wn-item-ttl {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  text-decoration: none;
}
.fb-wn-link:hover {
  text-decoration: underline;
}
.fb-wn-list {
  display: flex;
  flex-direction: column;
}
.fb-wn-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 13px 0;
}
.fb-wn-item:first-child {
  padding-top: 4px;
}
.fb-wn-item:last-child {
  border-bottom: none !important;
  padding-bottom: 6px;
}
.fb-wn-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fb-wn-type {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 7px;
  border-radius: 99px;
  background: rgba(107, 114, 128, 0.12);
  line-height: 1.4;
}
.fb-wn-type--new {
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
}
.fb-wn-type--improvement {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
}
.fb-wn-type--fix {
  background: rgba(245, 158, 11, 0.15);
  color: #b45309;
}
.fb-wn--dark .fb-wn-type--new {
  background: rgba(96, 165, 250, 0.16);
  color: #93c5fd;
}
.fb-wn--dark .fb-wn-type--improvement {
  background: rgba(52, 211, 153, 0.14);
  color: #6ee7b7;
}
.fb-wn--dark .fb-wn-type--fix {
  background: rgba(251, 191, 36, 0.14);
  color: #fcd34d;
}
.fb-wn-date {
  font-size: 12px;
  opacity: 0.55;
}
.fb-wn-excerpt {
  font-size: 13px;
  line-height: 1.45;
  opacity: 0.75;
}
.fb-wn-board {
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  align-self: flex-start;
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.fb-wn-board:hover {
  text-decoration: underline;
}
.fb-wn-board-arrow {
  display: inline-block;
  transition: transform 150ms ease;
}
.fb-wn-board:hover .fb-wn-board-arrow {
  transform: translateX(2px);
}

@media (max-width: 768px) {
  .fb-pnl-base {
    width: 100% !important;
    max-width: none !important;
    top: 4vh !important;
    max-height: 92vh !important;
  }
  .fb-cnt { padding: 16px 18px 14px !important; max-height: calc(100vh - 40px) !important; }
  .fb-ta { font-size: 16px !important; min-height: 64px !important; }
  .fb-ttl { font-size: 18px !important; }
  .fb-ei { font-size: 24px !important; }
  .fb-el { font-size: 11px !important; }
  .fb-sub { padding: 12px 20px !important; font-size: 16px !important; }
}
`

export function injectFeedbackCSS(): void {
	if (typeof document === 'undefined') return
	const styleId = 'usero-feedback-widget-css'
	if (document.getElementById(styleId)) return
	const style = document.createElement('style')
	style.id = styleId
	style.textContent = FEEDBACK_CSS
	document.head.appendChild(style)
}
