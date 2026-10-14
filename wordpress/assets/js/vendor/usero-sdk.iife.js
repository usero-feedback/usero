// @usero/sdk v1.6.3 (vendored 2026-10-14 from ../../dist/usero.iife.js by scripts/sync-wp-vendor.mjs)
var Usero=(function(exports){'use strict';var He={1:"\u{1F61E}",2:"\u{1F610}",3:"\u{1F60A}",4:"\u{1F929}"},ie={1:"Needs work",2:"It's okay",3:"Pretty good",4:"Amazing!"},ze={1:"linear-gradient(135deg,#ff6b6b14,#ff6b6b1f)",2:"linear-gradient(135deg,#9ca3af0f,#9ca3af1a)",3:"linear-gradient(135deg,#3b82f614,#3b82f61f)",4:"linear-gradient(135deg,#f59e0b14,#f59e0b1f)"},Z="https://usero.io",ye={primary:"#2563eb",background:"#ffffff",text:"#374151",border:"#e5e7eb",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"},oe={primary:"#2563eb",background:"#1f2937",text:"#f9fafb",border:"#374151",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)"};function mt(e={}){return {...ye,...e}}function ht(e){return typeof e=="object"&&e!==null&&"error"in e}function yt(e){if(typeof e!="object"||e===null)return {success:false,error:"Invalid response"};let t=e,r=t.success===true,o=typeof t.error=="string"?t.error:void 0,s=t.screenshot,i;if(typeof s=="object"&&s!==null){let a=s;typeof a.fileName=="string"&&typeof a.url=="string"&&typeof a.fileSize=="number"&&typeof a.mimeType=="string"&&(i={fileName:a.fileName,url:a.url,fileSize:a.fileSize,mimeType:a.mimeType,width:typeof a.width=="number"?a.width:void 0,height:typeof a.height=="number"?a.height:void 0});}return {success:r,error:o,screenshot:i}}var se=class{constructor(t=Z){this.baseUrl=t.replace(/\/$/,"");}async submitFeedback(t){try{let r=await fetch(`${this.baseUrl}/api/feedback`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(t),signal:AbortSignal.timeout(1e4)});if(!r.ok){let i=`HTTP ${r.status}: ${r.statusText}`;try{let a=await r.json();ht(a)&&typeof a.error=="string"&&(i=a.error);}catch{}throw new Error(i)}let o=await r.json(),s=typeof o=="object"&&o!==null&&"message"in o&&typeof o.message=="string"?o.message:"Feedback submitted successfully";return {success:!0,data:o,message:s}}catch(r){return {success:false,error:r instanceof Error?r.message:"An unexpected error occurred"}}}async uploadScreenshot(t,r){let o=new FormData;o.append("screenshot",t),o.append("clientId",r);let s=await fetch(`${this.baseUrl}/api/screenshots`,{method:"POST",body:o,signal:AbortSignal.timeout(3e4)}),i={success:false};try{let a=await s.json();i=yt(a);}catch{}if(!s.ok||!i.success||!i.screenshot){let a=i.error??`HTTP ${s.status}: ${s.statusText}`;throw new Error(a)}return i.screenshot}ping(t){fetch(`${this.baseUrl}/api/ping?clientId=${encodeURIComponent(t)}`,{signal:AbortSignal.timeout(5e3)}).catch(()=>{});}};function xt(e){if(e.startsWith("#")||typeof document>"u")return e;let r=document.createElement("canvas").getContext("2d");return r?(r.fillStyle=e,r.fillStyle):e}function xe(e){let t=xt(e);if(!t.startsWith("#")||t.length<7)return t;let r=parseInt(t.slice(1,3),16),o=parseInt(t.slice(3,5),16),s=parseInt(t.slice(5,7),16),i=Math.max(0,r-60),a=Math.min(255,o+40),f=Math.min(255,s+20);return `#${[i,a,f].map(b=>b.toString(16).padStart(2,"0")).join("")}`}var ae="usero:anonymous-id",le="usero:session-replay:sdk-session-id",j=null,H=null,ce=null,de=null,ee=null;function ve(){if(typeof crypto<"u"&&typeof crypto.randomUUID=="function")return crypto.randomUUID();let e=new Uint8Array(16);if(typeof crypto<"u"&&typeof crypto.getRandomValues=="function")crypto.getRandomValues(e);else for(let r=0;r<e.length;r+=1)e[r]=Math.floor(Math.random()*256);let t="";for(let r of e)t+=r.toString(16).padStart(2,"0");return t}function vt(e){if(typeof window>"u")return null;try{return window.localStorage?.getItem(e)??null}catch{return null}}function We(e,t){if(!(typeof window>"u"))try{window.localStorage?.setItem(e,t);}catch{}}function kt(e){if(typeof window>"u")return null;try{return window.sessionStorage?.getItem(e)??null}catch{return null}}function Be(e,t){if(!(typeof window>"u"))try{window.sessionStorage?.setItem(e,t);}catch{}}function ke(){if(j)return j;let e=vt(ae);if(e&&/^[a-z0-9-]{8,}$/i.test(e))return j=e,e;let t=ve();return We(ae,t),j=t,t}function St(){let e=ve();return j=e,We(ae,e),ee=null,ce=null,e}function _e(e){return /^[a-z0-9-]{8,}$/i.test(e)}function Se(){if(H)return H;let e=kt(le);if(e&&_e(e))return H=e,e;let t=ve();return Be(le,t),H=t,t}function we(e){_e(e)&&H!==e&&(H=e,Be(le,e));}function Ne(){return ce}function je(e){de===null&&(de=e);}function qe(){return de}function wt(e,t){let r=t.traits??{},s=Object.keys(r).sort().map(i=>[i,r[i]??null]);return JSON.stringify([e,t.id,t.email??null,t.displayName??null,s])}async function Ge(e,t){let r=ke();ce=t.id;let o=wt(r,t);if(o===ee)return  false;let s=`${e.apiUrl.replace(/\/$/,"")}/api/identify`,i=JSON.stringify({clientId:e.clientId,anonymousId:r,externalUserId:t.id,email:t.email,displayName:t.displayName,traits:t.traits});if(typeof document<"u"&&document.visibilityState==="hidden"&&typeof navigator<"u"&&typeof navigator.sendBeacon=="function")try{let a=new Blob([i],{type:"application/json"});if(navigator.sendBeacon(s,a))return ee=o,!0}catch{}try{let a=await fetch(s,{method:"POST",headers:{"Content-Type":"application/json"},body:i,keepalive:!0});if(!a.ok)return !0;try{let f=await a.json();f&&f.accepted===!0&&(ee=o);}catch{}return !0}catch{return  false}}function Ke(){St();}var Ve={ANON_STORAGE_KEY:ae,SDK_SESSION_STORAGE_KEY:le,reseatSdkSessionId:we,getOrMintSdkSessionId:Se,resetIdentityState:()=>{j=null,H=null,ce=null,de=null,ee=null;}};function Je(e){let t=`[usero:${e}]`;return {debug:(...r)=>{typeof console<"u"&&console.debug(t,...r);},info:(...r)=>{typeof console<"u"&&console.info(t,...r);},warn:(...r)=>{typeof console<"u"&&console.warn(t,...r);},error:(...r)=>{typeof console<"u"&&console.error(t,...r);}}}function Ye(e,t){let r=e;for(let o of t){if(!o||typeof o!="object")continue;let{metadata:s,...i}=o;r={...r,...i},s&&typeof s=="object"&&(r.metadata={...r.metadata??{},...s});}return r}function Xe(e,t){let r=t.user,o=t.getUser,s=null,i,a,f;function b(g){let d=g??null;if(d){if(d.id===s&&d.traits===i&&d.email===a&&d.displayName===f)return;Ge(e,d),s=d.id,i=d.traits,a=d.email,f=d.displayName;}else s!==null&&(Ke(),s=null,i=void 0,a=void 0,f=void 0);}function x(){if(o)try{b(o()??null);}catch{}}return t.user!==void 0?b(t.user):o&&x(),{identify:g=>{r=g,b(g);},setUserProp:g=>{r=g,b(g);},setGetUser:g=>{o=g;},resolveUser:()=>{r!==void 0?b(r):x();}}}function Qe(e){let{clientId:t,apiUrl:r,plugins:o,resolveUser:s,environment:i}=e,a=new Map,f=new Map,b=false,x=[];for(let d of o){let m={clientId:t,baseUrl:r,environment:i,logger:Je(d.name),getStore:()=>a.get(d.name),setStore:h=>{a.set(d.name,h);},resolveUser:()=>{b||s();},getSdkSessionId:()=>Se(),reseatSdkSessionId:h=>we(h),getAnonymousId:()=>ke(),getUserId:()=>Ne(),getReplayStartMs:()=>qe(),publishReplayStartMs:h=>je(h)};if(f.set(d.name,m),d.onInit){let h=(async()=>{try{await d.onInit?.(m);}catch(w){m.logger.error("onInit threw",w);}})();x.push(h);}}let g=x.length===0?Promise.resolve():Promise.all(x).then(()=>{});return {whenReady:()=>g,enrichSubmission:async d=>{if(o.length===0)return d;let m=o.map(async w=>{if(!w.onFeedbackSubmit)return;let U=f.get(w.name);if(U)try{return await w.onFeedbackSubmit(U,d)}catch(L){U.logger.error("onFeedbackSubmit threw",L);return}}),h=await Promise.all(m);return Ye(d,h)},notifySubmitted:(d,m)=>{let h=m.then(Ut),w=m.then(Et);for(let U of o){if(!U.afterFeedbackSubmit)continue;let L=f.get(U.name);if(L)try{U.afterFeedbackSubmit(L,{submission:d,feedbackId:h,replayLinkToken:w});}catch(q){L.logger.error("afterFeedbackSubmit threw",q);}}},destroy:()=>{if(!b){b=true;for(let d of o){if(!d.onDestroy)continue;let m=f.get(d.name);if(m)try{d.onDestroy(m);}catch(h){m.logger.error("onDestroy threw",h);}}a.clear(),f.clear();}}}}function Ze(e){let{clientId:t,environment:r,metadata:o,disablePageContext:s,payload:i}=e,a=s?void 0:typeof window<"u"?window.location.href:"",f=s?void 0:typeof document<"u"&&document.title||"Untitled Page",b=s?void 0:typeof document<"u"&&document.referrer?document.referrer:void 0,x=i.comment?.trim()||void 0,g=i.userEmail?.trim()||void 0,d={clientId:t,rating:i.rating,comment:x,userEmail:g,pageUrl:a,pageTitle:f,referrer:b,environment:r};return i.screenshots&&i.screenshots.length>0&&(d.screenshots=i.screenshots),(o!==void 0||i.metadata!==void 0)&&(d.metadata={...o??{},...i.metadata??{}}),d}async function et(e,t,r){let o=await t.enrichSubmission(r),s=e.submitFeedback(o);return t.notifySubmitted(o,s),s}function Ut(e){let t=e.success?e.data:null;return typeof t!="object"||t===null||!("feedbackId"in t)?null:typeof t.feedbackId=="string"?t.feedbackId:null}function Et(e){let t=e.success?e.data:null;return typeof t!="object"||t===null||!("replayLinkToken"in t)?null:typeof t.replayLinkToken=="string"?t.replayLinkToken:null}function tt(e){let t=[],r=e.rating!=null,o=!!e.comment?.trim();return !r&&!o&&t.push("Add rating or comment"),r&&e.rating!==void 0&&![1,2,3,4].includes(e.rating)&&t.push("Invalid rating"),o&&e.comment!==void 0&&(e.comment.length>1e3&&t.push("Comment too long"),/<script[^>]*>.*?<\/script>/gi.test(e.comment)&&t.push("Invalid comment")),{isValid:t.length===0,errors:t}}var nt=`
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

/* Labelled corner pill. Rules sit after the tab ones so the shared
   .fb-btn--right/left offsets and open transform are overridden. */
.fb-btn--pill {
  width: auto;
  height: auto;
  top: auto;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  transform: none;
  gap: 8px;
  padding: 12px 18px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  max-width: calc(100vw - 40px);
  box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3);
}

.fb-btn--pill.fb-btn--right {
  right: 20px;
  left: auto;
}

.fb-btn--pill.fb-btn--left {
  left: 20px;
  right: auto;
}

.fb-btn--pill.fb-btn--open {
  transform: scale(1.05);
}

.fb-btn-lbl {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
`;var Xt=Ve;function Tt(){return typeof window>"u"||typeof window.matchMedia!="function"?oe:window.matchMedia("(prefers-color-scheme: dark)").matches?oe:window.matchMedia("(prefers-color-scheme: light)").matches?ye:oe}function Ue(e){let t=Tt();return e?{...t,...e}:t}var rt="feedback_user_email",ue=new Map;function A(e){return e.replace(/[&<>"']/g,t=>{switch(t){case "&":return "&amp;";case "<":return "&lt;";case ">":return "&gt;";case '"':return "&quot;";case "'":return "&#x27;";default:return t}})}function Pt(){if(typeof window>"u")return "";try{return window.localStorage.getItem(rt)??""}catch{return ""}}function It(e){try{window.localStorage.setItem(rt,e);}catch{}}function Qt(e){if(typeof document>"u")return {destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}};let{clientId:t,baseUrl:r}=e;if(!t||t.length<3){let n=new Error("Invalid config. Contact admin.");return e.onError?.(n),{destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}}}let o=e.position??"right",s=e.theme,i=Ue(s),a=e.title??"Share Feedback",f=e.placeholder??"Tell us what you think... (optional)",b=e.showEmailOption??true,x=e.showScreenshotOption??true,g=e.environment,d=e.metadata,m=e.launcherType,h=e.launcherLabel,w=e.hideTrigger??false,U=e.disablePageContext??false,L=e.onSubmit,q=e.onError,Ee=e.onOpen,Te=e.onClose,fe=new se(r),G=Xe({apiUrl:r??Z,clientId:t},{user:e.user,getUser:e.getUser}),pe=Qe({clientId:t,apiUrl:r??Z,plugins:e.plugins??[],resolveUser:()=>G.resolveUser(),environment:g}),z=ue.get(t),k=z?.isOpen??false,te=false,O=z?.rating,R=z?.comment??"",M=z?.shareEmail??false,D=Pt(),F=false,E=null,y=z?[...z.screenshots]:[],C=false,T=null;function Pe(){if(O===void 0&&R.trim()===""&&y.length===0){ue.delete(t);return}ue.set(t,{rating:O,comment:R,shareEmail:M,screenshots:[...y],isOpen:k});}let W=3,it=10*1024*1024,B=document.createElement("div");B.setAttribute("data-usero-widget",""),B.style.cssText="all: initial;",document.body.appendChild(B);let K=B.attachShadow({mode:"open"});function ot(){G.resolveUser();}function be(n){try{window.dispatchEvent(new CustomEvent("usero:shadow-update",{detail:{host:B,root:K,reason:n}}));}catch{}}be("mount");let Ie=document.createElement("style");Ie.textContent=nt,K.appendChild(Ie);let P=document.createElement("button"),V=document.createElement("div"),u=document.createElement("div");K.appendChild(P),K.appendChild(V),K.appendChild(u);function st(n){E=n,I();}function Re(){k||(k=true,te=true,E=null,T=null,C=false,fe.ping(t),ot(),Ee?.(),I(),be("panel-open"));}async function at(n){if(T=null,!n.type.startsWith("image/")){T="Image files only",_();return}if(n.size>it){T="Max 10MB",_();return}if(y.length>=W){T=`Max ${W} screenshots`,_();return}C=true,ge(),_();try{let l=await fe.uploadScreenshot(n,t);y=[...y,l];}catch(l){T=l instanceof Error?l.message:"Upload failed";}finally{C=false,ge(),_();}}function Fe(n){y=y.filter((l,p)=>p!==n),ge(),_();}function J(){k&&(k=false,Pe(),Te?.(),I());}function $e(){return C?'<span class="fb-ups"></span> Uploading...':"\u{1F4F7} Add screenshot"}function lt(){let n=y.length>=W,l=C||n;return `
			<input type="file" accept="image/*" data-role="screenshot-input" style="display:none;" aria-label="Choose screenshot" />
			<button type="button" class="fb-upb ${l?"fb-upb--dis":""}" data-role="screenshot-pick" ${l?"disabled":""} style="border:1px solid ${i.border};color:${i.text};">
				${$e()}
			</button>
		`}function Le(){let n=y.length>=W,l=y.map(($,re)=>`
					<div class="fb-sp">
						<img src="${A($.url)}" alt="Screenshot ${re+1}" class="fb-si" />
						<button type="button" class="fb-sr" data-role="screenshot-remove" data-index="${re}" aria-label="Remove screenshot">\u2715</button>
					</div>
				`).join(""),p=T?`<div class="fb-upe">\u26A0 ${A(T)}</div>`:"",S=n?`<div class="fb-sl">Max ${W}</div>`:"";return T||y.length>0||n?`<div class="fb-up-extras">${p}${y.length>0?`<div class="fb-ss">${l}</div>`:""}${S}</div>`:""}function ge(){if(!x)return;let n=u.querySelector('button[data-role="screenshot-pick"]');if(!n)return;let l=y.length>=W,p=C||l;n.disabled=p,n.classList.toggle("fb-upb--dis",p),n.innerHTML=$e();}function _(){if(!x)return;let n=u.querySelector(".fb-up");n&&(n.innerHTML=Le(),n.querySelectorAll('button[data-role="screenshot-remove"]').forEach(l=>{l.addEventListener("click",()=>{let p=Number(l.dataset.index);Number.isInteger(p)&&Fe(p);});}));}async function Me(){if(F)return;F=true,E=null,I();let n={rating:O,comment:R.trim()||void 0,userEmail:M&&D.trim()?D.trim():void 0,screenshots:y.length>0?y:void 0,metadata:{pageUrl:window.location.href,pageTitle:document.title||"Untitled Page",referrer:document.referrer||void 0,timestamp:Date.now()}},l=Ze({clientId:t,environment:g,metadata:d,disablePageContext:U,payload:{rating:O,comment:R,userEmail:M?D:void 0,screenshots:y}}),p=tt(l);if(!p.isValid){F=false,st({type:"error",text:p.errors.join(", ")});return}try{let S=await et(fe,pe,l);if(S.success)M&&D&&It(D),L?.(n),O=void 0,R="",M=!1,y=[],T=null,ue.delete(t),E={type:"success",text:"Thank you!"};else {let $=S.error??"Error occurred. Try again.";q?.(new Error($)),E={type:"error",text:$};}}catch(S){let $=S instanceof Error?S.message:"Error occurred. Try again.";q?.(new Error($)),E={type:"error",text:$};}finally{F=false,I();}}function dt(){return m??(w?"none":"tab")}function ct(){let n=dt(),l=n==="button",p=n==="none",S=h??a;P.className=`fb-btn fb-btn--${o} ${l?"fb-btn--pill":""} ${k?"fb-btn--open":""}`,P.setAttribute("aria-label",l?S:"Open feedback"),P.type="button",P.style.background=`linear-gradient(135deg, ${i.primary}, ${xe(i.primary)})`,P.innerHTML=k?'<span style="font-size:20px;">\u2715</span>':l?`<span aria-hidden="true">\u{1F4AC}</span><span class="fb-btn-lbl">${A(S)}</span>`:"",P.style.display=p?"none":"",P.setAttribute("aria-hidden",p?"true":"false"),P.tabIndex=p?-1:0;}function ut(){V.className="fb-backdrop",V.style.display=k?"block":"none",V.setAttribute("aria-label","Close modal");}function ft(){u.className=`fb-pnl-base fb-pnl--${o} ${k?"fb-pnl--open":"fb-pnl--closed"}`,u.style.backgroundColor=i.background,o==="right"?(u.style.borderLeft=`1px solid ${i.border}`,u.style.borderRight=""):(u.style.borderRight=`1px solid ${i.border}`,u.style.borderLeft=""),u.setAttribute("role","dialog"),u.setAttribute("aria-modal","true"),u.setAttribute("aria-labelledby","usero-feedback-title");let n=1e3-R.length,l=n<50,p=[1,2,3,4].map(c=>{let v=O===c,gt=ze[c];return `
					<div class="${["fb-ec",v&&"fb-ec--sel"].filter(Boolean).join(" ")}" style="background:${gt}">
						<button type="button" class="fb-eb" data-rating="${c}" role="radio" aria-checked="${v}" aria-label="${c}: ${ie[c]}" style="color:${i.text}">
							<div class="fb-ei"><span role="img" aria-label="${ie[c]}">${He[c]}</span></div>
							<div class="fb-el" style="color:${i.text}">${ie[c]}</div>
						</button>
					</div>
				`}).join(""),S=E?`<div class="fb-msg fb-msg--header ${E.type==="success"?"fb-msg--ok":"fb-msg--err"}">${E.type==="success"?"\u2713":"\u26A0"} ${A(E.text)}</div>`:"",$=x?lt():"",re=x?Le():"",pt=b?`
				<div class="fb-email">
					<label class="fb-email-lbl" style="color:${i.text}">
						<input type="checkbox" class="fb-email-cb" data-role="share-email" ${M?"checked":""} aria-label="Share email" />
						<span>Share my email</span>
					</label>
					${M?`<input type="email" class="fb-email-inp" data-role="email-input" value="${A(D)}" placeholder="your.email@example.com" aria-label="Email" maxlength="254" autocomplete="email" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};" />`:""}
				</div>
			`:"",me=F,bt=`background:linear-gradient(135deg, ${i.primary}, ${xe(i.primary)});color:#ffffff;${me?"opacity:0.6;cursor:not-allowed;":""}`;u.innerHTML=`
			<div class="fb-cnt">
				<div class="fb-hdr" style="border-bottom:1px solid ${i.border}">
					<h2 id="usero-feedback-title" class="fb-ttl" style="color:${i.text}">${A(a)}</h2>
					${S}
					<button class="fb-close-btn" data-role="close" style="color:${i.text}" aria-label="Close" type="button">\u2715</button>
				</div>
				<form data-role="form">
					<div class="fb-es" role="radiogroup" aria-label="Rate experience">${p}</div>
					<textarea class="fb-ta" data-role="comment" placeholder="${A(f)}" aria-label="Comments" maxlength="1000" rows="2" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};">${A(R)}</textarea>
					<div class="fb-toolrow">
						${$}
						<div class="fb-charcount${l?" fb-charcount--low":""}" data-role="charcount" style="color:${l?"#dc2626":i.text};opacity:${l?1:.6};">${n} chars remaining</div>
					</div>
					${x?`<div class="fb-up">${re}</div>`:""}
					${pt}
					<button class="fb-sub ${me?"fb-sub--dis":""}" type="submit" aria-label="Submit" ${me?"disabled":""} style="${bt}">
						${F?'<span class="fb-spin"></span>':""}
						${F?"Submitting...":"Send Feedback \u{1F680}"}
					</button>
				</form>
			</div>
		`,u.querySelector('form[data-role="form"]')?.addEventListener("submit",c=>{c.preventDefault(),Me();}),u.querySelector('button[data-role="close"]')?.addEventListener("click",J),u.querySelectorAll("button[data-rating]").forEach(c=>{c.addEventListener("click",()=>{let v=c.dataset.rating;(v==="1"||v==="2"||v==="3"||v==="4")&&(O=Number(v),te=true,I());});});let X=u.querySelector('textarea[data-role="comment"]');X&&(te&&(te=false,requestAnimationFrame(()=>X.focus({preventScroll:true}))),X.addEventListener("input",()=>{if(X.value.length<=1e3){R=X.value;let c=u.querySelector('[data-role="charcount"]');if(c){let v=1e3-R.length;c.textContent=`${v} chars remaining`,c.style.color=v<50?"#dc2626":i.text,c.style.opacity=v<50?"1":"0.6";}}}));let De=u.querySelector('input[data-role="share-email"]');De?.addEventListener("change",()=>{M=De.checked,I();});let he=u.querySelector('input[data-role="email-input"]');he?.addEventListener("input",()=>{he.value.length<=254&&(D=he.value);});let Q=u.querySelector('input[data-role="screenshot-input"]');u.querySelector('button[data-role="screenshot-pick"]')?.addEventListener("click",()=>{Q?.click();}),Q?.addEventListener("change",()=>{let c=Q.files?.[0];c&&at(c).finally(()=>{Q&&(Q.value="");});}),u.querySelectorAll('button[data-role="screenshot-remove"]').forEach(c=>{c.addEventListener("click",()=>{let v=Number(c.dataset.index);Number.isInteger(v)&&Fe(v);});});}function I(){ct(),ut(),ft();}P.addEventListener("click",()=>{k?J():Re();}),V.addEventListener("click",()=>{C||F||J();});let Ce=n=>{if(k){if(n.key==="Escape"){if(C||F)return;J();}n.key==="Enter"&&(n.metaKey||n.ctrlKey)&&(n.preventDefault(),Me());}};document.addEventListener("keydown",Ce);let N=null,Y=null;function Ae(){N&&Y&&N.removeEventListener("change",Y),N=null,Y=null;}function Oe(){N||typeof window>"u"||typeof window.matchMedia!="function"||(N=window.matchMedia("(prefers-color-scheme: dark)"),Y=()=>{s===void 0&&(i=Ue(void 0),I());},N.addEventListener("change",Y));}s===void 0&&Oe(),I(),k&&be("panel-open");let ne=false;return {destroy:()=>{ne||(ne=true,Pe(),document.removeEventListener("keydown",Ce),Ae(),pe.destroy(),B.remove());},open:Re,close:J,whenReady:()=>pe.whenReady(),identify:n=>{ne||G.identify(n);},update:n=>{if(ne)return;let l=false;n.position!==void 0&&n.position!==o&&(o=n.position,l=true),"theme"in n&&(s=n.theme,i=Ue(s),s===void 0?Oe():Ae(),l=true),n.title!==void 0&&n.title!==a&&(a=n.title,l=true),n.placeholder!==void 0&&n.placeholder!==f&&(f=n.placeholder,l=true),n.showEmailOption!==void 0&&n.showEmailOption!==b&&(b=n.showEmailOption,l=true),n.showScreenshotOption!==void 0&&n.showScreenshotOption!==x&&(x=n.showScreenshotOption,l=true),n.hideTrigger!==void 0&&n.hideTrigger!==w&&(w=n.hideTrigger,l=true),n.launcherType!==void 0&&n.launcherType!==m&&(m=n.launcherType,l=true),n.launcherLabel!==void 0&&n.launcherLabel!==h&&(h=n.launcherLabel,l=true),"environment"in n&&(g=n.environment),"metadata"in n&&(d=n.metadata),n.disablePageContext!==void 0&&(U=n.disablePageContext),"onSubmit"in n&&(L=n.onSubmit),"onError"in n&&(q=n.onError),"onOpen"in n&&(Ee=n.onOpen),"onClose"in n&&(Te=n.onClose),"getUser"in n&&G.setGetUser(n.getUser),"user"in n&&G.setUserProp(n.user),l&&I();}}}exports.DARK_THEME=oe;exports.DEFAULT_THEME=ye;exports.__identityTest__=Xt;exports.initUseroFeedbackWidget=Qt;exports.mergePluginPatches=Ye;exports.mergeTheme=mt;exports.resolveTheme=Ue;return exports;})({});//# sourceMappingURL=usero.iife.js.map
//# sourceMappingURL=usero.iife.js.map