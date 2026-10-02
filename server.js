'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const MEDIA_DIR = path.join(ROOT, 'media');
const DB_FILE = path.join(DATA_DIR, 'db.json');
for (const dir of [DATA_DIR, MEDIA_DIR]) fs.mkdirSync(dir, {recursive:true});

const defaultDb = {version:2, users:[], sessions:[], posts:[], comments:[], likes:[], follows:[], notifications:[], conversations:[], messages:[]};
function clone(x){ return JSON.parse(JSON.stringify(x)); }
function loadDb(){
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE,'utf8'));
    for(const k of Object.keys(defaultDb)) if(!Array.isArray(defaultDb[k]) && raw[k]===undefined) raw[k]=defaultDb[k];
    for(const k of Object.keys(defaultDb)) if(Array.isArray(defaultDb[k]) && !Array.isArray(raw[k])) raw[k]=[];
    raw.version=2; return raw;
  } catch { return clone(defaultDb); }
}
let db = loadDb();
let saving = Promise.resolve();
function saveDb(){
  const snapshot = JSON.stringify(db,null,2);
  saving = saving.then(async()=>{
    const tmp=DB_FILE+'.tmp';
    await fs.promises.writeFile(tmp,snapshot,'utf8');
    await fs.promises.rename(tmp,DB_FILE);
  });
  return saving;
}

function now(){return new Date().toISOString();}
function id(prefix){return prefix+'_'+crypto.randomBytes(10).toString('hex');}
function sha(value){return crypto.createHash('sha256').update(String(value)).digest('hex');}
function hashPassword(password){return crypto.scryptSync(password,'swastik-password-salt-v2',64).toString('hex');}
function safeUser(u){return u?{id:u.id,username:u.username,displayName:u.displayName,bio:u.bio||'',avatar:u.avatar||'S',createdAt:u.createdAt}:null;}
function cookie(req,name){for(const part of String(req.headers.cookie||'').split(';')){const [k,...v]=part.trim().split('=');if(k===name)return decodeURIComponent(v.join('='));}return null;}
function currentUser(req){
  const token=cookie(req,'swastik_session'); if(!token)return null;
  const s=db.sessions.find(x=>x.token===token); if(!s)return null;
  if(Number(s.expiresAt)<Date.now()){db.sessions=db.sessions.filter(x=>x!==s); void saveDb(); return null;}
  return db.users.find(u=>u.id===s.userId)||null;
}
function auth(req,res){const u=currentUser(req); if(!u) return json(res,401,{error:'Login required'}); return u;}
function send(res,status,body,headers={}){
  const isJson=typeof body!=='string';
  const common={
    'Content-Type':isJson?'application/json; charset=utf-8':'text/plain; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
  };
  res.writeHead(status,{...common,...headers}); res.end(isJson?JSON.stringify(body):body);
}
function json(res,status,body,headers={}){send(res,status,body,headers);}
function ok(s,min,max){return typeof s==='string' && s.trim().length>=min && s.trim().length<=max;}
function parseJson(req){
  return new Promise((resolve,reject)=>{
    let text=''; const limit=10*1024*1024;
    req.on('data',chunk=>{text+=chunk;if(text.length>limit){reject(Object.assign(new Error('Payload too large'),{status:413}));req.destroy();}});
    req.on('end',()=>{try{resolve(text?JSON.parse(text):{});}catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}));}});
    req.on('error',reject);
  });
}

const hits=new Map();
function rateLimit(req,res,key,limit,windowMs){
  const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();
  const k=key+':'+ip; const t=Date.now(); const arr=(hits.get(k)||[]).filter(x=>t-x<windowMs); arr.push(t); hits.set(k,arr);
  if(arr.length>limit){json(res,429,{error:'Too many requests. Try again in a minute.'}); return false;} return true;
}
function addNotification(userId,type,fromUserId,postId){
  if(!userId||userId===fromUserId)return;
  db.notifications.push({id:id('n'),userId,type,fromUserId,postId:postId||null,createdAt:now(),read:false});
}
function postView(p,me){
  const author=db.users.find(u=>u.id===p.userId); if(!author)return null;
  return {id:p.id,caption:p.caption,image:p.image||null,createdAt:p.createdAt,author:safeUser(author),likes:db.likes.filter(l=>l.postId===p.id).length,liked:!!me&&db.likes.some(l=>l.postId===p.id&&l.userId===me.id),comments:db.comments.filter(c=>c.postId===p.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(c=>({id:c.id,text:c.text,createdAt:c.createdAt,user:safeUser(db.users.find(u=>u.id===c.userId))})).filter(x=>x.user)};
}
function notificationsFor(me){
  return db.notifications.filter(n=>n.userId===me.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50).map(n=>({...n,from:safeUser(db.users.find(u=>u.id===n.fromUserId))})).filter(n=>n.from||n.type==='system');
}
function initDemo(){
  if(db.users.length)return;
  const u1={id:id('u'),username:'ashu',displayName:'Ashu',bio:'Welcome to SWASTIK 🚀',avatar:'A',passwordHash:hashPassword('Demo@123'),createdAt:now()};
  const u2={id:id('u'),username:'riya',displayName:'Riya',bio:'Hello SWASTIK',avatar:'R',passwordHash:hashPassword('Demo@123'),createdAt:now()};
  const u3={id:id('u'),username:'rahul',displayName:'Rahul',bio:'',avatar:'R',passwordHash:hashPassword('Demo@123'),createdAt:now()};
  db.users.push(u1,u2,u3);
  db.posts.push({id:id('p'),userId:u1.id,caption:'Welcome to SWASTIK! 🚀',image:null,createdAt:now()});
  db.follows.push({from:u1.id,to:u2.id,createdAt:now()});
  saveDb();
}
initDemo();

function createSession(u){const token=crypto.randomBytes(32).toString('hex');db.sessions.push({token,userId:u.id,expiresAt:Date.now()+30*24*60*60*1000});return token;}
function sessionCookie(token){const secure=process.env.NODE_ENV==='production'?' Secure;':'';return `swastik_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000;${secure}`;}

async function router(req,res){
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`); const p=url.pathname; const method=req.method||'GET';
  try{
    if(method==='GET'&&p==='/health')return json(res,200,{ok:true,name:'SWASTIK',version:'4.0.0',time:now()});
    if(method==='POST'&&p==='/api/auth/signup'){
      if(!rateLimit(req,res,'signup',8,10*60*1000))return;
      const b=await parseJson(req); const username=String(b.username||'').trim().toLowerCase(); const password=String(b.password||''); const displayName=String(b.displayName||username).trim();
      if(!/^[a-z0-9_\.]{3,20}$/.test(username))return json(res,400,{error:'Username: 3–20 letters, numbers, underscore or dot.'});
      if(password.length<8||password.length>128)return json(res,400,{error:'Password must be 8–128 characters.'});
      if(!ok(displayName,1,40))return json(res,400,{error:'Display name must be 1–40 characters.'});
      if(db.users.some(u=>u.username===username))return json(res,409,{error:'Username already exists.'});
      const u={id:id('u'),username,displayName,bio:'',avatar:displayName[0].toUpperCase(),passwordHash:hashPassword(password),createdAt:now()};db.users.push(u);
      const token=createSession(u);await saveDb();return json(res,201,{user:safeUser(u)},{'Set-Cookie':sessionCookie(token)});
    }
    if(method==='POST'&&p==='/api/auth/login'){
      if(!rateLimit(req,res,'login',12,10*60*1000))return;
      const b=await parseJson(req);const username=String(b.username||'').trim().toLowerCase();const u=db.users.find(x=>x.username===username);
      if(!u||hashPassword(String(b.password||''))!==u.passwordHash)return json(res,401,{error:'Invalid username or password.'});
      const token=createSession(u);await saveDb();return json(res,200,{user:safeUser(u)},{'Set-Cookie':sessionCookie(token)});
    }
    if(method==='POST'&&p==='/api/auth/logout'){
      const token=cookie(req,'swastik_session');db.sessions=db.sessions.filter(s=>s.token!==token);await saveDb();return json(res,200,{ok:true},{'Set-Cookie':'swastik_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});
    }
    if(method==='GET'&&p==='/api/me')return json(res,200,{user:safeUser(currentUser(req))});
    if(method==='GET'&&p==='/api/feed'){
      const me=currentUser(req);const q=String(url.searchParams.get('q')||'').trim().toLowerCase();const page=Math.max(1,Number(url.searchParams.get('page')||1));const limit=Math.min(30,Math.max(1,Number(url.searchParams.get('limit')||20)));
      let posts=[...db.posts].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      if(q)posts=posts.filter(x=>{const au=db.users.find(z=>z.id===x.userId);return au&&(x.caption.toLowerCase().includes(q)||au.username.includes(q)||au.displayName.toLowerCase().includes(q));});
      const start=(page-1)*limit;const rows=posts.slice(start,start+limit).map(x=>postView(x,me)).filter(Boolean);return json(res,200,{posts:rows,page,hasMore:start+limit<posts.length});
    }
    if(method==='POST'&&p==='/api/posts'){
      const me=auth(req,res);if(!me)return;if(!rateLimit(req,res,'post',20,10*60*1000))return;
      const b=await parseJson(req);const caption=String(b.caption||'').trim();if(caption.length>500)return json(res,400,{error:'Caption can be up to 500 characters.'});if(!caption&&!b.image)return json(res,400,{error:'Add text or an image.'});
      let image=null;
      if(b.image){const m=String(b.image).match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);if(!m)return json(res,400,{error:'Only PNG, JPEG and WebP images are supported.'});const buf=Buffer.from(m[2],'base64');if(buf.length>2*1024*1024)return json(res,400,{error:'Image must be under 2 MB.'});const ext=m[1]==='image/jpeg'?'jpg':m[1].split('/')[1];const file=id('img')+'.'+ext;await fs.promises.writeFile(path.join(MEDIA_DIR,file),buf);image='/media/'+file;}
      const post={id:id('p'),userId:me.id,caption,image,createdAt:now()};db.posts.push(post);await saveDb();return json(res,201,{post:postView(post,me)});
    }
    const likeM=p.match(/^\/api\/posts\/([^/]+)\/like$/);
    if(method==='POST'&&likeM){const me=auth(req,res);if(!me)return;const post=db.posts.find(x=>x.id===likeM[1]);if(!post)return json(res,404,{error:'Post not found.'});const i=db.likes.findIndex(l=>l.postId===post.id&&l.userId===me.id);let liked;if(i>=0){db.likes.splice(i,1);liked=false;}else{db.likes.push({postId:post.id,userId:me.id,createdAt:now()});liked=true;addNotification(post.userId,'like',me.id,post.id)}await saveDb();return json(res,200,{liked,likes:db.likes.filter(l=>l.postId===post.id).length});}
    const commentM=p.match(/^\/api\/posts\/([^/]+)\/comments$/);
    if(method==='POST'&&commentM){const me=auth(req,res);if(!me)return;if(!rateLimit(req,res,'comment',40,10*60*1000))return;const post=db.posts.find(x=>x.id===commentM[1]);if(!post)return json(res,404,{error:'Post not found.'});const b=await parseJson(req);if(!ok(String(b.text||''),1,300))return json(res,400,{error:'Comment must be 1–300 characters.'});const c={id:id('c'),postId:post.id,userId:me.id,text:String(b.text).trim(),createdAt:now()};db.comments.push(c);addNotification(post.userId,'comment',me.id,post.id);await saveDb();return json(res,201,{comment:{id:c.id,text:c.text,createdAt:c.createdAt,user:safeUser(me)}});}
    const delPostM=p.match(/^\/api\/posts\/([^/]+)$/);
    if(method==='DELETE'&&delPostM){const me=auth(req,res);if(!me)return;const i=db.posts.findIndex(x=>x.id===delPostM[1]);if(i<0)return json(res,404,{error:'Post not found.'});if(db.posts[i].userId!==me.id)return json(res,403,{error:'You can only delete your own post.'});const post=db.posts[i];db.posts.splice(i,1);db.likes=db.likes.filter(x=>x.postId!==post.id);db.comments=db.comments.filter(x=>x.postId!==post.id);if(post.image)try{await fs.promises.unlink(path.join(MEDIA_DIR,path.basename(post.image)))}catch{}await saveDb();return json(res,200,{ok:true});}
    const followM=p.match(/^\/api\/users\/([^/]+)\/follow$/);
    if(method==='POST'&&followM){const me=auth(req,res);if(!me)return;const target=db.users.find(x=>x.id===followM[1]);if(!target||target.id===me.id)return json(res,400,{error:'Invalid user.'});const i=db.follows.findIndex(f=>f.from===me.id&&f.to===target.id);let following;if(i>=0){db.follows.splice(i,1);following=false;}else{db.follows.push({from:me.id,to:target.id,createdAt:now()});following=true;addNotification(target.id,'follow',me.id)}await saveDb();return json(res,200,{following});}
    if(method==='GET'&&p==='/api/users'){
      const me=currentUser(req);const q=String(url.searchParams.get('q')||'').trim().toLowerCase();const users=db.users.filter(u=>!q||u.username.includes(q)||u.displayName.toLowerCase().includes(q)).slice(0,30);return json(res,200,{users:users.map(u=>({...safeUser(u),followers:db.follows.filter(f=>f.to===u.id).length,following:!!me&&db.follows.some(f=>f.from===me.id&&f.to===u.id)}))});
    }
    const userM=p.match(/^\/api\/users\/([^/]+)$/);
    if(method==='GET'&&userM){const u=db.users.find(x=>x.username===userM[1].toLowerCase()||x.id===userM[1]);if(!u)return json(res,404,{error:'User not found.'});const me=currentUser(req);const posts=db.posts.filter(x=>x.userId===u.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return json(res,200,{user:{...safeUser(u),followers:db.follows.filter(f=>f.to===u.id).length,followingCount:db.follows.filter(f=>f.from===u.id).length,following:!!me&&db.follows.some(f=>f.from===me.id&&f.to===u.id)},posts:posts.map(p=>postView(p,me)).filter(Boolean)});}
    if(method==='PATCH'&&userM){const me=auth(req,res);if(!me)return;if(me.username!==userM[1].toLowerCase()&&me.id!==userM[1])return json(res,403,{error:'Not allowed.'});const b=await parseJson(req);if(b.displayName!==undefined){if(!ok(String(b.displayName),1,40))return json(res,400,{error:'Display name must be 1–40 characters.'});me.displayName=String(b.displayName).trim();me.avatar=me.displayName[0].toUpperCase();}if(b.bio!==undefined){if(String(b.bio).length>160)return json(res,400,{error:'Bio can be up to 160 characters.'});me.bio=String(b.bio);}await saveDb();return json(res,200,{user:safeUser(me)});}
    if(method==='GET'&&p==='/api/notifications'){const me=auth(req,res);if(!me)return;return json(res,200,{notifications:notificationsFor(me)});}
    if(method==='POST'&&p==='/api/notifications/read'){const me=auth(req,res);if(!me)return;db.notifications.forEach(n=>{if(n.userId===me.id)n.read=true});await saveDb();return json(res,200,{ok:true});}
    if(method==='GET'&&p==='/api/conversations'){const me=auth(req,res);if(!me)return;const conv=db.conversations.filter(c=>c.members.includes(me.id)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(c=>{const other=db.users.find(u=>c.members.includes(u.id)&&u.id!==me.id);const last=[...db.messages].filter(m=>m.conversationId===c.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];return {id:c.id,other:safeUser(other),last:last?{text:last.text,createdAt:last.createdAt}:null};});return json(res,200,{conversations:conv});}
    if(method==='POST'&&p==='/api/conversations'){const me=auth(req,res);if(!me)return;const b=await parseJson(req);const target=db.users.find(u=>u.username===String(b.username||'').trim().toLowerCase()||u.id===b.userId);if(!target||target.id===me.id)return json(res,400,{error:'Invalid user.'});let c=db.conversations.find(x=>x.members.length===2&&x.members.includes(me.id)&&x.members.includes(target.id));if(!c){c={id:id('conv'),members:[me.id,target.id],createdAt:now(),updatedAt:now()};db.conversations.push(c);await saveDb();}return json(res,201,{conversation:{id:c.id,other:safeUser(target)}});}
    const convM=p.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if(convM&&method==='GET'){const me=auth(req,res);if(!me)return;const c=db.conversations.find(x=>x.id===convM[1]&&x.members.includes(me.id));if(!c)return json(res,404,{error:'Conversation not found.'});const rows=db.messages.filter(m=>m.conversationId===c.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).slice(-100).map(m=>({...m,user:safeUser(db.users.find(u=>u.id===m.userId))}));return json(res,200,{messages:rows});}
    if(convM&&method==='POST'){const me=auth(req,res);if(!me)return;if(!rateLimit(req,res,'message',80,10*60*1000))return;const c=db.conversations.find(x=>x.id===convM[1]&&x.members.includes(me.id));if(!c)return json(res,404,{error:'Conversation not found.'});const b=await parseJson(req);if(!ok(String(b.text||''),1,1000))return json(res,400,{error:'Message must be 1–1000 characters.'});const m={id:id('m'),conversationId:c.id,userId:me.id,text:String(b.text).trim(),createdAt:now()};db.messages.push(m);c.updatedAt=m.createdAt;const other=c.members.find(x=>x!==me.id);addNotification(other,'message',me.id);await saveDb();return json(res,201,{message:{...m,user:safeUser(me)}});}
    if(method==='GET'&&p.startsWith('/media/')){const file=path.basename(p);if(file!==p.slice('/media/'.length)||file.includes('..'))return send(res,400,'Bad request');const fp=path.join(MEDIA_DIR,file);if(!fs.existsSync(fp))return send(res,404,'Not found');const ext=path.extname(fp).toLowerCase();const types={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});return fs.createReadStream(fp).pipe(res);}
    return staticFile(req,res,p);
  }catch(e){console.error(e);return json(res,e.status||500,{error:e.status?e.message:'Server error. Please try again.'});}
}

function staticFile(req,res,p){
  let rel=p==='/'?'/index.html':p; if(rel.includes('..')||rel.includes('\\'))return send(res,400,'Bad request');const fp=path.join(PUBLIC,rel);if(!fs.existsSync(fp)||!fs.statSync(fp).isFile())return send(res,404,'Not found');const ext=path.extname(fp).toLowerCase();const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon'};const headers={'Content-Type':types[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-store':'public, max-age=3600'};if(ext==='.html')headers['Content-Security-Policy']="default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";res.writeHead(200,headers);fs.createReadStream(fp).pipe(res);
}

const server=http.createServer(router);
const PORT=Number(process.env.PORT||3000);
server.on('error',e=>{console.error('Server error:',e.message);process.exitCode=1;});
server.listen(PORT,'0.0.0.0',()=>console.log(`SWASTIK running on port ${PORT}`));
function shutdown(){server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
