/* 시리즈 관리 화면 */
(() => {
  const STORAGE_KEY="aotsubaArchive.seriesEdits.v1";

  function saveSeriesEdits(){
    try{
      const edits={};
      state.series.forEach(series=>{
        edits[series.id]={
          title:series.title,
          description:series.description,
          thumbnail:series.thumbnail,
          order:series.order
        };
      });
      localStorage.setItem(STORAGE_KEY,JSON.stringify(edits));
    }catch(err){
      console.error("시리즈 설정 저장 실패",err);
    }
  }

  function loadSeriesEdits(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw) return;
      const edits=JSON.parse(raw);
      if(!edits || typeof edits!=="object") return;
      state.series=state.series.map(series=>edits[series.id]?{...series,...edits[series.id]}:series);
      renderSeries();
      populateEditorSeries();
    }catch(err){
      console.error("시리즈 설정 불러오기 실패",err);
    }
  }

  const modal=document.createElement("section");
  modal.id="seriesManager";
  modal.className="series-manager";
  modal.setAttribute("aria-hidden","true");
  modal.innerHTML=`
    <div class="series-manager-shell">
      <div class="series-manager-top">
        <strong>시리즈 관리</strong>
        <button type="button" class="ghost-btn series-manager-close">닫기</button>
      </div>
      <div class="series-manager-list" id="seriesManagerList"></div>
    </div>
  `;
  document.body.append(modal);

  function pressFx(btn){
    if(!btn) return;
    btn.classList.remove("press-active");
    void btn.offsetWidth;
    btn.classList.add("press-active");
    setTimeout(()=>btn.classList.remove("press-active"),170);
  }

  function renderManager(){
    const list=modal.querySelector("#seriesManagerList");
    list.innerHTML=state.series
      .slice()
      .sort((a,b)=>(a.order??999)-(b.order??999))
      .map(series=>{
        const count=state.posts.filter(p=>p.seriesId===series.id).length;
        return `
          <article class="series-manager-item" data-series-id="${escapeHtml(series.id)}">
            <div class="series-manager-thumb">
              ${series.thumbnail?`<img src="${escapeHtml(series.thumbnail)}" alt="">`:""}
            </div>
            <div class="series-manager-info">
              <strong>${escapeHtml(series.title)}</strong>
              <p>${escapeHtml(series.description||"")}</p>
              <span>${count}개의 포스트</span>
            </div>
            <button type="button" class="series-gear-btn" aria-label="${escapeHtml(series.title)} 설정">⚙</button>
            <div class="series-edit-panel" hidden>
              <label>
                <span>제목</span>
                <input type="text" class="series-edit-title" value="${escapeHtml(series.title)}">
              </label>
              <label>
                <span>한 줄 소개</span>
                <input type="text" class="series-edit-desc" value="${escapeHtml(series.description||"")}">
              </label>
              <label class="series-thumb-field">
                <span>썸네일</span>
                <input type="file" class="series-edit-thumb" accept="image/*">
              </label>
              <div class="series-edit-actions">
                <button type="button" class="ghost-btn series-edit-cancel">취소</button>
                <button type="button" class="primary-btn series-edit-save">저장</button>
              </div>
            </div>
          </article>
        `;
      }).join("") || `<div class="empty-state">아직 시리즈가 없습니다.</div>`;
  }

  function openManager(){
    renderManager();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";
  }
  function closeManager(){
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden","true");
    document.body.style.overflow="";
  }

  const manageBtn=document.querySelector("#seriesManageBtn");
  manageBtn?.addEventListener("click",e=>{
    e.preventDefault();
    e.stopImmediatePropagation();
    pressFx(manageBtn);
    setTimeout(openManager,80);
  },true);
  modal.querySelector(".series-manager-close")?.addEventListener("click",e=>{
    pressFx(e.currentTarget);
    setTimeout(closeManager,80);
  });

  modal.addEventListener("click",e=>{
    const item=e.target.closest(".series-manager-item");
    if(!item) return;

    const gear=e.target.closest(".series-gear-btn");
    if(gear){
      pressFx(gear);
      const panel=item.querySelector(".series-edit-panel");
      panel.hidden=!panel.hidden;
      if(!panel.hidden){
        requestAnimationFrame(()=>panel.classList.add("open"));
      }else{
        panel.classList.remove("open");
      }
      return;
    }

    const cancel=e.target.closest(".series-edit-cancel");
    if(cancel){
      pressFx(cancel);
      const panel=item.querySelector(".series-edit-panel");
      panel.classList.remove("open");
      setTimeout(()=>panel.hidden=true,150);
      return;
    }

    const save=e.target.closest(".series-edit-save");
    if(save){
      pressFx(save);
      const series=state.series.find(s=>s.id===item.dataset.seriesId);
      if(!series) return;
      series.title=item.querySelector(".series-edit-title").value.trim()||series.title;
      series.description=item.querySelector(".series-edit-desc").value.trim();
      saveSeriesEdits();
      renderSeries();
      populateEditorSeries();
      renderManager();
      if(typeof toast==="function") toast("시리즈를 수정했습니다.");
      return;
    }
  });

  modal.addEventListener("change",e=>{
    const input=e.target.closest(".series-edit-thumb");
    if(!input || !input.files?.[0]) return;
    const item=input.closest(".series-manager-item");
    const series=state.series.find(s=>s.id===item?.dataset.seriesId);
    if(!series) return;
    const reader=new FileReader();
    reader.onload=()=>{
      series.thumbnail=String(reader.result||"");
      const box=item.querySelector(".series-manager-thumb");
      box.innerHTML=`<img src="${escapeHtml(series.thumbnail)}" alt="">`;
    };
    reader.readAsDataURL(input.files[0]);
  });

  document.addEventListener("keydown",e=>{
    if(e.key==="Escape" && modal.classList.contains("open")) closeManager();
  });

  window.addEventListener("load",()=>setTimeout(loadSeriesEdits,0));
})();

/* 포스트 열람 상단 수정/닫기 정렬 */
(() => {
  function removeTopEditButton(){
    document.querySelector("#previewTopEditBtn")?.remove();
    document.querySelector(".preview-top-actions")?.classList.remove("has-edit");
  }

  function ensureTopActions(){
    const top=document.querySelector(".preview-top");
    const close=document.querySelector(".preview-close");
    if(!top || !close) return null;
    let actions=top.querySelector(".preview-top-actions");
    if(!actions){
      actions=document.createElement("div");
      actions.className="preview-top-actions";
      top.append(actions);
      actions.append(close);
    }else if(close.parentElement!==actions){
      actions.append(close);
    }
    return actions;
  }

  const baseOpenPostPreview=window.openPostPreview;
  if(typeof baseOpenPostPreview==="function"){
    window.openPostPreview=function(post){
      baseOpenPostPreview(post);
      document.querySelector(".post-preview-actions")?.remove();
      removeTopEditButton();
      const actions=ensureTopActions();
      if(!actions) return;

      const edit=document.createElement("button");
      edit.type="button";
      edit.id="previewTopEditBtn";
      edit.className="post-edit-btn";
      edit.textContent="수정";
      actions.insertBefore(edit,actions.querySelector(".preview-close"));
      actions.classList.add("has-edit");

      edit.addEventListener("click",()=>{
        const fallback=document.querySelector(".post-edit-btn:not(#previewTopEditBtn)");
        if(fallback){ fallback.click(); return; }
        const content=document.querySelector("#previewContent");
        const hiddenEdit=content?.querySelector(".post-edit-btn");
        hiddenEdit?.click();
      });
    };
  }

  const baseOpenSeriesPreview=window.openSeriesPreview;
  if(typeof baseOpenSeriesPreview==="function"){
    window.openSeriesPreview=function(series){
      removeTopEditButton();
      return baseOpenSeriesPreview(series);
    };
  }

  window.addEventListener("load",ensureTopActions);
})();
