// @usero/sdk v1.1.15 (vendored 2026-06-12 from ../../dist/usero.iife.js by scripts/sync-wp-vendor.mjs)
var Usero=(function(exports){'use strict';var We={1:"\u{1F61E}",2:"\u{1F610}",3:"\u{1F60A}",4:"\u{1F929}"},ne={1:"Needs work",2:"It's okay",3:"Pretty good",4:"Amazing!"},je={1:"linear-gradient(135deg,#ff6b6b14,#ff6b6b1f)",2:"linear-gradient(135deg,#9ca3af0f,#9ca3af1a)",3:"linear-gradient(135deg,#3b82f614,#3b82f61f)",4:"linear-gradient(135deg,#f59e0b14,#f59e0b1f)"},G="https://usero.io",Se={primary:"#2563eb",background:"#ffffff",text:"#374151",border:"#e5e7eb",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"},re={primary:"#2563eb",background:"#1f2937",text:"#f9fafb",border:"#374151",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)"};function mt(e={}){return {...Se,...e}}function bt(e){return typeof e=="object"&&e!==null&&"error"in e}function ht(e){if(typeof e!="object"||e===null)return {success:false,error:"Invalid response"};let n=e,o=n.success===true,s=typeof n.error=="string"?n.error:void 0,l=n.screenshot,i;if(typeof l=="object"&&l!==null){let a=l;typeof a.fileName=="string"&&typeof a.url=="string"&&typeof a.fileSize=="number"&&typeof a.mimeType=="string"&&(i={fileName:a.fileName,url:a.url,fileSize:a.fileSize,mimeType:a.mimeType,width:typeof a.width=="number"?a.width:void 0,height:typeof a.height=="number"?a.height:void 0});}return {success:o,error:s,screenshot:i}}var oe=class{constructor(n=G){this.baseUrl=n.replace(/\/$/,"");}async submitFeedback(n){try{let o=await fetch(`${this.baseUrl}/api/feedback`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(n),signal:AbortSignal.timeout(1e4)});if(!o.ok){let i=`HTTP ${o.status}: ${o.statusText}`;try{let a=await o.json();bt(a)&&typeof a.error=="string"&&(i=a.error);}catch{}throw new Error(i)}let s=await o.json(),l=typeof s=="object"&&s!==null&&"message"in s&&typeof s.message=="string"?s.message:"Feedback submitted successfully";return {success:!0,data:s,message:l}}catch(o){return {success:false,error:o instanceof Error?o.message:"An unexpected error occurred"}}}async uploadScreenshot(n,o){let s=new FormData;s.append("screenshot",n),s.append("clientId",o);let l=await fetch(`${this.baseUrl}/api/screenshots`,{method:"POST",body:s,signal:AbortSignal.timeout(3e4)}),i={success:false};try{let a=await l.json();i=ht(a);}catch{}if(!l.ok||!i.success||!i.screenshot){let a=i.error??`HTTP ${l.status}: ${l.statusText}`;throw new Error(a)}return i.screenshot}ping(){fetch(`${this.baseUrl}/api/ping`,{signal:AbortSignal.timeout(5e3)}).catch(()=>{});}};function yt(e){if(e.startsWith("#")||typeof document>"u")return e;let o=document.createElement("canvas").getContext("2d");return o?(o.fillStyle=e,o.fillStyle):e}function we(e){let n=yt(e);if(!n.startsWith("#")||n.length<7)return n;let o=parseInt(n.slice(1,3),16),s=parseInt(n.slice(3,5),16),l=parseInt(n.slice(5,7),16),i=Math.max(0,o-60),a=Math.min(255,s+40),S=Math.min(255,l+20);return `#${[i,a,S].map(O=>O.toString(16).padStart(2,"0")).join("")}`}var ie="usero:anonymous-id",se="usero:session-replay:sdk-session-id",D=null,M=null,le=null,ae=null,J=null;function ke(){if(typeof crypto<"u"&&typeof crypto.randomUUID=="function")return crypto.randomUUID();let e=new Uint8Array(16);if(typeof crypto<"u"&&typeof crypto.getRandomValues=="function")crypto.getRandomValues(e);else for(let o=0;o<e.length;o+=1)e[o]=Math.floor(Math.random()*256);let n="";for(let o of e)n+=o.toString(16).padStart(2,"0");return n}function xt(e){if(typeof window>"u")return null;try{return window.localStorage?.getItem(e)??null}catch{return null}}function qe(e,n){if(!(typeof window>"u"))try{window.localStorage?.setItem(e,n);}catch{}}function vt(e){if(typeof window>"u")return null;try{return window.sessionStorage?.getItem(e)??null}catch{return null}}function Ke(e,n){if(!(typeof window>"u"))try{window.sessionStorage?.setItem(e,n);}catch{}}function Ee(){if(D)return D;let e=xt(ie);if(e&&/^[a-z0-9-]{8,}$/i.test(e))return D=e,e;let n=ke();return qe(ie,n),D=n,n}function St(){let e=ke();return D=e,qe(ie,e),J=null,le=null,e}function Ve(e){return /^[a-z0-9-]{8,}$/i.test(e)}function Ue(){if(M)return M;let e=vt(se);if(e&&Ve(e))return M=e,e;let n=ke();return Ke(se,n),M=n,n}function Te(e){Ve(e)&&M!==e&&(M=e,Ke(se,e));}function Ge(){return le}function Je(e){ae===null&&(ae=e);}function Ye(){return ae}function wt(e,n){let o=n.traits??{},l=Object.keys(o).sort().map(i=>[i,o[i]??null]);return JSON.stringify([e,n.id,n.email??null,n.displayName??null,l])}async function Xe(e,n){let o=Ee();le=n.id;let s=wt(o,n);if(s===J)return  false;let l=`${e.apiUrl.replace(/\/$/,"")}/api/identify`,i=JSON.stringify({clientId:e.clientId,anonymousId:o,externalUserId:n.id,email:n.email,displayName:n.displayName,traits:n.traits});if(typeof document<"u"&&document.visibilityState==="hidden"&&typeof navigator<"u"&&typeof navigator.sendBeacon=="function")try{let a=new Blob([i],{type:"application/json"});if(navigator.sendBeacon(l,a))return J=s,!0}catch{}try{let a=await fetch(l,{method:"POST",headers:{"Content-Type":"application/json"},body:i,keepalive:!0});if(!a.ok)return !0;try{let S=await a.json();S&&S.accepted===!0&&(J=s);}catch{}return !0}catch{return  false}}function Qe(){St();}var Ze={ANON_STORAGE_KEY:ie,SDK_SESSION_STORAGE_KEY:se,reseatSdkSessionId:Te,getOrMintSdkSessionId:Ue,resetIdentityState:()=>{D=null,M=null,le=null,ae=null,J=null;}};function et(e){let n=`[usero:${e}]`;return {debug:(...o)=>{typeof console<"u"&&console.debug(n,...o);},info:(...o)=>{typeof console<"u"&&console.info(n,...o);},warn:(...o)=>{typeof console<"u"&&console.warn(n,...o);},error:(...o)=>{typeof console<"u"&&console.error(n,...o);}}}function tt(e){let n=[],o=e.rating!=null,s=!!e.comment?.trim();return !o&&!s&&n.push("Add rating or comment"),o&&e.rating!==void 0&&![1,2,3,4].includes(e.rating)&&n.push("Invalid rating"),s&&e.comment!==void 0&&(e.comment.length>1e3&&n.push("Comment too long"),/<script[^>]*>.*?<\/script>/gi.test(e.comment)&&n.push("Invalid comment")),{isValid:n.length===0,errors:n}}var nt=`
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
`;var Kt=Ze;function kt(){return typeof window>"u"||typeof window.matchMedia!="function"?re:window.matchMedia("(prefers-color-scheme: dark)").matches?re:window.matchMedia("(prefers-color-scheme: light)").matches?Se:re}function Ie(e){let n=kt();return e?{...n,...e}:n}var rt="feedback_user_email";function F(e){return e.replace(/[&<>"']/g,n=>{switch(n){case "&":return "&amp;";case "<":return "&lt;";case ">":return "&gt;";case '"':return "&quot;";case "'":return "&#x27;";default:return n}})}function Et(e,n){let o=e;for(let s of n){if(!s||typeof s!="object")continue;let{metadata:l,...i}=s;o={...o,...i},l&&typeof l=="object"&&(o.metadata={...o.metadata??{},...l});}return o}function Ut(){if(typeof window>"u")return "";try{return window.localStorage.getItem(rt)??""}catch{return ""}}function Tt(e){try{window.localStorage.setItem(rt,e);}catch{}}function Vt(e){if(typeof document>"u")return {destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}};let{clientId:n,baseUrl:o}=e;if(!n||n.length<3){let t=new Error("Invalid config. Contact admin.");return e.onError?.(t),{destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}}}let s=e.position??"right",l=e.theme,i=Ie(l),a=e.title??"Share Feedback",S=e.placeholder??"Tell us what you think... (optional)",O=e.showEmailOption??true,E=e.showScreenshotOption??true,$e=e.environment,de=e.metadata,Me=e.onSubmit,ce=e.onError,Fe=e.onOpen,Pe=e.onClose,Y=e.getUser,X=e.user,ue=new oe(o),ot={apiUrl:o??G,clientId:n},Q=null,fe,pe,ge;function z(t){let r=t??null;if(r){if(r.id===Q&&r.traits===fe&&r.email===pe&&r.displayName===ge)return;Xe(ot,r),Q=r.id,fe=r.traits,pe=r.email,ge=r.displayName;}else Q!==null&&(Qe(),Q=null,fe=void 0,pe=void 0,ge=void 0);}function me(){if(Y)try{z(Y()??null);}catch{}}e.user!==void 0?z(e.user):Y&&me();let Z=e.plugins??[],be=new Map,ee=new Map,he=[];for(let t of Z){let r={clientId:n,baseUrl:o??G,logger:et(t.name),getStore:()=>be.get(t.name),setStore:d=>{be.set(t.name,d);},resolveUser:()=>{j||(X!==void 0?z(X):me());},getSdkSessionId:()=>Ue(),reseatSdkSessionId:d=>Te(d),getAnonymousId:()=>Ee(),getUserId:()=>Ge(),getReplayStartMs:()=>Ye(),publishReplayStartMs:d=>Je(d)};if(ee.set(t.name,r),t.onInit){let d=(async()=>{try{await t.onInit?.(r);}catch(k){r.logger.error("onInit threw",k);}})();he.push(d);}}let it=he.length===0?Promise.resolve():Promise.all(he).then(()=>{}),b=false,te=false,H,U="",T=false,P=Ut(),v=false,h=null,f=[],w=false,y=null,R=3,st=10*1024*1024,L=document.createElement("div");L.setAttribute("data-usero-widget",""),L.style.cssText="all: initial;",document.body.appendChild(L);let _=L.attachShadow({mode:"open"});function at(){me();}function Re(t){try{window.dispatchEvent(new CustomEvent("usero:shadow-update",{detail:{host:L,root:_,reason:t}}));}catch{}}Re("mount");let Le=document.createElement("style");Le.textContent=nt,_.appendChild(Le);let I=document.createElement("button"),B=document.createElement("div"),u=document.createElement("div");_.appendChild(I),_.appendChild(B),_.appendChild(u);function lt(t){h=t,x();}function Ae(){b||(b=true,te=true,H=void 0,U="",T=false,h=null,f=[],y=null,w=false,ue.ping(),at(),Fe?.(),x(),Re("panel-open"));}async function dt(t){if(y=null,!t.type.startsWith("image/")){y="Image files only",A();return}if(t.size>st){y="Max 10MB",A();return}if(f.length>=R){y=`Max ${R} screenshots`,A();return}w=true,ye(),A();try{let r=await ue.uploadScreenshot(t,n);f=[...f,r];}catch(r){y=r instanceof Error?r.message:"Upload failed";}finally{w=false,ye(),A();}}function Ce(t){f=f.filter((r,d)=>d!==t),ye(),A();}function N(){b&&(b=false,Pe?.(),x());}function De(){return w?'<span class="fb-ups"></span> Uploading...':"\u{1F4F7} Add screenshot"}function ct(){let t=f.length>=R,r=w||t;return `
			<input type="file" accept="image/*" data-role="screenshot-input" style="display:none;" aria-label="Choose screenshot" />
			<button type="button" class="fb-upb ${r?"fb-upb--dis":""}" data-role="screenshot-pick" ${r?"disabled":""} style="border:1px solid ${i.border};color:${i.text};">
				${De()}
			</button>
		`}function Oe(){let t=f.length>=R,r=f.map((m,g)=>`
					<div class="fb-sp">
						<img src="${F(m.url)}" alt="Screenshot ${g+1}" class="fb-si" />
						<button type="button" class="fb-sr" data-role="screenshot-remove" data-index="${g}" aria-label="Remove screenshot">\u2715</button>
					</div>
				`).join(""),d=y?`<div class="fb-upe">\u26A0 ${F(y)}</div>`:"",k=t?`<div class="fb-sl">Max ${R}</div>`:"";return y||f.length>0||t?`<div class="fb-up-extras">${d}${f.length>0?`<div class="fb-ss">${r}</div>`:""}${k}</div>`:""}function ye(){if(!E)return;let t=u.querySelector('button[data-role="screenshot-pick"]');if(!t)return;let r=f.length>=R,d=w||r;t.disabled=d,t.classList.toggle("fb-upb--dis",d),t.innerHTML=De();}function A(){if(!E)return;let t=u.querySelector(".fb-up");t&&(t.innerHTML=Oe(),t.querySelectorAll('button[data-role="screenshot-remove"]').forEach(r=>{r.addEventListener("click",()=>{let d=Number(r.dataset.index);Number.isInteger(d)&&Ce(d);});}));}async function ze(){if(v)return;v=true,h=null,x();let t={rating:H,comment:U.trim()||void 0,userEmail:T&&P.trim()?P.trim():void 0,screenshots:f.length>0?f:void 0,metadata:{pageUrl:window.location.href,pageTitle:document.title||"Untitled Page",referrer:document.referrer||void 0,timestamp:Date.now()}},r={clientId:n,rating:t.rating,comment:t.comment,userEmail:t.userEmail,pageUrl:t.metadata.pageUrl,pageTitle:t.metadata.pageTitle,referrer:t.metadata.referrer,environment:$e};f.length>0&&(r.screenshots=f),de!==void 0&&(r.metadata=de);let d=tt(r);if(!d.isValid){v=false,lt({type:"error",text:d.errors.join(", ")});return}let k=r;if(Z.length>0){let m=Z.map(async q=>{if(!q.onFeedbackSubmit)return;let $=ee.get(q.name);if($)try{return await q.onFeedbackSubmit($,r)}catch(xe){$.logger.error("onFeedbackSubmit threw",xe);return}}),g=await Promise.all(m);k=Et(r,g);}try{let m=await ue.submitFeedback(k);if(m.success)T&&P&&Tt(P),Me?.(t),H=void 0,U="",T=!1,f=[],y=null,h={type:"success",text:"Thank you!"};else {let g=m.error??"Error occurred. Try again.";ce?.(new Error(g)),h={type:"error",text:g};}}catch(m){let g=m instanceof Error?m.message:"Error occurred. Try again.";ce?.(new Error(g)),h={type:"error",text:g};}finally{v=false,x();}}function ut(){I.className=`fb-btn fb-btn--${s} ${b?"fb-btn--open":""}`,I.setAttribute("aria-label","Open feedback"),I.type="button",I.style.background=`linear-gradient(135deg, ${i.primary}, ${we(i.primary)})`,I.innerHTML=b?'<span style="font-size:20px;">\u2715</span>':"";}function ft(){B.className="fb-backdrop",B.style.display=b?"block":"none",B.setAttribute("aria-label","Close modal");}function pt(){u.className=`fb-pnl-base fb-pnl--${s} ${b?"fb-pnl--open":"fb-pnl--closed"}`,u.style.backgroundColor=i.background,s==="right"?(u.style.borderLeft=`1px solid ${i.border}`,u.style.borderRight=""):(u.style.borderRight=`1px solid ${i.border}`,u.style.borderLeft=""),u.setAttribute("role","dialog"),u.setAttribute("aria-modal","true"),u.setAttribute("aria-labelledby","usero-feedback-title");let t=1e3-U.length,r=t<50,d=[1,2,3,4].map(c=>{let p=H===c,gt=je[c];return `
					<div class="${["fb-ec",p&&"fb-ec--sel"].filter(Boolean).join(" ")}" style="background:${gt}">
						<button type="button" class="fb-eb" data-rating="${c}" role="radio" aria-checked="${p}" aria-label="${c}: ${ne[c]}" style="color:${i.text}">
							<div class="fb-ei"><span role="img" aria-label="${ne[c]}">${We[c]}</span></div>
							<div class="fb-el" style="color:${i.text}">${ne[c]}</div>
						</button>
					</div>
				`}).join(""),k=h?`<div class="fb-msg fb-msg--header ${h.type==="success"?"fb-msg--ok":"fb-msg--err"}">${h.type==="success"?"\u2713":"\u26A0"} ${F(h.text)}</div>`:"",m=E?ct():"",g=E?Oe():"",q=O?`
				<div class="fb-email">
					<label class="fb-email-lbl" style="color:${i.text}">
						<input type="checkbox" class="fb-email-cb" data-role="share-email" ${T?"checked":""} aria-label="Share email" />
						<span>Share my email</span>
					</label>
					${T?`<input type="email" class="fb-email-inp" data-role="email-input" value="${F(P)}" placeholder="your.email@example.com" aria-label="Email" maxlength="254" autocomplete="email" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};" />`:""}
				</div>
			`:"",$=v,xe=`background:linear-gradient(135deg, ${i.primary}, ${we(i.primary)});color:#ffffff;${$?"opacity:0.6;cursor:not-allowed;":""}`;u.innerHTML=`
			<div class="fb-cnt">
				<div class="fb-hdr" style="border-bottom:1px solid ${i.border}">
					<h2 id="usero-feedback-title" class="fb-ttl" style="color:${i.text}">${F(a)}</h2>
					${k}
					<button class="fb-close-btn" data-role="close" style="color:${i.text}" aria-label="Close" type="button">\u2715</button>
				</div>
				<form data-role="form">
					<div class="fb-es" role="radiogroup" aria-label="Rate experience">${d}</div>
					<textarea class="fb-ta" data-role="comment" placeholder="${F(S)}" aria-label="Comments" maxlength="1000" rows="2" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};">${F(U)}</textarea>
					<div class="fb-toolrow">
						${m}
						<div class="fb-charcount${r?" fb-charcount--low":""}" data-role="charcount" style="color:${r?"#dc2626":i.text};opacity:${r?1:.6};">${t} chars remaining</div>
					</div>
					${E?`<div class="fb-up">${g}</div>`:""}
					${q}
					<button class="fb-sub ${$?"fb-sub--dis":""}" type="submit" aria-label="Submit" ${$?"disabled":""} style="${xe}">
						${v?'<span class="fb-spin"></span>':""}
						${v?"Submitting...":"Send Feedback \u{1F680}"}
					</button>
				</form>
			</div>
		`,u.querySelector('form[data-role="form"]')?.addEventListener("submit",c=>{c.preventDefault(),ze();}),u.querySelector('button[data-role="close"]')?.addEventListener("click",N),u.querySelectorAll("button[data-rating]").forEach(c=>{c.addEventListener("click",()=>{let p=c.dataset.rating;(p==="1"||p==="2"||p==="3"||p==="4")&&(H=Number(p),te=true,x());});});let K=u.querySelector('textarea[data-role="comment"]');K&&(te&&(te=false,requestAnimationFrame(()=>K.focus({preventScroll:true}))),K.addEventListener("input",()=>{if(K.value.length<=1e3){U=K.value;let c=u.querySelector('[data-role="charcount"]');if(c){let p=1e3-U.length;c.textContent=`${p} chars remaining`,c.style.color=p<50?"#dc2626":i.text,c.style.opacity=p<50?"1":"0.6";}}}));let Ne=u.querySelector('input[data-role="share-email"]');Ne?.addEventListener("change",()=>{T=Ne.checked,x();});let ve=u.querySelector('input[data-role="email-input"]');ve?.addEventListener("input",()=>{ve.value.length<=254&&(P=ve.value);});let V=u.querySelector('input[data-role="screenshot-input"]');u.querySelector('button[data-role="screenshot-pick"]')?.addEventListener("click",()=>{V?.click();}),V?.addEventListener("change",()=>{let c=V.files?.[0];c&&dt(c).finally(()=>{V&&(V.value="");});}),u.querySelectorAll('button[data-role="screenshot-remove"]').forEach(c=>{c.addEventListener("click",()=>{let p=Number(c.dataset.index);Number.isInteger(p)&&Ce(p);});});}function x(){ut(),ft(),pt();}I.addEventListener("click",()=>{b?N():Ae();}),B.addEventListener("click",()=>{w||v||N();});let He=t=>{if(b){if(t.key==="Escape"){if(w||v)return;N();}t.key==="Enter"&&(t.metaKey||t.ctrlKey)&&(t.preventDefault(),ze());}};document.addEventListener("keydown",He);let C=null,W=null;function _e(){C&&W&&C.removeEventListener("change",W),C=null,W=null;}function Be(){C||typeof window>"u"||typeof window.matchMedia!="function"||(C=window.matchMedia("(prefers-color-scheme: dark)"),W=()=>{l===void 0&&(i=Ie(void 0),x());},C.addEventListener("change",W));}l===void 0&&Be(),x();let j=false;return {destroy:()=>{if(!j){j=true,document.removeEventListener("keydown",He),_e();for(let t of Z){if(!t.onDestroy)continue;let r=ee.get(t.name);if(r)try{t.onDestroy(r);}catch(d){r.logger.error("onDestroy threw",d);}}be.clear(),ee.clear(),L.remove();}},open:Ae,close:N,whenReady:()=>it,identify:t=>{j||(X=t,z(t));},update:t=>{if(j)return;let r=false;t.position!==void 0&&t.position!==s&&(s=t.position,r=true),"theme"in t&&(l=t.theme,i=Ie(l),l===void 0?Be():_e(),r=true),t.title!==void 0&&t.title!==a&&(a=t.title,r=true),t.placeholder!==void 0&&t.placeholder!==S&&(S=t.placeholder,r=true),t.showEmailOption!==void 0&&t.showEmailOption!==O&&(O=t.showEmailOption,r=true),t.showScreenshotOption!==void 0&&t.showScreenshotOption!==E&&(E=t.showScreenshotOption,r=true),"environment"in t&&($e=t.environment),"metadata"in t&&(de=t.metadata),"onSubmit"in t&&(Me=t.onSubmit),"onError"in t&&(ce=t.onError),"onOpen"in t&&(Fe=t.onOpen),"onClose"in t&&(Pe=t.onClose),"getUser"in t&&(Y=t.getUser),"user"in t&&(X=t.user,z(t.user)),r&&x();}}}exports.DARK_THEME=re;exports.DEFAULT_THEME=Se;exports.__identityTest__=Kt;exports.initUseroFeedbackWidget=Vt;exports.mergePluginPatches=Et;exports.mergeTheme=mt;exports.resolveTheme=Ie;return exports;})({});//# sourceMappingURL=usero.iife.js.map
//# sourceMappingURL=usero.iife.js.map