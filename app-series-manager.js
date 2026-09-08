/* 시리즈 생성 및 설정: 저장 성공 후 로컬 캐시 갱신 */
(() => {
  const STORAGE_KEY="aotsubaArchive.seriesEdits.v1";
  let reorderMode=false, busy=false;
  const isAdmin=()=>window.archiveIsAdmin?.()===true;
  const modal=document.createElement("section");
  modal.id="seriesManager";
  modal.className="series-manager";
  modal.setAttribute("aria-hidden","true");
  modal.innerHTML=`
    <div class="series-manager-shell">
      <div class="series-manager-top">
        <div class="series-manager-brand-block">
          <div class="series-manager-brand archive-home-link" role="button" tabindex="0" data-archive-home aria-label="아오츠바 아카이브 홈으로 이동">아오츠바 아카이브</div>
          <div class="series-manager-subtitle">시리즈 관리</div>
        </div>
        <button type="button" class="ghost-btn series-manager-close">닫기</button>
      </div>
      <div class="series-manager-toolbar">
        <button type="button" class="ghost-btn series-reorder-toggle">시리즈 순서 변경</button>
        <button type="button" class="primary-btn series-create-toggle">새 시리즈</button>
      </div>
      <div id="seriesCreateArea"></div>
      <div class="series-manager-list" id="seriesManagerList"></div>
    </div>`;
  document.body.append(modal);
  const sortedSeries=()=>state.series.slice().sort((a,b)=>(a.order??999)-(b.order??999));
  function fields(series={}){
    const row=normalizeSeries(series);
    return `
      <label><span>제목</span><input type="text" class="series-edit-title" required maxlength="200" value="${escapeHtml(row.title||"")}"></label>
      <label><span>한 줄 소개</span><input type="text" class="series-edit-desc" value="${escapeHtml(row.description||"")}"></label>
      <label><span>썸네일 주소</span><input type="text" class="series-edit-thumb-url" placeholder="이미지 URL 또는 파일 경로" value="${escapeHtml(row.thumbnail||"")}"></label>
      <label><span>썸네일 파일</span><input type="file" class="series-edit-thumb" accept="image/*"></label>
      <label><span>아카이브 유형</span><select class="series-edit-type">${Object.entries(ARCHIVE_TYPES).map(([key,label])=>`<option value="${key}" ${row.archiveType===key?"selected":""}>${label}</option>`).join("")}</select></label>
      <fieldset class="series-category-field"><legend>성격 태그 · 복수 선택</legend>
        <div class="series-category-options">${SERIES_CATEGORIES.map(tag=>`<label><input type="checkbox" value="${tag}" ${row.categories.includes(tag)?"checked":""}><span>${tag}</span></label>`).join("")}</div>
      </fieldset>
      <label><span>추가 태그</span><input type="text" class="series-edit-custom" placeholder="쉼표로 구분" value="${escapeHtml(row.categories.filter(t=>!SERIES_CATEGORIES.includes(t)).join(", "))}"></label>`;
  }
  function renderManager(){
    modal.querySelector(".series-manager-toolbar").hidden=!isAdmin();
    modal.querySelector("#seriesManagerList").innerHTML=sortedSeries().map((series,index,rows)=>`
      <article class="series-manager-item" data-series-id="${escapeHtml(series.id)}">
        <div class="series-manager-thumb">${series.thumbnail?`<img src="${escapeHtml(series.thumbnail)}" alt="">`:""}</div>
        <div class="series-manager-info"><strong>${escapeHtml(series.title)}</strong>
          <p>${escapeHtml(series.description||"")}</p>${seriesMetadata(series)}
          <span>${state.posts.filter(p=>p.seriesId===series.id).length}개의 포스트</span></div>
        ${!isAdmin()?"":reorderMode?`<div class="series-reorder-actions">
          <button type="button" class="series-move-btn" data-move="-1" aria-label="앞으로 이동" ${index===0?"disabled":""}>←</button>
          <button type="button" class="series-move-btn" data-move="1" aria-label="뒤로 이동" ${index===rows.length-1?"disabled":""}>→</button></div>`:
          `<button type="button" class="series-gear-btn" aria-label="${escapeHtml(series.title)} 설정">⚙</button>`}
        ${!isAdmin()?"":`<form class="series-edit-panel" hidden>${fields(series)}
          <div class="series-edit-actions"><button type="button" class="ghost-btn series-edit-cancel">취소</button>
          <button type="submit" class="primary-btn series-edit-save">저장</button></div></form>`}
      </article>`).join("")||'<div class="empty-state">아직 시리즈가 없습니다.</div>';
  }
  function refresh(){
    renderAll();
    if(document.querySelector("#seriesPreviewPostList")) renderSeriesPreviewPosts();
  }
  function cache(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(Object.fromEntries(state.series.map(s=>[s.id,s]))));}
    catch(err){console.error("시리즈 보조 저장 실패",err);}
  }
  async function persist(rows,message){
    if(!isAdmin()||busy) return false;
    busy=true;
    const previous=state.series;
    state.series=rows.map(normalizeSeries);
    refresh();
    modal.setAttribute("aria-busy","true");
    modal.querySelectorAll("button,input,select").forEach(el=>{el.dataset.wasDisabled=String(el.disabled);el.disabled=true;});
    try{
      await window.archiveSaveSeries(state.series);
      cache();
      toast(message);
      return true;
    }catch(err){
      state.series=previous;
      refresh();
      toast("GitHub에 저장하지 못했습니다. 입력 내용을 확인하고 다시 저장해 주세요.");
      console.error(err);
      return false;
    }finally{
      busy=false;
      modal.removeAttribute("aria-busy");
      modal.querySelectorAll("button,input,select").forEach(el=>{el.disabled=el.dataset.wasDisabled==="true";});
    }
  }
  function closeManager(){
    if(busy) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden","true");
    modal.querySelector("#seriesCreateArea").innerHTML="";
    document.body.style.overflow="";
    document.querySelector("#seriesManageBtn")?.focus();
  }
  document.querySelector("#seriesManageBtn")?.addEventListener("click",e=>{
    e.preventDefault();e.stopImmediatePropagation();
    if(!isAdmin()) return;
    pulsePress(e.currentTarget);
    reorderMode=false;
    modal.querySelector(".series-reorder-toggle").textContent="시리즈 순서 변경";
    renderManager();
    modal.classList.add("open");modal.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";
  },true);
  modal.addEventListener("click",async e=>{
    const btn=e.target.closest("button");
    if(!btn||busy) return;
    pulsePress(btn);
    if(btn.matches(".series-manager-close")) return closeManager();
    if(!isAdmin()) return;
    if(btn.matches(".series-create-toggle")){
      const area=modal.querySelector("#seriesCreateArea");
      if(!area.firstElementChild) area.innerHTML=`<form class="series-create-form series-edit-panel open"><h2>새 시리즈</h2>${fields()}
        <div class="series-edit-actions"><button type="button" class="ghost-btn series-create-cancel">취소</button>
        <button type="submit" class="primary-btn series-create-save">생성</button></div></form>`;
      area.querySelector(".series-edit-title").focus();
      return;
    }
    if(btn.matches(".series-create-cancel")){modal.querySelector("#seriesCreateArea").innerHTML="";return;}
    if(btn.matches(".series-reorder-toggle")){
      reorderMode=!reorderMode;
      btn.textContent=reorderMode?"순서 변경 완료":"시리즈 순서 변경";
      renderManager();return;
    }
    const item=btn.closest(".series-manager-item");
    if(!item) return;
    const panel=item.querySelector(".series-edit-panel");
    if(btn.matches(".series-gear-btn")){panel.hidden=!panel.hidden;panel.classList.toggle("open",!panel.hidden);return;}
    if(btn.matches(".series-edit-cancel")){panel.reset();panel.hidden=true;panel.classList.remove("open");return;}
    if(btn.matches(".series-move-btn")){
      const rows=sortedSeries(),index=rows.findIndex(s=>s.id===item.dataset.seriesId),target=index+Number(btn.dataset.move);
      if(target<0||target>=rows.length) return;
      [rows[index],rows[target]]=[rows[target],rows[index]];
      if(await persist(rows.map((s,i)=>({...s,order:i+1})),"시리즈 순서를 저장했습니다.")) renderManager();
    }
  });
  function readThumbnail(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||""));
      reader.onerror=()=>reject(new Error("thumbnail_read_failed"));
      reader.readAsDataURL(file);
    });
  }
  let reading=false;
  modal.addEventListener("submit",async e=>{
    const form=e.target.closest("form");
    if(!form) return;
    e.preventDefault();
    if(!isAdmin()||busy||reading) return;
    const title=form.querySelector(".series-edit-title").value.trim();
    if(!title){toast("제목을 입력해 주세요.");form.querySelector(".series-edit-title").focus();return;}
    const create=form.matches(".series-create-form");
    const current=create?null:state.series.find(s=>s.id===form.closest(".series-manager-item").dataset.seriesId);
    if(!create&&!current) return;
    const fieldsValue={
      title,description:form.querySelector(".series-edit-desc").value.trim(),
      archiveType:form.querySelector(".series-edit-type").value,
      categories:[...form.querySelectorAll(".series-category-options input:checked")].map(el=>el.value)
        .concat(form.querySelector(".series-edit-custom").value.split(",")),
      thumbnail:form.querySelector(".series-edit-thumb-url").value.trim()
    };
    const file=form.querySelector(".series-edit-thumb").files?.[0];
    try{
      reading=true;
      if(file){
        if(!file.type.startsWith("image/")||file.size>2*1024*1024){toast("2MB 이하의 이미지 파일을 선택해 주세요.");return;}
        fieldsValue.thumbnail=await readThumbnail(file);
      }
      if(!isAdmin()||!form.isConnected) return;
      let id=current?.id;
      if(create){do{id="series-"+crypto.randomUUID();}while(state.series.some(s=>s.id===id));}
      const row=normalizeSeries({...current,...fieldsValue,id,
        order:create?Math.max(0,...state.series.map(s=>Number.isFinite(s.order)?s.order:999))+1:current.order});
      const rows=create?[...state.series,row]:state.series.map(s=>s.id===id?row:s);
      if(await persist(rows,create?"새 시리즈를 GitHub에 저장했습니다.":"시리즈 설정을 GitHub에 저장했습니다.")){
        if(create) modal.querySelector("#seriesCreateArea").innerHTML="";
        renderManager();
      }
    }catch(err){console.error(err);toast("썸네일을 읽지 못했습니다. 다시 선택해 주세요.");}
    finally{reading=false;}
  });
  document.addEventListener("archive-admin-change",()=>{
    if(!isAdmin()){
      modal.querySelector("#seriesCreateArea").innerHTML="";
      renderManager();
      if(!busy) closeManager();
    }
  });
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&modal.classList.contains("open")) closeManager();});
  try{
    const edits=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
    state.series=state.series.map(s=>normalizeSeries({...s,...edits[s.id]}));
  }catch(err){console.error(err);}
})();
/* 포스트 열람 상단 수정/닫기 정렬 */
(() => {
  function removeTopEditButton(){
    document.querySelector("#previewTopEditBtn")?.remove();
    document.querySelector(".preview-top-actions")?.classList.remove("has-edit");
  }

  function ensureTopActions(){
    const top=document.querySelector(".preview-top");
    const close=document.querySelector(".preview-close[data-close-preview]");
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
      actions.insertBefore(edit,actions.querySelector(".preview-close[data-close-preview]"));
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

  ensureTopActions();
})();
