/* 새 포스트 게시: 브라우저 로컬 저장 기반 */
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
    const ids=new Set(state.posts.map(post=>post.id));
    saved.forEach(post=>{
      if(!post?.id || ids.has(post.id)) return;
      state.posts.push(post);
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

    publishBtn.addEventListener("click",e=>{
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
        id:`post-local-${now.getTime()}`,
        title,
        excerpt:body.replace(/\s+/g," ").trim().slice(0,120),
        body,
        bodyHtml,
        date:now.toISOString(),
        seriesId,
        seriesOrder:nextSeriesOrder(seriesId),
        tags
      };

      const saved=readPublished();
      saved.push(post);
      if(!writePublished(saved)){
        toast("게시하지 못했습니다.");
        return;
      }

      state.posts.push(post);
      renderAll();
      clearEditorAfterPublish();
      closePostEditor();
      try{ localStorage.removeItem("aotsubaArchive.editorDraft.v1"); }catch(_e){}
      toast("게시했습니다!");
      setTimeout(()=>openPostPreview(post),100);
    },true);
  }

  /* 수정 모드가 끝나면 버튼 문구를 게시!로 복구 */
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
