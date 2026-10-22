const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHmac}=require('node:crypto');
const {chromium}=require('@playwright/test');
const origin='https://hanzizon.github.io', api='https://aotsuba-archive-admin.hannzizon.workers.dev';
const audioUrl=api+'/audio/'+'a'.repeat(64)+'.mp3';
// Synthetic MPEG-1 Layer III silence: no copyrighted media in fixtures.
const frame=Buffer.alloc(417); frame.set([0xff,0xfb,0x90,0xc0]);
const mp3=Buffer.concat(Array.from({length:200},()=>frame));
test('audio Worker: authenticated bounded upload, immutable identity, CORS and byte ranges',async()=>{
  const worker=(await import('data:text/javascript;base64,'+fs.readFileSync('cloudflare-worker/worker.js').toString('base64'))).default;
  const secret='audio-test-secret-at-least-32-characters';
  const now=Math.floor(Date.now()/1000), body=Buffer.from(JSON.stringify({iat:now,exp:now+10800})).toString('base64url');
  const token=body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
  const original=global.fetch; let written=null, calls=0;
  global.fetch=async (url,options={})=>{
    calls++;
    assert.match(String(url),/^https:\/\/api.github.com\/repos\/hanzizon\/aotsuba-archive-workshop\/contents\/media\/audio\/[a-f0-9]{64}\.mp3/);
    if(options.method==='PUT'){ written=JSON.parse(options.body);return new Response('{}'); }
    if(options.headers.Accept==='application/vnd.github.raw+json')return new Response(mp3);
    return new Response('{}',{status:written?200:404});
  };
  const env={SESSION_SECRET:secret,GITHUB_TOKEN:'test-only'};
  const request=(path,options={})=>worker.fetch(new Request(api+path,options),env);
  const headers={'Origin':origin,'Authorization':'Bearer '+token,'Content-Type':'audio/mpeg'};
  try {
    assert.equal((await request('/audio',{method:'POST',body:mp3})).status,401); assert.equal(calls,0);
    assert.equal((await request('/audio',{method:'POST',headers:{...headers,Origin:'https://evil.test'},body:mp3})).status,403);
    assert.equal((await request('/audio',{method:'POST',headers,body:'not mp3'})).status,415);
    assert.equal((await request('/audio',{method:'POST',headers:{...headers,'Content-Length':String(8*1024*1024+1)},body:mp3})).status,413);
    assert.equal((await request('/audio',{method:'POST',headers,body:Buffer.alloc(8*1024*1024+1)})).status,413);
    const uploaded=await (await request('/audio',{method:'POST',headers,body:mp3})).json();
    assert.match(uploaded.url,/\/audio\/[a-f0-9]{64}\.mp3$/); assert.deepEqual(Buffer.from(written.content,'base64'),mp3);
    const before=calls; await request('/audio',{method:'POST',headers,body:mp3}); assert.equal(calls,before+1);
    const path=new URL(uploaded.url).pathname;
    const full=await request(path);assert.equal(full.headers.get('Content-Type'),'audio/mpeg');assert.equal(full.headers.get('X-Content-Type-Options'),'nosniff');assert.deepEqual(Buffer.from(await full.arrayBuffer()),mp3);
    for(const [range,start,end] of [['bytes=2-8',2,8],['bytes=-10',mp3.length-10,mp3.length-1],['bytes=10-',10,mp3.length-1]]){
      const res=await request(path,{headers:{Range:range}});assert.equal(res.status,206);assert.deepEqual(Buffer.from(await res.arrayBuffer()),mp3.subarray(start,end+1));
    }
    for(const range of ['bytes=999999-','bytes=-0','bytes=5-2','bytes=0-1,3-4'])assert.equal((await request(path,{headers:{Range:range}})).status,416);
    assert.equal((await request(path,{method:'HEAD'})).body,null);
    assert.equal((await request('/audio',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}})).status,204);
    assert.equal((await request('/audio/invalid.mp3')).status,404);
  }finally{global.fetch=original;}
});

test('browser: insert MP3 mid-text, restore rich drafts, sanitize titles and play/pause real audio',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.href===audioUrl)return route.fulfill({body:mp3,contentType:'audio/mpeg'});
      if(url.origin!==origin)return route.abort();
      const file=decodeURIComponent(url.pathname.replace('/aotsuba-archive-workshop/',''))||'index.html';
      try{await route.fulfill({body:fs.readFileSync(file),contentType:({html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css',json:'application/json'})[file.split('.').pop()]||'application/octet-stream'});}catch(_){await route.abort();}
    });
    await page.goto(origin+'/aotsuba-archive-workshop/');
    await page.evaluate(()=>{window.archiveIsAdmin=()=>true;openPostEditor();});
    await page.waitForTimeout(100);
    await page.evaluate(url=>{
      window.archiveUploadAudio=async()=>({ok:true,url});
      setArchiveEditorHtml('<p>앞 문장뒤 문장</p>');
      const r=document.createRange();r.setStart(document.querySelector('#editorRichBody p').firstChild,4);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);
    },audioUrl);
    await page.locator('#editorInsertAudio').click();
    await page.locator('#audioFile').setInputFiles({name:'test.mp3',mimeType:'audio/mpeg',buffer:mp3});
    await page.locator('#audioTitle').fill('<img src=x onerror=alert(1)> 음악');
    await page.locator('.archive-audio-dialog button[type=submit]').click();
    await page.waitForFunction(()=>!document.querySelector('.archive-audio-dialog').open);
    assert.equal(await page.locator('#editorRichBody img').count(),0);
    assert.equal(await page.locator('#editorRichBody .archive-audio').count(),1);
    assert.match(await page.locator('#editorRichBody').textContent(),/^앞 문장<img.*음악\s*뒤 문장$/);
    await page.evaluate(()=>{saveEditorManualDraft();setArchiveEditorHtml('<p>changed</p>');restoreEditorManualDraft();});
    assert.equal(await page.locator('#editorRichBody .archive-audio').count(),1);
    await page.evaluate(()=>{closePostEditor();openPostEditor();});
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#editorRichBody .archive-audio').count(),1);
    await page.evaluate(()=>{const html=getArchiveEditorHtml();closePostEditor();openPostPreview({title:'음악 테스트',bodyHtml:html});});
    const link=page.locator('.preview-body .archive-audio');
    await link.click();await page.waitForFunction(()=>document.querySelector('.preview-body .archive-audio').getAttribute('aria-pressed')==='true');
    await link.press('Space');assert.equal(await link.getAttribute('aria-pressed'),'false');
    await link.press('Enter');await page.waitForFunction(()=>document.querySelector('.preview-body .archive-audio').getAttribute('aria-pressed')==='true');
    await page.evaluate(()=>goArchiveHome());assert.equal(await link.getAttribute('aria-pressed'),'false');
    const sanitized=await page.evaluate(()=>sanitizeArchiveHtml('<a class="archive-audio" href="https://evil.test/track.mp3" onclick="alert(1)">bad</a>'));
    assert.doesNotMatch(sanitized,/archive-audio|onclick/);
  }finally{await browser.close();}
});
