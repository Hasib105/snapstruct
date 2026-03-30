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

  function detectPlatform() {
    const url = location.href.toLowerCase();
    const hostname = location.hostname.toLowerCase();
    
    if (hostname.includes("linkedin.com")) return "linkedin";
    if (hostname.includes("twitter.com") || hostname.includes("x.com")) return "twitter";
    if (hostname.includes("facebook.com")) return "facebook";
    if (hostname.includes("instagram.com")) return "instagram";
    if (hostname.includes("amazon.com") || hostname.includes("amazon.")) return "amazon";
    if (hostname.includes("ebay.com")) return "ebay";
    if (hostname.includes("google.com") && url.includes("/search")) return "google_search";
    if (hostname.includes("yelp.com")) return "yelp";
    if (hostname.includes("crunchbase.com")) return "crunchbase";
    if (hostname.includes("glassdoor.com")) return "glassdoor";
    if (hostname.includes("indeed.com")) return "indeed";
    if (hostname.includes("shopify.com")) return "shopify";
    if (hostname.includes("aliexpress.com")) return "aliexpress";
    if (hostname.includes("zillow.com")) return "zillow";
    if (hostname.includes("github.com")) return "github";
    return "generic";
  }

  function extractLinkedInData(node) {
    const text = normalizeText(node.innerText || node.textContent || "");
    if (!text || text.length < 20) return null;

    // Extract person name (usually first strong text or heading)
    const nameNode = node.querySelector("span.entity-result__title-text a, h3 a, strong, .name");
    let name = normalizeText(nameNode?.textContent || "");
    
    // Try to extract name from text if not found
    if (!name) {
      const nameMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/);
      name = nameMatch ? nameMatch[1] : "";
    }

    // Extract title/role
    const titleMatch = text.match(/(?:^|\n|·\s*)([A-Z][^·\n]{10,80}(?:CEO|CTO|CFO|COO|Founder|Director|Manager|Engineer|Developer|Consultant|Executive|President|VP|Owner|Partner|Head|Lead|Chief|Senior|Junior)[^·\n]*)/i) ||
                       text.match(/(?:Founder|CEO|CTO|CFO|COO|Director|Manager|President|VP|Owner|Partner|Head|Lead|Chief)[^·\n,]{0,60}/i);
    const title = titleMatch ? normalizeText(titleMatch[0]) : "";

    // Extract company
    const companyMatch = text.match(/(?:at|@|·)\s*([A-Z][^·\n,]{2,50})/i) ||
                         text.match(/(?:Experience|Company):\s*([^·\n,]{3,50})/i);
    const company = companyMatch ? normalizeText(companyMatch[1]) : "";

    // Extract location
    const locationMatch = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)?)/);
    const location = locationMatch ? normalizeText(locationMatch[0]) : "";

    // Extract followers
    const followersMatch = text.match(/([\d,.]+[KkMm]?\+?)\s*(?:followers|connections)/i);
    const followers = followersMatch ? normalizeText(followersMatch[1]) : "";

    // Extract profile URL
    const profileLink = node.querySelector("a[href*='linkedin.com/in/'], a[href*='linkedin.com/company/']");
    const profileUrl = profileLink?.href || "";

    // Extract image
    const image = node.querySelector("img")?.src || "";

    // Extract experience/description
    const description = text.slice(0, 500);

    return {
      name,
      title,
      company,
      location,
      followers,
      profileUrl,
      image,
      description,
      rawText: text
    };
  }

  function extractProductData(node) {
    const text = normalizeText(node.innerText || node.textContent || "");
    if (!text || text.length < 15) return null;

    const titleNode = node.querySelector("h1, h2, h3, h4, .title, .product-title, [class*='title'], a");
    const title = normalizeText(titleNode?.textContent || text.split(/[.\n]/)[0] || "").slice(0, 200);

    const priceMatch = text.match(/(?:[$£€¥₹]\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|INR|BDT|Tk))/gi);
    const price = priceMatch ? normalizeText(priceMatch[0]) : "";
    const originalPrice = priceMatch && priceMatch[1] ? normalizeText(priceMatch[1]) : "";

    const ratingMatch = text.match(/(\d(?:\.\d)?)\s*(?:out of\s*5|\/\s*5|stars?|rating)/i) ||
                        text.match(/(\d(?:\.\d)?)\s*★/);
    const rating = ratingMatch ? ratingMatch[1] : "";

    const reviewsMatch = text.match(/([\d,]+)\s*(?:reviews?|ratings?|votes?)/i);
    const reviews = reviewsMatch ? reviewsMatch[1] : "";

    const image = node.querySelector("img")?.src || "";
    
    const links = Array.from(node.querySelectorAll("a[href]"))
      .map((a) => a.href)
      .filter((href) => /^https?:\/\//i.test(href));

    const availability = text.match(/(in stock|out of stock|available|unavailable|sold out|limited)/i);
    
    return {
      title,
      price,
      originalPrice,
      rating,
      reviews,
      availability: availability ? normalizeText(availability[0]) : "",
      image,
      productUrl: links[0] || "",
      description: text.slice(0, 400)
    };
  }

  function extractCompanyData(node) {
    const text = normalizeText(node.innerText || node.textContent || "");
    if (!text || text.length < 20) return null;

    const titleNode = node.querySelector("h1, h2, h3, h4, strong, b, a, .company-name");
    const companyName = normalizeText(titleNode?.textContent || text.split(/[.\n]/)[0] || "").slice(0, 150);

    const addressMatch = text.match(/\d{1,5}[^,.\n]{0,80}(?:street|st\.|road|rd\.|avenue|ave\.|lane|ln\.|drive|dr\.|boulevard|blvd\.|way|court|ct\.|plaza|square)/i) ||
                         text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\s*\d{5})/);
    const address = addressMatch ? normalizeText(addressMatch[0]) : "";

    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const phone = phoneMatch ? normalizeText(phoneMatch[0]) : "";

    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0] : "";

    const links = Array.from(node.querySelectorAll("a[href]"))
      .map((a) => a.href)
      .filter((href) => /^https?:\/\//i.test(href) && !href.includes("google.com"));

    const ratingMatch = text.match(/(\d(?:\.\d)?)\s*(?:\/\s*5|stars?|rating)/i);
    const rating = ratingMatch ? ratingMatch[1] : "";

    const reviewsMatch = text.match(/([\d,]+)\s*(?:reviews?|ratings?)/i);
    const reviews = reviewsMatch ? reviewsMatch[1] : "";

    const image = node.querySelector("img")?.src || "";

    const industryMatch = text.match(/(?:industry|sector|category):\s*([^,\n]{3,50})/i);
    const industry = industryMatch ? normalizeText(industryMatch[1]) : "";

    return {
      companyName,
      address,
      phone,
      email,
      website: links[0] || "",
      rating,
      reviews,
      industry,
      image,
      description: text.slice(0, 400)
    };
  }

  function extractLeadData(node) {
    const text = normalizeText(node.innerText || node.textContent || "");
    if (!text || text.length < 20) return null;

    // Person name extraction
    const nameNode = node.querySelector("h1, h2, h3, h4, strong, .name, [class*='name']");
    let name = normalizeText(nameNode?.textContent || "");
    if (!name || name.length > 100) {
      const nameMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})/);
      name = nameMatch ? nameMatch[1] : "";
    }

    // Title/role
    const titleMatch = text.match(/(CEO|CTO|CFO|COO|Founder|Co-founder|Director|Manager|Engineer|Developer|Consultant|Executive|President|VP|Owner|Partner|Head of|Lead|Chief|Senior|Junior|Analyst|Specialist|Coordinator)[^,\n]{0,60}/i);
    const title = titleMatch ? normalizeText(titleMatch[0]) : "";

    // Company
    const companyMatch = text.match(/(?:at|@|·|-|,)\s*([A-Z][^·\n,@]{2,60}(?:Inc\.|LLC|Ltd\.|Corp\.|Company|Co\.)?)/i);
    const company = companyMatch ? normalizeText(companyMatch[1]) : "";

    // Contact info
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0] : "";

    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const phone = phoneMatch ? normalizeText(phoneMatch[0]) : "";

    // Location
    const locationMatch = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-zA-Z\s]+)?)/);
    const location = locationMatch ? normalizeText(locationMatch[0]) : "";

    // Social/profile links
    const links = Array.from(node.querySelectorAll("a[href]"))
      .map((a) => ({ url: a.href, text: normalizeText(a.textContent) }))
      .filter((link) => /^https?:\/\//i.test(link.url));

    const linkedinUrl = links.find(l => l.url.includes("linkedin.com"))?.url || "";
    const twitterUrl = links.find(l => l.url.includes("twitter.com") || l.url.includes("x.com"))?.url || "";
    const websiteUrl = links.find(l => !l.url.includes("linkedin.com") && !l.url.includes("twitter.com"))?.url || "";

    const image = node.querySelector("img")?.src || "";

    // Followers/connections
    const followersMatch = text.match(/([\d,.]+[KkMm]?\+?)\s*(?:followers|connections|subscribers)/i);
    const followers = followersMatch ? normalizeText(followersMatch[1]) : "";

    return {
      name,
      title,
      company,
      email,
      phone,
      location,
      linkedinUrl,
      twitterUrl,
      website: websiteUrl,
      followers,
      image,
      description: text.slice(0, 400)
    };
  }

  function extractCustomerData(node) {
    const text = normalizeText(node.innerText || node.textContent || "");
    if (!text || text.length < 15) return null;

    const nameNode = node.querySelector("h1, h2, h3, h4, strong, .name, .customer-name, .user-name");
    let name = normalizeText(nameNode?.textContent || "");
    if (!name || name.length > 80) {
      const nameMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/);
      name = nameMatch ? nameMatch[1] : "";
    }

    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0] : "";

    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const phone = phoneMatch ? normalizeText(phoneMatch[0]) : "";

    const addressMatch = text.match(/\d{1,5}[^,.\n]{0,100}(?:\d{5}|\d{5}-\d{4}|[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})/i);
    const address = addressMatch ? normalizeText(addressMatch[0]) : "";

    const orderMatch = text.match(/(?:order|invoice|ref|id|#)\s*[:#]?\s*([A-Z0-9-]+)/i);
    const orderId = orderMatch ? orderMatch[1] : "";

    const dateMatch = text.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}/);
    const date = dateMatch ? normalizeText(dateMatch[0]) : "";

    const amountMatch = text.match(/(?:[$£€¥₹]\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:USD|EUR|GBP))/i);
    const amount = amountMatch ? normalizeText(amountMatch[0]) : "";

    return {
      name,
      email,
      phone,
      address,
      orderId,
      date,
      amount,
      description: text.slice(0, 300)
    };
  }

  function extractJobData(node) {
    const text = normalizeText(node.innerText || node.textContent || "");
    if (!text || text.length < 20) return null;

    const titleNode = node.querySelector("h1, h2, h3, h4, .job-title, [class*='title']");
    const jobTitle = normalizeText(titleNode?.textContent || text.split(/[.\n]/)[0] || "").slice(0, 150);

    const companyMatch = text.match(/(?:at|@|·|-)\s*([A-Z][^·\n,]{2,50})/i);
    const company = companyMatch ? normalizeText(companyMatch[1]) : "";

    const locationMatch = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})/);
    const location = locationMatch ? normalizeText(locationMatch[0]) : "";

    const salaryMatch = text.match(/(?:[$£€]\s*[\d,]+(?:k|K)?(?:\s*[-–]\s*[$£€]?\s*[\d,]+(?:k|K)?)?(?:\s*(?:\/\s*(?:year|yr|month|mo|hour|hr))?)?)/i);
    const salary = salaryMatch ? normalizeText(salaryMatch[0]) : "";

    const typeMatch = text.match(/(full[-\s]?time|part[-\s]?time|contract|freelance|internship|remote|hybrid|on[-\s]?site)/i);
    const jobType = typeMatch ? normalizeText(typeMatch[0]) : "";

    const postedMatch = text.match(/(?:posted|listed|added)\s*([\d]+\s*(?:days?|hours?|weeks?|months?)\s*ago|today|yesterday)/i);
    const posted = postedMatch ? normalizeText(postedMatch[1]) : "";

    const links = Array.from(node.querySelectorAll("a[href]"))
      .map((a) => a.href)
      .filter((href) => /^https?:\/\//i.test(href));

    return {
      jobTitle,
      company,
      location,
      salary,
      jobType,
      posted,
      jobUrl: links[0] || "",
      description: text.slice(0, 500)
    };
  }

  function extractGenericData(node) {
    const text = normalizeText(node.innerText || node.textContent || "");
    if (!text) return null;

    const titleNode = node.querySelector("h1, h2, h3, h4, strong, b, a");
    const title = normalizeText(titleNode ? titleNode.textContent : text.split(/[.|\n]/)[0] || "");

    const links = Array.from(node.querySelectorAll("a[href]"))
      .map((a) => a.href)
      .filter((href) => /^https?:\/\//i.test(href));

    const image = node.querySelector("img")?.src || "";

    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const priceMatch = text.match(/(?:[$£€¥₹]\s*[\d,]+(?:\.\d{1,2})?)/i);
    const ratingMatch = text.match(/(\d(?:\.\d)?)\s*(?:\/\s*5|stars?|rating)/i);
    const locationMatch = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);

    return {
      title,
      text: text.slice(0, 600),
      phone: phoneMatch ? normalizeText(phoneMatch[0]) : "",
      email: emailMatch ? emailMatch[0] : "",
      price: priceMatch ? normalizeText(priceMatch[0]) : "",
      rating: ratingMatch ? ratingMatch[1] : "",
      location: locationMatch ? normalizeText(locationMatch[0]) : "",
      website: links[0] || "",
      image,
      links: links.slice(0, 5)
    };
  }

  function collectCandidates(dataType = "auto") {
    const platform = detectPlatform();
    
    // Platform-specific selectors
    let selector;
    switch (platform) {
      case "linkedin":
        selector = ".entity-result, .search-result, .reusable-search__result-container, li.reusable-search__result-container, .org-people-profile-card, article";
        break;
      case "amazon":
      case "ebay":
      case "aliexpress":
        selector = "[data-component-type='s-search-result'], .s-result-item, .srp-results li, .product-card, .item";
        break;
      case "google_search":
        selector = ".g, .tF2Cxc, [data-hveid], .MjjYud";
        break;
      case "indeed":
      case "glassdoor":
        selector = ".job_seen_beacon, .jobsearch-ResultsList li, .jobCard, .job-listing";
        break;
      default:
        selector = "article, li, tr, .card, .item, .product, .listing, .result, .company, .store, .profile, .user, .member, div[class*='result'], div[class*='item'], div[class*='card']";
    }

    const all = Array.from(document.querySelectorAll(selector));

    const prepared = all
      .filter((el) => isVisible(el))
      .map((el) => ({ el, textLen: normalizeText(el.innerText || "").length, sig: getSignature(el) }))
      .filter((x) => x.textLen >= 20 && x.textLen <= 3000);

    const counts = prepared.reduce((acc, x) => {
      acc[x.sig] = (acc[x.sig] || 0) + 1;
      return acc;
    }, {});

    const repeated = prepared.filter((x) => counts[x.sig] >= 2);
    const source = repeated.length >= 3 ? repeated : prepared;

    // Determine extraction method
    let extractFn;
    const effectiveType = dataType === "auto" ? (platform === "linkedin" ? "leads" : "generic") : dataType;
    
    switch (effectiveType) {
      case "leads":
      case "people":
      case "contacts":
        extractFn = platform === "linkedin" ? extractLinkedInData : extractLeadData;
        break;
      case "products":
      case "items":
        extractFn = extractProductData;
        break;
      case "companies":
      case "businesses":
        extractFn = extractCompanyData;
        break;
      case "customers":
      case "orders":
        extractFn = extractCustomerData;
        break;
      case "jobs":
      case "positions":
        extractFn = extractJobData;
        break;
      default:
        extractFn = extractGenericData;
    }

    const items = [];
    const seen = new Set();
    
    for (const candidate of source) {
      const item = extractFn(candidate.el);
      if (!item) continue;
      
      // Create unique key based on main identifiers
      const keyParts = [
        item.name || item.title || item.companyName || item.jobTitle || "",
        item.email || item.phone || item.profileUrl || item.website || item.productUrl || ""
      ].filter(Boolean);
      
      const key = keyParts.join("|").toLowerCase();
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      
      items.push(item);
      if (items.length >= 100) break;
    }

    return {
      page: {
        url: location.href,
        title: document.title,
        platform,
        dataType: effectiveType,
        capturedAt: new Date().toISOString(),
        itemCount: items.length
      },
      items
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === "COLLECT_CANDIDATES") {
      try {
        const dataType = message.dataType || "auto";
        const data = collectCandidates(dataType);
        sendResponse({ ok: true, data });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
      return true;
    }
    return false;
  });
})();
