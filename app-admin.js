/* 관리자 로그인 + Cloudflare Worker 영구 저장 */
(() => {
  const API_BASE="https://aotsuba-archive-admin.hannzizon.workers.dev";
  const SESSION_KEY="aotsubaArchive.adminSession.v1";
  let token="";
  const REMOTE_TIMEOUT_MS=6000;
  let remoteLoadPromise=null;
  let writeRevision=0;

  function setAdminState(isAdmin){
    document.body.classList.toggle("is-admin",!!isAdmin);
    document.dispatchEvent(new CustomEvent("archive-admin-change"));
    const btn=document.querySelector("#adminSessionBtn");
    if(btn) btn.textContent=isAdmin?"로그아웃":"관리자";
  }

  function getToken(){
    if(token) return token;
    try{ token=sessionStorage.getItem(SESSION_KEY)||""; }catch(_e){}
    return token;
  }

  function setToken(value){
    token=value||"";
    try{
      if(token) sessionStorage.setItem(SESSION_KEY,token);
      else sessionStorage.removeItem(SESSION_KEY);
    }catch(_e){}
    setAdminState(!!token);
  }

  async function api(path,{method="GET",body,auth=false,timeoutMs=15000}={}){
    const headers={};
    if(body!==undefined) headers["Content-Type"]="application/json";
    if(auth){
      const current=getToken();
      if(!current) throw new Error("login_required");
      headers.Authorization=`Bearer ${current}`;
    }
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
    const res=await fetch(`${API_BASE}${path}`,{
      method,
      headers,
      body:body===undefined?undefined:JSON.stringify(body),
      signal:controller.signal
    });
    const data=await res.json().catch(()=>({}));
    if(res.status===401){
      setToken("");
      throw new Error(data.error||"unauthorized");
    }
    if(!res.ok || data.ok===false) throw new Error(data.error||`http_${res.status}`);
    return data;
    }finally{
      clearTimeout(timer);
    }
  }

  window.archiveIsAdmin=()=>!!getToken();
  window.archiveSavePosts=async function(rows=state.posts){
    writeRevision++;
    await api("/data/posts",{method:"PUT",body:rows,auth:true});
    return true;
  };

  window.archiveSaveSeries=async function(rows=state.series){
    writeRevision++;
    await api("/data/series",{method:"PUT",body:rows,auth:true});
    return true;
  };

  function loadRemoteData(){
    if(remoteLoadPromise) return remoteLoadPromise;
    remoteLoadPromise=syncRemoteData();
    return remoteLoadPromise;
  }

  async function syncRemoteData(){
    const baseline=JSON.stringify([state.posts,state.series]);
    const revision=writeRevision;
    try{
      const [posts,series]=await Promise.all([
        api("/data/posts",{timeoutMs:REMOTE_TIMEOUT_MS}),
        api("/data/series",{timeoutMs:REMOTE_TIMEOUT_MS})
      ]);
      const validRows=rows=>Array.isArray(rows) && rows.every(row=>
        row && typeof row.id==="string" && typeof row.title==="string");
      if(!validRows(posts.data) || !validRows(series.data)) throw new Error("invalid_archive_data");
      // A late response must never overwrite edits or an in-flight save.
      if(revision!==writeRevision || baseline!==JSON.stringify([state.posts,state.series]) ||
        document.querySelector("#postEditor.open,#seriesManager.open")) return;
      if(JSON.stringify([posts.data,series.data])===baseline) return;
      state.posts=posts.data.map(normalizePost);
      state.series=series.data.map(normalizeSeries);
      renderAll();
      if(typeof renderSeriesPreviewPosts==="function") renderSeriesPreviewPosts();
    }catch(err){
      console.error("원격 아카이브 데이터 불러오기 실패",err);
      toast("GitHub 데이터 연결에 실패해 현재 저장본을 표시합니다.");
    }
  }

  const headerActions=document.querySelector(".header-actions");
  if(headerActions && !document.querySelector("#adminSessionBtn")){
    const btn=document.createElement("button");
    btn.type="button";
    btn.id="adminSessionBtn";
    btn.className="admin-session-btn";
    btn.textContent="관리자";
    headerActions.prepend(btn);
  }

  const modal=document.createElement("div");
  modal.className="admin-login-modal";
  modal.id="adminLoginModal";
  modal.hidden=true;
  modal.innerHTML=`
    <div class="admin-login-backdrop" data-admin-close></div>
    <div class="admin-login-card" role="dialog" aria-modal="true" aria-labelledby="adminLoginTitle">
      <h2 class="admin-login-title" id="adminLoginTitle">관리자 로그인</h2>
      <p class="admin-login-desc">게시·수정·시리즈 관리는 관리자 로그인 후에만 사용할 수 있습니다.</p>
      <input class="admin-login-input" id="adminPasswordInput" type="password" autocomplete="current-password" placeholder="관리자 비밀번호" aria-label="관리자 비밀번호">
      <div class="admin-login-actions">
        <button type="button" class="ghost-btn" data-admin-close>취소</button>
        <button type="button" class="primary-btn" id="adminLoginSubmit">로그인</button>
      </div>
    </div>
  `;
  document.body.append(modal);

  function openLogin(){
    modal.hidden=false;
    document.body.style.overflow="hidden";
    setTimeout(()=>document.querySelector("#adminPasswordInput")?.focus(),30);
  }
  function closeLogin(){
    modal.hidden=true;
    document.querySelector("#adminPasswordInput").value="";
    if(!document.querySelector("#postEditor.open") && !document.querySelector("#seriesManager.open") && document.querySelector("#previewModal")?.hidden!==false){
      document.body.style.overflow="";
    }
  }

  document.querySelector("#adminSessionBtn")?.addEventListener("click",e=>{
    if(typeof pulsePress==="function") pulsePress(e.currentTarget);
    if(getToken()){
      setToken("");
      toast("관리자 로그아웃했습니다.");
      return;
    }
    openLogin();
  });

  modal.addEventListener("click",e=>{
    if(e.target.closest("[data-admin-close]")) closeLogin();
  });

  async function submitLogin(){
    if(document.querySelector("#adminLoginSubmit")?.disabled) return;
    const input=document.querySelector("#adminPasswordInput");
    const password=input?.value||"";
    if(!password){
      toast("관리자 비밀번호를 입력해 주세요.");
      input?.focus();
      return;
    }
    const submit=document.querySelector("#adminLoginSubmit");
    submit.disabled=true;
    try{
      const result=await api("/login",{method:"POST",body:{password}});
      setToken(result.token||"");
      closeLogin();
      toast("관리자 로그인했습니다.");
    }catch(err){
      console.error(err);
      toast(err.name==="AbortError" ? "연결 시간이 초과되었습니다. 다시 시도해 주세요." : "로그인에 실패했습니다. 비밀번호와 연결 상태를 확인해 주세요.");
      input?.select();
    }finally{
      submit.disabled=false;
    }
  }

  document.querySelector("#adminLoginSubmit")?.addEventListener("click",submitLogin);
  document.querySelector("#adminPasswordInput")?.addEventListener("keydown",e=>{
    if(e.key==="Enter") submitLogin();
  });

  /* 관리 기능을 직접 호출하려 해도 로그인 전에는 차단 */
  document.addEventListener("click",e=>{
    const target=e.target.closest("#seriesManageBtn,#writeBtn,.post-edit-btn,#previewTopEditBtn");
    if(!target || getToken()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openLogin();
  },true);

  document.querySelector("#archiveEditorTrigger")?.addEventListener("click",e=>{
    if(getToken()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  },true);

  /* 기존 포스트의 '수정 저장'은 기존 화면 로직이 끝난 뒤 GitHub에도 저장 */
  document.addEventListener("click",e=>{
    if(!getToken()) return;
    const submit=e.target.closest("#editorPublishBtn");
    if(!submit || submit.textContent.trim()!=="수정 저장") return;
    setTimeout(()=>window.archiveSavePosts(state.posts).then(()=>{
      toast("수정 내용을 GitHub에 저장했습니다.");
    }).catch(err=>{
      console.error(err);
      toast("수정 내용을 GitHub에 저장하지 못했습니다.");
    }),160);
  },true);

  /* 시리즈 설정/순서 변경이 끝난 직후 GitHub에도 저장 */
  document.addEventListener("click",e=>{
    if(!getToken()) return;
    
    const postOrderChanged=e.target.closest(".series-post-move-btn");
    if(postOrderChanged){
      setTimeout(()=>window.archiveSavePosts(state.posts).catch(err=>{
        console.error(err);
        toast("포스트 순서를 GitHub에 저장하지 못했습니다.");
      }),120);
    }
  });

  setAdminState(!!getToken());
  // Initialize local UI first; never wait for images or the window load event.
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",()=>setTimeout(loadRemoteData,0),{once:true});
  }else{
    setTimeout(loadRemoteData,0);
  }
})();
