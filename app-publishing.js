/* 새 포스트 게시: GitHub 영구 저장 + 로컬 보조 저장 */
(() => {
  const PUBLISHED_KEY = "aotsubaArchive.publishedPosts.v1";
  const POST_EDIT_KEY = "aotsubaArchive.postEdits.v1";

  function readPublished(){
    try{
      const raw=localStorage.getItem(PUBLISHED_KEY);
      const rows=raw ? JSON.parse(raw) : [];
      return Array.isArray(rows) ? rows : [];
    }catch(err){
      console.error("게시 포스트 불러오기 실패",err);
      return [];
    }
  }

  function readPostEdits(){
    try{
      const raw=localStorage.getItem(POST_EDIT_KEY);
      const edits=raw ? JSON.parse(raw) : {};
      return edits && typeof edits==="object" ? edits : {};
    }catch(_e){
      return {};
    }
  }

  function writePublished(rows){
    try{
      localStorage.setItem(PUBLISHED_KEY,JSON.stringify(rows));
      return true;
    }catch(err){
      console.error("게시 포스트 저장 실패",err);
      return false;
    }
  }

  function loadPublished(){
    const saved=readPublished();
    if(!saved.length) return;
    const edits=readPostEdits();
    const ids=new Set(state.posts.map(post=>post.id));
    saved.forEach(post=>{
      if(!post?.id || ids.has(post.id)) return;
      state.posts.push(normalizePost(edits[post.id] ? {...post,...edits[post.id]} : post));
      ids.add(post.id);
    });
    renderAll();
  }

  function nextSeriesOrder(seriesId){
    if(!seriesId) return null;
    const orders=state.posts
      .filter(post=>post.seriesId===seriesId && Number.isFinite(post.seriesOrder))
      .map(post=>post.seriesOrder);
    return orders.length ? Math.max(...orders)+1 : 1;
  }

  function clearEditorAfterPublish(){
    const title=document.querySelector("#editorTitle");
    const series=document.querySelector("#editorSeries");
    const tags=document.querySelector("#editorTags");
    const body=document.querySelector("#editorBody");
    if(title) title.value="";
    if(series) series.value="";
    if(tags) tags.value="";
    if(body) body.value="";
    window.setArchiveEditorHtml?.("<p><br></p>");
    try{ localStorage.removeItem("aotsubaArchive.editorDraft.v1"); }catch(_e){}
  }

  const publishBtn=document.querySelector("#editorPublishBtn");
  if(publishBtn){
    publishBtn.textContent="게시!";

    publishBtn.addEventListener("click",async e=>{
      if(publishBtn.textContent.trim()==="수정 저장") return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const title=(document.querySelector("#editorTitle")?.value||"").trim();
      const seriesId=document.querySelector("#editorSeries")?.value||"";
      const body=(document.querySelector("#editorBody")?.value||"").trimEnd();
      const bodyHtml=window.getArchiveEditorHtml?.()||"";
      const tags=(document.querySelector("#editorTags")?.value||"")
        .split(",")
        .map(v=>v.trim())
        .filter(Boolean);

      if(!title){
        toast("제목을 입력해 주세요.");
        document.querySelector("#editorTitle")?.focus();
        return;
      }
      if(!body.trim()){
        toast("본문을 입력해 주세요.");
        document.querySelector("#editorRichBody")?.focus();
        return;
      }

      const now=new Date();
      const post={
        id:`post-${now.getTime()}`,
        title,
        contentType:"text",
        excerpt:body.replace(/\s+/g," ").trim().slice(0,120),
        body,
        bodyHtml,
        date:now.toISOString(),
        seriesId,
        seriesOrder:nextSeriesOrder(seriesId),
        tags
      };

      const previousPosts=state.posts.slice();
      state.posts.push(post);
      renderAll();
      publishBtn.disabled=true;

      try{
        if(typeof window.archiveSavePosts!=="function") throw new Error("remote_save_unavailable");
        await window.archiveSavePosts(state.posts);

        const saved=readPublished();
        saved.push(post);
        writePublished(saved);

        clearEditorAfterPublish();
        closePostEditor();
        try{ localStorage.removeItem("aotsubaArchive.editorDraft.v1"); }catch(_e){}
        toast("게시했습니다!");
        setTimeout(()=>openPostPreview(post),100);
      }catch(err){
        console.error("GitHub 게시 실패",err);
        state.posts=previousPosts;
        renderAll();
        toast(err?.message==="login_required" ? "관리자 로그인이 필요합니다." : "GitHub에 게시하지 못했습니다.");
      }finally{
        publishBtn.disabled=false;
      }
    },true);
  }

  ["#writeBtn","#archiveEditorTrigger","#editorCloseBtn"].forEach(sel=>{
    document.querySelector(sel)?.addEventListener("click",()=>{
      setTimeout(()=>{
        const heading=document.querySelector(".post-editor-heading")?.textContent||"";
        if(heading.includes("작성실") && publishBtn) publishBtn.textContent="게시!";
      },0);
    });
  });

  loadPublished();
})();
