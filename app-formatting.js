/* 포스트 작성실: 문단별 리치 텍스트 정렬 + 구분선 + 초기화 */
(() => {
  const textarea = document.querySelector("#editorBody");
  const row = document.querySelector(".editor-format-row");
  if(!textarea || !row) return;

  function escapeText(value=""){
    return String(value)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;");
  }

  function plainTextToHtml(text=""){
    const lines=String(text).replace(/\r/g,"").split("\n");
    const blocks=[];
    let buf=[];
    const flush=()=>{
      if(!buf.length) return;
      blocks.push(`<p>${buf.map(line=>escapeText(line)||"<br>").join("<br>")}</p>`);
      buf=[];
    };
    lines.forEach(line=>{
      if(/^\s*---\s*$/.test(line)){
        flush();
        blocks.push('<hr class="post-divider divider-soft-full">');
      }else if(line.trim()===""){
        flush();
      }else{
        buf.push(line);
      }
    });
    flush();
    return blocks.join("") || "<p><br></p>";
  }

  function richHtmlToPlainText(html){
    const box=document.createElement("div");
    box.innerHTML=html||"";
    box.querySelectorAll("hr").forEach(hr=>hr.replaceWith(document.createTextNode("\n---\n")));
    box.querySelectorAll("p,div").forEach(el=>{
      if(el.nextSibling) el.append(document.createTextNode("\n\n"));
    });
    return (box.innerText||box.textContent||"")
      .replace(/\n{3,}/g,"\n\n")
      .trimEnd();
  }

  const rich=document.createElement("div");
  rich.id="editorRichBody";
  rich.className="editor-body editor-rich-body";
  rich.contentEditable="true";
  rich.setAttribute("role","textbox");
  rich.setAttribute("aria-multiline","true");
  rich.dataset.placeholder="이야기를 시작하세요.";
  rich.innerHTML=plainTextToHtml(textarea.value||"");
  textarea.hidden=true;
  textarea.insertAdjacentElement("afterend",rich);

  function syncPlain(){
    textarea.value=richHtmlToPlainText(rich.innerHTML);
    textarea.dispatchEvent(new Event("input",{bubbles:true}));
  }
  function applyTypography(){
    const family=document.querySelector("#editorFontFamily")?.value;
    const size=document.querySelector("#editorFontSize")?.value;
    if(family) rich.style.fontFamily=family;
    if(size) rich.style.fontSize=`${size}pt`;
  }
  applyTypography();

  window.archivePlainTextToHtml=plainTextToHtml;
  window.getArchiveEditorHtml=()=>rich.innerHTML;
  window.setArchiveEditorHtml=(html)=>{
    rich.innerHTML=html && String(html).trim() ? html : plainTextToHtml(textarea.value||"");
    syncPlain();
    applyTypography();
  };

  rich.addEventListener("input",syncPlain);
  rich.addEventListener("paste",e=>{
    e.preventDefault();
    const text=e.clipboardData?.getData("text/plain")||"";
    document.execCommand("insertText",false,text);
  });

  document.querySelector("#editorFontFamily")?.addEventListener("change",applyTypography);
  document.querySelector("#editorFontSize")?.addEventListener("change",applyTypography);

  const oldGroup=row.querySelector(".editor-align-group");
  const oldDivider=row.querySelector(":scope > .editor-format-divider");
  oldGroup?.remove();
  oldDivider?.remove();

  const divider=document.createElement("span");
  divider.className="editor-format-divider";
  divider.setAttribute("aria-hidden","true");

  const group=document.createElement("div");
  group.className="editor-align-group";
  group.innerHTML=`
    <button type="button" class="editor-format-btn" data-command="justifyLeft">좌측</button>
    <button type="button" class="editor-format-btn" data-command="justifyCenter">가운데</button>
    <button type="button" class="editor-format-btn" data-command="justifyFull">양쪽</button>
    <button type="button" class="editor-format-btn" data-command="justifyRight">우측</button>
    <span class="editor-format-divider" aria-hidden="true"></span>
    <select id="editorDividerStyle" class="editor-divider-style" aria-label="구분선 종류">
      <option value="soft-full">연한 전체선</option>
      <option value="solid">기본선</option>
      <option value="dashed">점선</option>
      <option value="short">짧은 중앙선</option>
    </select>
    <button type="button" class="editor-format-btn" id="editorInsertDivider">구분선</button>
  `;
  row.append(divider,group);

  group.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("mousedown",e=>e.preventDefault());
  });

  function selectionInsideEditor(){
    const sel=window.getSelection();
    if(!sel || !sel.rangeCount) return false;
    return rich.contains(sel.anchorNode);
  }

  function updateActiveButtons(){
    if(!selectionInsideEditor()) return;
    const map={justifyLeft:"justifyLeft",justifyCenter:"justifyCenter",justifyFull:"justifyFull",justifyRight:"justifyRight"};
    group.querySelectorAll("[data-command]").forEach(btn=>{
      let active=false;
      try{ active=document.queryCommandState(map[btn.dataset.command]); }catch(_e){}
      btn.classList.toggle("active",active);
    });
  }

  document.addEventListener("selectionchange",updateActiveButtons);

  function insertStyledDivider(style){
    rich.focus();
    const sel=window.getSelection();
    if(!sel?.rangeCount) return;
    const range=sel.getRangeAt(0);
    if(!rich.contains(range.commonAncestorContainer)) return;

    const hr=document.createElement("hr");
    hr.className=`post-divider divider-${style}`;
    range.deleteContents();
    range.insertNode(hr);

    const p=document.createElement("p");
    p.innerHTML="<br>";
    hr.after(p);
    const nextRange=document.createRange();
    nextRange.selectNodeContents(p);
    nextRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nextRange);
    syncPlain();
  }

  group.addEventListener("click",e=>{
    const commandBtn=e.target.closest("[data-command]");
    if(commandBtn){
      rich.focus();
      try{ document.execCommand(commandBtn.dataset.command,false,null); }catch(_e){}
      syncPlain();
      updateActiveButtons();
      return;
    }

    if(e.target.closest("#editorInsertDivider")){
      const style=document.querySelector("#editorDividerStyle")?.value || "soft-full";
      insertStyledDivider(style);
      if(typeof toast==="function") toast("구분선을 넣었습니다.");
    }
  });

  /* 임시저장 - 불러오기 - 초기화 순서로 버튼 추가 */
  const loadBtn=document.querySelector("#editorTempLoadBtn");
  if(loadBtn && !document.querySelector("#editorResetBtn")){
    const resetBtn=document.createElement("button");
    resetBtn.type="button";
    resetBtn.className="ghost-btn";
    resetBtn.id="editorResetBtn";
    resetBtn.textContent="초기화";
    loadBtn.insertAdjacentElement("afterend",resetBtn);

    const release=()=>setTimeout(()=>resetBtn.classList.remove("press-active"),80);
    resetBtn.addEventListener("pointerdown",()=>resetBtn.classList.add("press-active"));
    ["pointerup","pointercancel","pointerleave"].forEach(type=>resetBtn.addEventListener(type,release));

    resetBtn.addEventListener("click",()=>{
      if(typeof pulsePress==="function") pulsePress(resetBtn);
      const hasContent=!!(
        document.querySelector("#editorTitle")?.value.trim() ||
        document.querySelector("#editorTags")?.value.trim() ||
        textarea.value.trim() ||
        rich.innerText.trim()
      );
      if(hasContent && !window.confirm("작성 중인 내용을 모두 초기화할까요?")) return;

      const title=document.querySelector("#editorTitle");
      const series=document.querySelector("#editorSeries");
      const tags=document.querySelector("#editorTags");
      if(title) title.value="";
      if(series) series.value="";
      if(tags) tags.value="";
      textarea.value="";
      rich.innerHTML="<p><br></p>";
      syncPlain();
      try{ localStorage.removeItem("aotsubaArchive.editorDraft.v1"); }catch(_e){}
      if(typeof saveEditorDraft==="function") saveEditorDraft();
      if(typeof toast==="function") toast("작성 내용을 초기화했습니다.");
      title?.focus();
    });
  }

  const editor=document.querySelector("#postEditor");
  const observer=new MutationObserver(()=>{
    if(!editor?.classList.contains("open")) return;
    setTimeout(()=>{
      if(window.__archiveRichSkipNextSync){
        window.__archiveRichSkipNextSync=false;
        return;
      }
      rich.innerHTML=plainTextToHtml(textarea.value||"");
      applyTypography();
    },0);
  });
  if(editor) observer.observe(editor,{attributes:true,attributeFilter:["class"]});

  window.renderArchivePostBody=(post)=>{
    if(post?.bodyHtml) return post.bodyHtml;
    return plainTextToHtml(post?.body||"");
  };
})();
