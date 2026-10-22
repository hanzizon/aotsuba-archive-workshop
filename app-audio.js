/* Audio stays a sanitized link in saved posts; players exist only while reading. */
(() => {
  const rich=document.querySelector('#editorRichBody');
  const row=document.querySelector('.editor-format-row');
  if (!rich || !row) return;
  const button=document.createElement('button');
  button.type='button'; button.id='editorInsertAudio'; button.className='editor-format-btn'; button.textContent='MP3 넣기';
  row.append(button);
  const dialog=document.createElement('dialog');
  dialog.className='archive-audio-dialog';
  dialog.setAttribute('aria-labelledby','audioDialogTitle');
  dialog.innerHTML='<form><h2 id="audioDialogTitle">MP3 넣기</h2><label>MP3 파일 <input id="audioFile" type="file" accept=".mp3,audio/mpeg" required></label><label>글에 표시할 제목 <input id="audioTitle" maxlength="200" required></label><p>파일당 최대 8MB · 업로드한 파일은 공개됩니다.</p><p role="status" id="audioStatus"></p><div><button type="button" id="audioCancel" class="ghost-btn">취소</button> <button type="submit" class="primary-btn">본문에 넣기</button></div></form>';
  document.body.append(dialog);
  const file=dialog.querySelector('#audioFile'), title=dialog.querySelector('#audioTitle'), status=dialog.querySelector('#audioStatus');
  let selectedRange=null, savedHtml='', busy=false;
  button.addEventListener('mousedown',e=>e.preventDefault());
  button.addEventListener('click',()=>{
    if (!window.archiveIsAdmin?.()) { toast('MP3를 업로드하려면 관리자 로그인이 필요합니다.'); return; }
    const selection=getSelection();
    selectedRange=selection?.rangeCount && rich.contains(selection.getRangeAt(0).commonAncestorContainer)?selection.getRangeAt(0).cloneRange():document.createRange();
    if (!rich.contains(selectedRange.commonAncestorContainer)) { selectedRange.selectNodeContents(rich); selectedRange.collapse(false); }
    savedHtml=rich.innerHTML;
    dialog.querySelector('form').reset(); status.textContent=''; dialog.showModal();
  });
  file.addEventListener('change',()=>{ if (!title.value) title.value=(file.files[0]?.name || '').replace(/\.mp3$/i,''); });
  dialog.querySelector('#audioCancel').addEventListener('click',()=>{ if (!busy) dialog.close(); });
  dialog.addEventListener('cancel',e=>{ if (busy) e.preventDefault(); });
  dialog.querySelector('form').addEventListener('submit',async e=>{
    e.preventDefault(); if (busy) return;
    const chosen=file.files[0], label=title.value.trim();
    if (!chosen || !label) return;
    if (!/\.mp3$/i.test(chosen.name) || chosen.size>8*1024*1024 || !chosen.size) { status.textContent='8MB 이하의 MP3 파일을 선택해 주세요.'; return; }
    busy=true; dialog.querySelectorAll('button,input').forEach(el=>el.disabled=true); status.textContent='MP3를 업로드하고 있습니다…';
    try {
      const result=await window.archiveUploadAudio(chosen);
      if (!window.archiveSafeAudioUrl(result.url)) throw new Error('invalid_url');
      if (!document.querySelector('#postEditor.open') || rich.innerHTML!==savedHtml || !rich.contains(selectedRange.commonAncestorContainer)) throw new Error('editor_changed');
      const link=document.createElement('a'); link.className='archive-audio'; link.href=result.url; link.textContent=label;
      // A block-displayed inline link keeps text on either side intact, including nested formatting.
      selectedRange.collapse(false); selectedRange.insertNode(link);
      const after=document.createTextNode('\u00a0'); link.after(after);
      const next=document.createRange(); next.setStartAfter(after); next.collapse(true);
      dialog.close(); rich.focus(); getSelection().removeAllRanges(); getSelection().addRange(next);
      rich.dispatchEvent(new Event('input',{bubbles:true}));
      saveEditorDraft(); toast('MP3를 넣었습니다. 제목은 본문에서 수정할 수 있습니다.');
    } catch (err) {
      status.textContent=err.message==='editor_changed'?'본문이 변경되어 삽입하지 않았습니다. 다시 시도해 주세요.':
        ['unauthorized','login_required'].includes(err.message)?'관리자 로그인이 만료됐습니다. 다시 로그인해 주세요.':'업로드하지 못했습니다. MP3 파일과 연결을 확인하고 다시 시도해 주세요.';
    } finally { busy=false; dialog.querySelectorAll('button,input').forEach(el=>el.disabled=false); }
  });

  let active=null, player=null;
  function stop() {
    if (player) { player.pause(); player.removeAttribute('src'); player.load(); }
    active?.setAttribute('aria-pressed','false'); active?.classList.remove('is-playing'); active=null; player=null;
  }
  function prepare() {
    document.querySelectorAll('.preview-body a.archive-audio').forEach(link=>{
      link.setAttribute('role','button');
      if (!link.hasAttribute('aria-pressed')) link.setAttribute('aria-pressed','false');
    });
    if (active && (!active.isConnected || document.querySelector('#previewModal')?.hidden)) stop();
  }
  async function toggle(link) {
    if (!window.archiveSafeAudioUrl(link.getAttribute('href'))) return;
    if (active!==link) {
      stop(); active=link; player=new Audio(link.href); player.preload='none';
      const current=player;
      current.addEventListener('ended',()=>{ if (player===current) {link.setAttribute('aria-pressed','false');link.classList.remove('is-playing');} });
      current.addEventListener('error',()=>{ if (player===current) {stop();toast('MP3를 재생하지 못했습니다. 잠시 후 다시 눌러 주세요.');} });
    }
    if (!player.paused) {player.pause();link.setAttribute('aria-pressed','false');link.classList.remove('is-playing');return;}
    const current=player;
    try { await current.play(); if (current===player) {link.setAttribute('aria-pressed','true');link.classList.add('is-playing');} }
    catch (_) { if (current===player) {stop();toast('MP3를 재생하지 못했습니다. 다시 눌러 주세요.');} }
  }
  document.addEventListener('click',e=>{ const link=e.target.closest?.('.preview-body a.archive-audio'); if(link){e.preventDefault();toggle(link);} });
  document.addEventListener('keydown',e=>{ const link=e.target.closest?.('.preview-body a.archive-audio'); if(link && ['Enter',' '].includes(e.key)){e.preventDefault();toggle(link);} });
  document.addEventListener('archive-home',stop); window.addEventListener('pagehide',stop);
  const preview=document.querySelector('#previewModal');
  if (preview) new MutationObserver(prepare).observe(preview,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
})();
