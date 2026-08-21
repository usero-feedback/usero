// @usero/sdk v1.3.6 (vendored 2026-08-11 from ../../dist/usero.iife.js by scripts/sync-wp-vendor.mjs)
var Usero=(function(exports){'use strict';var Le={1:"\u{1F61E}",2:"\u{1F610}",3:"\u{1F60A}",4:"\u{1F929}"},re={1:"Needs work",2:"It's okay",3:"Pretty good",4:"Amazing!"},Ce={1:"linear-gradient(135deg,#ff6b6b14,#ff6b6b1f)",2:"linear-gradient(135deg,#9ca3af0f,#9ca3af1a)",3:"linear-gradient(135deg,#3b82f614,#3b82f61f)",4:"linear-gradient(135deg,#f59e0b14,#f59e0b1f)"},Q="https://usero.io",be={primary:"#2563eb",background:"#ffffff",text:"#374151",border:"#e5e7eb",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"},ie={primary:"#2563eb",background:"#1f2937",text:"#f9fafb",border:"#374151",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)"};function ut(e={}){return {...be,...e}}function ft(e){return typeof e=="object"&&e!==null&&"error"in e}function pt(e){if(typeof e!="object"||e===null)return {success:false,error:"Invalid response"};let t=e,r=t.success===true,o=typeof t.error=="string"?t.error:void 0,s=t.screenshot,i;if(typeof s=="object"&&s!==null){let a=s;typeof a.fileName=="string"&&typeof a.url=="string"&&typeof a.fileSize=="number"&&typeof a.mimeType=="string"&&(i={fileName:a.fileName,url:a.url,fileSize:a.fileSize,mimeType:a.mimeType,width:typeof a.width=="number"?a.width:void 0,height:typeof a.height=="number"?a.height:void 0});}return {success:r,error:o,screenshot:i}}var oe=class{constructor(t=Q){this.baseUrl=t.replace(/\/$/,"");}async submitFeedback(t){try{let r=await fetch(`${this.baseUrl}/api/feedback`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(t),signal:AbortSignal.timeout(1e4)});if(!r.ok){let i=`HTTP ${r.status}: ${r.statusText}`;try{let a=await r.json();ft(a)&&typeof a.error=="string"&&(i=a.error);}catch{}throw new Error(i)}let o=await r.json(),s=typeof o=="object"&&o!==null&&"message"in o&&typeof o.message=="string"?o.message:"Feedback submitted successfully";return {success:!0,data:o,message:s}}catch(r){return {success:false,error:r instanceof Error?r.message:"An unexpected error occurred"}}}async uploadScreenshot(t,r){let o=new FormData;o.append("screenshot",t),o.append("clientId",r);let s=await fetch(`${this.baseUrl}/api/screenshots`,{method:"POST",body:o,signal:AbortSignal.timeout(3e4)}),i={success:false};try{let a=await s.json();i=pt(a);}catch{}if(!s.ok||!i.success||!i.screenshot){let a=i.error??`HTTP ${s.status}: ${s.statusText}`;throw new Error(a)}return i.screenshot}ping(){fetch(`${this.baseUrl}/api/ping`,{signal:AbortSignal.timeout(5e3)}).catch(()=>{});}};function mt(e){if(e.startsWith("#")||typeof document>"u")return e;let r=document.createElement("canvas").getContext("2d");return r?(r.fillStyle=e,r.fillStyle):e}function he(e){let t=mt(e);if(!t.startsWith("#")||t.length<7)return t;let r=parseInt(t.slice(1,3),16),o=parseInt(t.slice(3,5),16),s=parseInt(t.slice(5,7),16),i=Math.max(0,r-60),a=Math.min(255,o+40),f=Math.min(255,s+20);return `#${[i,a,f].map(m=>m.toString(16).padStart(2,"0")).join("")}`}var se="usero:anonymous-id",ae="usero:session-replay:sdk-session-id",N=null,C=null,de=null,le=null,Z=null;function ye(){if(typeof crypto<"u"&&typeof crypto.randomUUID=="function")return crypto.randomUUID();let e=new Uint8Array(16);if(typeof crypto<"u"&&typeof crypto.getRandomValues=="function")crypto.getRandomValues(e);else for(let r=0;r<e.length;r+=1)e[r]=Math.floor(Math.random()*256);let t="";for(let r of e)t+=r.toString(16).padStart(2,"0");return t}function gt(e){if(typeof window>"u")return null;try{return window.localStorage?.getItem(e)??null}catch{return null}}function De(e,t){if(!(typeof window>"u"))try{window.localStorage?.setItem(e,t);}catch{}}function bt(e){if(typeof window>"u")return null;try{return window.sessionStorage?.getItem(e)??null}catch{return null}}function Oe(e,t){if(!(typeof window>"u"))try{window.sessionStorage?.setItem(e,t);}catch{}}function xe(){if(N)return N;let e=gt(se);if(e&&/^[a-z0-9-]{8,}$/i.test(e))return N=e,e;let t=ye();return De(se,t),N=t,t}function ht(){let e=ye();return N=e,De(se,e),Z=null,de=null,e}function He(e){return /^[a-z0-9-]{8,}$/i.test(e)}function ve(){if(C)return C;let e=bt(ae);if(e&&He(e))return C=e,e;let t=ye();return Oe(ae,t),C=t,t}function Se(e){He(e)&&C!==e&&(C=e,Oe(ae,e));}function ze(){return de}function Be(e){le===null&&(le=e);}function _e(){return le}function yt(e,t){let r=t.traits??{},s=Object.keys(r).sort().map(i=>[i,r[i]??null]);return JSON.stringify([e,t.id,t.email??null,t.displayName??null,s])}async function We(e,t){let r=xe();de=t.id;let o=yt(r,t);if(o===Z)return  false;let s=`${e.apiUrl.replace(/\/$/,"")}/api/identify`,i=JSON.stringify({clientId:e.clientId,anonymousId:r,externalUserId:t.id,email:t.email,displayName:t.displayName,traits:t.traits});if(typeof document<"u"&&document.visibilityState==="hidden"&&typeof navigator<"u"&&typeof navigator.sendBeacon=="function")try{let a=new Blob([i],{type:"application/json"});if(navigator.sendBeacon(s,a))return Z=o,!0}catch{}try{let a=await fetch(s,{method:"POST",headers:{"Content-Type":"application/json"},body:i,keepalive:!0});if(!a.ok)return !0;try{let f=await a.json();f&&f.accepted===!0&&(Z=o);}catch{}return !0}catch{return  false}}function Ne(){ht();}var je={ANON_STORAGE_KEY:se,SDK_SESSION_STORAGE_KEY:ae,reseatSdkSessionId:Se,getOrMintSdkSessionId:ve,resetIdentityState:()=>{N=null,C=null,de=null,le=null,Z=null;}};function qe(e){let t=`[usero:${e}]`;return {debug:(...r)=>{typeof console<"u"&&console.debug(t,...r);},info:(...r)=>{typeof console<"u"&&console.info(t,...r);},warn:(...r)=>{typeof console<"u"&&console.warn(t,...r);},error:(...r)=>{typeof console<"u"&&console.error(t,...r);}}}function Ge(e,t){let r=e;for(let o of t){if(!o||typeof o!="object")continue;let{metadata:s,...i}=o;r={...r,...i},s&&typeof s=="object"&&(r.metadata={...r.metadata??{},...s});}return r}function Ke(e,t){let r=t.user,o=t.getUser,s=null,i,a,f;function m(p){let d=p??null;if(d){if(d.id===s&&d.traits===i&&d.email===a&&d.displayName===f)return;We(e,d),s=d.id,i=d.traits,a=d.email,f=d.displayName;}else s!==null&&(Ne(),s=null,i=void 0,a=void 0,f=void 0);}function b(){if(o)try{m(o()??null);}catch{}}return t.user!==void 0?m(t.user):o&&b(),{identify:p=>{r=p,m(p);},setUserProp:p=>{r=p,m(p);},setGetUser:p=>{o=p;},resolveUser:()=>{r!==void 0?m(r):b();}}}function Ve(e){let{clientId:t,apiUrl:r,plugins:o,resolveUser:s,environment:i}=e,a=new Map,f=new Map,m=false,b=[];for(let d of o){let v={clientId:t,baseUrl:r,environment:i,logger:qe(d.name),getStore:()=>a.get(d.name),setStore:h=>{a.set(d.name,h);},resolveUser:()=>{m||s();},getSdkSessionId:()=>ve(),reseatSdkSessionId:h=>Se(h),getAnonymousId:()=>xe(),getUserId:()=>ze(),getReplayStartMs:()=>_e(),publishReplayStartMs:h=>Be(h)};if(f.set(d.name,v),d.onInit){let h=(async()=>{try{await d.onInit?.(v);}catch(R){v.logger.error("onInit threw",R);}})();b.push(h);}}let p=b.length===0?Promise.resolve():Promise.all(b).then(()=>{});return {whenReady:()=>p,enrichSubmission:async d=>{if(o.length===0)return d;let v=o.map(async R=>{if(!R.onFeedbackSubmit)return;let O=f.get(R.name);if(O)try{return await R.onFeedbackSubmit(O,d)}catch(j){O.logger.error("onFeedbackSubmit threw",j);return}}),h=await Promise.all(v);return Ge(d,h)},destroy:()=>{if(!m){m=true;for(let d of o){if(!d.onDestroy)continue;let v=f.get(d.name);if(v)try{d.onDestroy(v);}catch(h){v.logger.error("onDestroy threw",h);}}a.clear(),f.clear();}}}}function Je(e){let{clientId:t,environment:r,metadata:o,payload:s}=e,i=typeof window<"u"?window.location.href:"",a=typeof document<"u"&&document.title||"Untitled Page",f=typeof document<"u"&&document.referrer?document.referrer:void 0,m=s.comment?.trim()||void 0,b=s.userEmail?.trim()||void 0,p={clientId:t,rating:s.rating,comment:m,userEmail:b,pageUrl:i,pageTitle:a,referrer:f,environment:r};return s.screenshots&&s.screenshots.length>0&&(p.screenshots=s.screenshots),(o!==void 0||s.metadata!==void 0)&&(p.metadata={...o??{},...s.metadata??{}}),p}async function Ye(e,t,r){let o=await t.enrichSubmission(r);return e.submitFeedback(o)}function Xe(e){let t=[],r=e.rating!=null,o=!!e.comment?.trim();return !r&&!o&&t.push("Add rating or comment"),r&&e.rating!==void 0&&![1,2,3,4].includes(e.rating)&&t.push("Invalid rating"),o&&e.comment!==void 0&&(e.comment.length>1e3&&t.push("Comment too long"),/<script[^>]*>.*?<\/script>/gi.test(e.comment)&&t.push("Invalid comment")),{isValid:t.length===0,errors:t}}var Qe=`
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
`;var jt=je;function xt(){return typeof window>"u"||typeof window.matchMedia!="function"?ie:window.matchMedia("(prefers-color-scheme: dark)").matches?ie:window.matchMedia("(prefers-color-scheme: light)").matches?be:ie}function we(e){let t=xt();return e?{...t,...e}:t}var Ze="feedback_user_email",ce=new Map;function D(e){return e.replace(/[&<>"']/g,t=>{switch(t){case "&":return "&amp;";case "<":return "&lt;";case ">":return "&gt;";case '"':return "&quot;";case "'":return "&#x27;";default:return t}})}function vt(){if(typeof window>"u")return "";try{return window.localStorage.getItem(Ze)??""}catch{return ""}}function St(e){try{window.localStorage.setItem(Ze,e);}catch{}}function qt(e){if(typeof document>"u")return {destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}};let{clientId:t,baseUrl:r}=e;if(!t||t.length<3){let n=new Error("Invalid config. Contact admin.");return e.onError?.(n),{destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}}}let o=e.position??"right",s=e.theme,i=we(s),a=e.title??"Share Feedback",f=e.placeholder??"Tell us what you think... (optional)",m=e.showEmailOption??true,b=e.showScreenshotOption??true,p=e.environment,d=e.metadata,v=e.onSubmit,h=e.onError,R=e.onOpen,O=e.onClose,j=new oe(r),q=Ke({apiUrl:r??Q,clientId:t},{user:e.user,getUser:e.getUser}),ue=Ve({clientId:t,apiUrl:r??Q,plugins:e.plugins??[],resolveUser:()=>q.resolveUser(),environment:p}),H=ce.get(t),S=H?.isOpen??false,ee=false,M=H?.rating,E=H?.comment??"",F=H?.shareEmail??false,A=vt(),T=false,w=null,g=H?[...H.screenshots]:[],$=false,k=null;function ke(){if(M===void 0&&E.trim()===""&&g.length===0){ce.delete(t);return}ce.set(t,{rating:M,comment:E,shareEmail:F,screenshots:[...g],isOpen:S});}let z=3,et=10*1024*1024,B=document.createElement("div");B.setAttribute("data-usero-widget",""),B.style.cssText="all: initial;",document.body.appendChild(B);let G=B.attachShadow({mode:"open"});function tt(){q.resolveUser();}function fe(n){try{window.dispatchEvent(new CustomEvent("usero:shadow-update",{detail:{host:B,root:G,reason:n}}));}catch{}}fe("mount");let Ue=document.createElement("style");Ue.textContent=Qe,G.appendChild(Ue);let L=document.createElement("button"),K=document.createElement("div"),u=document.createElement("div");G.appendChild(L),G.appendChild(K),G.appendChild(u);function nt(n){w=n,U();}function Ee(){S||(S=true,ee=true,w=null,k=null,$=false,j.ping(),tt(),R?.(),U(),fe("panel-open"));}async function rt(n){if(k=null,!n.type.startsWith("image/")){k="Image files only",_();return}if(n.size>et){k="Max 10MB",_();return}if(g.length>=z){k=`Max ${z} screenshots`,_();return}$=true,pe(),_();try{let l=await j.uploadScreenshot(n,t);g=[...g,l];}catch(l){k=l instanceof Error?l.message:"Upload failed";}finally{$=false,pe(),_();}}function Te(n){g=g.filter((l,x)=>x!==n),pe(),_();}function V(){S&&(S=false,ke(),O?.(),U());}function Ie(){return $?'<span class="fb-ups"></span> Uploading...':"\u{1F4F7} Add screenshot"}function it(){let n=g.length>=z,l=$||n;return `
			<input type="file" accept="image/*" data-role="screenshot-input" style="display:none;" aria-label="Choose screenshot" />
			<button type="button" class="fb-upb ${l?"fb-upb--dis":""}" data-role="screenshot-pick" ${l?"disabled":""} style="border:1px solid ${i.border};color:${i.text};">
				${Ie()}
			</button>
		`}function Pe(){let n=g.length>=z,l=g.map((P,ne)=>`
					<div class="fb-sp">
						<img src="${D(P.url)}" alt="Screenshot ${ne+1}" class="fb-si" />
						<button type="button" class="fb-sr" data-role="screenshot-remove" data-index="${ne}" aria-label="Remove screenshot">\u2715</button>
					</div>
				`).join(""),x=k?`<div class="fb-upe">\u26A0 ${D(k)}</div>`:"",I=n?`<div class="fb-sl">Max ${z}</div>`:"";return k||g.length>0||n?`<div class="fb-up-extras">${x}${g.length>0?`<div class="fb-ss">${l}</div>`:""}${I}</div>`:""}function pe(){if(!b)return;let n=u.querySelector('button[data-role="screenshot-pick"]');if(!n)return;let l=g.length>=z,x=$||l;n.disabled=x,n.classList.toggle("fb-upb--dis",x),n.innerHTML=Ie();}function _(){if(!b)return;let n=u.querySelector(".fb-up");n&&(n.innerHTML=Pe(),n.querySelectorAll('button[data-role="screenshot-remove"]').forEach(l=>{l.addEventListener("click",()=>{let x=Number(l.dataset.index);Number.isInteger(x)&&Te(x);});}));}async function Re(){if(T)return;T=true,w=null,U();let n={rating:M,comment:E.trim()||void 0,userEmail:F&&A.trim()?A.trim():void 0,screenshots:g.length>0?g:void 0,metadata:{pageUrl:window.location.href,pageTitle:document.title||"Untitled Page",referrer:document.referrer||void 0,timestamp:Date.now()}},l=Je({clientId:t,environment:p,metadata:d,payload:{rating:M,comment:E,userEmail:F?A:void 0,screenshots:g}}),x=Xe(l);if(!x.isValid){T=false,nt({type:"error",text:x.errors.join(", ")});return}try{let I=await Ye(j,ue,l);if(I.success)F&&A&&St(A),v?.(n),M=void 0,E="",F=!1,g=[],k=null,ce.delete(t),w={type:"success",text:"Thank you!"};else {let P=I.error??"Error occurred. Try again.";h?.(new Error(P)),w={type:"error",text:P};}}catch(I){let P=I instanceof Error?I.message:"Error occurred. Try again.";h?.(new Error(P)),w={type:"error",text:P};}finally{T=false,U();}}function ot(){L.className=`fb-btn fb-btn--${o} ${S?"fb-btn--open":""}`,L.setAttribute("aria-label","Open feedback"),L.type="button",L.style.background=`linear-gradient(135deg, ${i.primary}, ${he(i.primary)})`,L.innerHTML=S?'<span style="font-size:20px;">\u2715</span>':"";}function st(){K.className="fb-backdrop",K.style.display=S?"block":"none",K.setAttribute("aria-label","Close modal");}function at(){u.className=`fb-pnl-base fb-pnl--${o} ${S?"fb-pnl--open":"fb-pnl--closed"}`,u.style.backgroundColor=i.background,o==="right"?(u.style.borderLeft=`1px solid ${i.border}`,u.style.borderRight=""):(u.style.borderRight=`1px solid ${i.border}`,u.style.borderLeft=""),u.setAttribute("role","dialog"),u.setAttribute("aria-modal","true"),u.setAttribute("aria-labelledby","usero-feedback-title");let n=1e3-E.length,l=n<50,x=[1,2,3,4].map(c=>{let y=M===c,ct=Ce[c];return `
					<div class="${["fb-ec",y&&"fb-ec--sel"].filter(Boolean).join(" ")}" style="background:${ct}">
						<button type="button" class="fb-eb" data-rating="${c}" role="radio" aria-checked="${y}" aria-label="${c}: ${re[c]}" style="color:${i.text}">
							<div class="fb-ei"><span role="img" aria-label="${re[c]}">${Le[c]}</span></div>
							<div class="fb-el" style="color:${i.text}">${re[c]}</div>
						</button>
					</div>
				`}).join(""),I=w?`<div class="fb-msg fb-msg--header ${w.type==="success"?"fb-msg--ok":"fb-msg--err"}">${w.type==="success"?"\u2713":"\u26A0"} ${D(w.text)}</div>`:"",P=b?it():"",ne=b?Pe():"",lt=m?`
				<div class="fb-email">
					<label class="fb-email-lbl" style="color:${i.text}">
						<input type="checkbox" class="fb-email-cb" data-role="share-email" ${F?"checked":""} aria-label="Share email" />
						<span>Share my email</span>
					</label>
					${F?`<input type="email" class="fb-email-inp" data-role="email-input" value="${D(A)}" placeholder="your.email@example.com" aria-label="Email" maxlength="254" autocomplete="email" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};" />`:""}
				</div>
			`:"",me=T,dt=`background:linear-gradient(135deg, ${i.primary}, ${he(i.primary)});color:#ffffff;${me?"opacity:0.6;cursor:not-allowed;":""}`;u.innerHTML=`
			<div class="fb-cnt">
				<div class="fb-hdr" style="border-bottom:1px solid ${i.border}">
					<h2 id="usero-feedback-title" class="fb-ttl" style="color:${i.text}">${D(a)}</h2>
					${I}
					<button class="fb-close-btn" data-role="close" style="color:${i.text}" aria-label="Close" type="button">\u2715</button>
				</div>
				<form data-role="form">
					<div class="fb-es" role="radiogroup" aria-label="Rate experience">${x}</div>
					<textarea class="fb-ta" data-role="comment" placeholder="${D(f)}" aria-label="Comments" maxlength="1000" rows="2" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};">${D(E)}</textarea>
					<div class="fb-toolrow">
						${P}
						<div class="fb-charcount${l?" fb-charcount--low":""}" data-role="charcount" style="color:${l?"#dc2626":i.text};opacity:${l?1:.6};">${n} chars remaining</div>
					</div>
					${b?`<div class="fb-up">${ne}</div>`:""}
					${lt}
					<button class="fb-sub ${me?"fb-sub--dis":""}" type="submit" aria-label="Submit" ${me?"disabled":""} style="${dt}">
						${T?'<span class="fb-spin"></span>':""}
						${T?"Submitting...":"Send Feedback \u{1F680}"}
					</button>
				</form>
			</div>
		`,u.querySelector('form[data-role="form"]')?.addEventListener("submit",c=>{c.preventDefault(),Re();}),u.querySelector('button[data-role="close"]')?.addEventListener("click",V),u.querySelectorAll("button[data-rating]").forEach(c=>{c.addEventListener("click",()=>{let y=c.dataset.rating;(y==="1"||y==="2"||y==="3"||y==="4")&&(M=Number(y),ee=true,U());});});let Y=u.querySelector('textarea[data-role="comment"]');Y&&(ee&&(ee=false,requestAnimationFrame(()=>Y.focus({preventScroll:true}))),Y.addEventListener("input",()=>{if(Y.value.length<=1e3){E=Y.value;let c=u.querySelector('[data-role="charcount"]');if(c){let y=1e3-E.length;c.textContent=`${y} chars remaining`,c.style.color=y<50?"#dc2626":i.text,c.style.opacity=y<50?"1":"0.6";}}}));let Ae=u.querySelector('input[data-role="share-email"]');Ae?.addEventListener("change",()=>{F=Ae.checked,U();});let ge=u.querySelector('input[data-role="email-input"]');ge?.addEventListener("input",()=>{ge.value.length<=254&&(A=ge.value);});let X=u.querySelector('input[data-role="screenshot-input"]');u.querySelector('button[data-role="screenshot-pick"]')?.addEventListener("click",()=>{X?.click();}),X?.addEventListener("change",()=>{let c=X.files?.[0];c&&rt(c).finally(()=>{X&&(X.value="");});}),u.querySelectorAll('button[data-role="screenshot-remove"]').forEach(c=>{c.addEventListener("click",()=>{let y=Number(c.dataset.index);Number.isInteger(y)&&Te(y);});});}function U(){ot(),st(),at();}L.addEventListener("click",()=>{S?V():Ee();}),K.addEventListener("click",()=>{$||T||V();});let Fe=n=>{if(S){if(n.key==="Escape"){if($||T)return;V();}n.key==="Enter"&&(n.metaKey||n.ctrlKey)&&(n.preventDefault(),Re());}};document.addEventListener("keydown",Fe);let W=null,J=null;function $e(){W&&J&&W.removeEventListener("change",J),W=null,J=null;}function Me(){W||typeof window>"u"||typeof window.matchMedia!="function"||(W=window.matchMedia("(prefers-color-scheme: dark)"),J=()=>{s===void 0&&(i=we(void 0),U());},W.addEventListener("change",J));}s===void 0&&Me(),U(),S&&fe("panel-open");let te=false;return {destroy:()=>{te||(te=true,ke(),document.removeEventListener("keydown",Fe),$e(),ue.destroy(),B.remove());},open:Ee,close:V,whenReady:()=>ue.whenReady(),identify:n=>{te||q.identify(n);},update:n=>{if(te)return;let l=false;n.position!==void 0&&n.position!==o&&(o=n.position,l=true),"theme"in n&&(s=n.theme,i=we(s),s===void 0?Me():$e(),l=true),n.title!==void 0&&n.title!==a&&(a=n.title,l=true),n.placeholder!==void 0&&n.placeholder!==f&&(f=n.placeholder,l=true),n.showEmailOption!==void 0&&n.showEmailOption!==m&&(m=n.showEmailOption,l=true),n.showScreenshotOption!==void 0&&n.showScreenshotOption!==b&&(b=n.showScreenshotOption,l=true),"environment"in n&&(p=n.environment),"metadata"in n&&(d=n.metadata),"onSubmit"in n&&(v=n.onSubmit),"onError"in n&&(h=n.onError),"onOpen"in n&&(R=n.onOpen),"onClose"in n&&(O=n.onClose),"getUser"in n&&q.setGetUser(n.getUser),"user"in n&&q.setUserProp(n.user),l&&U();}}}exports.DARK_THEME=ie;exports.DEFAULT_THEME=be;exports.__identityTest__=jt;exports.initUseroFeedbackWidget=qt;exports.mergePluginPatches=Ge;exports.mergeTheme=ut;exports.resolveTheme=we;return exports;})({});//# sourceMappingURL=usero.iife.js.map
//# sourceMappingURL=usero.iife.js.map