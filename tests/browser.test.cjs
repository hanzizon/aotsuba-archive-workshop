const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const {chromium}=require('@playwright/test');
test('browser: unchanged home appearance, safe preview/editor, title home keyboard and click',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    async function pageFor(baseline){
      const page=await browser.newPage({viewport:{width:1280,height:900}});
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname!=='hanzizon.github.io')return route.abort();
        let file=decodeURIComponent(url.pathname.replace('/aotsuba-archive-workshop/',''))||'index.html';
        if(file.includes('..'))return route.abort();
        try{
          const body=baseline?cp.execFileSync('git',['show','bb1c4b592c168dc9b3f70a052b4c64c84aabe694:'+file],{maxBuffer:10*1024*1024,stdio:['ignore','pipe','ignore']}):fs.readFileSync(file);
          const ext=file.split('.').pop();
          await route.fulfill({body,contentType:({html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css',png:'image/png',svg:'image/svg+xml'})[ext]||'application/octet-stream'});
        }catch(_){await route.abort();}
      });
      await page.goto('https://hanzizon.github.io/aotsuba-archive-workshop/');
      await page.waitForFunction(()=>document.querySelector('.series-card'));
      await page.evaluate(()=>document.fonts.ready);
      return page;
    }
    const baseline=await pageFor(true), page=await pageFor(false);
    // Hide transient error toasts from intentionally offline API/font requests.
    for(const p of [baseline,page])await p.addStyleTag({content:'.toast{visibility:hidden!important}'});
    assert.deepEqual(await page.screenshot(),await baseline.screenshot());
    await baseline.close();
    await page.evaluate(()=>{
      window.__xss=0;
      openPostPreview({title:'안전한 제목',date:'<img src=x onerror="window.__xss=1">',bodyHtml:'<p style="text-align:center"><strong>안전한 본문</strong></p><img src=x onerror="window.__xss=1"><svg onload="window.__xss=1"></svg><a href="javascript:window.__xss=1">링크</a>'});
    });
    assert.equal(await page.locator('.preview-body strong').textContent(),'안전한 본문');
    assert.equal(await page.locator('#previewContent [onerror],#previewContent svg,#previewContent a[href^="javascript:"]').count(),0);
    await page.evaluate(()=>setArchiveEditorHtml('<p style="text-align:right">편집</p><img src=x onerror="window.__xss=1">'));
    assert.equal(await page.locator('#editorRichBody [onerror]').count(),0);
    assert.equal(await page.evaluate(()=>window.__xss),0);
    for(const action of ['click','Enter','Space']){
      await page.evaluate(()=>{
        document.querySelector('#previewModal').hidden=true;
        document.querySelector('#postEditor').classList.add('open');
        document.body.style.overflow='hidden';
      });
      const title=page.locator('#postEditor [data-archive-home]').first();
      if(action==='click')await title.click();else{await title.focus();await title.press(action);}
      assert.equal(await page.locator('#postEditor').evaluate(el=>el.classList.contains('open')),false);
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
    }
    await page.close();
  }finally{await browser.close();}
});
