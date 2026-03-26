(() => {
  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (!style) return false;
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function getSignature(el) {
    const classes = Array.from(el.classList || []).slice(0, 3).join(".");
    const parent = el.parentElement;
    const parentTag = parent ? parent.tagName.toLowerCase() : "none";
    return `${el.tagName.toLowerCase()}|${classes}|${parentTag}`;
  }

  function extractFromNode(node) {
    const text = normalizeText(node.innerText || node.textContent || "");
    if (!text) return null;

    const titleNode = node.querySelector("h1, h2, h3, h4, strong, b, a");
    const title = normalizeText(titleNode ? titleNode.textContent : text.split(/[.|\\n]/)[0] || "");

    const links = Array.from(node.querySelectorAll("a[href]"))
      .map((a) => a.href)
      .filter((href) => /^https?:\/\//i.test(href));

    const image = node.querySelector("img")?.src || "";

    const phoneMatch = text.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
    const priceMatch = text.match(/(?:[$£€]\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s?(?:USD|EUR|GBP|Tk|BDT))/i);
    const ratingMatch = text.match(/(?:\b\d(?:\.\d)?\s*\/\s*5\b|\b\d(?:\.\d)?\s*star\b|\b\d(?:\.\d)?\s*rating\b)/i);

    const addressChunk = (text.match(/\d{1,5}[^,.\n]{0,60}(?:street|st\.|road|rd\.|avenue|ave\.|lane|ln\.|city|uk|usa|bangladesh)/i) || [""])[0];

    return {
      title,
      text: text.slice(0, 900),
      addressGuess: normalizeText(addressChunk),
      phoneGuess: phoneMatch ? normalizeText(phoneMatch[0]) : "",
      websiteGuess: links[0] || "",
      priceGuess: priceMatch ? normalizeText(priceMatch[0]) : "",
      ratingGuess: ratingMatch ? normalizeText(ratingMatch[0]) : "",
      imageGuess: image,
      links: links.slice(0, 3),
      htmlSnippet: normalizeText(node.outerHTML).slice(0, 500)
    };
  }

  function collectCandidates() {
    const selector = "article, li, tr, .card, .item, .product, .listing, .result, .company, .store, div";
    const all = Array.from(document.querySelectorAll(selector));

    const prepared = all
      .filter((el) => isVisible(el))
      .map((el) => ({ el, textLen: normalizeText(el.innerText || "").length, sig: getSignature(el) }))
      .filter((x) => x.textLen >= 20 && x.textLen <= 1800);

    const counts = prepared.reduce((acc, x) => {
      acc[x.sig] = (acc[x.sig] || 0) + 1;
      return acc;
    }, {});

    const repeated = prepared.filter((x) => counts[x.sig] >= 3);
    const source = repeated.length >= 6 ? repeated : prepared;

    const items = [];
    const seen = new Set();
    for (const candidate of source) {
      const item = extractFromNode(candidate.el);
      if (!item) continue;
      const key = `${item.title}|${item.phoneGuess}|${item.websiteGuess}|${item.priceGuess}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
      if (items.length >= 60) break;
    }

    return {
      page: {
        url: location.href,
        title: document.title,
        capturedAt: new Date().toISOString(),
        itemCount: items.length
      },
      items
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === "COLLECT_CANDIDATES") {
      try {
        const data = collectCandidates();
        sendResponse({ ok: true, data });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
      return true;
    }
    return false;
  });
})();
