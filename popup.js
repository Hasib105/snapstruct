const KEY_STORAGE = "gemini_api_key_local";
const MODEL_STORAGE = "gemini_model_local";
const SEARCH_STATE_STORAGE = "last_search_state_v1";
const DEFAULT_COMMAND = "scrape all leads";

const apiKeyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const commandEl = document.getElementById("command");
const scrapeBtn = document.getElementById("scrapeBtn");
const refreshBtn = document.getElementById("refreshBtn");
const resetBtn = document.getElementById("resetBtn");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");

let latestResult = null;

function setStatus(text) {
  statusEl.textContent = text;
}

function setExportButtonsEnabled(enabled) {
  downloadJsonBtn.disabled = !enabled;
  downloadCsvBtn.disabled = !enabled;
}

function commandIntent(command) {
  const normalized = (command || "").toLowerCase();
  
  // Leads / People / Contacts
  if (/(lead|leads|people|person|persons|contact|contacts|founder|ceo|executive|professionals?)/i.test(normalized)) {
    return "leads";
  }
  // Products
  if (/(product|products|ecom|item|items|listing|listings)/i.test(normalized)) {
    return "products";
  }
  // Companies / Businesses
  if (/(company|companies|business|businesses|firm|firms|organization|organizations|startup|startups)/i.test(normalized)) {
    return "companies";
  }
  // Customers / Orders
  if (/(customer|customers|order|orders|buyer|buyers|client|clients)/i.test(normalized)) {
    return "customers";
  }
  // Jobs
  if (/(job|jobs|position|positions|career|careers|opening|openings|vacancy|vacancies)/i.test(normalized)) {
    return "jobs";
  }
  
  return "leads"; // Default to leads for LinkedIn-style pages
}

function getFieldsForIntent(intent) {
  switch (intent) {
    case "leads":
      return ["name", "title", "company", "email", "phone", "location", "linkedinUrl", "twitterUrl", "website", "followers"];
    case "products":
      return ["title", "price", "originalPrice", "rating", "reviews", "availability", "image", "productUrl"];
    case "companies":
      return ["companyName", "address", "phone", "email", "website", "rating", "reviews", "industry"];
    case "customers":
      return ["name", "email", "phone", "address", "orderId", "date", "amount"];
    case "jobs":
      return ["jobTitle", "company", "location", "salary", "jobType", "posted", "jobUrl"];
    default:
      return ["title", "text", "phone", "email", "price", "rating", "location", "website"];
  }
}

function buildPrompt(intent, payload, command) {
  const targetFields = getFieldsForIntent(intent);
  const platform = payload?.page?.platform || "generic";

  return `You are a data extraction engine specialized in extracting structured data from web pages.

User Command: "${command}"
Detected Intent: ${intent}
Source Platform: ${platform}
Page URL: ${payload?.page?.url || "unknown"}

TASK:
Extract ALL relevant ${intent} from the provided candidate data. Be thorough - capture every valid record.

EXTRACTION RULES:
1. Extract ONLY data that exists in the candidates - never invent or hallucinate information
2. For each record, fill in as many fields as possible from the source data
3. Use empty string "" for unknown/missing fields
4. Clean and normalize data (trim whitespace, fix obvious formatting issues)
5. Remove duplicates based on primary identifiers (name+company for leads, title+price for products)
6. Keep ALL valid records - do not filter out entries with partial data

FIELD MAPPINGS FOR ${intent.toUpperCase()}:
${targetFields.map(f => `- ${f}: Extract from candidate data if available`).join("\n")}

SPECIAL INSTRUCTIONS FOR ${platform.toUpperCase()}:
${platform === "linkedin" ? `
- Extract full name from profile titles
- Parse "Title at Company" patterns
- Capture follower counts (e.g., "710+ followers")
- Extract location (City, State/Country)
- Get LinkedIn profile URLs
` : ""}
${platform === "google_search" ? `
- Extract business names from result titles
- Parse addresses and phone numbers from snippets
- Get website URLs from result links
` : ""}

OUTPUT FORMAT (STRICT JSON - no markdown, no explanation):
{
  "intent": "${intent}",
  "platform": "${platform}",
  "detectedFields": ${JSON.stringify(targetFields)},
  "records": [
    { /* one object per extracted ${intent.slice(0, -1) || "record"} */ }
  ],
  "totalExtracted": <number>,
  "confidence": <0.0-1.0>
}

CANDIDATE DATA:
${JSON.stringify(payload, null, 0).slice(0, 120000)}
`;
}

function parseJsonFromText(text) {
  const clean = (text || "").trim();
  try {
    return JSON.parse(clean);
  } catch (_e) {
    const fenceMatch = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch?.[1]) {
      return JSON.parse(fenceMatch[1]);
    }
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(clean.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Could not parse JSON from model response.");
  }
}

function fallbackStructure(intent, candidates) {
  const items = candidates?.items || [];
  const targetFields = getFieldsForIntent(intent);
  
  const records = items.slice(0, 60).map((item) => {
    const record = {};
    
    // Map candidate fields to target fields based on intent
    switch (intent) {
      case "leads":
        record.name = item.name || item.title || "";
        record.title = item.title || "";
        record.company = item.company || "";
        record.email = item.email || "";
        record.phone = item.phone || item.phoneGuess || "";
        record.location = item.location || "";
        record.linkedinUrl = item.linkedinUrl || item.profileUrl || "";
        record.twitterUrl = item.twitterUrl || "";
        record.website = item.website || item.websiteGuess || "";
        record.followers = item.followers || "";
        break;
        
      case "products":
        record.title = item.title || "";
        record.price = item.price || item.priceGuess || "";
        record.originalPrice = item.originalPrice || "";
        record.rating = item.rating || item.ratingGuess || "";
        record.reviews = item.reviews || "";
        record.availability = item.availability || "";
        record.image = item.image || item.imageGuess || "";
        record.productUrl = item.productUrl || item.websiteGuess || "";
        break;
        
      case "companies":
        record.companyName = item.companyName || item.title || "";
        record.address = item.address || item.addressGuess || "";
        record.phone = item.phone || item.phoneGuess || "";
        record.email = item.email || "";
        record.website = item.website || item.websiteGuess || "";
        record.rating = item.rating || item.ratingGuess || "";
        record.reviews = item.reviews || "";
        record.industry = item.industry || "";
        break;
        
      case "customers":
        record.name = item.name || item.title || "";
        record.email = item.email || "";
        record.phone = item.phone || item.phoneGuess || "";
        record.address = item.address || item.addressGuess || "";
        record.orderId = item.orderId || "";
        record.date = item.date || "";
        record.amount = item.amount || item.priceGuess || "";
        break;
        
      case "jobs":
        record.jobTitle = item.jobTitle || item.title || "";
        record.company = item.company || "";
        record.location = item.location || "";
        record.salary = item.salary || "";
        record.jobType = item.jobType || "";
        record.posted = item.posted || "";
        record.jobUrl = item.jobUrl || item.websiteGuess || "";
        break;
        
      default:
        record.title = item.title || "";
        record.text = item.text || item.description || "";
        record.phone = item.phone || item.phoneGuess || "";
        record.email = item.email || "";
        record.price = item.price || item.priceGuess || "";
        record.rating = item.rating || item.ratingGuess || "";
        record.location = item.location || "";
        record.website = item.website || item.websiteGuess || "";
    }
    
    return record;
  });

  // Filter out empty records
  const validRecords = records.filter(record => {
    const values = Object.values(record).filter(v => v && String(v).trim());
    return values.length >= 2; // At least 2 non-empty fields
  });

  return {
    intent,
    platform: candidates?.page?.platform || "generic",
    detectedFields: targetFields,
    records: validRecords,
    totalExtracted: validRecords.length,
    confidence: 0.4
  };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) throw new Error("No active tab found.");
  return tabs[0];
}

async function collectFromCurrentPage(tabId, dataType) {
  const response = await chrome.tabs.sendMessage(tabId, { action: "COLLECT_CANDIDATES", dataType });
  if (!response?.ok) {
    throw new Error(response?.error || "Failed to collect candidates from page.");
  }
  return response.data;
}

async function callGemini({ apiKey, model, prompt }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      topP: 0.95,
      maxOutputTokens: 4096,
      responseMimeType: "application/json"
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
  if (!text) {
    throw new Error("Gemini returned empty response.");
  }
  return parseJsonFromText(text);
}

function renderPreview(result) {
  const records = result?.records || [];
  if (!records.length) {
    previewEl.innerHTML = "<p style='padding:10px'>No records found.</p>";
    return;
  }

  const cols = Array.from(
    records.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );

  const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const rows = records
    .slice(0, 20)
    .map((row) => `<tr>${cols.map((c) => `<td>${escapeHtml(String(row[c] ?? ""))}</td>`).join("")}</tr>`)
    .join("");

  previewEl.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toCsv(records) {
  if (!records.length) return "";
  const cols = Array.from(
    records.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );

  const escapeCsv = (value) => {
    const s = String(value ?? "");
    if (/[",\n]/.test(s)) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };

  const lines = [cols.join(",")];
  for (const row of records) {
    lines.push(cols.map((c) => escapeCsv(row[c])).join(","));
  }
  return lines.join("\n");
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
}

async function saveLocalSettings() {
  const payload = {
    [KEY_STORAGE]: apiKeyEl.value.trim(),
    [MODEL_STORAGE]: modelEl.value.trim() || "gemini-3.1-flash-lite-preview"
  };
  await chrome.storage.local.set(payload);
}

async function loadLocalSettings() {
  const data = await chrome.storage.local.get([KEY_STORAGE, MODEL_STORAGE]);
  if (data[KEY_STORAGE]) apiKeyEl.value = data[KEY_STORAGE];
  if (data[MODEL_STORAGE]) modelEl.value = data[MODEL_STORAGE];
}

async function saveSearchState({ statusText } = {}) {
  const payload = {
    [SEARCH_STATE_STORAGE]: {
      command: commandEl.value.trim() || DEFAULT_COMMAND,
      result: latestResult,
      statusText: statusText || statusEl.textContent || "Ready.",
      savedAt: new Date().toISOString()
    }
  };
  await chrome.storage.local.set(payload);
}

async function loadSearchState() {
  const data = await chrome.storage.local.get([SEARCH_STATE_STORAGE]);
  const saved = data?.[SEARCH_STATE_STORAGE];
  if (!saved) return;

  if (saved.command) {
    commandEl.value = saved.command;
  }

  if (saved.result?.records?.length) {
    latestResult = saved.result;
    renderPreview(saved.result);
    setExportButtonsEnabled(true);
  }

  if (saved.statusText) {
    setStatus(`Restored: ${saved.statusText}`);
  }
}

async function clearSearchState() {
  await chrome.storage.local.remove([SEARCH_STATE_STORAGE]);
}

async function handleScrape() {
  const apiKey = apiKeyEl.value.trim();
  const model = modelEl.value.trim() || "gemini-3.1-flash-lite-preview";
  const command = commandEl.value.trim() || DEFAULT_COMMAND;
  const intent = commandIntent(command);

  if (!apiKey) {
    setStatus("Please enter Gemini API key first.");
    return;
  }

  scrapeBtn.disabled = true;
  refreshBtn.disabled = true;
  resetBtn.disabled = true;
  setExportButtonsEnabled(false);

  try {
    await saveLocalSettings();

    setStatus(`Scanning page for ${intent}...`);
    const tab = await getActiveTab();
    const candidates = await collectFromCurrentPage(tab.id, intent);

    const platform = candidates?.page?.platform || "generic";
    setStatus(`Found ${candidates?.items?.length || 0} candidates on ${platform}. Processing with AI...`);
    const prompt = buildPrompt(intent, candidates, command);

    let structured;
    try {
      structured = await callGemini({ apiKey, model, prompt });
    } catch (modelError) {
      setStatus(`AI processing failed, using fallback. Reason: ${modelError.message}`);
      structured = fallbackStructure(intent, candidates);
    }

    const finalResult = {
      meta: {
        ...candidates.page,
        command,
        intent
      },
      ...structured
    };

    latestResult = finalResult;
    renderPreview(finalResult);

    const count = finalResult.records?.length || 0;
    const message = `✓ Extracted ${count} ${intent}. Platform: ${platform}. Confidence: ${(finalResult.confidence * 100).toFixed(0)}%`;
    setStatus(message);
    await saveSearchState({ statusText: message });

    setExportButtonsEnabled(count > 0);
  } catch (error) {
    const message = `Error: ${error.message || String(error)}`;
    setStatus(message);
    await saveSearchState({ statusText: message });
  } finally {
    scrapeBtn.disabled = false;
    refreshBtn.disabled = false;
    resetBtn.disabled = false;
  }
}

async function handleRefresh() {
  if (scrapeBtn.disabled) return;
  commandEl.value = commandEl.value.trim() || DEFAULT_COMMAND;
  await handleScrape();
}

async function handleReset() {
  latestResult = null;
  commandEl.value = DEFAULT_COMMAND;
  previewEl.innerHTML = "";
  setExportButtonsEnabled(false);
  setStatus("State cleared. Start a new scrape.");
  await clearSearchState();
  await saveSearchState({ statusText: "State cleared. Start a new scrape." });
}

async function saveCommandDraft() {
  await saveSearchState();
}

async function initPopup() {
  await loadLocalSettings();
  await loadSearchState();

  if (!latestResult?.records?.length) {
    setExportButtonsEnabled(false);
  }
}

scrapeBtn.addEventListener("click", handleScrape);
refreshBtn.addEventListener("click", () => {
  handleRefresh().catch((error) => {
    setStatus(`Error: ${error.message || String(error)}`);
  });
});

resetBtn.addEventListener("click", () => {
  handleReset().catch((error) => {
    setStatus(`Error: ${error.message || String(error)}`);
  });
});

downloadJsonBtn.addEventListener("click", () => {
  if (!latestResult) return;
  const stamp = new Date().toISOString().replaceAll(":", "-");
  downloadTextFile(`scrape-${stamp}.json`, JSON.stringify(latestResult, null, 2), "application/json");
});

downloadCsvBtn.addEventListener("click", () => {
  if (!latestResult?.records?.length) return;
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const csv = toCsv(latestResult.records);
  downloadTextFile(`scrape-${stamp}.csv`, csv, "text/csv");
});

apiKeyEl.addEventListener("change", saveLocalSettings);
modelEl.addEventListener("change", saveLocalSettings);
commandEl.addEventListener("change", () => {
  saveCommandDraft().catch((error) => {
    setStatus(`Warning: could not save command state: ${error.message}`);
  });
});

initPopup().catch((error) => {
  setStatus(`Warning: could not load session settings: ${error.message}`);
});
