import {createHmac,timingSafeEqual,scryptSync,createHash} from 'node:crypto';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...extra}});
function env(name){const v=process.env[name];if(!v || name==='SESSION_SECRET'&&v.length<32 || name==='ADMIN_PASSWORD'&&v.length<12)fail(503,'Configuration du serveur incomplète.');return v;}
async function db(path,options={}){const response=await fetch(env('SUPABASE_URL')+'/rest/v1/'+path,{...options,headers:{apikey:env('SUPABASE_SECRET_KEY'),...(env('SUPABASE_SECRET_KEY').startsWith('sb_secret_')?{}:{Authorization:'Bearer '+env('SUPABASE_SECRET_KEY')}),'Content-Type':'application/json',Prefer:'return=representation',...options.headers}});if(!response.ok)fail(503,'La base de données est momentanément indisponible.');const text=await response.text();return text?JSON.parse(text):[];}
const sign=v=>createHmac('sha256',env('SESSION_SECRET')).update(v).digest('base64url');
export function session(request){try{const value=request.headers.get('cookie')?.match(/(?:^|; )pm_session=([^;]+)/)?.[1];if(!value)return null;const [payload,signature]=value.split('.');const expected=sign(payload);if(!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;const data=JSON.parse(Buffer.from(payload,'base64url'));return data.exp>Date.now()&&['member','admin'].includes(data.role)?data:null;}catch{return null;}}
function cookie(data,request){const payload=Buffer.from(JSON.stringify({...data,exp:Date.now()+8*3600000})).toString('base64url');return `pm_session=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export function verifyPin(pin,hash){try{const [salt,encoded]=hash.split(':');const target=Buffer.from(encoded,'hex'),actual=scryptSync(pin,salt,64);return target.length===actual.length&&timingSafeEqual(actual,target);}catch{return false;}}
const auth=(user,admin=false)=>{if(!user||admin&&user.role!=='admin')fail(403,'Accès non autorisé.');};
const monthOK=month=>/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'');
const dateOK=date=>/^\d{4}-\d{2}-\d{2}$/.test(date||'')&&!isNaN(Date.parse(date))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
const clean=s=>typeof s==='string'&&s.trim().length>0&&s.length<=160&&!/[<>]/.test(s);
export function validateEvents(events,month){return Array.isArray(events)&&events.length<=40&&new Set(events.map(e=>e.id)).size===events.length&&events.every(e=>/^[a-zA-Z0-9_-]{1,90}$/.test(e.id)&&dateOK(e.isoDate)&&e.isoDate.startsWith(month+'-')&&clean(e.title));}
export default async function handler(request,context={}){
 try{
  const url=new URL(request.url),resource=url.searchParams.get('resource'),user=session(request);
  if(request.method==='POST'&&request.headers.get('origin')!==url.origin)fail(403,'Origine de requête invalide.');
  if(Number(request.headers.get('content-length')||0)>65536)fail(413,'Requête trop volumineuse.');
  let body={};if(request.method==='POST'){const raw=await request.text();if(raw.length>65536)fail(413,'Requête trop volumineuse.');try{body=JSON.parse(raw);}catch{fail(400,'Requête invalide.');}}
  if(resource==='login'&&request.method==='POST'){
   if(typeof body.pin!=='string'||body.pin.length>128)fail(400,'Code invalide.');
   const subject=body.admin?'admin':String(Number(body.memberId));const ip=context.ip||'local';
   for(const key of ['ip:'+ip,'subject:'+subject]){const digest=createHash('sha256').update(key+env('SESSION_SECRET')).digest('hex');const allowed=await db('rpc/pm_consume_login_attempt',{method:'POST',body:JSON.stringify({p_key:digest})});if(!allowed)fail(429,'Trop de tentatives. Réessayez dans 15 minutes.');}
   let account;
   if(body.admin){const a=Buffer.from(createHash('sha256').update(body.pin).digest()),b=Buffer.from(createHash('sha256').update(env('ADMIN_PASSWORD')).digest());if(!timingSafeEqual(a,b))fail(401,'Code incorrect.');account={role:'admin'};}
   else {const rows=await db('pm_members?id=eq.'+Number(body.memberId)+'&select=id,pin_hash');if(!rows[0]||!verifyPin(body.pin,rows[0].pin_hash))fail(401,'Code incorrect.');account={role:'member',memberId:rows[0].id};}
   return json(account,200,{'Set-Cookie':cookie(account,request)});
  }
  if(resource==='logout'&&request.method==='POST')return json({ok:true},200,{'Set-Cookie':'pm_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure'});
  if(resource==='state'&&request.method==='GET'){
   const month=url.searchParams.get('month');if(!monthOK(month))fail(400,'Mois invalide.');
   const [members,months,answers]=await Promise.all([db('pm_members?select=id,prenom,nom,sexe,pupitre&order=id'),db('pm_months?month=eq.'+month+'&select=*'),db('pm_answers?month=eq.'+month+'&select=member_id,event_id,status')]);
   const data=months[0]||{month,events:[],revision:0};return json({members,month:{events:data.events,revision:data.revision,answers:Object.fromEntries(answers.filter(a=>data.events.some(e=>e.id===a.event_id)).map(a=>[a.member_id+'_'+a.event_id,a.status]))},session:user?{role:user.role,memberId:user.memberId}:null});
  }
  if(resource==='private'&&request.method==='GET'){auth(user,true);const [members,settings,studio]=await Promise.all([db('pm_members?select=id,prenom,nom,sexe,pupitre,role,statut&order=id'),db('pm_settings?key=eq.planning&select=value'),db('pm_studio?select=*&order=booking_date')]);return json({members,planning:settings[0]?.value||[],studio});}
  if(resource==='answer'&&request.method==='POST'){
   auth(user);const {month,eventId,status}=body,memberId=Number(body.memberId);if(user.role!=='admin'&&memberId!==user.memberId)fail(403,'Vous pouvez modifier uniquement votre ligne.');
   if(!monthOK(month)||!['disponible','indisponible','repétition','a_definir'].includes(status))fail(400,'Disponibilité invalide.');
   const row=await db('pm_months?month=eq.'+month+'&select=events');if(!row[0]?.events.some(e=>e.id===eventId))fail(409,'Cette date a changé. Actualisez la page.');
   await db('pm_answers?on_conflict=month,event_id,member_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({month,event_id:eventId,member_id:memberId,status,updated_at:new Date().toISOString()})});return json({ok:true});
  }
  if(resource==='dates'&&request.method==='POST'){
   auth(user,true);if(!monthOK(body.month)||!validateEvents(body.events,body.month)||!Number.isInteger(body.revision))fail(400,'Dates ou titres invalides.');
   const revision=await db('rpc/pm_save_dates',{method:'POST',body:JSON.stringify({p_month:body.month,p_events:body.events,p_revision:body.revision})});if(!Number.isInteger(revision)||revision<0)fail(409,'Un autre responsable a modifié les dates. Vos changements ne sont pas enregistrés. Actualisez puis réessayez.');return json({revision});
  }
  if(resource==='studio'&&request.method==='POST'){
   auth(user,true);if(!dateOK(body.date)||!Number.isInteger(body.revision))fail(400,'Date invalide.');
   const filter=`pm_studio?booking_date=eq.${body.date}&revision=eq.${body.revision}`;
   if(body.remove){const removed=await db(filter,{method:'DELETE'});if(!removed.length)fail(409,'Réservation déjà modifiée. Actualisez.');return json({ok:true});}
   if(!clean(body.title)||!clean(body.type)||!/^\d{1,2}h(?:\d{2})?-\d{1,2}h(?:\d{2})?$/i.test(body.time||''))fail(400,'Horaires attendus : 19h-22h ou 18h30-20h30.');
   const values=body.time.toLowerCase().split('-').map(v=>{const [h,m='0']=v.split('h');if(+h>23||+m>59)fail(400,'Horaire invalide.');return +h*60+ +m;});if(values[1]<=values[0])fail(400,'La fin doit être après le début.');
   if(body.revision===0){await db('pm_studio?on_conflict=booking_date',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({booking_date:body.date,title:body.title,time:body.time,type:body.type,revision:1})});const existing=await db('pm_studio?booking_date=eq.'+body.date);if(existing[0]?.title!==body.title||existing[0]?.time!==body.time||existing[0]?.type!==body.type)fail(409,'Ce jour a été réservé par un autre responsable. Actualisez.');return json({booking:existing[0]});}
   const updated=await db(filter,{method:'PATCH',body:JSON.stringify({title:body.title,time:body.time,type:body.type,revision:body.revision+1})});if(!updated.length)fail(409,'Réservation modifiée par un autre responsable. Actualisez.');return json({booking:updated[0]});
  }
  fail(404,'Action inconnue.');
 }catch(error){return json({error:error.status?error.message:'Erreur du serveur. Réessayez.'},error.status||500);}
}
