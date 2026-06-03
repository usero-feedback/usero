// @usero/sdk v1.1.9 (vendored 2026-06-03 from ../../dist/usero.iife.js by scripts/sync-wp-vendor.mjs)
var Usero=(function(exports){'use strict';var Be={1:"\u{1F61E}",2:"\u{1F610}",3:"\u{1F60A}",4:"\u{1F929}"},ee={1:"Needs work",2:"It's okay",3:"Pretty good",4:"Amazing!"},Ne={1:"linear-gradient(135deg,#ff6b6b14,#ff6b6b1f)",2:"linear-gradient(135deg,#9ca3af0f,#9ca3af1a)",3:"linear-gradient(135deg,#3b82f614,#3b82f61f)",4:"linear-gradient(135deg,#f59e0b14,#f59e0b1f)"},K="https://usero.io",he={primary:"#2563eb",background:"#ffffff",text:"#374151",border:"#e5e7eb",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"},te={primary:"#2563eb",background:"#1f2937",text:"#f9fafb",border:"#374151",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)"};function ut(t={}){return {...he,...t}}function ft(t){return typeof t=="object"&&t!==null&&"error"in t}function pt(t){if(typeof t!="object"||t===null)return {success:false,error:"Invalid response"};let n=t,o=n.success===true,s=typeof n.error=="string"?n.error:void 0,l=n.screenshot,i;if(typeof l=="object"&&l!==null){let a=l;typeof a.fileName=="string"&&typeof a.url=="string"&&typeof a.fileSize=="number"&&typeof a.mimeType=="string"&&(i={fileName:a.fileName,url:a.url,fileSize:a.fileSize,mimeType:a.mimeType,width:typeof a.width=="number"?a.width:void 0,height:typeof a.height=="number"?a.height:void 0});}return {success:o,error:s,screenshot:i}}var ne=class{constructor(n=K){this.baseUrl=n.replace(/\/$/,"");}async submitFeedback(n){try{let o=await fetch(`${this.baseUrl}/api/feedback`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(n),signal:AbortSignal.timeout(1e4)});if(!o.ok){let i=`HTTP ${o.status}: ${o.statusText}`;try{let a=await o.json();ft(a)&&typeof a.error=="string"&&(i=a.error);}catch{}throw new Error(i)}let s=await o.json(),l=typeof s=="object"&&s!==null&&"message"in s&&typeof s.message=="string"?s.message:"Feedback submitted successfully";return {success:!0,data:s,message:l}}catch(o){return {success:false,error:o instanceof Error?o.message:"An unexpected error occurred"}}}async uploadScreenshot(n,o){let s=new FormData;s.append("screenshot",n),s.append("clientId",o);let l=await fetch(`${this.baseUrl}/api/screenshots`,{method:"POST",body:s,signal:AbortSignal.timeout(3e4)}),i={success:false};try{let a=await l.json();i=pt(a);}catch{}if(!l.ok||!i.success||!i.screenshot){let a=i.error??`HTTP ${l.status}: ${l.statusText}`;throw new Error(a)}return i.screenshot}ping(){fetch(`${this.baseUrl}/api/ping`,{signal:AbortSignal.timeout(5e3)}).catch(()=>{});}};function gt(t){if(t.startsWith("#")||typeof document>"u")return t;let o=document.createElement("canvas").getContext("2d");return o?(o.fillStyle=t,o.fillStyle):t}function ye(t){let n=gt(t);if(!n.startsWith("#")||n.length<7)return n;let o=parseInt(n.slice(1,3),16),s=parseInt(n.slice(3,5),16),l=parseInt(n.slice(5,7),16),i=Math.max(0,o-60),a=Math.min(255,s+40),w=Math.min(255,l+20);return `#${[i,a,w].map(C=>C.toString(16).padStart(2,"0")).join("")}`}var xe="usero:anonymous-id",We="usero:session-replay:sdk-session-id",G=null,re=null,we=null,ve=null,oe=null;function Se(){if(typeof crypto<"u"&&typeof crypto.randomUUID=="function")return crypto.randomUUID();let t=new Uint8Array(16);if(typeof crypto<"u"&&typeof crypto.getRandomValues=="function")crypto.getRandomValues(t);else for(let o=0;o<t.length;o+=1)t[o]=Math.floor(Math.random()*256);let n="";for(let o of t)n+=o.toString(16).padStart(2,"0");return n}function mt(t){if(typeof window>"u")return null;try{return window.localStorage?.getItem(t)??null}catch{return null}}function _e(t,n){if(!(typeof window>"u"))try{window.localStorage?.setItem(t,n);}catch{}}function bt(t){if(typeof window>"u")return null;try{return window.sessionStorage?.getItem(t)??null}catch{return null}}function ht(t,n){if(!(typeof window>"u"))try{window.sessionStorage?.setItem(t,n);}catch{}}function ke(){if(G)return G;let t=mt(xe);if(t&&/^[a-z0-9-]{8,}$/i.test(t))return G=t,t;let n=Se();return _e(xe,n),G=n,n}function yt(){let t=Se();return G=t,_e(xe,t),oe=null,we=null,t}function je(){if(re)return re;let t=bt(We);if(t&&/^[a-z0-9-]{8,}$/i.test(t))return re=t,t;let n=Se();return ht(We,n),re=n,n}function qe(){return we}function Ke(t){ve===null&&(ve=t);}function Ge(){return ve}function xt(t,n){let o=n.traits??{},l=Object.keys(o).sort().map(i=>[i,o[i]??null]);return JSON.stringify([t,n.id,n.email??null,n.displayName??null,l])}async function Ve(t,n){let o=ke();we=n.id;let s=xt(o,n);if(s===oe)return  false;let l=`${t.apiUrl.replace(/\/$/,"")}/api/identify`,i=JSON.stringify({clientId:t.clientId,anonymousId:o,externalUserId:n.id,email:n.email,displayName:n.displayName,traits:n.traits});if(typeof document<"u"&&document.visibilityState==="hidden"&&typeof navigator<"u"&&typeof navigator.sendBeacon=="function")try{let a=new Blob([i],{type:"application/json"});if(navigator.sendBeacon(l,a))return oe=s,!0}catch{}try{let a=await fetch(l,{method:"POST",headers:{"Content-Type":"application/json"},body:i,keepalive:!0});if(!a.ok)return !0;try{let w=await a.json();w&&w.accepted===!0&&(oe=s);}catch{}return !0}catch{return  false}}function Je(){yt();}function Ye(t){let n=`[usero:${t}]`;return {debug:(...o)=>{typeof console<"u"&&console.debug(n,...o);},info:(...o)=>{typeof console<"u"&&console.info(n,...o);},warn:(...o)=>{typeof console<"u"&&console.warn(n,...o);},error:(...o)=>{typeof console<"u"&&console.error(n,...o);}}}function Xe(t){let n=[],o=t.rating!=null,s=!!t.comment?.trim();return !o&&!s&&n.push("Add rating or comment"),o&&t.rating!==void 0&&![1,2,3,4].includes(t.rating)&&n.push("Invalid rating"),s&&t.comment!==void 0&&(t.comment.length>1e3&&n.push("Comment too long"),/<script[^>]*>.*?<\/script>/gi.test(t.comment)&&n.push("Invalid comment")),{isValid:n.length===0,errors:n}}var Qe=`
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
`;function vt(){return typeof window>"u"||typeof window.matchMedia!="function"?te:window.matchMedia("(prefers-color-scheme: dark)").matches?te:window.matchMedia("(prefers-color-scheme: light)").matches?he:te}function Ee(t){let n=vt();return t?{...n,...t}:n}var Ze="feedback_user_email";function M(t){return t.replace(/[&<>"']/g,n=>{switch(n){case "&":return "&amp;";case "<":return "&lt;";case ">":return "&gt;";case '"':return "&quot;";case "'":return "&#x27;";default:return n}})}function wt(t,n){let o=t;for(let s of n){if(!s||typeof s!="object")continue;let{metadata:l,...i}=s;o={...o,...i},l&&typeof l=="object"&&(o.metadata={...o.metadata??{},...l});}return o}function St(){if(typeof window>"u")return "";try{return window.localStorage.getItem(Ze)??""}catch{return ""}}function kt(t){try{window.localStorage.setItem(Ze,t);}catch{}}function _t(t){if(typeof document>"u")return {destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}};let{clientId:n,baseUrl:o}=t;if(!n||n.length<3){let e=new Error("Invalid config. Contact admin.");return t.onError?.(e),{destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}}}let s=t.position??"right",l=t.theme,i=Ee(l),a=t.title??"Share Feedback",w=t.placeholder??"Tell us what you think... (optional)",C=t.showEmailOption??true,E=t.showScreenshotOption??true,Ue=t.environment,ie=t.metadata,Te=t.onSubmit,se=t.onError,$e=t.onOpen,Ie=t.onClose,V=t.getUser,J=t.user,ae=new ne(o),et={apiUrl:o??K,clientId:n},Y=null,le,de,ce;function D(e){let r=e??null;if(r){if(r.id===Y&&r.traits===le&&r.email===de&&r.displayName===ce)return;Ve(et,r),Y=r.id,le=r.traits,de=r.email,ce=r.displayName;}else Y!==null&&(Je(),Y=null,le=void 0,de=void 0,ce=void 0);}function ue(){if(V)try{D(V()??null);}catch{}}t.user!==void 0?D(t.user):V&&ue();let X=t.plugins??[],fe=new Map,Q=new Map,pe=[];for(let e of X){let r={clientId:n,baseUrl:o??K,logger:Ye(e.name),getStore:()=>fe.get(e.name),setStore:u=>{fe.set(e.name,u);},resolveUser:()=>{W||(J!==void 0?D(J):ue());},getSdkSessionId:()=>je(),getAnonymousId:()=>ke(),getUserId:()=>qe(),getReplayStartMs:()=>Ge(),publishReplayStartMs:u=>Ke(u)};if(Q.set(e.name,r),e.onInit){let u=(async()=>{try{await e.onInit?.(r);}catch(k){r.logger.error("onInit threw",k);}})();pe.push(u);}}let tt=pe.length===0?Promise.resolve():Promise.all(pe).then(()=>{}),b=false,Z=false,O,U="",T=false,F=St(),v=false,h=null,f=[],S=false,y=null,P=3,nt=10*1024*1024,R=document.createElement("div");R.setAttribute("data-usero-widget",""),R.style.cssText="all: initial;",document.body.appendChild(R);let z=R.attachShadow({mode:"open"});function rt(){ue();}function Me(e){try{window.dispatchEvent(new CustomEvent("usero:shadow-update",{detail:{host:R,root:z,reason:e}}));}catch{}}Me("mount");let Fe=document.createElement("style");Fe.textContent=Qe,z.appendChild(Fe);let $=document.createElement("button"),H=document.createElement("div"),c=document.createElement("div");z.appendChild($),z.appendChild(H),z.appendChild(c);function ot(e){h=e,x();}function Pe(){b||(b=true,Z=true,O=void 0,U="",T=false,h=null,f=[],y=null,S=false,ae.ping(),rt(),$e?.(),x(),Me("panel-open"));}async function it(e){if(y=null,!e.type.startsWith("image/")){y="Image files only",L();return}if(e.size>nt){y="Max 10MB",L();return}if(f.length>=P){y=`Max ${P} screenshots`,L();return}S=true,ge(),L();try{let r=await ae.uploadScreenshot(e,n);f=[...f,r];}catch(r){y=r instanceof Error?r.message:"Upload failed";}finally{S=false,ge(),L();}}function Re(e){f=f.filter((r,u)=>u!==e),ge(),L();}function B(){b&&(b=false,Ie?.(),x());}function Le(){return S?'<span class="fb-ups"></span> Uploading...':"\u{1F4F7} Add screenshot"}function st(){let e=f.length>=P,r=S||e;return `
			<input type="file" accept="image/*" data-role="screenshot-input" style="display:none;" aria-label="Choose screenshot" />
			<button type="button" class="fb-upb ${r?"fb-upb--dis":""}" data-role="screenshot-pick" ${r?"disabled":""} style="border:1px solid ${i.border};color:${i.text};">
				${Le()}
			</button>
		`}function Ae(){let e=f.length>=P,r=f.map((m,g)=>`
					<div class="fb-sp">
						<img src="${M(m.url)}" alt="Screenshot ${g+1}" class="fb-si" />
						<button type="button" class="fb-sr" data-role="screenshot-remove" data-index="${g}" aria-label="Remove screenshot">\u2715</button>
					</div>
				`).join(""),u=y?`<div class="fb-upe">\u26A0 ${M(y)}</div>`:"",k=e?`<div class="fb-sl">Max ${P}</div>`:"";return y||f.length>0||e?`<div class="fb-up-extras">${u}${f.length>0?`<div class="fb-ss">${r}</div>`:""}${k}</div>`:""}function ge(){if(!E)return;let e=c.querySelector('button[data-role="screenshot-pick"]');if(!e)return;let r=f.length>=P,u=S||r;e.disabled=u,e.classList.toggle("fb-upb--dis",u),e.innerHTML=Le();}function L(){if(!E)return;let e=c.querySelector(".fb-up");e&&(e.innerHTML=Ae(),e.querySelectorAll('button[data-role="screenshot-remove"]').forEach(r=>{r.addEventListener("click",()=>{let u=Number(r.dataset.index);Number.isInteger(u)&&Re(u);});}));}async function Ce(){if(v)return;v=true,h=null,x();let e={rating:O,comment:U.trim()||void 0,userEmail:T&&F.trim()?F.trim():void 0,screenshots:f.length>0?f:void 0,metadata:{pageUrl:window.location.href,pageTitle:document.title||"Untitled Page",referrer:document.referrer||void 0,timestamp:Date.now()}},r={clientId:n,rating:e.rating,comment:e.comment,userEmail:e.userEmail,pageUrl:e.metadata.pageUrl,pageTitle:e.metadata.pageTitle,referrer:e.metadata.referrer,environment:Ue};f.length>0&&(r.screenshots=f),ie!==void 0&&(r.metadata=ie);let u=Xe(r);if(!u.isValid){v=false,ot({type:"error",text:u.errors.join(", ")});return}let k=r;if(X.length>0){let m=X.map(async _=>{if(!_.onFeedbackSubmit)return;let I=Q.get(_.name);if(I)try{return await _.onFeedbackSubmit(I,r)}catch(me){I.logger.error("onFeedbackSubmit threw",me);return}}),g=await Promise.all(m);k=wt(r,g);}try{let m=await ae.submitFeedback(k);if(m.success)T&&F&&kt(F),Te?.(e),O=void 0,U="",T=!1,f=[],y=null,h={type:"success",text:"Thank you!"};else {let g=m.error??"Error occurred. Try again.";se?.(new Error(g)),h={type:"error",text:g};}}catch(m){let g=m instanceof Error?m.message:"Error occurred. Try again.";se?.(new Error(g)),h={type:"error",text:g};}finally{v=false,x();}}function at(){$.className=`fb-btn fb-btn--${s} ${b?"fb-btn--open":""}`,$.setAttribute("aria-label","Open feedback"),$.type="button",$.style.background=`linear-gradient(135deg, ${i.primary}, ${ye(i.primary)})`,$.innerHTML=b?'<span style="font-size:20px;">\u2715</span>':"";}function lt(){H.className="fb-backdrop",H.style.display=b?"block":"none",H.setAttribute("aria-label","Close modal");}function dt(){c.className=`fb-pnl-base fb-pnl--${s} ${b?"fb-pnl--open":"fb-pnl--closed"}`,c.style.backgroundColor=i.background,s==="right"?(c.style.borderLeft=`1px solid ${i.border}`,c.style.borderRight=""):(c.style.borderRight=`1px solid ${i.border}`,c.style.borderLeft=""),c.setAttribute("role","dialog"),c.setAttribute("aria-modal","true"),c.setAttribute("aria-labelledby","usero-feedback-title");let e=1e3-U.length,r=e<50,u=[1,2,3,4].map(d=>{let p=O===d,ct=Ne[d];return `
					<div class="${["fb-ec",p&&"fb-ec--sel"].filter(Boolean).join(" ")}" style="background:${ct}">
						<button type="button" class="fb-eb" data-rating="${d}" role="radio" aria-checked="${p}" aria-label="${d}: ${ee[d]}" style="color:${i.text}">
							<div class="fb-ei"><span role="img" aria-label="${ee[d]}">${Be[d]}</span></div>
							<div class="fb-el" style="color:${i.text}">${ee[d]}</div>
						</button>
					</div>
				`}).join(""),k=h?`<div class="fb-msg fb-msg--header ${h.type==="success"?"fb-msg--ok":"fb-msg--err"}">${h.type==="success"?"\u2713":"\u26A0"} ${M(h.text)}</div>`:"",m=E?st():"",g=E?Ae():"",_=C?`
				<div class="fb-email">
					<label class="fb-email-lbl" style="color:${i.text}">
						<input type="checkbox" class="fb-email-cb" data-role="share-email" ${T?"checked":""} aria-label="Share email" />
						<span>Share my email</span>
					</label>
					${T?`<input type="email" class="fb-email-inp" data-role="email-input" value="${M(F)}" placeholder="your.email@example.com" aria-label="Email" maxlength="254" autocomplete="email" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};" />`:""}
				</div>
			`:"",I=v,me=`background:linear-gradient(135deg, ${i.primary}, ${ye(i.primary)});color:#ffffff;${I?"opacity:0.6;cursor:not-allowed;":""}`;c.innerHTML=`
			<div class="fb-cnt">
				<div class="fb-hdr" style="border-bottom:1px solid ${i.border}">
					<h2 id="usero-feedback-title" class="fb-ttl" style="color:${i.text}">${M(a)}</h2>
					${k}
					<button class="fb-close-btn" data-role="close" style="color:${i.text}" aria-label="Close" type="button">\u2715</button>
				</div>
				<form data-role="form">
					<div class="fb-es" role="radiogroup" aria-label="Rate experience">${u}</div>
					<textarea class="fb-ta" data-role="comment" placeholder="${M(w)}" aria-label="Comments" maxlength="1000" rows="2" style="border:1px solid ${i.border};color:${i.text};background-color:${i.background};">${M(U)}</textarea>
					<div class="fb-toolrow">
						${m}
						<div class="fb-charcount${r?" fb-charcount--low":""}" data-role="charcount" style="color:${r?"#dc2626":i.text};opacity:${r?1:.6};">${e} chars remaining</div>
					</div>
					${E?`<div class="fb-up">${g}</div>`:""}
					${_}
					<button class="fb-sub ${I?"fb-sub--dis":""}" type="submit" aria-label="Submit" ${I?"disabled":""} style="${me}">
						${v?'<span class="fb-spin"></span>':""}
						${v?"Submitting...":"Send Feedback \u{1F680}"}
					</button>
				</form>
			</div>
		`,c.querySelector('form[data-role="form"]')?.addEventListener("submit",d=>{d.preventDefault(),Ce();}),c.querySelector('button[data-role="close"]')?.addEventListener("click",B),c.querySelectorAll("button[data-rating]").forEach(d=>{d.addEventListener("click",()=>{let p=d.dataset.rating;(p==="1"||p==="2"||p==="3"||p==="4")&&(O=Number(p),Z=true,x());});});let j=c.querySelector('textarea[data-role="comment"]');j&&(Z&&(Z=false,requestAnimationFrame(()=>j.focus({preventScroll:true}))),j.addEventListener("input",()=>{if(j.value.length<=1e3){U=j.value;let d=c.querySelector('[data-role="charcount"]');if(d){let p=1e3-U.length;d.textContent=`${p} chars remaining`,d.style.color=p<50?"#dc2626":i.text,d.style.opacity=p<50?"1":"0.6";}}}));let He=c.querySelector('input[data-role="share-email"]');He?.addEventListener("change",()=>{T=He.checked,x();});let be=c.querySelector('input[data-role="email-input"]');be?.addEventListener("input",()=>{be.value.length<=254&&(F=be.value);});let q=c.querySelector('input[data-role="screenshot-input"]');c.querySelector('button[data-role="screenshot-pick"]')?.addEventListener("click",()=>{q?.click();}),q?.addEventListener("change",()=>{let d=q.files?.[0];d&&it(d).finally(()=>{q&&(q.value="");});}),c.querySelectorAll('button[data-role="screenshot-remove"]').forEach(d=>{d.addEventListener("click",()=>{let p=Number(d.dataset.index);Number.isInteger(p)&&Re(p);});});}function x(){at(),lt(),dt();}$.addEventListener("click",()=>{b?B():Pe();}),H.addEventListener("click",()=>{S||v||B();});let De=e=>{if(b){if(e.key==="Escape"){if(S||v)return;B();}e.key==="Enter"&&(e.metaKey||e.ctrlKey)&&(e.preventDefault(),Ce());}};document.addEventListener("keydown",De);let A=null,N=null;function Oe(){A&&N&&A.removeEventListener("change",N),A=null,N=null;}function ze(){A||typeof window>"u"||typeof window.matchMedia!="function"||(A=window.matchMedia("(prefers-color-scheme: dark)"),N=()=>{l===void 0&&(i=Ee(void 0),x());},A.addEventListener("change",N));}l===void 0&&ze(),x();let W=false;return {destroy:()=>{if(!W){W=true,document.removeEventListener("keydown",De),Oe();for(let e of X){if(!e.onDestroy)continue;let r=Q.get(e.name);if(r)try{e.onDestroy(r);}catch(u){r.logger.error("onDestroy threw",u);}}fe.clear(),Q.clear(),R.remove();}},open:Pe,close:B,whenReady:()=>tt,identify:e=>{W||(J=e,D(e));},update:e=>{if(W)return;let r=false;e.position!==void 0&&e.position!==s&&(s=e.position,r=true),"theme"in e&&(l=e.theme,i=Ee(l),l===void 0?ze():Oe(),r=true),e.title!==void 0&&e.title!==a&&(a=e.title,r=true),e.placeholder!==void 0&&e.placeholder!==w&&(w=e.placeholder,r=true),e.showEmailOption!==void 0&&e.showEmailOption!==C&&(C=e.showEmailOption,r=true),e.showScreenshotOption!==void 0&&e.showScreenshotOption!==E&&(E=e.showScreenshotOption,r=true),"environment"in e&&(Ue=e.environment),"metadata"in e&&(ie=e.metadata),"onSubmit"in e&&(Te=e.onSubmit),"onError"in e&&(se=e.onError),"onOpen"in e&&($e=e.onOpen),"onClose"in e&&(Ie=e.onClose),"getUser"in e&&(V=e.getUser),"user"in e&&(J=e.user,D(e.user)),r&&x();}}}exports.DARK_THEME=te;exports.DEFAULT_THEME=he;exports.initUseroFeedbackWidget=_t;exports.mergePluginPatches=wt;exports.mergeTheme=ut;exports.resolveTheme=Ee;return exports;})({});//# sourceMappingURL=usero.iife.js.map
//# sourceMappingURL=usero.iife.js.map