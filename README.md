# Page Scraper AI (Extension-only)

Chrome extension that scrapes the current page directly from DOM, then uses Gemini to structure data.

## What it does

- No Playwright, no backend
- Works on current tab only
- User enters Gemini API key in popup
- API key is stored in extension session storage (cleared after browser restart)
- Exports structured data as JSON or CSV

## Supported command style

- `sob company scrape koro`
- `sob product scrape koro`

The extension maps command to intent:

- companies: company name, address, phone, website
- products: title, price, image, rating, website

## Files

- `manifest.json`: MV3 config and permissions
- `content.js`: collects repeated card-like DOM candidates
- `popup.js`: command handling, Gemini call, fallback parser, export
- `popup.html` + `popup.css`: UI

## Run locally

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder
4. Open any listing page (company list, ecommerce category page)
5. Open extension popup
6. Enter Gemini API key
7. Click **Scrape Current Page**
8. Download JSON/CSV

## Notes

- Some websites block content scripts or load data lazily. In that case scroll first, then scrape.
- If Gemini fails, extension uses fallback parser so you still get structured output.
