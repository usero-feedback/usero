// @usero/sdk v1.4.2 (vendored 2026-09-24 from ../../dist/usero.iife.js by scripts/sync-wp-vendor.mjs)
var Usero=(function(exports){'use strict';var He={1:"\u{1F61E}",2:"\u{1F610}",3:"\u{1F60A}",4:"\u{1F929}"},re={1:"Needs work",2:"It's okay",3:"Pretty good",4:"Amazing!"},ze={1:"linear-gradient(135deg,#ff6b6b14,#ff6b6b1f)",2:"linear-gradient(135deg,#9ca3af0f,#9ca3af1a)",3:"linear-gradient(135deg,#3b82f614,#3b82f61f)",4:"linear-gradient(135deg,#f59e0b14,#f59e0b1f)"},X="https://usero.io",ye={primary:"#2563eb",background:"#ffffff",text:"#374151",border:"#e5e7eb",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"},ie={primary:"#2563eb",background:"#1f2937",text:"#f9fafb",border:"#374151",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)"};function mt(e={}){return {...ye,...e}}function ht(e){return typeof e=="object"&&e!==null&&"error"in e}function yt(e){if(typeof e!="object"||e===null)return {success:false,error:"Invalid response"};let t=e,r=t.success===true,o=typeof t.error=="string"?t.error:void 0,a=t.screenshot,i;if(typeof a=="object"&&a!==null){let s=a;typeof s.fileName=="string"&&typeof s.url=="string"&&typeof s.fileSize=="number"&&typeof s.mimeType=="string"&&(i={fileName:s.fileName,url:s.url,fileSize:s.fileSize,mimeType:s.mimeType,width:typeof s.width=="number"?s.width:void 0,height:typeof s.height=="number"?s.height:void 0});}return {success:r,error:o,screenshot:i}}var oe=class{constructor(t=X){this.baseUrl=t.replace(/\/$/,"");}async submitFeedback(t){try{let r=await fetch(`${this.baseUrl}/api/feedback`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(t),signal:AbortSignal.timeout(1e4)});if(!r.ok){let i=`HTTP ${r.status}: ${r.statusText}`;try{let s=await r.json();ht(s)&&typeof s.error=="string"&&(i=s.error);}catch{}throw new Error(i)}let o=await r.json(),a=typeof o=="object"&&o!==null&&"message"in o&&typeof o.message=="string"?o.message:"Feedback submitted successfully";return {success:!0,data:o,message:a}}catch(r){return {success:false,error:r instanceof Error?r.message:"An unexpected error occurred"}}}async uploadScreenshot(t,r){let o=new FormData;o.append("screenshot",t),o.append("clientId",r);let a=await fetch(`${this.baseUrl}/api/screenshots`,{method:"POST",body:o,signal:AbortSignal.timeout(3e4)}),i={success:false};try{let s=await a.json();i=yt(s);}catch{}if(!a.ok||!i.success||!i.screenshot){let s=i.error??`HTTP ${a.status}: ${a.statusText}`;throw new Error(s)}return i.screenshot}ping(){fetch(`${this.baseUrl}/api/ping`,{signal:AbortSignal.timeout(5e3)}).catch(()=>{});}};function xt(e){if(e.startsWith("#")||typeof document>"u")return e;let r=document.createElement("canvas").getContext("2d");return r?(r.fillStyle=e,r.fillStyle):e}function xe(e){let t=xt(e);if(!t.startsWith("#")||t.length<7)return t;let r=parseInt(t.slice(1,3),16),o=parseInt(t.slice(3,5),16),a=parseInt(t.slice(5,7),16),i=Math.max(0,r-60),s=Math.min(255,o+40),f=Math.min(255,a+20);return `#${[i,s,f].map(g=>g.toString(16).padStart(2,"0")).join("")}`}var se="usero:anonymous-id",ae="usero:session-replay:sdk-session-id",N=null,D=null,de=null,le=null,Q=null;function ve(){if(typeof crypto<"u"&&typeof crypto.randomUUID=="function")return crypto.randomUUID();let e=new Uint8Array(16);if(typeof crypto<"u"&&typeof crypto.getRandomValues=="function")crypto.getRandomValues(e);else for(let r=0;r<e.length;r+=1)e[r]=Math.floor(Math.random()*256);let t="";for(let r of e)t+=r.toString(16).padStart(2,"0");return t}function vt(e){if(typeof window>"u")return null;try{return window.localStorage?.getItem(e)??null}catch{return null}}function We(e,t){if(!(typeof window>"u"))try{window.localStorage?.setItem(e,t);}catch{}}function St(e){if(typeof window>"u")return null;try{return window.sessionStorage?.getItem(e)??null}catch{return null}}function Be(e,t){if(!(typeof window>"u"))try{window.sessionStorage?.setItem(e,t);}catch{}}function Se(){if(N)return N;let e=vt(se);if(e&&/^[a-z0-9-]{8,}$/i.test(e))return N=e,e;let t=ve();return We(se,t),N=t,t}function wt(){let e=ve();return N=e,We(se,e),Q=null,de=null,e}function _e(e){return /^[a-z0-9-]{8,}$/i.test(e)}function we(){if(D)return D;let e=St(ae);if(e&&_e(e))return D=e,e;let t=ve();return Be(ae,t),D=t,t}function ke(e){_e(e)&&D!==e&&(D=e,Be(ae,e));}function Ne(){return de}function je(e){le===null&&(le=e);}function qe(){return le}function kt(e,t){let r=t.traits??{},a=Object.keys(r).sort().map(i=>[i,r[i]??null]);return JSON.stringify([e,t.id,t.email??null,t.displayName??null,a])}async function Ge(e,t){let r=Se();de=t.id;let o=kt(r,t);if(o===Q)return  false;let a=`${e.apiUrl.replace(/\/$/,"")}/api/identify`,i=JSON.stringify({clientId:e.clientId,anonymousId:r,externalUserId:t.id,email:t.email,displayName:t.displayName,traits:t.traits});if(typeof document<"u"&&document.visibilityState==="hidden"&&typeof navigator<"u"&&typeof navigator.sendBeacon=="function")try{let s=new Blob([i],{type:"application/json"});if(navigator.sendBeacon(a,s))return Q=o,!0}catch{}try{let s=await fetch(a,{method:"POST",headers:{"Content-Type":"application/json"},body:i,keepalive:!0});if(!s.ok)return !0;try{let f=await s.json();f&&f.accepted===!0&&(Q=o);}catch{}return !0}catch{return  false}}function Ke(){wt();}var Ve={ANON_STORAGE_KEY:se,SDK_SESSION_STORAGE_KEY:ae,reseatSdkSessionId:ke,getOrMintSdkSessionId:we,resetIdentityState:()=>{N=null,D=null,de=null,le=null,Q=null;}};function Je(e){let t=`[usero:${e}]`;return {debug:(...r)=>{typeof console<"u"&&console.debug(t,...r);},info:(...r)=>{typeof console<"u"&&console.info(t,...r);},warn:(...r)=>{typeof console<"u"&&console.warn(t,...r);},error:(...r)=>{typeof console<"u"&&console.error(t,...r);}}}function Ye(e,t){let r=e;for(let o of t){if(!o||typeof o!="object")continue;let{metadata:a,...i}=o;r={...r,...i},a&&typeof a=="object"&&(r.metadata={...r.metadata??{},...a});}return r}function Xe(e,t){let r=t.user,o=t.getUser,a=null,i,s,f;function g(b){let d=b??null;if(d){if(d.id===a&&d.traits===i&&d.email===s&&d.displayName===f)return;Ge(e,d),a=d.id,i=d.traits,s=d.email,f=d.displayName;}else a!==null&&(Ke(),a=null,i=void 0,s=void 0,f=void 0);}function h(){if(o)try{g(o()??null);}catch{}}return t.user!==void 0?g(t.user):o&&h(),{identify:b=>{r=b,g(b);},setUserProp:b=>{r=b,g(b);},setGetUser:b=>{o=b;},resolveUser:()=>{r!==void 0?g(r):h();}}}function Qe(e){let{clientId:t,apiUrl:r,plugins:o,resolveUser:a,environment:i}=e,s=new Map,f=new Map,g=false,h=[];for(let d of o){let v={clientId:t,baseUrl:r,environment:i,logger:Je(d.name),getStore:()=>s.get(d.name),setStore:y=>{s.set(d.name,y);},resolveUser:()=>{g||a();},getSdkSessionId:()=>we(),reseatSdkSessionId:y=>ke(y),getAnonymousId:()=>Se(),getUserId:()=>Ne(),getReplayStartMs:()=>qe(),publishReplayStartMs:y=>je(y)};if(f.set(d.name,v),d.onInit){let y=(async()=>{try{await d.onInit?.(v);}catch(P){v.logger.error("onInit threw",P);}})();h.push(y);}}let b=h.length===0?Promise.resolve():Promise.all(h).then(()=>{});return {whenReady:()=>b,enrichSubmission:async d=>{if(o.length===0)return d;let v=o.map(async P=>{if(!P.onFeedbackSubmit)return;let O=f.get(P.name);if(O)try{return await P.onFeedbackSubmit(O,d)}catch(Z){O.logger.error("onFeedbackSubmit threw",Z);return}}),y=await Promise.all(v);return Ye(d,y)},destroy:()=>{if(!g){g=true;for(let d of o){if(!d.onDestroy)continue;let v=f.get(d.name);if(v)try{d.onDestroy(v);}catch(y){v.logger.error("onDestroy threw",y);}}s.clear(),f.clear();}}}}function Ze(e){let{clientId:t,environment:r,metadata:o,disablePageContext:a,payload:i}=e,s=a?void 0:typeof window<"u"?window.location.href:"",f=a?void 0:typeof document<"u"&&document.title||"Untitled Page",g=a?void 0:typeof document<"u"&&document.referrer?document.referrer:void 0,h=i.comment?.trim()||void 0,b=i.userEmail?.trim()||void 0,d={clientId:t,rating:i.rating,comment:h,userEmail:b,pageUrl:s,pageTitle:f,referrer:g,environment:r};return i.screenshots&&i.screenshots.length>0&&(d.screenshots=i.screenshots),(o!==void 0||i.metadata!==void 0)&&(d.metadata={...o??{},...i.metadata??{}}),d}async function et(e,t,r){let o=await t.enrichSubmission(r);return e.submitFeedback(o)}function tt(e){let t=[],r=e.rating!=null,o=!!e.comment?.trim();return !r&&!o&&t.push("Add rating or comment"),r&&e.rating!==void 0&&![1,2,3,4].includes(e.rating)&&t.push("Invalid rating"),o&&e.comment!==void 0&&(e.comment.length>1e3&&t.push("Comment too long"),/<script[^>]*>.*?<\/script>/gi.test(e.comment)&&t.push("Invalid comment")),{isValid:t.length===0,errors:t}}var nt=`
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
`;var Jt=Ve;function Ut(){return typeof window>"u"||typeof window.matchMedia!="function"?ie:window.matchMedia("(prefers-color-scheme: dark)").matches?ie:window.matchMedia("(prefers-color-scheme: light)").matches?ye:ie}function Ue(e){let t=Ut();return e?{...t,...e}:t}var rt="feedback_user_email",ce=new Map;function L(e){return e.replace(/[&<>"']/g,t=>{switch(t){case "&":return "&amp;";case "<":return "&lt;";case ">":return "&gt;";case '"':return "&quot;";case "'":return "&#x27;";default:return t}})}function Et(){if(typeof window>"u")return "";try{return window.localStorage.getItem(rt)??""}catch{return ""}}function Tt(e){try{window.localStorage.setItem(rt,e);}catch{}}function Yt(e){if(typeof document>"u")return {destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}};let{clientId:t,baseUrl:r}=e;if(!t||t.length<3){let n=new Error("Invalid config. Contact admin.");return e.onError?.(n),{destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}}}let o=e.position??"right",a=e.theme,i=Ue(a),s=e.title??"Share Feedback",f=e.placeholder??"Tell us what you think... (optional)",g=e.showEmailOption??true,h=e.showScreenshotOption??true,b=e.environment,d=e.metadata,v=e.launcherType,y=e.launcherLabel,P=e.hideTrigger??false,O=e.disablePageContext??false,Z=e.onSubmit,ue=e.onError,Ee=e.onOpen,Te=e.onClose,fe=new oe(r),j=Xe({apiUrl:r??X,clientId:t},{user:e.user,getUser:e.getUser}),pe=Qe({clientId:t,apiUrl:r??X,plugins:e.plugins??[],resolveUser:()=>j.resolveUser(),environment:b}),H=ce.get(t),S=H?.isOpen??false,ee=false,A=H?.rating,I=H?.comment??"",$=H?.shareEmail??false,C=Et(),R=false,k=null,m=H?[...H.screenshots]:[],M=false,U=null;function Pe(){if(A===void 0&&I.trim()===""&&m.length===0){ce.delete(t);return}ce.set(t,{rating:A,comment:I,shareEmail:$,screenshots:[...m],isOpen:S});}let z=3,it=10*1024*1024,W=document.createElement("div");W.setAttribute("data-usero-widget",""),W.style.cssText="all: initial;",document.body.appendChild(W);let q=W.attachShadow({mode:"open"});function ot(){j.resolveUser();}function ge(n){try{window.dispatchEvent(new CustomEvent("usero:shadow-update",{detail:{host:W,root:q,reason:n}}));}catch{}}ge("mount");let Ie=document.createElement("style");Ie.textContent=nt,q.appendChild(Ie);let E=document.createElement("button"),G=document.createElement("div"),u=document.createElement("div");q.appendChild(E),q.appendChild(G),q.appendChild(u);function st(n){k=n,T();}function Re(){S||(S=true,ee=true,k=null,U=null,M=false,fe.ping(),ot(),Ee?.(),T(),ge("panel-open"));}async function at(n){if(U=null,!n.type.startsWith("image/")){U="Image files only",B();return}if(n.size>it){U="Max 10MB",B();return}if(m.length>=z){U=`Max ${z} screenshots`,B();return}M=true,be(),B();try{let l=await fe.uploadScreenshot(n,t);m=[...m,l];}catch(l){U=l instanceof Error?l.message:"Upload failed";}finally{M=false,be(),B();}}function Fe(n){m=m.filter((l,p)=>p!==n),be(),B();}function K(){S&&(S=false,Pe(),Te?.(),T());}function $e(){return M?'<span class="fb-ups"></span> Uploading...':"\u{1F4F7} Add screenshot"}function lt(){let n=m.length>=z,l=M||n;return `
			<input type="file" accept="image/*" data-role="screenshot-input" style="display:none;" aria-label="Choose screenshot" />
			<button type="button" class="fb-upb ${l?"fb-upb--dis":""}" data-role="screenshot-pick" ${l?"disabled":""} style="border:1px solid ${i.border};color:${i.text};">
				${$e()}
			</button>
		`}function Me(){let n=m.length>=z,l=m.map((F,ne)=>`
					<div class="fb-sp">
						<img src="${L(F.url)}" alt="Screenshot ${ne+1}" class="fb-si" />
						<button type="button" class="fb-sr" data-role="screenshot-remove" data-index="${ne}" aria-label="Remove screenshot">\u2715</button>
					</div>
				`).join(""),p=U?`<div class="fb-upe">\u26A0 ${L(U)}</div>`:"",w=n?`<div class="fb-sl">Max ${z}</div>`:"";return U||m.length>0||n?`<div class="fb-up-extras">${p}${m.length>0?`<div class="fb-ss">${l}</div>`:""}${w}</div>`:""}function be(){if(!h)return;let n=u.querySelector('button[data-role="screenshot-pick"]');if(!n)return;let l=m.length>=z,p=M||l;n.disabled=p,n.classList.toggle("fb-upb--dis",p),n.innerHTML=$e();}function B(){if(!h)return;let n=u.querySelector(".fb-up");n&&(n.innerHTML=Me(),n.querySelectorAll('button[data-role="screenshot-remove"]').forEach(l=>{l.addEventListener("click",()=>{let p=Number(l.dataset.index);Number.isInteger(p)&&Fe(p);});}));}async function Le(){if(R)return;R=true,k=null,T();let n={rating:A,comment:I.trim()||void 0,userEmail:$&&C.trim()?C.trim():void 0,screenshots:m.length>0?m:void 0,metadata:{pageUrl:window.location.href,pageTitle:document.title||"Untitled Page",referrer:document.referrer||void 0,timestamp:Date.now()}},l=Ze({clientId:t,environment:b,metadata:d,disablePageContext:O,payload:{rating:A,comment:I,userEmail:$?C:void 0,screenshots:m}}),p=tt(l);if(!p.isValid){R=false,st({type:"error",text:p.errors.join(", ")});return}try{let w=await et(fe,pe,l);if(w.success)$&&C&&Tt(C),Z?.(n),A=void 0,I="",$=!1,m=[],U=null,ce.delete(t),k={type:"success",text:"Thank you!"};else {let F=w.error??"Error occurred. Try again.";ue?.(new Error(F)),k={type:"error",text:F};}}catch(w){let F=w instanceof Error?w.message:"Error occurred. Try again.";ue?.(new Error(F)),k={type:"error",text:F};}finally{R=false,T();}}function dt(){return v??(P?"none":"tab")}function ct(){let n=dt(),l=n==="button",p=n==="none",w=y??s;E.className=`fb-btn fb-btn--${o} ${l?"fb-btn--pill":""} ${S?"fb-btn--open":""}`,E.setAttribute("aria-label",l?w:"Open feedback"),E.type="button",E.style.background=`linear-gradient(135deg, ${i.primary}, ${xe(i.primary)})`,E.innerHTML=S?'<span style="font-size:20px;">\u2715</span>':l?`<span aria-hidden="true">\u{1F4AC}</span><span class="fb-btn-lbl">${L(w)}</span>`:"",E.style.display=p?"none":"",E.setAttribute("aria-hidden",p?"true":"false"),E.tabIndex=p?-1:0;}function ut(){G.className="fb-backdrop",G.style.display=S?"block":"none",G.setAttribute("aria-label","Close modal");}function ft(){u.className=`fb-pnl-base fb-pnl--${o} ${S?"fb-pnl--open":"fb-pnl--closed"}`,u.style.backgroundColor=i.background,o==="right"?(u.style.borderLeft=`1px solid ${i.border}`,u.style.borderRight=""):(u.style.borderRight=`1px solid ${i.border}`,u.style.borderLeft=""),u.setAttribute("role","dialog"),u.setAttribute("aria-modal","true"),u.setAttribute("aria-labelledby","usero-feedback-title");let n=1e3-I.length,l=n<50,p=[1,2,3,4].map(c=>{let x=A===c,bt=ze[c];return `
					<div class="${["fb-ec",x&&"fb-ec--sel"].filter(Boolean).join(" ")}" style="background:${bt}">
						<button type="button" class="fb-eb" data-rating="${c}" role="radio" aria-checked="${x}" aria-label="${c}: ${re[c]}" style="color:${i.text}">
							<div class="fb-ei"><span role="img" aria-label="${re[c]}">${He[c]}</span></div>
							<div class="fb-el" style="color:${i.text}">${re[c]}</div>
						</button>
					</div>
				`}).join(""),w=k?`<div class="fb-msg fb-msg--header ${k.type==="success"?"fb-msg--ok":"fb-msg--err"}">${k.type==="success"?"\u2713":"\u26A0"} ${L(k.text)}</div>`:"",F=h?lt():"",ne=h?Me():"",pt=g?`
				<div class="fb-email">
					<label class="fb-email-lbl" style="color:${i.text}">
						<input type="checkbox" class="fb-email-cb" data-role="share-email" ${$?"checked":""} aria-label="Share email" />
						<span>Share my email</span>
					</label>
					${$?`<input type="email" class="fb-email-inp" data-role="email-input" value="${L(C)}" placeholder="your.email@example.com" aria-label="Email" maxlength="254" autocomplete="email" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};" />`:""}
				</div>
			`:"",me=R,gt=`background:linear-gradient(135deg, ${i.primary}, ${xe(i.primary)});color:#ffffff;${me?"opacity:0.6;cursor:not-allowed;":""}`;u.innerHTML=`
			<div class="fb-cnt">
				<div class="fb-hdr" style="border-bottom:1px solid ${i.border}">
					<h2 id="usero-feedback-title" class="fb-ttl" style="color:${i.text}">${L(s)}</h2>
					${w}
					<button class="fb-close-btn" data-role="close" style="color:${i.text}" aria-label="Close" type="button">\u2715</button>
				</div>
				<form data-role="form">
					<div class="fb-es" role="radiogroup" aria-label="Rate experience">${p}</div>
					<textarea class="fb-ta" data-role="comment" placeholder="${L(f)}" aria-label="Comments" maxlength="1000" rows="2" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};">${L(I)}</textarea>
					<div class="fb-toolrow">
						${F}
						<div class="fb-charcount${l?" fb-charcount--low":""}" data-role="charcount" style="color:${l?"#dc2626":i.text};opacity:${l?1:.6};">${n} chars remaining</div>
					</div>
					${h?`<div class="fb-up">${ne}</div>`:""}
					${pt}
					<button class="fb-sub ${me?"fb-sub--dis":""}" type="submit" aria-label="Submit" ${me?"disabled":""} style="${gt}">
						${R?'<span class="fb-spin"></span>':""}
						${R?"Submitting...":"Send Feedback \u{1F680}"}
					</button>
				</form>
			</div>
		`,u.querySelector('form[data-role="form"]')?.addEventListener("submit",c=>{c.preventDefault(),Le();}),u.querySelector('button[data-role="close"]')?.addEventListener("click",K),u.querySelectorAll("button[data-rating]").forEach(c=>{c.addEventListener("click",()=>{let x=c.dataset.rating;(x==="1"||x==="2"||x==="3"||x==="4")&&(A=Number(x),ee=true,T());});});let J=u.querySelector('textarea[data-role="comment"]');J&&(ee&&(ee=false,requestAnimationFrame(()=>J.focus({preventScroll:true}))),J.addEventListener("input",()=>{if(J.value.length<=1e3){I=J.value;let c=u.querySelector('[data-role="charcount"]');if(c){let x=1e3-I.length;c.textContent=`${x} chars remaining`,c.style.color=x<50?"#dc2626":i.text,c.style.opacity=x<50?"1":"0.6";}}}));let Oe=u.querySelector('input[data-role="share-email"]');Oe?.addEventListener("change",()=>{$=Oe.checked,T();});let he=u.querySelector('input[data-role="email-input"]');he?.addEventListener("input",()=>{he.value.length<=254&&(C=he.value);});let Y=u.querySelector('input[data-role="screenshot-input"]');u.querySelector('button[data-role="screenshot-pick"]')?.addEventListener("click",()=>{Y?.click();}),Y?.addEventListener("change",()=>{let c=Y.files?.[0];c&&at(c).finally(()=>{Y&&(Y.value="");});}),u.querySelectorAll('button[data-role="screenshot-remove"]').forEach(c=>{c.addEventListener("click",()=>{let x=Number(c.dataset.index);Number.isInteger(x)&&Fe(x);});});}function T(){ct(),ut(),ft();}E.addEventListener("click",()=>{S?K():Re();}),G.addEventListener("click",()=>{M||R||K();});let Ae=n=>{if(S){if(n.key==="Escape"){if(M||R)return;K();}n.key==="Enter"&&(n.metaKey||n.ctrlKey)&&(n.preventDefault(),Le());}};document.addEventListener("keydown",Ae);let _=null,V=null;function Ce(){_&&V&&_.removeEventListener("change",V),_=null,V=null;}function De(){_||typeof window>"u"||typeof window.matchMedia!="function"||(_=window.matchMedia("(prefers-color-scheme: dark)"),V=()=>{a===void 0&&(i=Ue(void 0),T());},_.addEventListener("change",V));}a===void 0&&De(),T(),S&&ge("panel-open");let te=false;return {destroy:()=>{te||(te=true,Pe(),document.removeEventListener("keydown",Ae),Ce(),pe.destroy(),W.remove());},open:Re,close:K,whenReady:()=>pe.whenReady(),identify:n=>{te||j.identify(n);},update:n=>{if(te)return;let l=false;n.position!==void 0&&n.position!==o&&(o=n.position,l=true),"theme"in n&&(a=n.theme,i=Ue(a),a===void 0?De():Ce(),l=true),n.title!==void 0&&n.title!==s&&(s=n.title,l=true),n.placeholder!==void 0&&n.placeholder!==f&&(f=n.placeholder,l=true),n.showEmailOption!==void 0&&n.showEmailOption!==g&&(g=n.showEmailOption,l=true),n.showScreenshotOption!==void 0&&n.showScreenshotOption!==h&&(h=n.showScreenshotOption,l=true),n.hideTrigger!==void 0&&n.hideTrigger!==P&&(P=n.hideTrigger,l=true),n.launcherType!==void 0&&n.launcherType!==v&&(v=n.launcherType,l=true),n.launcherLabel!==void 0&&n.launcherLabel!==y&&(y=n.launcherLabel,l=true),"environment"in n&&(b=n.environment),"metadata"in n&&(d=n.metadata),n.disablePageContext!==void 0&&(O=n.disablePageContext),"onSubmit"in n&&(Z=n.onSubmit),"onError"in n&&(ue=n.onError),"onOpen"in n&&(Ee=n.onOpen),"onClose"in n&&(Te=n.onClose),"getUser"in n&&j.setGetUser(n.getUser),"user"in n&&j.setUserProp(n.user),l&&T();}}}exports.DARK_THEME=ie;exports.DEFAULT_THEME=ye;exports.__identityTest__=Jt;exports.initUseroFeedbackWidget=Yt;exports.mergePluginPatches=Ye;exports.mergeTheme=mt;exports.resolveTheme=Ue;return exports;})({});//# sourceMappingURL=usero.iife.js.map
//# sourceMappingURL=usero.iife.js.map