// @usero/sdk v1.3.0 (vendored 2026-06-12 from ../../dist/usero.iife.js by scripts/sync-wp-vendor.mjs)
var Usero=(function(exports){'use strict';var $e={1:"\u{1F61E}",2:"\u{1F610}",3:"\u{1F60A}",4:"\u{1F929}"},te={1:"Needs work",2:"It's okay",3:"Pretty good",4:"Amazing!"},Me={1:"linear-gradient(135deg,#ff6b6b14,#ff6b6b1f)",2:"linear-gradient(135deg,#9ca3af0f,#9ca3af1a)",3:"linear-gradient(135deg,#3b82f614,#3b82f61f)",4:"linear-gradient(135deg,#f59e0b14,#f59e0b1f)"},J="https://usero.io",pe={primary:"#2563eb",background:"#ffffff",text:"#374151",border:"#e5e7eb",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"},ne={primary:"#2563eb",background:"#1f2937",text:"#f9fafb",border:"#374151",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)"};function lt(e={}){return {...pe,...e}}function dt(e){return typeof e=="object"&&e!==null&&"error"in e}function ct(e){if(typeof e!="object"||e===null)return {success:false,error:"Invalid response"};let t=e,r=t.success===true,o=typeof t.error=="string"?t.error:void 0,s=t.screenshot,i;if(typeof s=="object"&&s!==null){let a=s;typeof a.fileName=="string"&&typeof a.url=="string"&&typeof a.fileSize=="number"&&typeof a.mimeType=="string"&&(i={fileName:a.fileName,url:a.url,fileSize:a.fileSize,mimeType:a.mimeType,width:typeof a.width=="number"?a.width:void 0,height:typeof a.height=="number"?a.height:void 0});}return {success:r,error:o,screenshot:i}}var re=class{constructor(t=J){this.baseUrl=t.replace(/\/$/,"");}async submitFeedback(t){try{let r=await fetch(`${this.baseUrl}/api/feedback`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(t),signal:AbortSignal.timeout(1e4)});if(!r.ok){let i=`HTTP ${r.status}: ${r.statusText}`;try{let a=await r.json();dt(a)&&typeof a.error=="string"&&(i=a.error);}catch{}throw new Error(i)}let o=await r.json(),s=typeof o=="object"&&o!==null&&"message"in o&&typeof o.message=="string"?o.message:"Feedback submitted successfully";return {success:!0,data:o,message:s}}catch(r){return {success:false,error:r instanceof Error?r.message:"An unexpected error occurred"}}}async uploadScreenshot(t,r){let o=new FormData;o.append("screenshot",t),o.append("clientId",r);let s=await fetch(`${this.baseUrl}/api/screenshots`,{method:"POST",body:o,signal:AbortSignal.timeout(3e4)}),i={success:false};try{let a=await s.json();i=ct(a);}catch{}if(!s.ok||!i.success||!i.screenshot){let a=i.error??`HTTP ${s.status}: ${s.statusText}`;throw new Error(a)}return i.screenshot}ping(){fetch(`${this.baseUrl}/api/ping`,{signal:AbortSignal.timeout(5e3)}).catch(()=>{});}};function ut(e){if(e.startsWith("#")||typeof document>"u")return e;let r=document.createElement("canvas").getContext("2d");return r?(r.fillStyle=e,r.fillStyle):e}function me(e){let t=ut(e);if(!t.startsWith("#")||t.length<7)return t;let r=parseInt(t.slice(1,3),16),o=parseInt(t.slice(3,5),16),s=parseInt(t.slice(5,7),16),i=Math.max(0,r-60),a=Math.min(255,o+40),p=Math.min(255,s+20);return `#${[i,a,p].map(m=>m.toString(16).padStart(2,"0")).join("")}`}var ie="usero:anonymous-id",oe="usero:session-replay:sdk-session-id",_=null,A=null,ae=null,se=null,Y=null;function ge(){if(typeof crypto<"u"&&typeof crypto.randomUUID=="function")return crypto.randomUUID();let e=new Uint8Array(16);if(typeof crypto<"u"&&typeof crypto.getRandomValues=="function")crypto.getRandomValues(e);else for(let r=0;r<e.length;r+=1)e[r]=Math.floor(Math.random()*256);let t="";for(let r of e)t+=r.toString(16).padStart(2,"0");return t}function ft(e){if(typeof window>"u")return null;try{return window.localStorage?.getItem(e)??null}catch{return null}}function Ae(e,t){if(!(typeof window>"u"))try{window.localStorage?.setItem(e,t);}catch{}}function pt(e){if(typeof window>"u")return null;try{return window.sessionStorage?.getItem(e)??null}catch{return null}}function Le(e,t){if(!(typeof window>"u"))try{window.sessionStorage?.setItem(e,t);}catch{}}function be(){if(_)return _;let e=ft(ie);if(e&&/^[a-z0-9-]{8,}$/i.test(e))return _=e,e;let t=ge();return Ae(ie,t),_=t,t}function mt(){let e=ge();return _=e,Ae(ie,e),Y=null,ae=null,e}function Ce(e){return /^[a-z0-9-]{8,}$/i.test(e)}function he(){if(A)return A;let e=pt(oe);if(e&&Ce(e))return A=e,e;let t=ge();return Le(oe,t),A=t,t}function ye(e){Ce(e)&&A!==e&&(A=e,Le(oe,e));}function Oe(){return ae}function De(e){se===null&&(se=e);}function He(){return se}function gt(e,t){let r=t.traits??{},s=Object.keys(r).sort().map(i=>[i,r[i]??null]);return JSON.stringify([e,t.id,t.email??null,t.displayName??null,s])}async function ze(e,t){let r=be();ae=t.id;let o=gt(r,t);if(o===Y)return  false;let s=`${e.apiUrl.replace(/\/$/,"")}/api/identify`,i=JSON.stringify({clientId:e.clientId,anonymousId:r,externalUserId:t.id,email:t.email,displayName:t.displayName,traits:t.traits});if(typeof document<"u"&&document.visibilityState==="hidden"&&typeof navigator<"u"&&typeof navigator.sendBeacon=="function")try{let a=new Blob([i],{type:"application/json"});if(navigator.sendBeacon(s,a))return Y=o,!0}catch{}try{let a=await fetch(s,{method:"POST",headers:{"Content-Type":"application/json"},body:i,keepalive:!0});if(!a.ok)return !0;try{let p=await a.json();p&&p.accepted===!0&&(Y=o);}catch{}return !0}catch{return  false}}function Be(){mt();}var _e={ANON_STORAGE_KEY:ie,SDK_SESSION_STORAGE_KEY:oe,reseatSdkSessionId:ye,getOrMintSdkSessionId:he,resetIdentityState:()=>{_=null,A=null,ae=null,se=null,Y=null;}};function Ne(e){let t=`[usero:${e}]`;return {debug:(...r)=>{typeof console<"u"&&console.debug(t,...r);},info:(...r)=>{typeof console<"u"&&console.info(t,...r);},warn:(...r)=>{typeof console<"u"&&console.warn(t,...r);},error:(...r)=>{typeof console<"u"&&console.error(t,...r);}}}function We(e,t){let r=e;for(let o of t){if(!o||typeof o!="object")continue;let{metadata:s,...i}=o;r={...r,...i},s&&typeof s=="object"&&(r.metadata={...r.metadata??{},...s});}return r}function je(e,t){let r=t.user,o=t.getUser,s=null,i,a,p;function m(l){let u=l??null;if(u){if(u.id===s&&u.traits===i&&u.email===a&&u.displayName===p)return;ze(e,u),s=u.id,i=u.traits,a=u.email,p=u.displayName;}else s!==null&&(Be(),s=null,i=void 0,a=void 0,p=void 0);}function y(){if(o)try{m(o()??null);}catch{}}return t.user!==void 0?m(t.user):o&&y(),{identify:l=>{r=l,m(l);},setUserProp:l=>{r=l,m(l);},setGetUser:l=>{o=l;},resolveUser:()=>{r!==void 0?m(r):y();}}}function qe(e){let{clientId:t,apiUrl:r,plugins:o,resolveUser:s}=e,i=new Map,a=new Map,p=false,m=[];for(let l of o){let u={clientId:t,baseUrl:r,logger:Ne(l.name),getStore:()=>i.get(l.name),setStore:b=>{i.set(l.name,b);},resolveUser:()=>{p||s();},getSdkSessionId:()=>he(),reseatSdkSessionId:b=>ye(b),getAnonymousId:()=>be(),getUserId:()=>Oe(),getReplayStartMs:()=>He(),publishReplayStartMs:b=>De(b)};if(a.set(l.name,u),l.onInit){let b=(async()=>{try{await l.onInit?.(u);}catch(U){u.logger.error("onInit threw",U);}})();m.push(b);}}let y=m.length===0?Promise.resolve():Promise.all(m).then(()=>{});return {whenReady:()=>y,enrichSubmission:async l=>{if(o.length===0)return l;let u=o.map(async U=>{if(!U.onFeedbackSubmit)return;let C=a.get(U.name);if(C)try{return await U.onFeedbackSubmit(C,l)}catch(X){C.logger.error("onFeedbackSubmit threw",X);return}}),b=await Promise.all(u);return We(l,b)},destroy:()=>{if(!p){p=true;for(let l of o){if(!l.onDestroy)continue;let u=a.get(l.name);if(u)try{l.onDestroy(u);}catch(b){u.logger.error("onDestroy threw",b);}}i.clear(),a.clear();}}}}function Ge(e){let{clientId:t,environment:r,metadata:o,payload:s}=e,i=typeof window<"u"?window.location.href:"",a=typeof document<"u"&&document.title||"Untitled Page",p=typeof document<"u"&&document.referrer?document.referrer:void 0,m=s.comment?.trim()||void 0,y=s.userEmail?.trim()||void 0,l={clientId:t,rating:s.rating,comment:m,userEmail:y,pageUrl:i,pageTitle:a,referrer:p,environment:r};return s.screenshots&&s.screenshots.length>0&&(l.screenshots=s.screenshots),(o!==void 0||s.metadata!==void 0)&&(l.metadata={...o??{},...s.metadata??{}}),l}async function Ke(e,t,r){let o=await t.enrichSubmission(r);return e.submitFeedback(o)}function Ve(e){let t=[],r=e.rating!=null,o=!!e.comment?.trim();return !r&&!o&&t.push("Add rating or comment"),r&&e.rating!==void 0&&![1,2,3,4].includes(e.rating)&&t.push("Invalid rating"),o&&e.comment!==void 0&&(e.comment.length>1e3&&t.push("Comment too long"),/<script[^>]*>.*?<\/script>/gi.test(e.comment)&&t.push("Invalid comment")),{isValid:t.length===0,errors:t}}var Je=`
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
`;var _t=_e;function bt(){return typeof window>"u"||typeof window.matchMedia!="function"?ne:window.matchMedia("(prefers-color-scheme: dark)").matches?ne:window.matchMedia("(prefers-color-scheme: light)").matches?pe:ne}function xe(e){let t=bt();return e?{...t,...e}:t}var Ye="feedback_user_email";function L(e){return e.replace(/[&<>"']/g,t=>{switch(t){case "&":return "&amp;";case "<":return "&lt;";case ">":return "&gt;";case '"':return "&quot;";case "'":return "&#x27;";default:return t}})}function ht(){if(typeof window>"u")return "";try{return window.localStorage.getItem(Ye)??""}catch{return ""}}function yt(e){try{window.localStorage.setItem(Ye,e);}catch{}}function Nt(e){if(typeof document>"u")return {destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}};let{clientId:t,baseUrl:r}=e;if(!t||t.length<3){let n=new Error("Invalid config. Contact admin.");return e.onError?.(n),{destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}}}let o=e.position??"right",s=e.theme,i=xe(s),a=e.title??"Share Feedback",p=e.placeholder??"Tell us what you think... (optional)",m=e.showEmailOption??true,y=e.showScreenshotOption??true,l=e.environment,u=e.metadata,b=e.onSubmit,U=e.onError,C=e.onOpen,X=e.onClose,le=new re(r),N=je({apiUrl:r??J,clientId:t},{user:e.user,getUser:e.getUser}),de=qe({clientId:t,apiUrl:r??J,plugins:e.plugins??[],resolveUser:()=>N.resolveUser()}),v=false,Q=false,O,P="",R=false,$=ht(),E=false,S=null,g=[],F=false,w=null,D=3,Xe=10*1024*1024,H=document.createElement("div");H.setAttribute("data-usero-widget",""),H.style.cssText="all: initial;",document.body.appendChild(H);let W=H.attachShadow({mode:"open"});function Qe(){N.resolveUser();}function ve(n){try{window.dispatchEvent(new CustomEvent("usero:shadow-update",{detail:{host:H,root:W,reason:n}}));}catch{}}ve("mount");let Se=document.createElement("style");Se.textContent=Je,W.appendChild(Se);let M=document.createElement("button"),j=document.createElement("div"),f=document.createElement("div");W.appendChild(M),W.appendChild(j),W.appendChild(f);function Ze(n){S=n,k();}function we(){v||(v=true,Q=true,O=void 0,P="",R=false,S=null,g=[],w=null,F=false,le.ping(),Qe(),C?.(),k(),ve("panel-open"));}async function et(n){if(w=null,!n.type.startsWith("image/")){w="Image files only",z();return}if(n.size>Xe){w="Max 10MB",z();return}if(g.length>=D){w=`Max ${D} screenshots`,z();return}F=true,ce(),z();try{let d=await le.uploadScreenshot(n,t);g=[...g,d];}catch(d){w=d instanceof Error?d.message:"Upload failed";}finally{F=false,ce(),z();}}function ke(n){g=g.filter((d,x)=>x!==n),ce(),z();}function q(){v&&(v=false,X?.(),k());}function Ue(){return F?'<span class="fb-ups"></span> Uploading...':"\u{1F4F7} Add screenshot"}function tt(){let n=g.length>=D,d=F||n;return `
			<input type="file" accept="image/*" data-role="screenshot-input" style="display:none;" aria-label="Choose screenshot" />
			<button type="button" class="fb-upb ${d?"fb-upb--dis":""}" data-role="screenshot-pick" ${d?"disabled":""} style="border:1px solid ${i.border};color:${i.text};">
				${Ue()}
			</button>
		`}function Ee(){let n=g.length>=D,d=g.map((I,ee)=>`
					<div class="fb-sp">
						<img src="${L(I.url)}" alt="Screenshot ${ee+1}" class="fb-si" />
						<button type="button" class="fb-sr" data-role="screenshot-remove" data-index="${ee}" aria-label="Remove screenshot">\u2715</button>
					</div>
				`).join(""),x=w?`<div class="fb-upe">\u26A0 ${L(w)}</div>`:"",T=n?`<div class="fb-sl">Max ${D}</div>`:"";return w||g.length>0||n?`<div class="fb-up-extras">${x}${g.length>0?`<div class="fb-ss">${d}</div>`:""}${T}</div>`:""}function ce(){if(!y)return;let n=f.querySelector('button[data-role="screenshot-pick"]');if(!n)return;let d=g.length>=D,x=F||d;n.disabled=x,n.classList.toggle("fb-upb--dis",x),n.innerHTML=Ue();}function z(){if(!y)return;let n=f.querySelector(".fb-up");n&&(n.innerHTML=Ee(),n.querySelectorAll('button[data-role="screenshot-remove"]').forEach(d=>{d.addEventListener("click",()=>{let x=Number(d.dataset.index);Number.isInteger(x)&&ke(x);});}));}async function Te(){if(E)return;E=true,S=null,k();let n={rating:O,comment:P.trim()||void 0,userEmail:R&&$.trim()?$.trim():void 0,screenshots:g.length>0?g:void 0,metadata:{pageUrl:window.location.href,pageTitle:document.title||"Untitled Page",referrer:document.referrer||void 0,timestamp:Date.now()}},d=Ge({clientId:t,environment:l,metadata:u,payload:{rating:O,comment:P,userEmail:R?$:void 0,screenshots:g}}),x=Ve(d);if(!x.isValid){E=false,Ze({type:"error",text:x.errors.join(", ")});return}try{let T=await Ke(le,de,d);if(T.success)R&&$&&yt($),b?.(n),O=void 0,P="",R=!1,g=[],w=null,S={type:"success",text:"Thank you!"};else {let I=T.error??"Error occurred. Try again.";U?.(new Error(I)),S={type:"error",text:I};}}catch(T){let I=T instanceof Error?T.message:"Error occurred. Try again.";U?.(new Error(I)),S={type:"error",text:I};}finally{E=false,k();}}function nt(){M.className=`fb-btn fb-btn--${o} ${v?"fb-btn--open":""}`,M.setAttribute("aria-label","Open feedback"),M.type="button",M.style.background=`linear-gradient(135deg, ${i.primary}, ${me(i.primary)})`,M.innerHTML=v?'<span style="font-size:20px;">\u2715</span>':"";}function rt(){j.className="fb-backdrop",j.style.display=v?"block":"none",j.setAttribute("aria-label","Close modal");}function it(){f.className=`fb-pnl-base fb-pnl--${o} ${v?"fb-pnl--open":"fb-pnl--closed"}`,f.style.backgroundColor=i.background,o==="right"?(f.style.borderLeft=`1px solid ${i.border}`,f.style.borderRight=""):(f.style.borderRight=`1px solid ${i.border}`,f.style.borderLeft=""),f.setAttribute("role","dialog"),f.setAttribute("aria-modal","true"),f.setAttribute("aria-labelledby","usero-feedback-title");let n=1e3-P.length,d=n<50,x=[1,2,3,4].map(c=>{let h=O===c,at=Me[c];return `
					<div class="${["fb-ec",h&&"fb-ec--sel"].filter(Boolean).join(" ")}" style="background:${at}">
						<button type="button" class="fb-eb" data-rating="${c}" role="radio" aria-checked="${h}" aria-label="${c}: ${te[c]}" style="color:${i.text}">
							<div class="fb-ei"><span role="img" aria-label="${te[c]}">${$e[c]}</span></div>
							<div class="fb-el" style="color:${i.text}">${te[c]}</div>
						</button>
					</div>
				`}).join(""),T=S?`<div class="fb-msg fb-msg--header ${S.type==="success"?"fb-msg--ok":"fb-msg--err"}">${S.type==="success"?"\u2713":"\u26A0"} ${L(S.text)}</div>`:"",I=y?tt():"",ee=y?Ee():"",ot=m?`
				<div class="fb-email">
					<label class="fb-email-lbl" style="color:${i.text}">
						<input type="checkbox" class="fb-email-cb" data-role="share-email" ${R?"checked":""} aria-label="Share email" />
						<span>Share my email</span>
					</label>
					${R?`<input type="email" class="fb-email-inp" data-role="email-input" value="${L($)}" placeholder="your.email@example.com" aria-label="Email" maxlength="254" autocomplete="email" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};" />`:""}
				</div>
			`:"",ue=E,st=`background:linear-gradient(135deg, ${i.primary}, ${me(i.primary)});color:#ffffff;${ue?"opacity:0.6;cursor:not-allowed;":""}`;f.innerHTML=`
			<div class="fb-cnt">
				<div class="fb-hdr" style="border-bottom:1px solid ${i.border}">
					<h2 id="usero-feedback-title" class="fb-ttl" style="color:${i.text}">${L(a)}</h2>
					${T}
					<button class="fb-close-btn" data-role="close" style="color:${i.text}" aria-label="Close" type="button">\u2715</button>
				</div>
				<form data-role="form">
					<div class="fb-es" role="radiogroup" aria-label="Rate experience">${x}</div>
					<textarea class="fb-ta" data-role="comment" placeholder="${L(p)}" aria-label="Comments" maxlength="1000" rows="2" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};">${L(P)}</textarea>
					<div class="fb-toolrow">
						${I}
						<div class="fb-charcount${d?" fb-charcount--low":""}" data-role="charcount" style="color:${d?"#dc2626":i.text};opacity:${d?1:.6};">${n} chars remaining</div>
					</div>
					${y?`<div class="fb-up">${ee}</div>`:""}
					${ot}
					<button class="fb-sub ${ue?"fb-sub--dis":""}" type="submit" aria-label="Submit" ${ue?"disabled":""} style="${st}">
						${E?'<span class="fb-spin"></span>':""}
						${E?"Submitting...":"Send Feedback \u{1F680}"}
					</button>
				</form>
			</div>
		`,f.querySelector('form[data-role="form"]')?.addEventListener("submit",c=>{c.preventDefault(),Te();}),f.querySelector('button[data-role="close"]')?.addEventListener("click",q),f.querySelectorAll("button[data-rating]").forEach(c=>{c.addEventListener("click",()=>{let h=c.dataset.rating;(h==="1"||h==="2"||h==="3"||h==="4")&&(O=Number(h),Q=true,k());});});let K=f.querySelector('textarea[data-role="comment"]');K&&(Q&&(Q=false,requestAnimationFrame(()=>K.focus({preventScroll:true}))),K.addEventListener("input",()=>{if(K.value.length<=1e3){P=K.value;let c=f.querySelector('[data-role="charcount"]');if(c){let h=1e3-P.length;c.textContent=`${h} chars remaining`,c.style.color=h<50?"#dc2626":i.text,c.style.opacity=h<50?"1":"0.6";}}}));let Fe=f.querySelector('input[data-role="share-email"]');Fe?.addEventListener("change",()=>{R=Fe.checked,k();});let fe=f.querySelector('input[data-role="email-input"]');fe?.addEventListener("input",()=>{fe.value.length<=254&&($=fe.value);});let V=f.querySelector('input[data-role="screenshot-input"]');f.querySelector('button[data-role="screenshot-pick"]')?.addEventListener("click",()=>{V?.click();}),V?.addEventListener("change",()=>{let c=V.files?.[0];c&&et(c).finally(()=>{V&&(V.value="");});}),f.querySelectorAll('button[data-role="screenshot-remove"]').forEach(c=>{c.addEventListener("click",()=>{let h=Number(c.dataset.index);Number.isInteger(h)&&ke(h);});});}function k(){nt(),rt(),it();}M.addEventListener("click",()=>{v?q():we();}),j.addEventListener("click",()=>{F||E||q();});let Ie=n=>{if(v){if(n.key==="Escape"){if(F||E)return;q();}n.key==="Enter"&&(n.metaKey||n.ctrlKey)&&(n.preventDefault(),Te());}};document.addEventListener("keydown",Ie);let B=null,G=null;function Pe(){B&&G&&B.removeEventListener("change",G),B=null,G=null;}function Re(){B||typeof window>"u"||typeof window.matchMedia!="function"||(B=window.matchMedia("(prefers-color-scheme: dark)"),G=()=>{s===void 0&&(i=xe(void 0),k());},B.addEventListener("change",G));}s===void 0&&Re(),k();let Z=false;return {destroy:()=>{Z||(Z=true,document.removeEventListener("keydown",Ie),Pe(),de.destroy(),H.remove());},open:we,close:q,whenReady:()=>de.whenReady(),identify:n=>{Z||N.identify(n);},update:n=>{if(Z)return;let d=false;n.position!==void 0&&n.position!==o&&(o=n.position,d=true),"theme"in n&&(s=n.theme,i=xe(s),s===void 0?Re():Pe(),d=true),n.title!==void 0&&n.title!==a&&(a=n.title,d=true),n.placeholder!==void 0&&n.placeholder!==p&&(p=n.placeholder,d=true),n.showEmailOption!==void 0&&n.showEmailOption!==m&&(m=n.showEmailOption,d=true),n.showScreenshotOption!==void 0&&n.showScreenshotOption!==y&&(y=n.showScreenshotOption,d=true),"environment"in n&&(l=n.environment),"metadata"in n&&(u=n.metadata),"onSubmit"in n&&(b=n.onSubmit),"onError"in n&&(U=n.onError),"onOpen"in n&&(C=n.onOpen),"onClose"in n&&(X=n.onClose),"getUser"in n&&N.setGetUser(n.getUser),"user"in n&&N.setUserProp(n.user),d&&k();}}}exports.DARK_THEME=ne;exports.DEFAULT_THEME=pe;exports.__identityTest__=_t;exports.initUseroFeedbackWidget=Nt;exports.mergePluginPatches=We;exports.mergeTheme=lt;exports.resolveTheme=xe;return exports;})({});//# sourceMappingURL=usero.iife.js.map
//# sourceMappingURL=usero.iife.js.map