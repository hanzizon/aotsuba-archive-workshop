/* 시리즈 순서 + 시리즈 내부 포스트 순서 관리 */
(() => {
  const SERIES_KEY="aotsubaArchive.seriesEdits.v1";
  const POST_EDIT_KEY="aotsubaArchive.postEdits.v1";
  const modal=document.querySelector("#seriesManager");
  if(!modal) return;

  function savePostOrders(posts){
    try{
      const raw=localStorage.getItem(POST_EDIT_KEY);
      const edits=raw ? JSON.parse(raw) : {};
      posts.forEach(post=>{
        edits[post.id]={...(edits[post.id]||{}),seriesOrder:post.seriesOrder};
      });
      localStorage.setItem(POST_EDIT_KEY,JSON.stringify(edits));
    }catch(err){
      console.error("포스트 순서 저장 실패",err);
    }
  }

  function saveSeriesState(){
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
      localStorage.setItem(SERIES_KEY,JSON.stringify(edits));
    }catch(err){
      console.error("시리즈 순서 저장 실패",err);
    }
  }

  function sortedSeries(){
    return state.series.slice().sort((a,b)=>(a.order??999)-(b.order??999));
  }

  function sortedPosts(seriesId){
    return state.posts
      .filter(post=>post.seriesId===seriesId)
      .slice()
      .sort((a,b)=>(a.seriesOrder??999)-(b.seriesOrder??999));
  }

  function injectControls(){
    modal.querySelectorAll(".series-manager-item").forEach(item=>{
      const panel=item.querySelector(".series-edit-panel");
      if(!panel || panel.querySelector(".series-order-field")) return;
      const series=state.series.find(s=>s.id===item.dataset.seriesId);
      if(!series) return;

      const ordered=sortedSeries();
      const currentIndex=Math.max(0,ordered.findIndex(s=>s.id===series.id));
      const orderLabel=document.createElement("label");
      orderLabel.className="series-order-field";
      orderLabel.innerHTML=`
        <span>시리즈 순서</span>
        <select class="series-order-select" aria-label="시리즈 순서">
          ${ordered.map((s,i)=>`<option value="${i+1}" ${i===currentIndex?"selected":""}>${i+1}번째</option>`).join("")}
        </select>
      `;

      const postSection=document.createElement("section");
      postSection.className="series-post-order-section";
      postSection.innerHTML=`
        <div class="series-post-order-head">
          <strong>포스트 순서</strong>
          <span>위아래 버튼으로 위치를 바꾸면 회차 번호도 함께 바뀝니다.</span>
        </div>
        <div class="series-post-order-list"></div>
      `;

      const actions=panel.querySelector(".series-edit-actions");
      panel.insertBefore(orderLabel,actions);
      panel.insertBefore(postSection,actions);
      renderPostOrderList(item);
    });
  }

  function renderPostOrderList(item){
    const list=item.querySelector(".series-post-order-list");
    if(!list) return;
    const posts=sortedPosts(item.dataset.seriesId);
    list.innerHTML=posts.map((post,index)=>`
      <div class="series-post-order-row" data-post-id="${escapeHtml(post.id)}">
        <span class="series-post-order-num">${Number.isFinite(post.seriesOrder)?post.seriesOrder:"-"}화</span>
        <span class="series-post-order-title">${escapeHtml(cleanPostTitle(post.title))}</span>
        <div class="series-post-order-actions">
          <button type="button" class="series-post-move-btn" data-move="up" aria-label="위로 이동" ${index===0?"disabled":""}>↑</button>
          <button type="button" class="series-post-move-btn" data-move="down" aria-label="아래로 이동" ${index===posts.length-1?"disabled":""}>↓</button>
        </div>
      </div>
    `).join("") || `<div class="series-post-order-empty">포스트가 없습니다.</div>`;
  }

  function movePost(item,postId,direction){
    const posts=sortedPosts(item.dataset.seriesId);
    const index=posts.findIndex(post=>post.id===postId);
    if(index<0) return;
    const target=direction==="up" ? index-1 : index+1;
    if(target<0 || target>=posts.length) return;

    const slots=posts.map((post,i)=>Number.isFinite(post.seriesOrder)?post.seriesOrder:i+1);
    [posts[index],posts[target]]=[posts[target],posts[index]];
    posts.forEach((post,i)=>{ post.seriesOrder=slots[i]; });
    savePostOrders(posts);
    renderPostOrderList(item);
    renderSeries();
    if(state.seriesId===item.dataset.seriesId) renderSeriesPreviewPosts?.();
    toast("포스트 순서를 변경했습니다.");
  }

  function applySeriesOrder(item){
    const select=item.querySelector(".series-order-select");
    const targetIndex=Math.max(0,Number(select?.value||1)-1);
    const ordered=sortedSeries();
    const currentIndex=ordered.findIndex(s=>s.id===item.dataset.seriesId);
    if(currentIndex<0) return;
    const [picked]=ordered.splice(currentIndex,1);
    ordered.splice(Math.min(targetIndex,ordered.length),0,picked);
    ordered.forEach((series,index)=>{ series.order=index+1; });
    saveSeriesState();
  }

  const observer=new MutationObserver(injectControls);
  observer.observe(modal,{childList:true,subtree:true});
  injectControls();

  modal.addEventListener("click",e=>{
    const move=e.target.closest(".series-post-move-btn");
    if(move){
      e.preventDefault();
      e.stopPropagation();
      const item=move.closest(".series-manager-item");
      if(item) movePost(item,move.closest(".series-post-order-row")?.dataset.postId,move.dataset.move);
      return;
    }
  },true);

  modal.addEventListener("click",e=>{
    const save=e.target.closest(".series-edit-save");
    if(!save) return;
    const item=save.closest(".series-manager-item");
    if(item) applySeriesOrder(item);
  },true);
})();
