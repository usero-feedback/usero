// @usero/sdk v1.4.0 (vendored 2026-09-04 from ../../dist/usero.iife.js by scripts/sync-wp-vendor.mjs)
var Usero=(function(exports){'use strict';var De={1:"\u{1F61E}",2:"\u{1F610}",3:"\u{1F60A}",4:"\u{1F929}"},re={1:"Needs work",2:"It's okay",3:"Pretty good",4:"Amazing!"},Oe={1:"linear-gradient(135deg,#ff6b6b14,#ff6b6b1f)",2:"linear-gradient(135deg,#9ca3af0f,#9ca3af1a)",3:"linear-gradient(135deg,#3b82f614,#3b82f61f)",4:"linear-gradient(135deg,#f59e0b14,#f59e0b1f)"},X="https://usero.io",he={primary:"#2563eb",background:"#ffffff",text:"#374151",border:"#e5e7eb",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"},ie={primary:"#2563eb",background:"#1f2937",text:"#f9fafb",border:"#374151",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)"};function pt(e={}){return {...he,...e}}function gt(e){return typeof e=="object"&&e!==null&&"error"in e}function mt(e){if(typeof e!="object"||e===null)return {success:false,error:"Invalid response"};let t=e,r=t.success===true,o=typeof t.error=="string"?t.error:void 0,a=t.screenshot,i;if(typeof a=="object"&&a!==null){let s=a;typeof s.fileName=="string"&&typeof s.url=="string"&&typeof s.fileSize=="number"&&typeof s.mimeType=="string"&&(i={fileName:s.fileName,url:s.url,fileSize:s.fileSize,mimeType:s.mimeType,width:typeof s.width=="number"?s.width:void 0,height:typeof s.height=="number"?s.height:void 0});}return {success:r,error:o,screenshot:i}}var oe=class{constructor(t=X){this.baseUrl=t.replace(/\/$/,"");}async submitFeedback(t){try{let r=await fetch(`${this.baseUrl}/api/feedback`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(t),signal:AbortSignal.timeout(1e4)});if(!r.ok){let i=`HTTP ${r.status}: ${r.statusText}`;try{let s=await r.json();gt(s)&&typeof s.error=="string"&&(i=s.error);}catch{}throw new Error(i)}let o=await r.json(),a=typeof o=="object"&&o!==null&&"message"in o&&typeof o.message=="string"?o.message:"Feedback submitted successfully";return {success:!0,data:o,message:a}}catch(r){return {success:false,error:r instanceof Error?r.message:"An unexpected error occurred"}}}async uploadScreenshot(t,r){let o=new FormData;o.append("screenshot",t),o.append("clientId",r);let a=await fetch(`${this.baseUrl}/api/screenshots`,{method:"POST",body:o,signal:AbortSignal.timeout(3e4)}),i={success:false};try{let s=await a.json();i=mt(s);}catch{}if(!a.ok||!i.success||!i.screenshot){let s=i.error??`HTTP ${a.status}: ${a.statusText}`;throw new Error(s)}return i.screenshot}ping(){fetch(`${this.baseUrl}/api/ping`,{signal:AbortSignal.timeout(5e3)}).catch(()=>{});}};function bt(e){if(e.startsWith("#")||typeof document>"u")return e;let r=document.createElement("canvas").getContext("2d");return r?(r.fillStyle=e,r.fillStyle):e}function ye(e){let t=bt(e);if(!t.startsWith("#")||t.length<7)return t;let r=parseInt(t.slice(1,3),16),o=parseInt(t.slice(3,5),16),a=parseInt(t.slice(5,7),16),i=Math.max(0,r-60),s=Math.min(255,o+40),f=Math.min(255,a+20);return `#${[i,s,f].map(p=>p.toString(16).padStart(2,"0")).join("")}`}var se="usero:anonymous-id",ae="usero:session-replay:sdk-session-id",N=null,D=null,de=null,le=null,Q=null;function xe(){if(typeof crypto<"u"&&typeof crypto.randomUUID=="function")return crypto.randomUUID();let e=new Uint8Array(16);if(typeof crypto<"u"&&typeof crypto.getRandomValues=="function")crypto.getRandomValues(e);else for(let r=0;r<e.length;r+=1)e[r]=Math.floor(Math.random()*256);let t="";for(let r of e)t+=r.toString(16).padStart(2,"0");return t}function ht(e){if(typeof window>"u")return null;try{return window.localStorage?.getItem(e)??null}catch{return null}}function He(e,t){if(!(typeof window>"u"))try{window.localStorage?.setItem(e,t);}catch{}}function yt(e){if(typeof window>"u")return null;try{return window.sessionStorage?.getItem(e)??null}catch{return null}}function ze(e,t){if(!(typeof window>"u"))try{window.sessionStorage?.setItem(e,t);}catch{}}function ve(){if(N)return N;let e=ht(se);if(e&&/^[a-z0-9-]{8,}$/i.test(e))return N=e,e;let t=xe();return He(se,t),N=t,t}function xt(){let e=xe();return N=e,He(se,e),Q=null,de=null,e}function Be(e){return /^[a-z0-9-]{8,}$/i.test(e)}function Se(){if(D)return D;let e=yt(ae);if(e&&Be(e))return D=e,e;let t=xe();return ze(ae,t),D=t,t}function we(e){Be(e)&&D!==e&&(D=e,ze(ae,e));}function _e(){return de}function We(e){le===null&&(le=e);}function Ne(){return le}function vt(e,t){let r=t.traits??{},a=Object.keys(r).sort().map(i=>[i,r[i]??null]);return JSON.stringify([e,t.id,t.email??null,t.displayName??null,a])}async function je(e,t){let r=ve();de=t.id;let o=vt(r,t);if(o===Q)return  false;let a=`${e.apiUrl.replace(/\/$/,"")}/api/identify`,i=JSON.stringify({clientId:e.clientId,anonymousId:r,externalUserId:t.id,email:t.email,displayName:t.displayName,traits:t.traits});if(typeof document<"u"&&document.visibilityState==="hidden"&&typeof navigator<"u"&&typeof navigator.sendBeacon=="function")try{let s=new Blob([i],{type:"application/json"});if(navigator.sendBeacon(a,s))return Q=o,!0}catch{}try{let s=await fetch(a,{method:"POST",headers:{"Content-Type":"application/json"},body:i,keepalive:!0});if(!s.ok)return !0;try{let f=await s.json();f&&f.accepted===!0&&(Q=o);}catch{}return !0}catch{return  false}}function qe(){xt();}var Ge={ANON_STORAGE_KEY:se,SDK_SESSION_STORAGE_KEY:ae,reseatSdkSessionId:we,getOrMintSdkSessionId:Se,resetIdentityState:()=>{N=null,D=null,de=null,le=null,Q=null;}};function Ke(e){let t=`[usero:${e}]`;return {debug:(...r)=>{typeof console<"u"&&console.debug(t,...r);},info:(...r)=>{typeof console<"u"&&console.info(t,...r);},warn:(...r)=>{typeof console<"u"&&console.warn(t,...r);},error:(...r)=>{typeof console<"u"&&console.error(t,...r);}}}function Ve(e,t){let r=e;for(let o of t){if(!o||typeof o!="object")continue;let{metadata:a,...i}=o;r={...r,...i},a&&typeof a=="object"&&(r.metadata={...r.metadata??{},...a});}return r}function Je(e,t){let r=t.user,o=t.getUser,a=null,i,s,f;function p(g){let l=g??null;if(l){if(l.id===a&&l.traits===i&&l.email===s&&l.displayName===f)return;je(e,l),a=l.id,i=l.traits,s=l.email,f=l.displayName;}else a!==null&&(qe(),a=null,i=void 0,s=void 0,f=void 0);}function b(){if(o)try{p(o()??null);}catch{}}return t.user!==void 0?p(t.user):o&&b(),{identify:g=>{r=g,p(g);},setUserProp:g=>{r=g,p(g);},setGetUser:g=>{o=g;},resolveUser:()=>{r!==void 0?p(r):b();}}}function Ye(e){let{clientId:t,apiUrl:r,plugins:o,resolveUser:a,environment:i}=e,s=new Map,f=new Map,p=false,b=[];for(let l of o){let h={clientId:t,baseUrl:r,environment:i,logger:Ke(l.name),getStore:()=>s.get(l.name),setStore:x=>{s.set(l.name,x);},resolveUser:()=>{p||a();},getSdkSessionId:()=>Se(),reseatSdkSessionId:x=>we(x),getAnonymousId:()=>ve(),getUserId:()=>_e(),getReplayStartMs:()=>Ne(),publishReplayStartMs:x=>We(x)};if(f.set(l.name,h),l.onInit){let x=(async()=>{try{await l.onInit?.(h);}catch(F){h.logger.error("onInit threw",F);}})();b.push(x);}}let g=b.length===0?Promise.resolve():Promise.all(b).then(()=>{});return {whenReady:()=>g,enrichSubmission:async l=>{if(o.length===0)return l;let h=o.map(async F=>{if(!F.onFeedbackSubmit)return;let A=f.get(F.name);if(A)try{return await F.onFeedbackSubmit(A,l)}catch(Z){A.logger.error("onFeedbackSubmit threw",Z);return}}),x=await Promise.all(h);return Ve(l,x)},destroy:()=>{if(!p){p=true;for(let l of o){if(!l.onDestroy)continue;let h=f.get(l.name);if(h)try{l.onDestroy(h);}catch(x){h.logger.error("onDestroy threw",x);}}s.clear(),f.clear();}}}}function Xe(e){let{clientId:t,environment:r,metadata:o,disablePageContext:a,payload:i}=e,s=a?void 0:typeof window<"u"?window.location.href:"",f=a?void 0:typeof document<"u"&&document.title||"Untitled Page",p=a?void 0:typeof document<"u"&&document.referrer?document.referrer:void 0,b=i.comment?.trim()||void 0,g=i.userEmail?.trim()||void 0,l={clientId:t,rating:i.rating,comment:b,userEmail:g,pageUrl:s,pageTitle:f,referrer:p,environment:r};return i.screenshots&&i.screenshots.length>0&&(l.screenshots=i.screenshots),(o!==void 0||i.metadata!==void 0)&&(l.metadata={...o??{},...i.metadata??{}}),l}async function Qe(e,t,r){let o=await t.enrichSubmission(r);return e.submitFeedback(o)}function Ze(e){let t=[],r=e.rating!=null,o=!!e.comment?.trim();return !r&&!o&&t.push("Add rating or comment"),r&&e.rating!==void 0&&![1,2,3,4].includes(e.rating)&&t.push("Invalid rating"),o&&e.comment!==void 0&&(e.comment.length>1e3&&t.push("Comment too long"),/<script[^>]*>.*?<\/script>/gi.test(e.comment)&&t.push("Invalid comment")),{isValid:t.length===0,errors:t}}var et=`
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
`;var Gt=Ge;function St(){return typeof window>"u"||typeof window.matchMedia!="function"?ie:window.matchMedia("(prefers-color-scheme: dark)").matches?ie:window.matchMedia("(prefers-color-scheme: light)").matches?he:ie}function ke(e){let t=St();return e?{...t,...e}:t}var tt="feedback_user_email",ce=new Map;function O(e){return e.replace(/[&<>"']/g,t=>{switch(t){case "&":return "&amp;";case "<":return "&lt;";case ">":return "&gt;";case '"':return "&quot;";case "'":return "&#x27;";default:return t}})}function wt(){if(typeof window>"u")return "";try{return window.localStorage.getItem(tt)??""}catch{return ""}}function kt(e){try{window.localStorage.setItem(tt,e);}catch{}}function Kt(e){if(typeof document>"u")return {destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}};let{clientId:t,baseUrl:r}=e;if(!t||t.length<3){let n=new Error("Invalid config. Contact admin.");return e.onError?.(n),{destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}}}let o=e.position??"right",a=e.theme,i=ke(a),s=e.title??"Share Feedback",f=e.placeholder??"Tell us what you think... (optional)",p=e.showEmailOption??true,b=e.showScreenshotOption??true,g=e.environment,l=e.metadata,h=e.hideTrigger??false,x=e.disablePageContext??false,F=e.onSubmit,A=e.onError,Z=e.onOpen,Ue=e.onClose,ue=new oe(r),j=Je({apiUrl:r??X,clientId:t},{user:e.user,getUser:e.getUser}),fe=Ye({clientId:t,apiUrl:r??X,plugins:e.plugins??[],resolveUser:()=>j.resolveUser(),environment:g}),H=ce.get(t),S=H?.isOpen??false,ee=false,C=H?.rating,T=H?.comment??"",$=H?.shareEmail??false,L=wt(),P=false,w=null,m=H?[...H.screenshots]:[],M=false,k=null;function Ee(){if(C===void 0&&T.trim()===""&&m.length===0){ce.delete(t);return}ce.set(t,{rating:C,comment:T,shareEmail:$,screenshots:[...m],isOpen:S});}let z=3,nt=10*1024*1024,B=document.createElement("div");B.setAttribute("data-usero-widget",""),B.style.cssText="all: initial;",document.body.appendChild(B);let q=B.attachShadow({mode:"open"});function rt(){j.resolveUser();}function pe(n){try{window.dispatchEvent(new CustomEvent("usero:shadow-update",{detail:{host:B,root:q,reason:n}}));}catch{}}pe("mount");let Te=document.createElement("style");Te.textContent=et,q.appendChild(Te);let U=document.createElement("button"),G=document.createElement("div"),u=document.createElement("div");q.appendChild(U),q.appendChild(G),q.appendChild(u);function it(n){w=n,E();}function Pe(){S||(S=true,ee=true,w=null,k=null,M=false,ue.ping(),rt(),Z?.(),E(),pe("panel-open"));}async function ot(n){if(k=null,!n.type.startsWith("image/")){k="Image files only",_();return}if(n.size>nt){k="Max 10MB",_();return}if(m.length>=z){k=`Max ${z} screenshots`,_();return}M=true,ge(),_();try{let d=await ue.uploadScreenshot(n,t);m=[...m,d];}catch(d){k=d instanceof Error?d.message:"Upload failed";}finally{M=false,ge(),_();}}function Ie(n){m=m.filter((d,v)=>v!==n),ge(),_();}function K(){S&&(S=false,Ee(),Ue?.(),E());}function Re(){return M?'<span class="fb-ups"></span> Uploading...':"\u{1F4F7} Add screenshot"}function st(){let n=m.length>=z,d=M||n;return `
			<input type="file" accept="image/*" data-role="screenshot-input" style="display:none;" aria-label="Choose screenshot" />
			<button type="button" class="fb-upb ${d?"fb-upb--dis":""}" data-role="screenshot-pick" ${d?"disabled":""} style="border:1px solid ${i.border};color:${i.text};">
				${Re()}
			</button>
		`}function Fe(){let n=m.length>=z,d=m.map((R,ne)=>`
					<div class="fb-sp">
						<img src="${O(R.url)}" alt="Screenshot ${ne+1}" class="fb-si" />
						<button type="button" class="fb-sr" data-role="screenshot-remove" data-index="${ne}" aria-label="Remove screenshot">\u2715</button>
					</div>
				`).join(""),v=k?`<div class="fb-upe">\u26A0 ${O(k)}</div>`:"",I=n?`<div class="fb-sl">Max ${z}</div>`:"";return k||m.length>0||n?`<div class="fb-up-extras">${v}${m.length>0?`<div class="fb-ss">${d}</div>`:""}${I}</div>`:""}function ge(){if(!b)return;let n=u.querySelector('button[data-role="screenshot-pick"]');if(!n)return;let d=m.length>=z,v=M||d;n.disabled=v,n.classList.toggle("fb-upb--dis",v),n.innerHTML=Re();}function _(){if(!b)return;let n=u.querySelector(".fb-up");n&&(n.innerHTML=Fe(),n.querySelectorAll('button[data-role="screenshot-remove"]').forEach(d=>{d.addEventListener("click",()=>{let v=Number(d.dataset.index);Number.isInteger(v)&&Ie(v);});}));}async function $e(){if(P)return;P=true,w=null,E();let n={rating:C,comment:T.trim()||void 0,userEmail:$&&L.trim()?L.trim():void 0,screenshots:m.length>0?m:void 0,metadata:{pageUrl:window.location.href,pageTitle:document.title||"Untitled Page",referrer:document.referrer||void 0,timestamp:Date.now()}},d=Xe({clientId:t,environment:g,metadata:l,disablePageContext:x,payload:{rating:C,comment:T,userEmail:$?L:void 0,screenshots:m}}),v=Ze(d);if(!v.isValid){P=false,it({type:"error",text:v.errors.join(", ")});return}try{let I=await Qe(ue,fe,d);if(I.success)$&&L&&kt(L),F?.(n),C=void 0,T="",$=!1,m=[],k=null,ce.delete(t),w={type:"success",text:"Thank you!"};else {let R=I.error??"Error occurred. Try again.";A?.(new Error(R)),w={type:"error",text:R};}}catch(I){let R=I instanceof Error?I.message:"Error occurred. Try again.";A?.(new Error(R)),w={type:"error",text:R};}finally{P=false,E();}}function at(){U.className=`fb-btn fb-btn--${o} ${S?"fb-btn--open":""}`,U.setAttribute("aria-label","Open feedback"),U.type="button",U.style.background=`linear-gradient(135deg, ${i.primary}, ${ye(i.primary)})`,U.innerHTML=S?'<span style="font-size:20px;">\u2715</span>':"",U.style.display=h?"none":"",U.setAttribute("aria-hidden",h?"true":"false"),U.tabIndex=h?-1:0;}function lt(){G.className="fb-backdrop",G.style.display=S?"block":"none",G.setAttribute("aria-label","Close modal");}function dt(){u.className=`fb-pnl-base fb-pnl--${o} ${S?"fb-pnl--open":"fb-pnl--closed"}`,u.style.backgroundColor=i.background,o==="right"?(u.style.borderLeft=`1px solid ${i.border}`,u.style.borderRight=""):(u.style.borderRight=`1px solid ${i.border}`,u.style.borderLeft=""),u.setAttribute("role","dialog"),u.setAttribute("aria-modal","true"),u.setAttribute("aria-labelledby","usero-feedback-title");let n=1e3-T.length,d=n<50,v=[1,2,3,4].map(c=>{let y=C===c,ft=Oe[c];return `
					<div class="${["fb-ec",y&&"fb-ec--sel"].filter(Boolean).join(" ")}" style="background:${ft}">
						<button type="button" class="fb-eb" data-rating="${c}" role="radio" aria-checked="${y}" aria-label="${c}: ${re[c]}" style="color:${i.text}">
							<div class="fb-ei"><span role="img" aria-label="${re[c]}">${De[c]}</span></div>
							<div class="fb-el" style="color:${i.text}">${re[c]}</div>
						</button>
					</div>
				`}).join(""),I=w?`<div class="fb-msg fb-msg--header ${w.type==="success"?"fb-msg--ok":"fb-msg--err"}">${w.type==="success"?"\u2713":"\u26A0"} ${O(w.text)}</div>`:"",R=b?st():"",ne=b?Fe():"",ct=p?`
				<div class="fb-email">
					<label class="fb-email-lbl" style="color:${i.text}">
						<input type="checkbox" class="fb-email-cb" data-role="share-email" ${$?"checked":""} aria-label="Share email" />
						<span>Share my email</span>
					</label>
					${$?`<input type="email" class="fb-email-inp" data-role="email-input" value="${O(L)}" placeholder="your.email@example.com" aria-label="Email" maxlength="254" autocomplete="email" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};" />`:""}
				</div>
			`:"",me=P,ut=`background:linear-gradient(135deg, ${i.primary}, ${ye(i.primary)});color:#ffffff;${me?"opacity:0.6;cursor:not-allowed;":""}`;u.innerHTML=`
			<div class="fb-cnt">
				<div class="fb-hdr" style="border-bottom:1px solid ${i.border}">
					<h2 id="usero-feedback-title" class="fb-ttl" style="color:${i.text}">${O(s)}</h2>
					${I}
					<button class="fb-close-btn" data-role="close" style="color:${i.text}" aria-label="Close" type="button">\u2715</button>
				</div>
				<form data-role="form">
					<div class="fb-es" role="radiogroup" aria-label="Rate experience">${v}</div>
					<textarea class="fb-ta" data-role="comment" placeholder="${O(f)}" aria-label="Comments" maxlength="1000" rows="2" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};">${O(T)}</textarea>
					<div class="fb-toolrow">
						${R}
						<div class="fb-charcount${d?" fb-charcount--low":""}" data-role="charcount" style="color:${d?"#dc2626":i.text};opacity:${d?1:.6};">${n} chars remaining</div>
					</div>
					${b?`<div class="fb-up">${ne}</div>`:""}
					${ct}
					<button class="fb-sub ${me?"fb-sub--dis":""}" type="submit" aria-label="Submit" ${me?"disabled":""} style="${ut}">
						${P?'<span class="fb-spin"></span>':""}
						${P?"Submitting...":"Send Feedback \u{1F680}"}
					</button>
				</form>
			</div>
		`,u.querySelector('form[data-role="form"]')?.addEventListener("submit",c=>{c.preventDefault(),$e();}),u.querySelector('button[data-role="close"]')?.addEventListener("click",K),u.querySelectorAll("button[data-rating]").forEach(c=>{c.addEventListener("click",()=>{let y=c.dataset.rating;(y==="1"||y==="2"||y==="3"||y==="4")&&(C=Number(y),ee=true,E());});});let J=u.querySelector('textarea[data-role="comment"]');J&&(ee&&(ee=false,requestAnimationFrame(()=>J.focus({preventScroll:true}))),J.addEventListener("input",()=>{if(J.value.length<=1e3){T=J.value;let c=u.querySelector('[data-role="charcount"]');if(c){let y=1e3-T.length;c.textContent=`${y} chars remaining`,c.style.color=y<50?"#dc2626":i.text,c.style.opacity=y<50?"1":"0.6";}}}));let Le=u.querySelector('input[data-role="share-email"]');Le?.addEventListener("change",()=>{$=Le.checked,E();});let be=u.querySelector('input[data-role="email-input"]');be?.addEventListener("input",()=>{be.value.length<=254&&(L=be.value);});let Y=u.querySelector('input[data-role="screenshot-input"]');u.querySelector('button[data-role="screenshot-pick"]')?.addEventListener("click",()=>{Y?.click();}),Y?.addEventListener("change",()=>{let c=Y.files?.[0];c&&ot(c).finally(()=>{Y&&(Y.value="");});}),u.querySelectorAll('button[data-role="screenshot-remove"]').forEach(c=>{c.addEventListener("click",()=>{let y=Number(c.dataset.index);Number.isInteger(y)&&Ie(y);});});}function E(){at(),lt(),dt();}U.addEventListener("click",()=>{S?K():Pe();}),G.addEventListener("click",()=>{M||P||K();});let Me=n=>{if(S){if(n.key==="Escape"){if(M||P)return;K();}n.key==="Enter"&&(n.metaKey||n.ctrlKey)&&(n.preventDefault(),$e());}};document.addEventListener("keydown",Me);let W=null,V=null;function Ae(){W&&V&&W.removeEventListener("change",V),W=null,V=null;}function Ce(){W||typeof window>"u"||typeof window.matchMedia!="function"||(W=window.matchMedia("(prefers-color-scheme: dark)"),V=()=>{a===void 0&&(i=ke(void 0),E());},W.addEventListener("change",V));}a===void 0&&Ce(),E(),S&&pe("panel-open");let te=false;return {destroy:()=>{te||(te=true,Ee(),document.removeEventListener("keydown",Me),Ae(),fe.destroy(),B.remove());},open:Pe,close:K,whenReady:()=>fe.whenReady(),identify:n=>{te||j.identify(n);},update:n=>{if(te)return;let d=false;n.position!==void 0&&n.position!==o&&(o=n.position,d=true),"theme"in n&&(a=n.theme,i=ke(a),a===void 0?Ce():Ae(),d=true),n.title!==void 0&&n.title!==s&&(s=n.title,d=true),n.placeholder!==void 0&&n.placeholder!==f&&(f=n.placeholder,d=true),n.showEmailOption!==void 0&&n.showEmailOption!==p&&(p=n.showEmailOption,d=true),n.showScreenshotOption!==void 0&&n.showScreenshotOption!==b&&(b=n.showScreenshotOption,d=true),n.hideTrigger!==void 0&&n.hideTrigger!==h&&(h=n.hideTrigger,d=true),"environment"in n&&(g=n.environment),"metadata"in n&&(l=n.metadata),n.disablePageContext!==void 0&&(x=n.disablePageContext),"onSubmit"in n&&(F=n.onSubmit),"onError"in n&&(A=n.onError),"onOpen"in n&&(Z=n.onOpen),"onClose"in n&&(Ue=n.onClose),"getUser"in n&&j.setGetUser(n.getUser),"user"in n&&j.setUserProp(n.user),d&&E();}}}exports.DARK_THEME=ie;exports.DEFAULT_THEME=he;exports.__identityTest__=Gt;exports.initUseroFeedbackWidget=Kt;exports.mergePluginPatches=Ve;exports.mergeTheme=pt;exports.resolveTheme=ke;return exports;})({});//# sourceMappingURL=usero.iife.js.map
//# sourceMappingURL=usero.iife.js.map