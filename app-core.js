const EMBEDDED_POSTS = [{"id": "post-001", "title": "제43편. 등불", "excerpt": "밤이 깊어진 뒤에도 방 안에는 등잔 하나가 오래 남아 있었다.", "body": "방으로 돌아왔을 때에는 창밖이 이미 어두워져 있었다. 등잔 하나가 침대 곁에서 낮은 빛을 흘리고 있었고, 츠바키는 문이 닫히는 소리를 들은 뒤에도 한동안 그 자리에서 움직이지 않았다. 오늘 있었던 일을 차례로 떠올리려 했지만 이상하게도 마지막에 들었던 목소리만 또렷하게 남았다.\n\n아오이는 늘 그렇듯 필요한 말만 남기고 물러났다. 그러나 그 짧은 인사가 평소와 같지 않았다는 것을 츠바키는 알고 있었다. 아주 사소한 차이였고, 다른 사람이라면 알아채지 못했을 정도였지만 이제는 그런 것까지 눈에 들어왔다.", "date": "2026-09-07T18:00:00+09:00", "seriesId": "royal-guard-au", "seriesOrder": 43, "tags": ["아오츠바", "황녀AU", "연재"]}, {"id": "post-002", "title": "제42편. 귀환", "excerpt": "돌아온다는 말은 생각보다 많은 것을 바꾸었다.", "body": "황궁의 회랑은 늦은 오후의 빛으로 길게 물들어 있었다. 츠바키는 걸음을 늦추지 않은 채 창밖을 바라보았고, 반 걸음 뒤에서는 아오이의 발소리가 일정한 간격으로 따라왔다. 익숙한 거리였다. 어느 순간부터는 그 간격마저 하루의 일부처럼 느껴졌다.", "date": "2026-09-05T21:30:00+09:00", "seriesId": "royal-guard-au", "seriesOrder": 42, "tags": ["아오츠바", "황녀AU"]}, {"id": "post-003", "title": "첫눈", "excerpt": "도시의 첫눈이 내리던 날, 두 사람은 평소보다 조금 늦게 집으로 돌아갔다.", "body": "첫눈은 생각보다 늦게 내렸다. 두 사람이 건물 밖으로 나왔을 때에는 이미 도로 가장자리에 얇은 흰빛이 내려앉아 있었고, 츠바키는 우산을 펴려던 손을 잠시 멈췄다.", "date": "2026-08-29T13:00:00+09:00", "seriesId": "modern-au", "seriesOrder": 3, "tags": ["현대AU", "단편"]}, {"id": "post-004", "title": "작은 정원", "excerpt": "아무도 찾지 않는 정원 한구석에서 시작된 짧은 이야기.", "body": "정원은 본궁에서 멀지 않았지만 이상하리만치 사람이 드물었다. 오래된 담장과 키 낮은 장미 덤불 사이로 좁은 길이 이어졌고, 두 사람은 말없이 그 길을 걸었다.", "date": "2026-08-20T09:20:00+09:00", "seriesId": "shorts", "seriesOrder": 1, "tags": ["단편", "정원"]}];
const EMBEDDED_SERIES = [{"id": "royal-guard-au", "title": "기사띠니 황녀띠니", "description": "제목 고민 중", "thumbnail": "./series-kittihwangtti.png", "order": 1}];

const state = {
  posts: [],
  series: [],
  query: "",
  seriesId: "",
  sort: "latest"
};

const $ = (sel) => document.querySelector(sel);

function toast(message){
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 1700);
}

function formatDate(value){
  if(!value) return "";
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year:"numeric", month:"2-digit", day:"2-digit"
  }).format(d);
}

function escapeHtml(value=""){
  return String(value)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

async function loadData(){
  state.posts = EMBEDDED_POSTS;
  state.series = EMBEDDED_SERIES;
  renderAll();
}

function seriesById(id){
  return state.series.find(item => item.id === id);
}

function renderSeries(){
  const grid = $("#seriesGrid");
  const cards = state.series
    .slice()
    .sort((a,b) => (a.order ?? 999) - (b.order ?? 999))
    .map((series, index) => {
      const count = state.posts.filter(p => p.seriesId === series.id).length;
      const thumb = series.thumbnail
        ? `<img src="${escapeHtml(series.thumbnail)}" alt="">`
        : "";
      return `
        <article class="series-card" data-series-id="${escapeHtml(series.id)}">
          <div class="series-thumb">
            ${thumb}
            <span class="series-index">${String(index+1).padStart(2,"0")}</span>
          </div>
          <div class="series-body">
            <div class="series-title">${escapeHtml(series.title)}</div>
            <p class="series-desc">${escapeHtml(series.description || "")}</p>
            <div class="series-meta">${count}개의 포스트</div>
          </div>
        </article>
      `;
    }).join("");

  grid.innerHTML = cards || `<div class="empty-state">아직 시리즈가 없습니다.</div>`;
}

function getFilteredPosts(){
  const q = state.query.trim().toLocaleLowerCase("ko-KR");

  let rows = state.posts.filter(post => {
    if(state.seriesId && post.seriesId !== state.seriesId) return false;
    if(!q) return true;

    const haystack = [
      post.title,
      post.excerpt,
      post.body,
      ...(post.tags || [])
    ].join(" ").toLocaleLowerCase("ko-KR");

    return haystack.includes(q);
  });

  const collator = new Intl.Collator("ko-KR", {numeric:true, sensitivity:"base"});

  rows.sort((a,b) => {
    if(state.sort === "oldest"){
      return new Date(a.date) - new Date(b.date);
    }
    if(state.sort === "title-asc"){
      return collator.compare(a.title || "", b.title || "");
    }
    if(state.sort === "title-desc"){
      return collator.compare(b.title || "", a.title || "");
    }
    if(state.sort === "series"){
      const sa = seriesById(a.seriesId);
      const sb = seriesById(b.seriesId);
      const seriesOrder = (sa?.order ?? 999) - (sb?.order ?? 999);
      if(seriesOrder !== 0) return seriesOrder;

      const postOrder = (a.seriesOrder ?? 999) - (b.seriesOrder ?? 999);
      if(postOrder !== 0) return postOrder;

      return new Date(b.date) - new Date(a.date);
    }
    return new Date(b.date) - new Date(a.date);
  });

  return rows;
}

function renderPosts(){
  const rows = getFilteredPosts();
  const list = $("#postList");
  const empty = $("#emptyState");

  empty.hidden = rows.length > 0;

  list.innerHTML = rows.map((post, idx) => {
    const series = seriesById(post.seriesId);
    const tags = (post.tags || []).map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join("");
    const orderLabel = series && Number.isFinite(post.seriesOrder)
      ? `${escapeHtml(series.title)} · ${post.seriesOrder}화`
      : `${idx+1}`;

    return `
      <article class="post-item">
        <div>
          <h3 class="post-title series-list-title">
            ${episodeBadge(post)}
            <span class="post-title-text">${escapeHtml(cleanPostTitle(post.title))}</span>
          </h3>
          <p class="post-excerpt">${escapeHtml(post.excerpt || "")}</p>
          <div class="post-meta">
            <span>${formatDate(post.date)}</span>
            ${series ? `<span class="post-series">${escapeHtml(series.title)}</span>` : ""}
            <span class="post-tags">${tags}</span>
          </div>
        </div>
        <div class="post-order"></div>
      </article>
    `;
  }).join("");
}

function renderFilters(){
  const filter = $("#seriesFilter");
  const options = state.series
    .slice()
    .sort((a,b) => (a.order ?? 999) - (b.order ?? 999))
    .map(series => `<option value="${escapeHtml(series.id)}">${escapeHtml(series.title)}</option>`)
    .join("");

  filter.innerHTML = `<option value="">모든 시리즈</option>${options}`;
  filter.value = state.seriesId;
}

function renderStats(){
  const postCount=$("#postCount");
  const seriesCount=$("#seriesCount");
  if(postCount) postCount.textContent=state.posts.length;
  if(seriesCount) seriesCount.textContent=state.series.length;
}

function renderAll(){
  renderStats();
  renderSeries();
  populateEditorSeries();
}


$("#seriesGrid").addEventListener("pointerdown",e=>{
  const card=e.target.closest(".series-card");
  if(card) card.classList.add("tap-active");
});
["pointerup","pointercancel","pointerleave"].forEach(type=>{
  $("#seriesGrid").addEventListener(type,e=>{
    const card=e.target.closest(".series-card");
    if(card) setTimeout(()=>card.classList.remove("tap-active"),90);
  });
});

$("#seriesGrid").addEventListener("click", (e) => {
  const card = e.target.closest(".series-card");
  if(!card) return;
  card.classList.remove("tap-active");
  void card.offsetWidth;
  card.classList.add("tap-active");
  setTimeout(()=>card.classList.remove("tap-active"),180);
  const series = seriesById(card.dataset.seriesId);
  if(series) setTimeout(()=>openSeriesPreview(series),90);
});

$("#showAllSeriesBtn").addEventListener("click", () => {
  const first=state.series.slice().sort((a,b)=>(a.order??999)-(b.order??999))[0];
  if(first) openSeriesPreview(first);
});

$("#writeBtn").addEventListener("click", () => {
  openPostEditor();
});

$("#seriesManageBtn").addEventListener("click", () => {
  toast("시리즈 관리 화면은 다음 단계에서 붙일 예정입니다.");
});



function pulsePress(el){
  if(!el) return;
  el.classList.remove("press-active");
  void el.offsetWidth;
  el.classList.add("press-active");
  setTimeout(()=>el.classList.remove("press-active"),170);
}

document.querySelectorAll(".header-actions button,.preview-close,#editorTempSaveBtn,#editorTempLoadBtn,#editorCloseBtn,#editorPublishBtn").forEach(el=>{
  el.addEventListener("pointerdown",()=>el.classList.add("press-active"));
  ["pointerup","pointercancel","pointerleave"].forEach(type=>{
    el.addEventListener(type,()=>setTimeout(()=>el.classList.remove("press-active"),80));
  });
  el.addEventListener("click",()=>pulsePress(el));
});

function openPostPreview(post){
  const series=seriesById(post.seriesId);
  $("#previewKind").textContent="";
  $("#previewContent").innerHTML=`
    <h2 class="preview-title">${episodeBadge(post)}<span class="preview-title-text">${escapeHtml(cleanPostTitle(post.title))}</span></h2>
    <div class="preview-meta">
      <span>${formatDate(post.date)}</span>
      ${series ? `<span class="post-series">${escapeHtml(series.title)}</span>` : ""}
    </div>
    <div class="preview-body">${escapeHtml(post.body||"")}</div>
  `;
  $("#previewModal").hidden=false;
  document.body.style.overflow="hidden";
}



function cleanPostTitle(title){
  return (title||"")
    .replace(/^\s*제?\s*\d+\s*(?:편|화)\s*[.\-_:：]?\s*/u,"")
    .trim();
}

function episodeBadge(post){
  if(!Number.isFinite(post?.seriesOrder)) return "";
  return `<span class="episode-badge">${post.seriesOrder}화</span>`;
}

function getFirstSentence(text){
  const clean=(text||"").replace(/\r/g,"").trim();
  if(!clean) return "";
  const firstParagraph=clean.split(/\n\s*\n/)[0].replace(/\s*\n\s*/g," ").trim();
  const match=firstParagraph.match(/^.*?[.!?。！？](?:["'”’』」])?(?=\s|$)/);
  return (match ? match[0] : firstParagraph).trim();
}

function renderSeriesPreviewPosts(){
  const list=$("#seriesPreviewPostList");
  const empty=$("#seriesPreviewEmpty");
  if(!list || !empty) return;

  let rows=state.posts.filter(p=>p.seriesId===state.seriesId);

  const q=state.query.trim().toLowerCase();
  if(q){
    rows=rows.filter(p=>
      [p.title,p.body]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }

  rows=rows.slice().sort((a,b)=>{
    if(state.sort==="oldest") return new Date(a.date)-new Date(b.date);
    if(state.sort==="title-asc") return a.title.localeCompare(b.title,"ko");
    if(state.sort==="title-desc") return b.title.localeCompare(a.title,"ko");
    if(state.sort==="series") return (a.seriesOrder??999)-(b.seriesOrder??999);
    return new Date(b.date)-new Date(a.date);
  });

  empty.hidden=rows.length>0;

  list.innerHTML=rows.map((post,idx)=>{
    const series=seriesById(post.seriesId);
    return `
      <article class="post-item series-preview-post" data-post-series="${escapeHtml(post.seriesId||"")}" data-post-order="${Number.isFinite(post.seriesOrder)?post.seriesOrder:""}">
        <div>
          <h3 class="post-title series-list-title">
            ${episodeBadge(post)}
            <span class="post-title-text">${escapeHtml(cleanPostTitle(post.title))}</span>
          </h3>
          <p class="post-excerpt series-list-excerpt">${escapeHtml((post.body||"").replace(/\s+/g," ").trim())}</p>
          <div class="post-meta">
            <span>${formatDate(post.date)}</span>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function openSeriesPreview(series){
  state.seriesId=series.id;
  state.query="";
  state.sort="latest";

  $("#previewKind").textContent="";
  $("#previewContent").innerHTML=`
    <section class="series-archive-block series-archive-minimal">
      <div class="archive-controls series-archive-controls">
        <input id="seriesPreviewSearch" type="search" placeholder="제목, 본문 검색" aria-label="포스트 검색">
        <select id="seriesPreviewSort" aria-label="정렬">
          <option value="latest">최신순</option>
          <option value="oldest">오래된 순</option>
          <option value="title-asc">제목 오름차순</option>
          <option value="title-desc">제목 내림차순</option>
          <option value="series">시리즈순</option>
        </select>
      </div>

      <div class="post-list" id="seriesPreviewPostList" aria-live="polite"></div>
      <div class="empty-state" id="seriesPreviewEmpty" hidden>조건에 맞는 포스트가 없습니다.</div>
    </section>
  `;

  $("#seriesPreviewSearch").addEventListener("input",e=>{
    state.query=e.target.value;
    renderSeriesPreviewPosts();
  });
  $("#seriesPreviewSort").addEventListener("change",e=>{
    state.sort=e.target.value;
    renderSeriesPreviewPosts();
  });

  renderSeriesPreviewPosts();
  $("#previewModal").hidden=false;
  document.body.style.overflow="hidden";
}
function closePreview(){
  $("#previewModal").hidden=true;
  document.body.style.overflow="";
}

$("#previewContent").addEventListener("click",e=>{
  const link=e.target.closest(".series-post-link");
  if(link){
    pulsePress(link);
    const post=state.posts.find(p=>p.title===link.dataset.postTitle);
    if(post) setTimeout(()=>openPostPreview(post),90);
    return;
  }

  const item=e.target.closest(".series-preview-post");
  if(item){
    pulsePress(item);
    const order=item.dataset.postOrder==="" ? null : Number(item.dataset.postOrder);
    const post=state.posts.find(p=>
      p.seriesId===item.dataset.postSeries &&
      (order===null ? !Number.isFinite(p.seriesOrder) : p.seriesOrder===order)
    );
    if(post) setTimeout(()=>openPostPreview(post),90);
  }
});

document.querySelectorAll("[data-close-preview]").forEach(el=>el.addEventListener("click",closePreview));
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#previewModal").hidden) closePreview();});



