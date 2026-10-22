/* Treat archive HTML as untrusted, including local drafts and cached edits. */
(() => {
  const tags = ["p","div","br","hr","span","b","strong","i","em","u","s","strike",
    "blockquote","pre","code","ul","ol","li","h1","h2","h3","h4","h5","h6","a",
    "img","sub","sup","table","thead","tbody","tr","th","td","font"];
  const classes = new Set(["post-divider","divider-soft-full","divider-solid","divider-dashed","divider-short"]);
  function safeUrl(value, image = false) {
    const text = String(value || "").trim();
    if (image && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(text)) return text;
    try {
      const url = new URL(text, location.href);
      if (["http:", "https:"].includes(url.protocol) || (!image && url.protocol === "mailto:")) return text;
    } catch (_) {}
    return "";
  }
  window.archiveSafeImageUrl = value => safeUrl(value, true);
  window.archiveSafeAudioUrl = value => /^https:\/\/aotsuba-archive-admin\.hannzizon\.workers\.dev\/audio\/[a-f0-9]{64}\.mp3$/.test(String(value || ""));
  const purifier = window.DOMPurify;
  if (purifier?.isSupported) purifier.addHook("afterSanitizeAttributes", node => {
    for (const attr of ["href","src"]) if (node.hasAttribute?.(attr)) {
      const value = safeUrl(node.getAttribute(attr), attr === "src");
      if (value) node.setAttribute(attr, value);
      else node.removeAttribute(attr);
    }
    if (node.hasAttribute?.("class")) {
      const value = [...node.classList].filter(name => classes.has(name) ||
        (name === "archive-audio" && node.tagName === "A" && window.archiveSafeAudioUrl(node.getAttribute("href")))).join(" ");
      if (value) node.setAttribute("class", value);
      else node.removeAttribute("class");
    }
    if (node.hasAttribute?.("style")) {
      const align = node.style.textAlign;
      node.removeAttribute("style");
      if (["left","center","right","justify","start","end"].includes(align)) node.style.textAlign = align;
    }
    if (node.tagName === "A") node.setAttribute("rel","noopener noreferrer");
    if (node.tagName === "IMG") node.setAttribute("referrerpolicy","no-referrer");
  });
  window.sanitizeArchiveHtml = html => {
    if (!purifier?.isSupported) {
      const text = document.createElement("div");
      text.textContent = String(html || "");
      return text.innerHTML;
    }
    return purifier.sanitize(String(html || ""), {
      ALLOWED_TAGS: tags,
      ALLOWED_ATTR: ["href","src","alt","title","class","style","align","color","face","size","colspan","rowspan"],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      ALLOWED_NAMESPACES: ["http://www.w3.org/1999/xhtml"]
    });
  };
})();
