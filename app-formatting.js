/* 포스트 작성실 정렬 + 구분선 도구 */
(() => {
  const FORMAT_KEY = "aotsubaArchive.editorFormat.v1";
  const row = document.querySelector(".editor-format-row");
  const body = document.querySelector("#editorBody");
  if(!row || !body) return;

  const divider = document.createElement("span");
  divider.className = "editor-format-divider";
  divider.setAttribute("aria-hidden", "true");

  const group = document.createElement("div");
  group.className = "editor-align-group";
  group.innerHTML = `
    <button type="button" class="editor-format-btn active" data-align="left">좌측</button>
    <button type="button" class="editor-format-btn" data-align="center">가운데</button>
    <button type="button" class="editor-format-btn" data-align="justify">양쪽</button>
    <button type="button" class="editor-format-btn" data-align="right">우측</button>
    <span class="editor-format-divider" aria-hidden="true"></span>
    <button type="button" class="editor-format-btn" id="editorInsertDivider">구분선</button>
  `;
  row.append(divider, group);

  let currentAlign = "left";

  function setActiveAlign(align){
    currentAlign = align || "left";
    body.style.textAlign = currentAlign;
    group.querySelectorAll("[data-align]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.align === currentAlign);
    });
    try{
      localStorage.setItem(FORMAT_KEY, JSON.stringify({textAlign:currentAlign}));
    }catch(_e){}
  }

  try{
    const saved = JSON.parse(localStorage.getItem(FORMAT_KEY) || "{}");
    if(["left","center","justify","right"].includes(saved.textAlign)){
      currentAlign = saved.textAlign;
    }
  }catch(_e){}
  setActiveAlign(currentAlign);

  group.addEventListener("click", e => {
    const alignBtn = e.target.closest("[data-align]");
    if(alignBtn){
      setActiveAlign(alignBtn.dataset.align);
      body.focus();
      return;
    }

    if(e.target.closest("#editorInsertDivider")){
      const start = body.selectionStart ?? body.value.length;
      const end = body.selectionEnd ?? start;
      const before = body.value.slice(0, start);
      const after = body.value.slice(end);
      const needsLeading = before && !before.endsWith("\n\n");
      const needsTrailing = after && !after.startsWith("\n\n");
      const insert = `${needsLeading ? "\n\n" : ""}---${needsTrailing ? "\n\n" : ""}`;
      body.value = before + insert + after;
      const caret = before.length + insert.length;
      body.focus();
      body.setSelectionRange(caret, caret);
      body.dispatchEvent(new Event("input", {bubbles:true}));
      if(typeof toast === "function") toast("구분선을 넣었습니다.");
    }
  });

  function renderBodyWithDividers(text){
    const safe = typeof escapeHtml === "function" ? escapeHtml(text || "") : String(text || "");
    return safe
      .split(/\n/)
      .map(line => /^\s*---\s*$/.test(line) ? '<hr class="post-divider">' : line)
      .join("\n");
  }

  if(typeof window.openPostPreview === "function"){
    const baseOpenPostPreview = window.openPostPreview;
    window.openPostPreview = function(post){
      const series = typeof seriesById === "function" ? seriesById(post.seriesId) : null;
      const previewKind = document.querySelector("#previewKind");
      const previewContent = document.querySelector("#previewContent");
      const modal = document.querySelector("#previewModal");
      if(!previewContent || !modal){
        return baseOpenPostPreview(post);
      }

      if(previewKind) previewKind.textContent = "";
      previewContent.innerHTML = `
        <h2 class="preview-title">${typeof episodeBadge === "function" ? episodeBadge(post) : ""}<span class="preview-title-text">${typeof escapeHtml === "function" ? escapeHtml(typeof cleanPostTitle === "function" ? cleanPostTitle(post.title) : post.title) : post.title}</span></h2>
        <div class="preview-meta">
          <span>${typeof formatDate === "function" ? formatDate(post.date) : (post.date || "")}</span>
          ${series ? `<span class="post-series">${typeof escapeHtml === "function" ? escapeHtml(series.title) : series.title}</span>` : ""}
        </div>
        <div class="preview-body" style="text-align:${post.textAlign || "left"}">${renderBodyWithDividers(post.body || "")}</div>
      `;
      modal.hidden = false;
      document.body.style.overflow = "hidden";
    };
  }

  // 편집 중 정렬값을 현재 포스트 객체에 반영할 수 있도록 노출
  window.getArchiveEditorTextAlign = () => currentAlign;
})();
