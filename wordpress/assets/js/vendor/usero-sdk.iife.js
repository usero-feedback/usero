// @usero/sdk v1.1.0 (vendored 2026-05-29 from ../../dist/usero.iife.js by scripts/sync-wp-vendor.mjs)
var Usero=(function(exports){'use strict';var Me={1:"\u{1F61E}",2:"\u{1F610}",3:"\u{1F60A}",4:"\u{1F929}"},Z={1:"Needs work",2:"It's okay",3:"Pretty good",4:"Amazing!"},Ae={1:"linear-gradient(135deg,#ff6b6b14,#ff6b6b1f)",2:"linear-gradient(135deg,#9ca3af0f,#9ca3af1a)",3:"linear-gradient(135deg,#3b82f614,#3b82f61f)",4:"linear-gradient(135deg,#f59e0b14,#f59e0b1f)"},j="https://usero.io",be={primary:"#2563eb",background:"#ffffff",text:"#374151",border:"#e5e7eb",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"},ee={primary:"#2563eb",background:"#1f2937",text:"#f9fafb",border:"#374151",shadow:"0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)"};function et(e={}){return {...be,...e}}function tt(e){return typeof e=="object"&&e!==null&&"error"in e}function nt(e){if(typeof e!="object"||e===null)return {success:false,error:"Invalid response"};let n=e,r=n.success===true,s=typeof n.error=="string"?n.error:void 0,d=n.screenshot,o;if(typeof d=="object"&&d!==null){let a=d;typeof a.fileName=="string"&&typeof a.url=="string"&&typeof a.fileSize=="number"&&typeof a.mimeType=="string"&&(o={fileName:a.fileName,url:a.url,fileSize:a.fileSize,mimeType:a.mimeType,width:typeof a.width=="number"?a.width:void 0,height:typeof a.height=="number"?a.height:void 0});}return {success:r,error:s,screenshot:o}}var te=class{constructor(n=j){this.baseUrl=n.replace(/\/$/,"");}async submitFeedback(n){try{let r=await fetch(`${this.baseUrl}/api/feedback`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(n),signal:AbortSignal.timeout(1e4)});if(!r.ok){let o=`HTTP ${r.status}: ${r.statusText}`;try{let a=await r.json();tt(a)&&typeof a.error=="string"&&(o=a.error);}catch{}throw new Error(o)}let s=await r.json(),d=typeof s=="object"&&s!==null&&"message"in s&&typeof s.message=="string"?s.message:"Feedback submitted successfully";return {success:!0,data:s,message:d}}catch(r){return {success:false,error:r instanceof Error?r.message:"An unexpected error occurred"}}}async uploadScreenshot(n,r){let s=new FormData;s.append("screenshot",n),s.append("clientId",r);let d=await fetch(`${this.baseUrl}/api/screenshots`,{method:"POST",body:s,signal:AbortSignal.timeout(3e4)}),o={success:false};try{let a=await d.json();o=nt(a);}catch{}if(!d.ok||!o.success||!o.screenshot){let a=o.error??`HTTP ${d.status}: ${d.statusText}`;throw new Error(a)}return o.screenshot}ping(){fetch(`${this.baseUrl}/api/ping`,{signal:AbortSignal.timeout(5e3)}).catch(()=>{});}};function rt(e){if(e.startsWith("#")||typeof document>"u")return e;let r=document.createElement("canvas").getContext("2d");return r?(r.fillStyle=e,r.fillStyle):e}function ge(e){let n=rt(e);if(!n.startsWith("#")||n.length<7)return n;let r=parseInt(n.slice(1,3),16),s=parseInt(n.slice(3,5),16),d=parseInt(n.slice(5,7),16),o=Math.max(0,r-60),a=Math.min(255,s+40),v=Math.min(255,d+20);return `#${[o,a,v].map(R=>R.toString(16).padStart(2,"0")).join("")}`}var he="usero:anonymous-id",q=null,ne=null;function Ce(){if(typeof crypto<"u"&&typeof crypto.randomUUID=="function")return crypto.randomUUID();let e=new Uint8Array(16);if(typeof crypto<"u"&&typeof crypto.getRandomValues=="function")crypto.getRandomValues(e);else for(let r=0;r<e.length;r+=1)e[r]=Math.floor(Math.random()*256);let n="";for(let r of e)n+=r.toString(16).padStart(2,"0");return n}function ot(e){if(typeof window>"u")return null;try{return window.localStorage?.getItem(e)??null}catch{return null}}function ze(e,n){if(!(typeof window>"u"))try{window.localStorage?.setItem(e,n);}catch{}}function it(){if(q)return q;let e=ot(he);if(e&&/^[a-z0-9-]{8,}$/i.test(e))return q=e,e;let n=Ce();return ze(he,n),q=n,n}function st(){let e=Ce();return q=e,ze(he,e),ne=null,e}function at(e,n){let r=n.traits??{},d=Object.keys(r).sort().map(o=>[o,r[o]??null]);return JSON.stringify([e,n.id,n.email??null,n.displayName??null,d])}async function De(e,n){let r=it(),s=at(r,n);if(s===ne)return  false;let d=`${e.apiUrl.replace(/\/$/,"")}/api/identify`,o=JSON.stringify({clientId:e.clientId,anonymousId:r,externalUserId:n.id,email:n.email,displayName:n.displayName,traits:n.traits});if(typeof document<"u"&&document.visibilityState==="hidden"&&typeof navigator<"u"&&typeof navigator.sendBeacon=="function")try{let a=new Blob([o],{type:"application/json"});if(navigator.sendBeacon(d,a))return ne=s,!0}catch{}try{let a=await fetch(d,{method:"POST",headers:{"Content-Type":"application/json"},body:o,keepalive:!0});if(!a.ok)return !0;try{let v=await a.json();v&&v.accepted===!0&&(ne=s);}catch{}return !0}catch{return  false}}function Oe(){st();}function He(e){let n=`[usero:${e}]`;return {debug:(...r)=>{typeof console<"u"&&console.debug(n,...r);},info:(...r)=>{typeof console<"u"&&console.info(n,...r);},warn:(...r)=>{typeof console<"u"&&console.warn(n,...r);},error:(...r)=>{typeof console<"u"&&console.error(n,...r);}}}function Be(e){let n=[],r=e.rating!=null,s=!!e.comment?.trim();return !r&&!s&&n.push("Add rating or comment"),r&&e.rating!==void 0&&![1,2,3,4].includes(e.rating)&&n.push("Invalid rating"),s&&e.comment!==void 0&&(e.comment.length>1e3&&n.push("Comment too long"),/<script[^>]*>.*?<\/script>/gi.test(e.comment)&&n.push("Invalid comment")),{isValid:n.length===0,errors:n}}var Ne=`
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
`;function lt(){return typeof window>"u"||typeof window.matchMedia!="function"?ee:window.matchMedia("(prefers-color-scheme: dark)").matches?ee:window.matchMedia("(prefers-color-scheme: light)").matches?be:ee}function ye(e){let n=lt();return e?{...n,...e}:n}var We="feedback_user_email";function T(e){return e.replace(/[&<>"']/g,n=>{switch(n){case "&":return "&amp;";case "<":return "&lt;";case ">":return "&gt;";case '"':return "&quot;";case "'":return "&#x27;";default:return n}})}function dt(e,n){let r=e;for(let s of n){if(!s||typeof s!="object")continue;let{metadata:d,...o}=s;r={...r,...o},d&&typeof d=="object"&&(r.metadata={...r.metadata??{},...d});}return r}function ct(){if(typeof window>"u")return "";try{return window.localStorage.getItem(We)??""}catch{return ""}}function ft(e){try{window.localStorage.setItem(We,e);}catch{}}function Rt(e){if(typeof document>"u")return {destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}};let{clientId:n,baseUrl:r}=e;if(!n||n.length<3){let t=new Error("Invalid config. Contact admin.");return e.onError?.(t),{destroy:()=>{},open:()=>{},close:()=>{},update:()=>{},whenReady:()=>Promise.resolve(),identify:()=>{}}}let s=e.position??"right",d=e.theme,o=ye(d),a=e.title??"Share Feedback",v=e.placeholder??"Tell us what you think... (optional)",R=e.showEmailOption??true,K=e.showScreenshotOption??true,xe=e.environment,re=e.metadata,ve=e.onSubmit,oe=e.onError,we=e.onOpen,ke=e.onClose,V=e.getUser,G=e.user,ie=new te(r),_e={apiUrl:r??j,clientId:n},J=null,se,ae,le;function I(t){let i=t??null;if(i){if(i.id===J&&i.traits===se&&i.email===ae&&i.displayName===le)return;De(_e,i),J=i.id,se=i.traits,ae=i.email,le=i.displayName;}else J!==null&&(Oe(),J=null,se=void 0,ae=void 0,le=void 0);}function de(){if(V)try{I(V()??null);}catch{}}e.user!==void 0?I(e.user):V&&de();let X=e.plugins??[],ce=new Map,Y=new Map,fe=[];for(let t of X){let i={clientId:n,baseUrl:r??j,logger:He(t.name),getStore:()=>ce.get(t.name),setStore:m=>{ce.set(t.name,m);},resolveUser:()=>{B||(G!==void 0?I(G):de());}};if(Y.set(t.name,i),t.onInit){let m=(async()=>{try{await t.onInit?.(i);}catch(P){i.logger.error("onInit threw",P);}})();fe.push(m);}}let je=fe.length===0?Promise.resolve():Promise.all(fe).then(()=>{}),b=false,Q=false,L,w="",k=false,M=ct(),S=false,g=null,u=[],A=false,h=null,C=3,qe=10*1024*1024,$=document.createElement("div");$.setAttribute("data-usero-widget",""),$.style.cssText="all: initial;",document.body.appendChild($);let z=$.attachShadow({mode:"open"});function Ke(){de();}function Se(t){try{window.dispatchEvent(new CustomEvent("usero:shadow-update",{detail:{host:$,root:z,reason:t}}));}catch{}}Se("mount");let Ee=document.createElement("style");Ee.textContent=Ne,z.appendChild(Ee);let E=document.createElement("button"),D=document.createElement("div"),c=document.createElement("div");z.appendChild(E),z.appendChild(D),z.appendChild(c);function Ve(t){g=t,p();}function Ue(){b||(b=true,Q=true,L=void 0,w="",k=false,g=null,u=[],h=null,A=false,ie.ping(),Ke(),we?.(),p(),Se("panel-open"));}async function Ge(t){if(h=null,!t.type.startsWith("image/")){h="Image files only",p();return}if(t.size>qe){h="Max 10MB",p();return}if(u.length>=C){h=`Max ${C} screenshots`,p();return}A=true,p();try{let i=await ie.uploadScreenshot(t,n);u=[...u,i];}catch(i){h=i instanceof Error?i.message:"Upload failed";}finally{A=false,p();}}function Je(t){u=u.filter((i,m)=>m!==t),p();}function O(){b&&(b=false,ke?.(),p());}async function Te(){if(S)return;S=true,g=null,p();let t={rating:L,comment:w.trim()||void 0,userEmail:k?M:void 0,screenshots:u.length>0?u:void 0,metadata:{pageUrl:window.location.href,pageTitle:document.title||"Untitled Page",referrer:document.referrer||void 0,timestamp:Date.now()}},i={clientId:n,rating:t.rating,comment:t.comment,userEmail:t.userEmail,pageUrl:t.metadata.pageUrl,pageTitle:t.metadata.pageTitle,referrer:t.metadata.referrer,environment:xe};u.length>0&&(i.screenshots=u),re!==void 0&&(i.metadata=re);let m=Be(i);if(!m.isValid){S=false,Ve({type:"error",text:m.errors.join(", ")});return}let P=i;if(X.length>0){let x=X.map(async N=>{if(!N.onFeedbackSubmit)return;let U=Y.get(N.name);if(U)try{return await N.onFeedbackSubmit(U,i)}catch(ue){U.logger.error("onFeedbackSubmit threw",ue);return}}),y=await Promise.all(x);P=dt(i,y);}try{let x=await ie.submitFeedback(P);if(x.success)k&&M&&ft(M),ve?.(t),L=void 0,w="",k=!1,u=[],h=null,g={type:"success",text:"Thank you!"};else {let y=x.error??"Error occurred. Try again.";oe?.(new Error(y)),g={type:"error",text:y};}}catch(x){let y=x instanceof Error?x.message:"Error occurred. Try again.";oe?.(new Error(y)),g={type:"error",text:y};}finally{S=false,p();}}function Xe(){E.className=`fb-btn fb-btn--${s} ${b?"fb-btn--open":""}`,E.setAttribute("aria-label","Open feedback"),E.type="button",E.style.background=`linear-gradient(135deg, ${o.primary}, ${ge(o.primary)})`,E.innerHTML=b?'<span style="font-size:20px;">\u2715</span>':"";}function Ye(){D.className="fb-backdrop",D.style.display=b?"block":"none",D.setAttribute("aria-label","Close modal");}function Qe(){c.className=`fb-pnl-base fb-pnl--${s} ${b?"fb-pnl--open":"fb-pnl--closed"}`,c.style.backgroundColor=o.background,s==="right"?(c.style.borderLeft=`1px solid ${o.border}`,c.style.borderRight=""):(c.style.borderRight=`1px solid ${o.border}`,c.style.borderLeft=""),c.setAttribute("role","dialog"),c.setAttribute("aria-modal","true"),c.setAttribute("aria-labelledby","usero-feedback-title");let t=1e3-w.length,i=t<50,m=[1,2,3,4].map(l=>{let f=L===l,me=Ae[l];return `
					<div class="${["fb-ec",f&&"fb-ec--sel"].filter(Boolean).join(" ")}" style="background:${me}">
						<button type="button" class="fb-eb" data-rating="${l}" role="radio" aria-checked="${f}" aria-label="${l}: ${Z[l]}" style="color:${o.text}">
							<div class="fb-ei"><span role="img" aria-label="${Z[l]}">${Me[l]}</span></div>
							<div class="fb-el" style="color:${o.text}">${Z[l]}</div>
						</button>
					</div>
				`}).join(""),P=g?`<div class="fb-msg fb-msg--header ${g.type==="success"?"fb-msg--ok":"fb-msg--err"}">${g.type==="success"?"\u2713":"\u26A0"} ${T(g.text)}</div>`:"",x=K?(()=>{let l=u.length>=C,f=A||l;return `
						<input type="file" accept="image/*" data-role="screenshot-input" style="display:none;" aria-label="Choose screenshot" />
						<button type="button" class="fb-upb ${f?"fb-upb--dis":""}" data-role="screenshot-pick" ${f?"disabled":""} style="border:1px solid ${o.border};color:${o.text};">
							${A?'<span class="fb-ups"></span> Uploading...':"\u{1F4F7} Add screenshot"}
						</button>
					`})():"",y=K?(()=>{let l=u.length>=C,f=u.map((Ze,Le)=>`
								<div class="fb-sp">
									<img src="${T(Ze.url)}" alt="Screenshot ${Le+1}" class="fb-si" />
									<button type="button" class="fb-sr" data-role="screenshot-remove" data-index="${Le}" aria-label="Remove screenshot">\u2715</button>
								</div>
							`).join(""),me=h?`<div class="fb-upe">\u26A0 ${T(h)}</div>`:"",Ie=l?`<div class="fb-sl">Max ${C}</div>`:"";return h||u.length>0||l?`<div class="fb-up-extras">${me}${u.length>0?`<div class="fb-ss">${f}</div>`:""}${Ie}</div>`:""})():"",N=R?`
				<div class="fb-email">
					<label class="fb-email-lbl" style="color:${o.text}">
						<input type="checkbox" class="fb-email-cb" data-role="share-email" ${k?"checked":""} aria-label="Share email" />
						<span>Share my email</span>
					</label>
					${k?`<input type="email" class="fb-email-inp" data-role="email-input" value="${T(M)}" placeholder="your.email@example.com" aria-label="Email" maxlength="254" autocomplete="email" style="border:1px solid ${o.border};color:${o.text};background-color:${o.background};" />`:""}
				</div>
			`:"",U=S,ue=`background:linear-gradient(135deg, ${o.primary}, ${ge(o.primary)});color:#ffffff;${U?"opacity:0.6;cursor:not-allowed;":""}`;c.innerHTML=`
			<div class="fb-cnt">
				<div class="fb-hdr" style="border-bottom:1px solid ${o.border}">
					<h2 id="usero-feedback-title" class="fb-ttl" style="color:${o.text}">${T(a)}</h2>
					${P}
					<button class="fb-close-btn" data-role="close" style="color:${o.text}" aria-label="Close" type="button">\u2715</button>
				</div>
				<form data-role="form">
					<div class="fb-es" role="radiogroup" aria-label="Rate experience">${m}</div>
					<textarea class="fb-ta" data-role="comment" placeholder="${T(v)}" aria-label="Comments" maxlength="1000" rows="2" style="border:1px solid ${o.border};color:${o.text};background-color:${o.background};">${T(w)}</textarea>
					<div class="fb-toolrow">
						${x}
						<div class="fb-charcount${i?" fb-charcount--low":""}" data-role="charcount" style="color:${i?"#dc2626":o.text};opacity:${i?1:.6};">${t} chars remaining</div>
					</div>
					${y?`<div class="fb-up">${y}</div>`:""}
					${N}
					<button class="fb-sub ${U?"fb-sub--dis":""}" type="submit" aria-label="Submit" ${U?"disabled":""} style="${ue}">
						${S?'<span class="fb-spin"></span>':""}
						${S?"Submitting...":"Send Feedback \u{1F680}"}
					</button>
				</form>
			</div>
		`,c.querySelector('form[data-role="form"]')?.addEventListener("submit",l=>{l.preventDefault(),Te();}),c.querySelector('button[data-role="close"]')?.addEventListener("click",O),c.querySelectorAll("button[data-rating]").forEach(l=>{l.addEventListener("click",()=>{let f=l.dataset.rating;(f==="1"||f==="2"||f==="3"||f==="4")&&(L=Number(f),Q=true,p());});});let W=c.querySelector('textarea[data-role="comment"]');W&&(Q&&(Q=false,requestAnimationFrame(()=>W.focus({preventScroll:true}))),W.addEventListener("input",()=>{if(W.value.length<=1e3){w=W.value;let l=c.querySelector('[data-role="charcount"]');if(l){let f=1e3-w.length;l.textContent=`${f} chars remaining`,l.style.color=f<50?"#dc2626":o.text,l.style.opacity=f<50?"1":"0.6";}}}));let Re=c.querySelector('input[data-role="share-email"]');Re?.addEventListener("change",()=>{k=Re.checked,p();});let pe=c.querySelector('input[data-role="email-input"]');pe?.addEventListener("input",()=>{pe.value.length<=254&&(M=pe.value);});let _=c.querySelector('input[data-role="screenshot-input"]');c.querySelector('button[data-role="screenshot-pick"]')?.addEventListener("click",()=>{_?.click();}),_?.addEventListener("change",()=>{let l=_.files?.[0];l&&Ge(l).finally(()=>{_&&(_.value="");});}),c.querySelectorAll('button[data-role="screenshot-remove"]').forEach(l=>{l.addEventListener("click",()=>{let f=Number(l.dataset.index);Number.isInteger(f)&&Je(f);});});}function p(){Xe(),Ye(),Qe();}E.addEventListener("click",()=>{b?O():Ue();}),D.addEventListener("click",O);let $e=t=>{b&&(t.key==="Escape"&&O(),t.key==="Enter"&&(t.metaKey||t.ctrlKey)&&(t.preventDefault(),Te()));};document.addEventListener("keydown",$e);let F=null,H=null;function Fe(){F&&H&&F.removeEventListener("change",H),F=null,H=null;}function Pe(){F||typeof window>"u"||typeof window.matchMedia!="function"||(F=window.matchMedia("(prefers-color-scheme: dark)"),H=()=>{d===void 0&&(o=ye(void 0),p());},F.addEventListener("change",H));}d===void 0&&Pe(),p();let B=false;return {destroy:()=>{if(!B){B=true,document.removeEventListener("keydown",$e),Fe();for(let t of X){if(!t.onDestroy)continue;let i=Y.get(t.name);if(i)try{t.onDestroy(i);}catch(m){i.logger.error("onDestroy threw",m);}}ce.clear(),Y.clear(),$.remove();}},open:Ue,close:O,whenReady:()=>je,identify:t=>{B||(G=t,I(t));},update:t=>{if(B)return;let i=false;t.position!==void 0&&t.position!==s&&(s=t.position,i=true),"theme"in t&&(d=t.theme,o=ye(d),d===void 0?Pe():Fe(),i=true),t.title!==void 0&&t.title!==a&&(a=t.title,i=true),t.placeholder!==void 0&&t.placeholder!==v&&(v=t.placeholder,i=true),t.showEmailOption!==void 0&&t.showEmailOption!==R&&(R=t.showEmailOption,i=true),t.showScreenshotOption!==void 0&&t.showScreenshotOption!==K&&(K=t.showScreenshotOption,i=true),"environment"in t&&(xe=t.environment),"metadata"in t&&(re=t.metadata),"onSubmit"in t&&(ve=t.onSubmit),"onError"in t&&(oe=t.onError),"onOpen"in t&&(we=t.onOpen),"onClose"in t&&(ke=t.onClose),"getUser"in t&&(V=t.getUser),"user"in t&&(G=t.user,I(t.user)),i&&p();}}}exports.DARK_THEME=ee;exports.DEFAULT_THEME=be;exports.initUseroFeedbackWidget=Rt;exports.mergePluginPatches=dt;exports.mergeTheme=et;exports.resolveTheme=ye;return exports;})({});//# sourceMappingURL=usero.iife.js.map
//# sourceMappingURL=usero.iife.js.map