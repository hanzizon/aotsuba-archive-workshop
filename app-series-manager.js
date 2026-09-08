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
        <div class="series-manager-brand-block">
          <div class="series-manager-brand">아오츠바 아카이브</div>
          <div class="series-manager-subtitle">시리즈 관리</div>
        </div>
        <button type="button" class="ghost-btn series-manager-close">닫기</button>
      </div>
      <div class="series-manager-toolbar">
        <button type="button" class="ghost-btn series-reorder-toggle">시리즈 순서 변경</button>
      </div>
      <div class="series-manager-list" id="seriesManagerList"></div>
    </div>
  `;
  document.body.append(modal);

  let reorderMode=false;

  function pressFx(btn){
    if(!btn) return;
    btn.classList.remove("press-active");
    void btn.offsetWidth;
    btn.classList.add("press-active");
    setTimeout(()=>btn.classList.remove("press-active"),170);
  }

  function sortedSeries(){
    return state.series.slice().sort((a,b)=>(a.order??999)-(b.order??999));
  }

  function renderManager(){
    const list=modal.querySelector("#seriesManagerList");
    const ordered=sortedSeries();
    list.innerHTML=ordered
      .map((series,index)=>{
        const count=state.posts.filter(p=>p.seriesId===series.id).length;
        return `
          <article class="series-manager-item${reorderMode?" reorder-mode":""}" data-series-id="${escapeHtml(series.id)}">
            <div class="series-manager-thumb">
              ${series.thumbnail?`<img src="${escapeHtml(series.thumbnail)}" alt="">`:""}
            </div>
            <div class="series-manager-info">
              <strong>${escapeHtml(series.title)}</strong>
              <p>${escapeHtml(series.description||"")}</p>
              <span>${count}개의 포스트</span>
            </div>
            ${reorderMode ? `
              <div class="series-reorder-actions">
                <button type="button" class="series-move-btn" data-move="left" aria-label="왼쪽으로 이동" ${index===0?"disabled":""}>←</button>
                <button type="button" class="series-move-btn" data-move="right" aria-label="오른쪽으로 이동" ${index===ordered.length-1?"disabled":""}>→</button>
              </div>
            ` : `<button type="button" class="series-gear-btn" aria-label="${escapeHtml(series.title)} 설정">⚙</button>`}
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

  function moveSeries(seriesId,direction){
    const ordered=sortedSeries();
    const index=ordered.findIndex(s=>s.id===seriesId);
    if(index<0) return;
    const target=direction==="left"?index-1:index+1;
    if(target<0 || target>=ordered.length) return;
    [ordered[index],ordered[target]]=[ordered[target],ordered[index]];
    ordered.forEach((series,i)=>{series.order=i+1;});
    saveSeriesEdits();
    renderSeries();
    populateEditorSeries();
    renderManager();
    toast("시리즈 순서를 변경했습니다.");
  }

  function openManager(){
    reorderMode=false;
    modal.querySelector(".series-reorder-toggle").textContent="시리즈 순서 변경";
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

  modal.querySelector(".series-reorder-toggle")?.addEventListener("click",e=>{
    pressFx(e.currentTarget);
    reorderMode=!reorderMode;
    e.currentTarget.textContent=reorderMode?"순서 변경 완료":"시리즈 순서 변경";
    renderManager();
  });

  modal.addEventListener("click",e=>{
    const item=e.target.closest(".series-manager-item");
    if(!item) return;

    const move=e.target.closest(".series-move-btn");
    if(move){
      pressFx(move);
      moveSeries(item.dataset.seriesId,move.dataset.move);
      return;
    }

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
      const legacyAction=document.querySelector(".post-preview-actions");
      const legacyEdit=legacyAction?.querySelector(".post-edit-btn") || null;
      legacyAction?.remove();
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
        if(typeof pulsePress==="function") pulsePress(edit);
        legacyEdit?.click();
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

/* 추가 기능 파일 로드 */
(() => {
  if(!document.querySelector('link[href="./styles-archive-features.css"]')){
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="./styles-archive-features.css";
    document.head.append(link);
  }
  ["./app-publishing.js","./app-series-order.js"].forEach(src=>{
    if(document.querySelector(`script[src="${src}"]`)) return;
    const script=document.createElement("script");
    script.src=src;
    script.defer=true;
    document.body.append(script);
  });
})();
