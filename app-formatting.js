/* 포스트 작성실: 문단별 리치 텍스트 정렬 + 구분선 */
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
        blocks.push('<hr class="post-divider">');
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
      rich.focus();
      try{
        document.execCommand("insertHorizontalRule",false,null);
      }catch(_e){
        const sel=window.getSelection();
        if(sel?.rangeCount){
          const hr=document.createElement("hr");
          hr.className="post-divider";
          const range=sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(hr);
        }
      }
      rich.querySelectorAll("hr").forEach(hr=>hr.classList.add("post-divider"));
      syncPlain();
      if(typeof toast==="function") toast("구분선을 넣었습니다.");
    }
  });

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
