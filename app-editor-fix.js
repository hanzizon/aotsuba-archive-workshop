/* 포스트 수정실에서 원본 textarea/중복 리치 편집기가 함께 보이는 문제 방지 */
(() => {
  function normalizeEditorBody(){
    // Do not observe our own attribute writes: they otherwise queue forever.
    observer?.disconnect();
    try{
    const textarea=document.querySelector("#editorBody");
    if(textarea){
      textarea.hidden=true;
      textarea.setAttribute("aria-hidden","true");
      textarea.style.setProperty("display","none","important");
      textarea.style.setProperty("position","absolute","important");
      textarea.style.setProperty("width","1px","important");
      textarea.style.setProperty("height","1px","important");
      textarea.style.setProperty("min-height","0","important");
      textarea.style.setProperty("margin","0","important");
      textarea.style.setProperty("padding","0","important");
      textarea.style.setProperty("border","0","important");
      textarea.style.setProperty("overflow","hidden","important");
      textarea.style.setProperty("clip-path","inset(50%)","important");
    }

    const richEditors=[...document.querySelectorAll("#editorRichBody")];
    if(richEditors.length>1){
      richEditors.slice(1).forEach(el=>el.remove());
    }
    }finally{
      if(editor) observer?.observe(editor,{childList:true,subtree:true,attributes:true,attributeFilter:["class","hidden","style"]});
    }
  }

  const editor=document.querySelector("#postEditor");
  const observer=editor ? new MutationObserver(normalizeEditorBody) : null;
  normalizeEditorBody();

  document.querySelector("#writeBtn")?.addEventListener("click",()=>setTimeout(normalizeEditorBody,0));
  document.querySelector("#archiveEditorTrigger")?.addEventListener("click",()=>setTimeout(normalizeEditorBody,0));
  document.addEventListener("click",e=>{
    if(e.target.closest(".post-edit-btn,#previewTopEditBtn")){
      setTimeout(normalizeEditorBody,0);
      setTimeout(normalizeEditorBody,100);
    }
  },true);
})();
