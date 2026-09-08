/* Rich editor statistics and persistent series post deletion. */
(() => {
  const rich=document.querySelector('#editorRichBody');
  const briefing=document.createElement('div');
  briefing.id='editorBriefing';
  briefing.title='공백 포함 · 줄바꿈 제외 · 텍스트가 있는 문단만 계산';
  rich.insertAdjacentElement('afterend',briefing);

  function updateBriefing(){
    const paragraphs=[];
    const blocks=new Set(['P','DIV','LI','BLOCKQUOTE','PRE','H1','H2','H3','H4','H5','H6','UL','OL','SECTION','ARTICLE','TABLE','TBODY','TR','TD','TH']);
    let text='';
    const flush=()=>{ if(text.trim()) paragraphs.push(text); text=''; };
    function visit(node){
      if(node.nodeType===3){ text+=node.textContent.replace(/[\r\n\u200b\ufeff]/g,''); return; }
      if(node.nodeType!==1 || node.matches('script,style,[hidden],[aria-hidden="true"]')) return;
      if(node.tagName==='HR'){ flush(); return; }
      if(node.tagName==='BR') return;
      const block=blocks.has(node.tagName);
      if(block) flush();
      node.childNodes.forEach(visit);
      if(block) flush();
    }
    rich.childNodes.forEach(visit);
    flush();
    const chars=paragraphs.reduce((sum,p)=>sum+Array.from(p).length,0);
    const count=paragraphs.length;
    const average=count ? Math.round(chars/count*10)/10 : 0;
    briefing.textContent=`구분점 ${rich.querySelectorAll('hr').length}개 / 본문 ${chars}자 / 문단 ${count}개 / 문단평균 ${average}자`;
  }
  rich.addEventListener('input',updateBriefing);
  new MutationObserver(updateBriefing).observe(rich,{childList:true,subtree:true,characterData:true});
  updateBriefing();

  const modal=document.querySelector('#previewModal');
  const close=modal.querySelector('[data-close-preview].preview-close');
  const actions=document.createElement('span');
  actions.className='series-delete-actions';
  close.before(actions);
  actions.innerHTML='<button type="button" class="preview-close" id="seriesDeleteBtn">삭제</button><span id="seriesDeleteCount"></span><button type="button" class="preview-close" id="seriesDeleteConfirm">선택 삭제</button><button type="button" class="preview-close" id="seriesDeleteCancel">취소</button>';
  const start=actions.querySelector('#seriesDeleteBtn');
  const confirm=actions.querySelector('#seriesDeleteConfirm');
  const cancel=actions.querySelector('#seriesDeleteCancel');
  const count=actions.querySelector('#seriesDeleteCount');
  let selecting=false;
  let saving=false;
  const selected=new Set();
  const isAdmin=()=>!!window.archiveIsAdmin?.();
  // Keep this write isolated until it finishes; closing normally still works.
  document.addEventListener('click',e=>{
    if(saving && e.target.closest('[data-close-preview]')){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },true);
  document.addEventListener('keydown',e=>{
    if(saving && e.key==='Escape'){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },true);
  function reset(){ selecting=false; selected.clear(); }
  function render(){
    const list=document.querySelector('#seriesPreviewPostList');
    if(!list || modal.hidden || !isAdmin()) reset();
    actions.hidden=!list || modal.hidden || !isAdmin();
    start.hidden=selecting;
    confirm.hidden=cancel.hidden=count.hidden=!selecting;
    const ids=new Set(state.posts.filter(p=>p.seriesId===state.seriesId).map(p=>p.id));
    selected.forEach(id=>{ if(!ids.has(id)) selected.delete(id); });
    count.textContent=`${selected.size}개 선택`;
    confirm.disabled=saving || !selected.size;
    cancel.disabled=start.disabled=saving;
    confirm.textContent=saving?'삭제 중…':'선택 삭제';
    list?.querySelectorAll('.series-preview-post').forEach(item=>{
      let checkbox=item.querySelector('.post-delete-checkbox');
      item.classList.toggle('delete-selecting',selecting);
      if(!selecting){ checkbox?.remove(); return; }
      if(!checkbox){
        checkbox=document.createElement('input');
        checkbox.type='checkbox';
        checkbox.className='post-delete-checkbox';
        checkbox.setAttribute('aria-label',`${item.querySelector('.post-title-text').textContent} 삭제 선택`);
        item.prepend(checkbox);
        checkbox.addEventListener('change',()=>{
          if(checkbox.checked) selected.add(item.dataset.postId);
          else selected.delete(item.dataset.postId);
          render();
        });
      }
      checkbox.checked=selected.has(item.dataset.postId);
      checkbox.disabled=saving;
    });
  }
  window.archiveDeleteSelection={reset,render,active:()=>selecting};
  actions.addEventListener('click',e=>{
    const button=e.target.closest('button');
    if(button) pulsePress(button);
  });
  start.addEventListener('click',()=>{ if(isAdmin() && !saving){ selecting=true; render(); } });
  cancel.addEventListener('click',()=>{ reset(); render(); start.focus(); });
  confirm.addEventListener('click',async()=>{
    if(!isAdmin() || saving || !selected.size) return;
    const ids=new Set(selected);
    if(!window.confirm(`선택한 포스트 ${ids.size}개를 삭제할까요? 삭제한 포스트는 복구할 수 없습니다.`)) return;
    const remaining=state.posts.filter(p=>!ids.has(p.id));
    saving=true;
    render();
    try{
      await window.archiveSavePosts(remaining);
      state.posts=remaining;
      // Remove local fallback copies only after the authoritative write succeeds.
      try{
        const key='aotsubaArchive.publishedPosts.v1';
        const cached=JSON.parse(localStorage.getItem(key)||'[]');
        localStorage.setItem(key,JSON.stringify(cached.filter(p=>!ids.has(p.id))));
        const editKey='aotsubaArchive.postEdits.v1';
        const edits=JSON.parse(localStorage.getItem(editKey)||'{}');
        ids.forEach(id=>delete edits[id]);
        localStorage.setItem(editKey,JSON.stringify(edits));
      }catch(err){ console.error('로컬 보조 저장 정리 실패',err); }
      reset();
      renderAll();
      renderSeriesPreviewPosts();
      toast(`${ids.size}개 포스트를 삭제했습니다.`);
    }catch(err){
      console.error('포스트 삭제 실패',err);
      toast('삭제하지 못했습니다. 로그인과 연결 상태를 확인한 뒤 다시 시도해 주세요.');
    }finally{
      saving=false;
      render();
    }
  });
  // Observe only lifecycle changes, never our own checkbox/control writes.
  new MutationObserver(render).observe(modal,{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(render).observe(document.querySelector('#previewContent'),{childList:true});
  new MutationObserver(render).observe(document.body,{attributes:true,attributeFilter:['class']});
  render();
})();
