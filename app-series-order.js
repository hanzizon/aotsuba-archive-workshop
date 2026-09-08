/* 시리즈 내부 포스트 순서 관리 */
(() => {
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

  function sortedPosts(seriesId){
    return state.posts
      .filter(post=>post.seriesId===seriesId)
      .slice()
      .sort((a,b)=>(a.seriesOrder??999)-(b.seriesOrder??999));
  }

  function injectControls(){
    modal.querySelectorAll(".series-manager-item").forEach(item=>{
      const panel=item.querySelector(".series-edit-panel");
      if(!panel || panel.querySelector(".series-post-order-section")) return;

      const section=document.createElement("section");
      section.className="series-post-order-section";
      section.innerHTML=`
        <div class="series-post-order-head">
          <strong>포스트 순서</strong>
          <span>위아래로 옮기면 회차 번호도 함께 바뀝니다.</span>
        </div>
        <div class="series-post-order-list"></div>
      `;
      const actions=panel.querySelector(".series-edit-actions");
      panel.insertBefore(section,actions);
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
    if(state.seriesId===item.dataset.seriesId && typeof renderSeriesPreviewPosts==="function") renderSeriesPreviewPosts();
    toast("포스트 순서를 변경했습니다.");
  }

  const observer=new MutationObserver(injectControls);
  observer.observe(modal,{childList:true,subtree:true});
  injectControls();

  modal.addEventListener("click",e=>{
    const move=e.target.closest(".series-post-move-btn");
    if(!move) return;
    if(!window.archiveIsAdmin?.() || modal.getAttribute("aria-busy")==="true") return;
    e.preventDefault();
    e.stopPropagation();
    if(typeof pulsePress==="function") pulsePress(move);
    const item=move.closest(".series-manager-item");
    const row=move.closest(".series-post-order-row");
    if(item && row) movePost(item,row.dataset.postId,move.dataset.move);
  },true);
})();
