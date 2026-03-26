const KEY_STORAGE = "gemini_api_key_session";
const MODEL_STORAGE = "gemini_model_session";
const SEARCH_STATE_STORAGE = "last_search_state_v1";
const DEFAULT_COMMAND = "scrape all companies";

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
  if (/(product|products|ecom|item|items)/i.test(normalized)) {
    return "products";
  }
  if (/(company|companies|business|businesses|firm|firms)/i.test(normalized)) {
    return "companies";
  }
  return "companies";
}

function buildPrompt(intent, payload, command) {
  const targetFields =
    intent === "products"
      ? ["title", "price", "image", "rating", "website"]
      : ["company_name", "address", "phone", "website"];

  return `You are an extraction engine.
User command: ${command}
Intent: ${intent}

Task:
1) Read the candidate items from current webpage.
2) Produce clean structured records.
3) Keep only meaningful records.
4) If a field is unknown, use empty string.
5) Do not hallucinate data not present in candidates.

Expected output format: STRICT JSON only, no markdown.
Schema:
{
  "intent": "${intent}",
  "detectedFields": ${JSON.stringify(targetFields)},
  "records": [
    {}
  ],
  "confidence": 0.0
}

Candidates JSON:
${JSON.stringify(payload).slice(0, 120000)}
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
  const records = (candidates?.items || []).slice(0, 40).map((item) => {
    if (intent === "products") {
      return {
        title: item.title || "",
        price: item.priceGuess || "",
        image: item.imageGuess || "",
        rating: item.ratingGuess || "",
        website: item.websiteGuess || ""
      };
    }
    return {
      company_name: item.title || "",
      address: item.addressGuess || "",
      phone: item.phoneGuess || "",
      website: item.websiteGuess || ""
    };
  });

  return {
    intent,
    detectedFields: intent === "products" ? ["title", "price", "image", "rating", "website"] : ["company_name", "address", "phone", "website"],
    records,
    confidence: 0.35
  };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) throw new Error("No active tab found.");
  return tabs[0];
}

async function collectFromCurrentPage(tabId) {
  const response = await chrome.tabs.sendMessage(tabId, { action: "COLLECT_CANDIDATES" });
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

async function saveSessionSettings() {
  const payload = {
    [KEY_STORAGE]: apiKeyEl.value.trim(),
    [MODEL_STORAGE]: modelEl.value.trim() || "gemini-3.1-flash-lite-preview"
  };
  await chrome.storage.session.set(payload);
}

async function loadSessionSettings() {
  const data = await chrome.storage.session.get([KEY_STORAGE, MODEL_STORAGE]);
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
    await saveSessionSettings();

    setStatus("Reading DOM from current page...");
    const tab = await getActiveTab();
    const candidates = await collectFromCurrentPage(tab.id);

    setStatus(`DOM captured (${candidates?.items?.length || 0} candidates). Running Gemini...`);
    const prompt = buildPrompt(intent, candidates, command);

    let structured;
    try {
      structured = await callGemini({ apiKey, model, prompt });
    } catch (modelError) {
      setStatus(`Gemini failed, using fallback parser. Reason: ${modelError.message}`);
      structured = fallbackStructure(intent, candidates);
    }

    const finalResult = {
      meta: candidates.page,
      ...structured
    };

    latestResult = finalResult;
    renderPreview(finalResult);

    const count = finalResult.records?.length || 0;
    const message = `Done. Extracted ${count} records as structured table + JSON. Intent: ${finalResult.intent}.`;
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
  await loadSessionSettings();
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

apiKeyEl.addEventListener("change", saveSessionSettings);
modelEl.addEventListener("change", saveSessionSettings);
commandEl.addEventListener("change", () => {
  saveCommandDraft().catch((error) => {
    setStatus(`Warning: could not save command state: ${error.message}`);
  });
});

initPopup().catch((error) => {
  setStatus(`Warning: could not load session settings: ${error.message}`);
});
