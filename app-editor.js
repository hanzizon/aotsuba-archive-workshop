const bgImages=[
  {src:"./aotsuba-bg.png",label:"이미지 1"},
  {src:"./aotsuba-bg-2.png",label:"이미지 2"},
  {src:"./aotsuba-bg-3.png",label:"이미지 3"}
];
let bgImageIndex=-1;

function setBgImageIndex(index){
  const img=document.querySelector("#aotsubaBg");
  const btn=document.querySelector("#bgImageToggle");
  bgImageIndex=index;
  if(!img||!btn) return;

  if(index<0 || index>=bgImages.length){
    img.classList.add("is-off");
    btn.textContent="이미지 OFF";
    btn.setAttribute("aria-pressed","false");
    return;
  }

  const current=bgImages[index];
  img.src=current.src;
  img.classList.remove("is-off");
  btn.textContent=current.label;
  btn.setAttribute("aria-pressed","true");
}

document.querySelector("#bgImageToggle")?.addEventListener("click",()=>{
  const nextIndex=(bgImageIndex>=bgImages.length-1) ? -1 : bgImageIndex+1;
  setBgImageIndex(nextIndex);
});

setBgImageIndex(-1);

const EDITOR_DRAFT_KEY="aotsubaArchive.editorDraft.v1";
const EDITOR_MANUAL_SAVE_KEY="aotsubaArchive.editorManualSave.v1";
let editorSaveTimer=null;



function formatEditorSaveTime(date=new Date()){
  const pad=n=>String(n).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function captureEditorState(){
  return {
    version:1,
    savedAt:Date.now(),
    title:$("#editorTitle")?.value || "",
    seriesId:$("#editorSeries")?.value || "",
    tags:$("#editorTags")?.value || "",
    body:$("#editorBody")?.value || "",
    fontFamily:$("#editorFontFamily")?.value || "",
    fontSize:$("#editorFontSize")?.value || getDefaultEditorFontSize()
  };
}

function saveEditorManualDraft({showToast=false}={}){
  try{
    const savedAt=new Date();
    localStorage.setItem(EDITOR_MANUAL_SAVE_KEY,JSON.stringify(captureEditorState()));
    if(showToast) toast(`${formatEditorSaveTime(savedAt)}에 임시저장했습니다.`);
    return true;
  }catch(err){
    console.error("포스트 임시저장 실패",err);
    if(showToast) toast("임시저장하지 못했습니다.");
    return false;
  }
}

function hasCurrentEditorContent(){
  return !!(
    ($("#editorTitle")?.value || "").trim() ||
    ($("#editorTags")?.value || "").trim() ||
    ($("#editorBody")?.value || "").trim()
  );
}

function restoreEditorManualDraft(){
  let saved=null;
  try{
    const raw=localStorage.getItem(EDITOR_MANUAL_SAVE_KEY);
    if(!raw) return false;
    saved=JSON.parse(raw);
  }catch(err){
    console.error("포스트 임시저장본 읽기 실패",err);
    return false;
  }

  if(!saved || saved.version!==1) return false;

  $("#editorTitle").value=saved.title || "";
  $("#editorTags").value=saved.tags || "";
  $("#editorBody").value=saved.body || "";

  const series=$("#editorSeries");
  if(series && [...series.options].some(o=>o.value===saved.seriesId)){
    series.value=saved.seriesId;
  }else if(series){
    series.value="";
  }

  const family=$("#editorFontFamily");
  if(family && [...family.options].some(o=>o.value===saved.fontFamily)){
    family.value=saved.fontFamily;
  }

  const size=$("#editorFontSize");
  if(size && [...size.options].some(o=>o.value===String(saved.fontSize))){
    size.value=String(saved.fontSize);
  }

  applyEditorTypography();
  saveEditorDraft();
  return true;
}

function getDefaultEditorFontSize(){
  return window.matchMedia("(max-width:760px)").matches ? "10" : "11";
}

function applyEditorTypography(){
  const body=$("#editorBody");
  const family=$("#editorFontFamily")?.value;
  const size=$("#editorFontSize")?.value || getDefaultEditorFontSize();
  if(body){
    if(family) body.style.fontFamily=family;
    body.style.fontSize=`${size}pt`;
  }
}

function populateEditorSeries(){
  const select=$("#editorSeries");
  if(!select) return;
  const current=select.value;
  select.innerHTML=`<option value="">시리즈 없음</option>`+
    state.series
      .slice()
      .sort((a,b)=>(a.order??999)-(b.order??999))
      .map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.title)}</option>`)
      .join("");
  if([...select.options].some(o=>o.value===current)) select.value=current;
}

function loadEditorDraft(){
  try{
    const raw=localStorage.getItem(EDITOR_DRAFT_KEY);
    if(!raw) return;
    const saved=JSON.parse(raw);
    $("#editorTitle").value=saved.title||"";
    $("#editorSeries").value=saved.seriesId||"";
    $("#editorTags").value=saved.tags||"";
    $("#editorBody").value=saved.body||"";
    if(saved.fontFamily && [...$("#editorFontFamily").options].some(o=>o.value===saved.fontFamily)){
      $("#editorFontFamily").value=saved.fontFamily;
    }
    $("#editorFontSize").value=saved.fontSize || getDefaultEditorFontSize();
    applyEditorTypography();
  }catch(err){
    console.error("글쓰기 임시저장본 불러오기 실패",err);
  }
}

function saveEditorDraft(){
  try{
    const saved={
      title:$("#editorTitle").value,
      seriesId:$("#editorSeries").value,
      tags:$("#editorTags").value,
      body:$("#editorBody").value,
      fontFamily:$("#editorFontFamily").value,
      fontSize:$("#editorFontSize").value,
      savedAt:new Date().toISOString()
    };
    localStorage.setItem(EDITOR_DRAFT_KEY,JSON.stringify(saved));
    const stateEl=$("#editorSaveState");
    if(stateEl){
      stateEl.textContent="저장됨";
      clearTimeout(stateEl._timer);
      stateEl._timer=setTimeout(()=>stateEl.textContent="자동 저장",900);
    }
  }catch(err){
    console.error("글쓰기 임시저장 실패",err);
  }
}

function openPostEditor(){
  populateEditorSeries();
  $("#editorFontSize").value=getDefaultEditorFontSize();
  loadEditorDraft();
  applyEditorTypography();
  const editor=$("#postEditor");
  editor.classList.add("open");
  editor.setAttribute("aria-hidden","false");
  $("#archiveEditorTrigger")?.setAttribute("aria-expanded","true");
  document.body.style.overflow="hidden";
  setTimeout(()=>$("#editorTitle")?.focus(),40);
}

function closePostEditor(){
  saveEditorDraft();
  const editor=$("#postEditor");
  editor.classList.remove("open");
  editor.setAttribute("aria-hidden","true");
  $("#archiveEditorTrigger")?.setAttribute("aria-expanded","false");
  document.body.style.overflow="";
}

$("#archiveEditorTrigger")?.addEventListener("click",openPostEditor);
$("#archiveEditorTrigger")?.addEventListener("keydown",e=>{
  if(e.key==="Enter"||e.key===" "){
    e.preventDefault();
    openPostEditor();
  }
});
$("#editorCloseBtn")?.addEventListener("click",closePostEditor);
["#editorTitle","#editorSeries","#editorTags","#editorBody","#editorFontFamily","#editorFontSize"].forEach(sel=>{
  $(sel)?.addEventListener("input",()=>{
    const stateEl=$("#editorSaveState");
    if(stateEl) stateEl.textContent="저장 중…";
    clearTimeout(editorSaveTimer);
    editorSaveTimer=setTimeout(saveEditorDraft,350);
  });
  $(sel)?.addEventListener("change",()=>{
    if(sel==="#editorFontFamily" || sel==="#editorFontSize") applyEditorTypography();
    clearTimeout(editorSaveTimer);
    editorSaveTimer=setTimeout(saveEditorDraft,120);
  });
});

$("#editorTempSaveBtn")?.addEventListener("click",()=>{
  pulsePress($("#editorTempSaveBtn"));
  saveEditorManualDraft({showToast:true});
});

$("#editorTempLoadBtn")?.addEventListener("click",()=>{
  pulsePress($("#editorTempLoadBtn"));

  let hasSaved=false;
  try{
    hasSaved=!!localStorage.getItem(EDITOR_MANUAL_SAVE_KEY);
  }catch(err){
    console.error("포스트 임시저장본 확인 실패",err);
  }

  if(!hasSaved){
    toast("저장된 임시저장본이 없습니다.");
    return;
  }

  if(hasCurrentEditorContent()){
    const ok=window.confirm("현재 작업을 임시저장본으로 바꿀까요?");
    if(!ok) return;
  }

  if(restoreEditorManualDraft()){
    toast("불러오기에 성공했습니다!");
  }else{
    toast("임시저장본을 불러오지 못했습니다.");
  }
});

$("#editorPublishBtn")?.addEventListener("click",()=>{
  saveEditorDraft();
  toast("게시 기능은 다음 단계에서 GitHub 저장과 연결할 예정입니다.");
});

loadData().catch(err => {
  console.error(err);
  toast("아카이브 데이터를 불러오지 못했습니다.");
});
