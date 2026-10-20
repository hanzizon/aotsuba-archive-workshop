const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {JSDOM}=require("jsdom");
const {Miniflare:Runtime,convertV4MiniflareOptions}=require("miniflare");
class Miniflare extends Runtime {
  constructor(options){super(convertV4MiniflareOptions(options));}
  setOptions(options){return super.setOptions(convertV4MiniflareOptions(options));}
}
const origin="https://hanzizon.github.io";
function dom(){
  const d=new JSDOM("<!doctype html>",{url:origin+"/aotsuba-archive-workshop/",runScripts:"outside-only"});
  d.window.eval(fs.readFileSync("vendor/purify.min.js","utf8"));
  d.window.eval(fs.readFileSync("app-security.js","utf8"));
  return d;
}
test("rich text allowlist rejects executable HTML, clobbering and CSS",()=>{
  const d=dom(),w=d.window;
  const attack=`<script>alert(1)</script><img src=x onerror=alert(1)>
    <svg><a onload=alert(1)></a></svg><math><mtext><img src=x onerror=alert(1)></mtext></math>
    <iframe srcdoc="<script>alert(1)</script>"></iframe><object data=x></object>
    <a href="java&#10;script:alert(1)" id=adminSessionBtn name=DOMPurify>bad</a>
    <p style="position:fixed;background:url(https://evil.test);text-align:center" onclick=alert(1)>safe</p>
    <img src="data:image/svg+xml;base64,AAAA"><form><input name=attributes></form>`;
  const output=w.sanitizeArchiveHtml(attack);
  const el=w.document.createElement("div");el.innerHTML=output;
  assert.equal(el.querySelector("script,svg,math,iframe,object,form,input"),null);
  for(const node of el.querySelectorAll("*"))for(const a of node.attributes){
    assert.ok(!/^on|^id$|^name$/.test(a.name));
    assert.ok(!/javascript|position:|background:|image\/svg/i.test(a.value));
  }
  assert.match(output,/text-align: center/);
  assert.equal(w.sanitizeArchiveHtml(output),output);
  d.window.close();
});
test("safe rich text, dividers, links, raster uploads and alignment survive",()=>{
  const d=dom(),w=d.window;
  const html='<p style="text-align: right;"><strong>한글</strong><em>글</em><u>밑줄</u><br></p><hr class="post-divider divider-short"><ul><li>항목</li></ul><a href="https://example.com">링크</a><img src="data:image/png;base64,AAAA">';
  const output=w.sanitizeArchiveHtml(html);
  for(const text of ["<strong>한글</strong>","<em>글</em>","<u>밑줄</u>","divider-short","text-align: right","https://example.com","data:image/png"])assert.ok(output.includes(text));
  assert.equal(w.archiveSafeImageUrl("javascript:alert(1)"),"");
  assert.equal(w.archiveSafeImageUrl("./series-kittihwangtti.png"),"./series-kittihwangtti.png");
  d.window.close();
});
test("sanitizer failure displays escaped text",()=>{
  const d=new JSDOM("",{runScripts:"outside-only"});
  d.window.eval(fs.readFileSync("app-security.js","utf8"));
  assert.equal(d.window.sanitizeArchiveHtml("<img onerror=alert(1)>"),"&lt;img onerror=alert(1)&gt;");
  d.window.close();
});
function runtime(){
  return new Miniflare({workers:[{
    modules:true,scriptPath:"cloudflare-worker/worker.js",compatibilityDate:"2026-09-08",
    durableObjects:{LOGIN_LIMITER:{className:"LoginLimiter",useSQLite:true}},
    bindings:{ADMIN_PASSWORD:"test-password",SESSION_SECRET:"test-secret-with-at-least-32-characters"},
  }]});
}
function login(mf,ip="192.0.2.1",password="wrong"){
  return mf.dispatchFetch("https://test/login",{method:"POST",headers:{Origin:origin,"CF-Connecting-IP":ip,"Content-Type":"application/json"},body:JSON.stringify({password})});
}
test("Worker CORS, 3h tokens, tampering and cross-instance durable rate limiting",async()=>{
  const mf=runtime();
  try{
    let r=await mf.dispatchFetch("https://test/login",{method:"OPTIONS",headers:{Origin:origin,"Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"content-type"}});
    assert.equal(r.status,204);assert.equal(r.headers.get("Access-Control-Allow-Origin"),origin);
    for(const headers of [
      {Origin:"https://evil.test","Access-Control-Request-Method":"POST"},
      {Origin:origin,"Access-Control-Request-Method":"DELETE"},
      {Origin:origin,"Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"x-evil"}]){
      assert.equal((await mf.dispatchFetch("https://test/login",{method:"OPTIONS",headers})).status,403);
    }
    r=await mf.dispatchFetch("https://test/health",{headers:{Origin:"null"}});
    assert.equal(r.status,403);assert.equal(r.headers.get("Access-Control-Allow-Origin"),null);
    r=await login(mf,"192.0.2.10","test-password");
    assert.equal(r.status,200);
    const session=await r.json(),payload=JSON.parse(Buffer.from(session.token.split(".")[0],"base64url"));
    assert.equal(session.expiresIn,10800);assert.equal(payload.exp-payload.iat,10800);
    // Invalid payload lets us prove successful auth without performing a GitHub write.
    const put=token=>mf.dispatchFetch("https://test/data/posts",{method:"PUT",headers:{Authorization:"Bearer "+token},body:"{}"});
    assert.equal((await put(session.token)).status,400);
    assert.equal((await put(session.token+".extra")).status,401);
    assert.equal((await put(session.token+"x")).status,401);
    assert.equal((await put("")).status,401);
    const sign=payload=>{
      const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
      return body+'.'+require('node:crypto').createHmac('sha256','test-secret-with-at-least-32-characters').update(body).digest('base64url');
    };
    const now=Math.floor(Date.now()/1000);
    for(const payload of [{exp:now+43200},{iat:now,exp:now+43200},{iat:now-10800,exp:now-1},{iat:now+60,exp:now+10800}]){
      assert.equal((await put(sign(payload))).status,401);
    }
    const results=await Promise.all(Array.from({length:12},()=>login(mf)));
    assert.equal(results.filter(r=>r.status===401).length,5);
    assert.equal(results.filter(r=>r.status===429).length,7);
    assert.ok(Number(results.find(r=>r.status===429).headers.get("Retry-After"))>0);
    assert.equal((await login(mf,"192.0.2.1","test-password")).status,429);
    // Reload Worker isolates; durable SQLite state must still enforce the limit.
    await mf.setOptions({workers:[{
      modules:true,scriptPath:"cloudflare-worker/worker.js",compatibilityDate:"2026-09-08",
      durableObjects:{LOGIN_LIMITER:{className:"LoginLimiter",useSQLite:true}},
      bindings:{ADMIN_PASSWORD:"test-password",SESSION_SECRET:"test-secret-with-at-least-32-characters"}
    }]});
    assert.equal((await login(mf)).status,429);
    const distributed=await Promise.all(Array.from({length:60},(_,i)=>login(mf,"198.51.100."+i)));
    assert.equal(distributed.filter(r=>r.status===401).length,44);
    assert.equal(distributed.filter(r=>r.status===429).length,16);
  }finally{await mf.dispose();}
});
test("login fails closed with missing limiter or secrets",async()=>{
  const mf=new Miniflare({workers:[{modules:true,scriptPath:"cloudflare-worker/worker.js",compatibilityDate:"2026-09-08"}]});
  try{assert.equal((await login(mf)).status,503);}finally{await mf.dispose();}
});
test('committed archive rich text survives sanitizing without content or markup loss',()=>{
  const d=dom();
  for(const post of JSON.parse(fs.readFileSync('data/posts.json','utf8'))){
    const before=d.window.document.createElement('div');before.innerHTML=post.bodyHtml||'';
    const after=d.window.document.createElement('div');after.innerHTML=d.window.sanitizeArchiveHtml(post.bodyHtml);
    assert.equal(after.innerHTML,before.innerHTML);
  }
  d.window.close();
});
