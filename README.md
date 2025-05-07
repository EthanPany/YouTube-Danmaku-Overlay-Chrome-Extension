# **Project Plan: YouTube Danmaku Overlay Chrome Extension**

Here’s a hands‑on implementation sequence. For each step, you’ll pull in the minimal template/code you need, build one piece at a time, and verify it works before moving on.



------





## **1. Prep your dev environment**





- **Install Node.js & npm** (v16+).
- **Clone a Chrome‑extension + React starter** (e.g. [chrome-extension-react-boilerplate](https://github.com/lxieyang/chrome-extension-boilerplate-react) or your preferred repo):



```
git clone https://github.com/lxieyang/chrome-extension-boilerplate-react.git bili-youtube-danmaku
cd bili-youtube-danmaku
npm install
```



- 
- **Open** the folder in your IDE (VS Code, etc.).





------





## **2. Configure** 

## **manifest.json**





- In public/manifest.json (or root), set:



```
{
  "manifest_version": 3,
  "name": "YouTube→B站弹幕",
  "version": "0.1.0",
  "content_scripts":[
    {
      "matches":["https://www.youtube.com/watch*"],
      "js":["static/js/contentScript.js"],
      "run_at":"document_idle"
    }
  ],
  "host_permissions":[
    "https://api.bilibili.com/*",
    "https://*.bilibili.com/*"
  ]
}
```



- 
- Remove any unused permissions or pages from the boilerplate.





------





## **3. Wire up your content script**





- In src/contentScript.js, stub out a simple log to verify it loads:



```
console.log("🍥 bili-danmaku content script loaded");
```



- 

- **Build & Load** into Chrome:

  

  1. npm run build
  2. In Chrome’s Extensions → “Load unpacked” → select your build/ folder.
  3. Open any YouTube watch page → check DevTools console for your 🍥 log.

  





------





## **4. YouTube metadata extractor**





- In contentScript.js, locate the <meta property="og:title"> tag and the <video> element:



```
const title = document.querySelector('meta[property="og:title"]').content;
const videoEl = document.querySelector('video');
const duration = videoEl?.duration;
console.log({ title, duration });
```



- 
- Reload and verify you see proper title & duration in console.





------



\## 5. Bilibili search module



- Create a new file src/bilibili.js exporting async function searchBili(keyword) { … }.
- Inside, fetch("https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword="+encodeURIComponent(keyword), { headers:{ /* dummy cookies if needed*/ } }).
- Parse JSON, return top 5 results (id, title, pic, duration).
- In contentScript.js, call searchBili(title) and log results. Verify in console you get B站 data.





------



\## 6. Matching logic



- In src/match.js, write a simple similarity function (e.g. normalized Levenshtein or Jaro‑Winkler; you can use [string-similarity](https://www.npmjs.com/package/string-similarity)).
- In contentScript.js, feed the search results through your matcher, compare durations (±5s), pick the first that scores ≥0.8.
- Log “Match found:” or “No match” so you can see it working.





------



\## 7. Popup UI with React



- In src/components/Popup.jsx, build a small React component showing thumbnail, title, author, date, and a “Show Danmaku” button.
- In src/contentScript.js, when a match is found, inject a <div id="bili-root"></div> into the YouTube player container, then mount React there:



```
import React from "react";
import ReactDOM from "react-dom/client";
import Popup from "./components/Popup";
// ...
const container = document.createElement("div");
container.id = "bili-root";
document.querySelector('#movie_player').appendChild(container);
ReactDOM.createRoot(container).render(<Popup data={matchData} />);
```



- 
- Verify the UI appears on matched videos.





------



\## 8. Danmaku fetch & parse



- In bilibili.js, add async function fetchDanmaku(cid) { … } that:

  

  1. GET https://comment.bilibili.com/${cid}.xml
  2. new DOMParser().parseFromString(responseText, "text/xml")
  3. Extract all <d> elements with mode=1, map to { time, text }.

  

- Test it by wiring it to your React button: on click, call fetchDanmaku, log first 10 comments.





------



\## 9. CommentCoreLibrary integration



- Install CCL: npm install comment-core-library.
- In your overlay component (e.g. src/components/Overlay.jsx):



```
import {CommentManager} from 'comment-core-library';
// on mount:
const cm = new CommentManager(overlayDiv);
cm.init();
cm.load(danmakuArray.map(c=>({stime:c.time*1000, text:c.text, mode:1})));
```



- 
- Overlay Div: inject a full‑screen absolute <div> over the video with pointer-events:none.
- Verify dummy comments appear by manually sending one via cm.send({stime:0, mode:1, text:'Hello'});.





------



\## 10. Playback sync



- In Overlay.jsx or content script, set up a **poller** or hook into <video>:



```
const video = document.querySelector('video');
video.addEventListener('play', ()=>cm.start());
video.addEventListener('pause', ()=>cm.pause());
video.addEventListener('seeked', ()=>cm.time(video.currentTime*1000));
video.addEventListener('timeupdate', ()=>cm.time(video.currentTime*1000));
```



- 
- Confirm comments align with playback: play, pause, seek.





------



\## 11. Toggle & cleanup



- In your Popup component, toggle a prop like overlayActive.
- When toggled off, call cm.clear() and unmount or hide the Overlay component.
- Ensure event listeners are removed on unmount to avoid leaks.





------



\## 12. Final polish & testing



- **Test** against several videos (matches and non‑matches).
- **Adjust CSS** for popup placement so it doesn’t block YouTube controls.
- **Handle SPA navigation** on YouTube by detecting URL changes (e.g. history.pushState override or popstate listener) and reset your state/UI.
- **Build** your final bundle (npm run build), load as unpacked, and verify end‑to‑end.





------





### **Summary of Implementation Steps**





1. **Clone & install** a React + Chrome‑extension starter.
2. **Set up** manifest.json with content script and host permissions.
3. **Verify** your content script runs on YouTube.
4. **Extract** video title/duration from the page.
5. **Implement** Bilibili search module; fetch & log results.
6. **Write** matching logic (title similarity + duration).
7. **Build** the React popup UI and inject it.
8. **Fetch & parse** danmaku XML from Bilibili.
9. **Integrate** CommentCoreLibrary for rendering.
10. **Sync** comments with playback via video events.
11. **Add** toggle/hide functionality and cleanup.
12. **Polish** CSS, handle navigation, and test across scenarios.





## **1. Project Structure and Required Modules**

The Chrome extension will be organized into modular components to separate concerns and simplify development. At a high level, it will consist of a **Manifest V3** configuration, a content script (with embedded React UI), and (optionally) a background service worker for network requests or shared state. Key parts of the project structure include:



- **Manifest (manifest.json):** Defines extension metadata and permissions. It will specify manifest_version: 3, content script details, and any needed host permissions and privileges. For example, we will include a content script entry matching YouTube video URLs and host permissions for Bilibili’s API domains  . The manifest may also declare an extension icon and an optional options page for user settings (e.g. to adjust the matching threshold).

- **Content Script (YouTube Integrator):** This is the core script injected into YouTube video pages. It will run on normal (non-live) video watch pages (matching URL pattern https://www.youtube.com/watch*v=*). The content script is responsible for extracting YouTube metadata, searching Bilibili, injecting the UI, and orchestrating the danmaku overlay. We will build this as a React-based module for ease of UI management. The content script bundle may be structured into sub-modules:

  

  - *YouTube Metadata Module:* Extracts the video’s title, description, and possibly video ID or duration from the YouTube page. This can parse Open Graph meta tags (e.g. <meta property="og:title" content="..."> and <meta property="og:description" content="..."> in the page HTML ) or use the DOM (e.g. document.title). It will also obtain available title translations if possible (more on this in the matching algorithm section).
  - *Bilibili API Module:* Handles searching for videos on Bilibili and retrieving video details and danmaku comments. This module will construct queries to Bilibili’s search API and handle the required cookies/headers, then parse the JSON results. It will also fetch Bilibili video info (for the comment ID, *cid*) and retrieve the danmaku XML or other format.
  - *Matching & Logic Module:* Contains the logic to compare YouTube metadata with Bilibili results (title similarity, duration check, etc.) and decide if a match is confident. It will implement the threshold logic and return the best match (or none).
  - *UI Components:* One React component for the **popup/notification** (showing the Bilibili video info and “Show Danmaku” button) and another for the **danmaku overlay** (the floating comments over the video). These components will be injected into the YouTube page’s DOM.
  - *Danmaku Renderer:* A utility (or third-party library) to render scrolling comments. We plan to use an existing open-source library like **CommentCoreLibrary (CCL)** to manage timed comment rendering on an HTML5 video , which prevents reinventing the wheel. This will handle creating comment elements, animating them from right to left, and avoiding overlap.

  

- **Background Service Worker (optional):** In Manifest V3, if needed, a background script (service worker) can perform cross-domain network requests or maintain global settings. We intend to keep logic in the content script where possible. However, if Bilibili API calls face cross-origin restrictions, the background could be used to proxy those requests (with appropriate permissions). The background could also store user preferences (like threshold or toggling features) via Chrome’s storage API. If not needed for network requests, we may omit the background and use the content script alone (since content scripts with host permissions can often fetch data directly).

- **Assets and Libraries:** The project will include any required assets such as icons and might bundle minified libraries (React, CommentCoreLibrary, etc.). React will be bundled into the content script code (likely using a build tool like webpack or Vite for a production-ready bundle). We will also include CSS for styling the popup and danmaku (either as separate content script CSS or in JS via styled-components or similar). The CommentCoreLibrary (if used) can be included via npm and bundled, or loaded via CDN if acceptable.





The directory structure could look like:

```
/extension
  ├─ manifest.json
  ├─ background.js  (service worker, if used)
  ├─ content/
  │    ├─ contentScript.js (bundled React app entry)
  │    ├─ components/ (React components for UI)
  │    ├─ youtube.js (metadata extraction logic)
  │    ├─ bilibili.js (API interaction logic)
  │    └─ match.js (matching algorithm logic)
  └─ assets/
       └─ icon.png
```

Each module will be clearly separated but integrated through the content script. By organizing into these modules, we ensure the code is maintainable and each piece can be developed and tested in isolation. For instance, the Bilibili API module can be tested with sample inputs (video titles) to see if it returns correct candidate matches, and the UI components can be developed using React dev tools before integration.





## **2. Matching Algorithm Design (Video Metadata Matching)**





**Data selection for matching:** To identify the corresponding Bilibili video for a given YouTube video, the extension will leverage key metadata from the YouTube page:



- The video’s **title** (primary title in YouTube, typically in the original upload language).
- The video’s **description** or keywords (to use if titles are generic or require additional context).
- Any **available title translations** that the YouTube video may provide. YouTube allows creators to add translated titles for other languages. If a Chinese title is available (since Bilibili is a Chinese platform), it would be very useful for matching. The extension can attempt to detect if a translated title in Chinese exists (though obtaining this may require either the YouTube Data API or parsing the page’s structured data if present; this is an optional enhancement).
- The video’s **duration** as a secondary factor (length in seconds). A matching Bilibili re-upload should have a nearly identical runtime, which we can use as a confidence check.





**Bilibili search query construction:** The simplest approach is to use the YouTube title as the search keyword on Bilibili. We will start with the original title (e.g. an English title). If that yields no good match, and if we have a translated title (say in Chinese), we can try that as an alternate query. In cases where the YouTube title is very generic or too long, we might consider using a portion of it or filtering out terms like episode numbers, etc., but initially a direct query should suffice. We will call Bilibili’s video search API with the keyword. For example, using the endpoint https://api.bilibili.com/x/web-interface/search/type with parameters like search_type=video and keyword=<YouTubeTitle> will return JSON results .



**Parsing and scoring search results:** The Bilibili search API will return a list of candidate videos. We will examine the top results and score them against the YouTube video’s metadata:



- **Title similarity:** We will compute a similarity score between the YouTube title and each Bilibili video title. This can be done using a string similarity metric such as Jaro-Winkler or Levenshtein distance (normalized) . For instance, Jaro-Winkler gives a similarity between 0 (no similarity) and 1 (exact match) . We will normalize titles by lowercasing and removing punctuation or irrelevant tokens before comparison. If a Bilibili title is in Chinese, but includes the English title in parentheses or description (which often happens for popular videos), the algorithm will catch the English part. If the titles are in different languages entirely, pure string similarity may fail – in such cases, having the translated title or using an external translation of the YouTube title to Chinese could help (this is noted for future improvement).
- **Duration match:** We will retrieve the duration of the YouTube video (e.g. using the HTML5 video element or YouTube API) and compare it to the duration reported by Bilibili for that video. Bilibili’s search results include a duration field (format “MM:SS” or “HH:MM:SS”) , which we can parse into seconds. If the durations are nearly equal (for example, within a few seconds difference), that significantly boosts confidence that it’s the same content. If a top result has a very different length (say half the duration), it’s likely not the correct match even if titles are similar. We will define a tolerance (perhaps 5% of the total length or a fixed ~5s difference to account for slight edits or intro/outro differences).
- **Other metadata:** We can also consider the upload date or author. For example, if the YouTube video was published on a certain date and the Bilibili video was published much later (which is common for re-uploads), that is expected. The Bilibili author might be unrelated to the YouTube channel (often a fan uploader), so author name matching likely won’t help. However, if the Bilibili video’s description contains the YouTube channel name or a credit to the original, that is a sign – checking that could be complex, so we will not rely on it for automated matching in the initial design. Instead, we focus on title and duration.





**Threshold logic:** We will define a confidence threshold to decide if a match is “good enough” to show to the user. The threshold will be configurable (perhaps via an options page or a constant that advanced users can edit). For example, we might require the title similarity to be above 0.8 (80%) and the duration to match within 5%. We can combine factors into a single confidence score or use a short-circuit logic (e.g., “if similarity > X *and* duration within Y%, consider it a match”). If the top search result meets the criteria, we proceed with that. If no result is confident, the extension will **not display anything**, to avoid false positives (the user should not see an irrelevant popup for unrelated content).



To illustrate, suppose the YouTube video title is “Amazing Science Experiment Compilation”. If a Bilibili search returns a video titled “【科普】Amazing Science Experiment Compilation (中文字幕)” by some user, and the length is the same 10:05, the similarity score would be very high (perhaps >0.9) and durations match 100%, so it clears the threshold. On the other hand, if the closest result was “Amazing Science Experiment **Part 2**” with a length off by several minutes, the title similarity might be moderate and duration mismatch, so we would skip it (no popup shown).



If multiple Bilibili results are very similar in score (e.g., if the video has been reuploaded by several users), we will pick the top one (assuming Bilibili’s own ranking by relevance or views will put the best candidate first). In future, we might refine this to prefer, say, the upload with the most views or the earliest upload, but initially, the first match that meets criteria will be used.



**Configurable parameters:** The matching threshold (similarity cutoff) and possibly whether to require duration match can be configurable. For v1, these can be constants in the code (e.g., TITLE_SIM_THRESHOLD = 0.8). We will document these and potentially expose them via a simple options UI if needed.



**Fallback behavior:** In cases where the primary search doesn’t yield a confident match, the extension can try a second strategy **before giving up**: for example, if the YouTube video’s language is not English, we could attempt to translate the title into Chinese (using a translation API or a built-in dictionary) and search again. However, to keep things lightweight and avoid API usage, this will likely be a future improvement. Initially, if no match is found on direct search, the extension will quietly do nothing (the user will not see any UI in this case).



To summarize, the matching algorithm will take the YouTube video metadata as input and output either a matched Bilibili video (with its details) or a null result. It uses a combination of fuzzy title matching and duration checking to ensure confidence. This approach balances accuracy with simplicity, leveraging the assumption that an identical video will have very similar title and runtime on both platforms.





## **3. Bilibili and YouTube APIs (Data Sources, Limitations, Workarounds)**





In this section, we outline the external interfaces we’ll use for data and the considerations in using them without requiring user login tokens.



**YouTube Data Access:** We avoid using the official YouTube Data API (which would require an API key or OAuth token) and instead rely on data already present on the YouTube page and the YouTube player:



- The **YouTube page HTML** provides metadata such as the title, description, and thumbnails via Open Graph tags. As an example, a YouTube video page’s HTML contains lines like: <meta property="og:title" content="OMFG - Hello"> and <meta property="og:description" content="..."> . The content script can read these directly from the DOM. This gives us the title (and potentially the description if needed for additional context).
- The YouTube page also includes the video ID in the URL itself (v= parameter). We will parse that if needed (for instance, to use YouTube’s player API).
- **YouTube IFrame Player API:** We will use YouTube’s IFrame JavaScript API in a limited capacity to sync playback (discussed in Section 6). Notably, this API can also retrieve certain video info. For example, player.getDuration() returns the video’s length in seconds  and player.getVideoUrl() returns the video’s URL . The IFrame API’s getVideoData() method can provide the video title and author as well, but since we already have the title from the page, we may not need to call that. Using the IFrame API on a youtube.com page requires injecting the API script (from youtube.com/iframe_api) and creating a player object. We must be careful not to conflict with YouTube’s own player – we will likely instantiate a lightweight, **hidden** iframe player solely to tap into the API, or attempt to attach to the existing player element (if possible). The details are discussed in the synchronization section. The key point is that the IFrame API does not require any user auth and is designed for client-side use, so it aligns with our “no user token” requirement.
- **HTML5 Video Element:** Alternatively or additionally, the content script can interact directly with the HTML5 video element on the page (YouTube’s player uses an <video> tag under the hood for HTML5 playback). The content script can find document.querySelector('video') and read properties like .duration and .currentTime, or attach event listeners to it. This is a more direct way to get playback info without even loading the IFrame API. We will consider this approach as a fallback if the IFrame API integration proves complex on YouTube’s own site. Accessing the video element is possible because the content script runs in the context of the page (and YouTube does not deliberately sandbox the video element from scripts). This means we can get the duration (same value as getDuration() would give) and listen to timeupdate events from the video element. Both methods are viable; we will choose the one that is simplest and most reliable.





**Bilibili Search API:** Bilibili provides a web API for searching videos, but it has some anti-scraping measures. We will use the **public web search API endpoint**:

```
https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=<query>
```

This returns a JSON object containing search results. Each result includes fields like title, video URL (arcurl), thumbnail image URL, author name, publication date (as a Unix timestamp), duration, etc.  . We will parse these fields to gather candidate matches. Crucially, as of an update in 2022, Bilibili’s search API requires certain cookies or it may reject the request with an HTTP 412 error (to deter bots) . Since our extension operates without logging into Bilibili, we have to work around this:



- We will include some **dummy cookies/headers** known to satisfy Bilibili’s checks. For example, the open-source SearxNG engine sets cookies like buvid3 with a random value, i-wanna-go-back=-1, etc., to emulate a normal browser request . We can replicate that approach. Essentially, before making the search API call, the extension can perform a preliminary request to https://www.bilibili.com to obtain some cookies, or simply attach pre-defined cookie values in the request header (using the fetch API with credentials). Because our extension has permission for Bilibili’s domain, it can set the Cookie header in a programmatic request. We will try the simpler method: include a set of cookies as identified by other projects (like SearxNG) to avoid the -412 block . This should make the search request appear legitimate enough to get a response.
- No user token or auth is needed for general searches. We just need to ensure our requests mimic a normal browser. We will also send a proper User-Agent string (likely the default Chrome UA or a close variant) and possibly a referer if needed (some Bilibili endpoints might check referer). These details can be adjusted if we encounter issues during testing.





**Bilibili Video Details API:** Once we identify a candidate Bilibili video (or its ID), we need the **cid** (comment ID) to fetch danmaku comments. Bilibili uses two main identifiers for videos: the older numeric **AV** ID and the newer **BV** ID (an alphanumeric code starting with “BV”). The search API might return an aid (AV ID) and/or we can extract the BV ID from the URL. We can use either to get details. Bilibili has an API endpoint:

```
https://api.bilibili.com/x/web-interface/view?bvid=<BV_ID>
```

(or ?aid=<AV_ID>) which returns a JSON with detailed info . This includes the title, description, uploader, and a list of video parts with their cids. For a single-part video, it will be just one cid. We will call this endpoint using the BV ID we got from search (the arcurl or the BV can be parsed from it). The response will contain a field like cid (content ID) and duration among other data. If the search result already provided duration (which it does) and we trust the match, we might not strictly need this step except for the **cid**. So this API call is primarily to get the comment id needed for fetching the actual danmaku. This call does not require authentication either.



Limitation and workaround: Accessing x/web-interface/view might be subject to rate limiting, but for our use (one call when a match is found) it should be fine. If a video is region-locked or requires login on Bilibili’s website, the API might return an error code (e.g., -403). In such cases, the extension will not proceed with overlay since the comments might not be accessible. This is an edge case (most user-uploaded reprints are freely accessible).



**Bilibili Danmaku (Comment) API:** Bilibili’s bullet comments are traditionally retrieved via a comment.bilibili.com service. Each video part has a numeric cid which identifies the comment file. The classic way (still functional) is to request:

```
https://comment.bilibili.com/<cid>.xml
```

This returns an XML file containing all the danmaku for that video (or the currently active pool) . Each comment is an <d> element with attributes and the comment text. For example, an entry might look like:

```
<d p="30.2345,1,25,16777215,1597332800,0,abc123,6543210">Great experiment!</d>
```

Here the p attribute encodes: time (30.2345 seconds), type/mode (1 = scrolling), font size (25), color (16777215 for white), timestamp, pool, user hash, and comment ID. The text content is the comment text (“Great experiment!”). We will fetch this XML for the matched Bilibili video’s cid. There is also a newer API that returns proto-buffer data in chunks of 6 minutes , but parsing that would require extra steps. For simplicity, we’ll use the XML API which is well-documented and easier to parse, acknowledging that it may not include **historical** (archived) danmaku if the video is old. (Bilibili’s “history” feature allows viewing comments from a specific date in the past, via separate endpoints dmroll, but we will ignore that for now and just get the current full comment set.)



When requesting the XML, we will send a normal GET request. No special auth is needed, but we should include a common User-Agent. If Bilibili requires a referer for this domain, we might need to set Referer: https://www.bilibili.com/video/<BV_ID> to mimic a user viewing the video – this is a trivial header addition if needed. Many existing scripts and tools fetch cid.xml without issue , so we expect it to work.



**Data Volume and Performance:** One consideration is that some popular videos have tens of thousands of comments. The XML could be large (several MB). Downloading that in one go is usually fine on desktop broadband, but we will monitor performance. If needed, we could switch to the newer segmented API which loads 6-minute chunks as needed (this would reduce upfront data). However, implementing the protobuf decoding is more complex. As a compromise, we might initially load the first part of comments (say first 10 minutes) and then load more on the fly as the video plays. But to keep the first version simple, we will likely fetch the whole XML once and parse it. The extension will parse the XML (which can be done with the browser’s DOMParser or via a simple regex for <d> tags since the format is straightforward).



**Using existing libraries and avoiding rate limits:** We will use open-source libraries when possible:



- *For string similarity:* We might use a lightweight library or write a small function for Levenshtein or Jaro-Winkler if needed, or simply use a simple algorithm (since titles aren’t extremely long, performance is not an issue for single comparisons).
- *For XML parsing:* Instead of writing our own XML parser, we can use the browser’s built-in XML parsing as mentioned. There is no need for heavy libraries here.
- *For danmaku rendering:* CommentCoreLibrary (MIT-licensed) will be included to manage comment flow on the screen .





We must also consider **CORS and permissions**. Because our extension will be requesting data from Bilibili domains while running on a YouTube page, this is cross-origin. In Manifest V3, by declaring the Bilibili URLs in host_permissions, we can use fetch or XHR from the content script to those URLs without being blocked by CORS (the extension environment relaxes it for declared hosts). We’ll ensure https://api.bilibili.com/* and https://comment.bilibili.com/* are in the manifest’s host permissions. If we encounter any CORS issue, another approach is to perform the requests in the background service worker (since extension background scripts are exempt from CORS when using fetch with the appropriate permissions). Either way, no user credentials are needed, just the technical permission for cross-origin.



**Summary of API usage:**



1. **YouTube page/DOM** – to get video title, description, duration (no special permission needed, runs in content script).
2. **YouTube IFrame Player API** – to listen to player events and get current time (loaded in page context; no auth needed, just include the script).
3. **Bilibili Search API** – GET request to api.bilibili.com/x/web-interface/search/type with query and dummy cookies to avoid 412 block .
4. **Bilibili View API** – GET api.bilibili.com/x/web-interface/view?bvid=... to get cid (public endpoint) .
5. **Bilibili Danmaku API** – GET comment.bilibili.com/<cid>.xml to fetch comments (public, XML data) .





All these calls are lightweight and require no user login. We will handle potential error conditions (no search results, video not found, network errors) by failing gracefully – e.g., if search API returns an error code or empty data, the extension simply won’t display the popup.





## **4. UI Injection Approach in YouTube (Using React)**





To present information to the user and overlay comments, we need to inject custom UI elements into the YouTube page. We will use **React** to build these UI components for ease of development and state management. The strategy for UI injection is as follows:



- **Mounting a React App in the YouTube DOM:** The content script will programmatically create a container <div in the YouTube page where our React app will live. For example, we can create a div with an id like "bili-danmaku-root" and attach it either to the end of the document body or a specific container. We might insert it as the first child of <body> or as a child of the #player-container element so that it’s positioned near the video player . Once the container is in place, we use ReactDOM.createRoot(container).render(<App />) (for React 18+) to mount our React component tree . This initialization will be done when the content script runs (which is on YouTube’s video page load or navigation).

- **React Components:** We will have at least two main components:

  

  1. **DanmakuMatchPopup:** A small notification UI that appears when a Bilibili match is found. This could be styled as a small card or box in the corner of the page (for example, bottom-right of the video player, or just below the player). It will display a thumbnail of the Bilibili video, the title (possibly truncated if long), the uploader name, and the publish date on Bilibili. It will also have a call-to-action button, e.g., “Show Comments” or “Enable Danmaku”. This button when clicked will initiate the overlay of comments. We will make this popup unobtrusive – perhaps semi-transparent background or a small icon indicating availability of danmaku. The user can choose to click it to enable the feature.
  2. **DanmakuOverlay:** This component represents the layer of flying comments over the video. When active, it will cover the video player area with an invisible canvas or a div that spans the video dimensions. This overlay will render the scrolling comments. It may not have much visible structure of its own except housing the comment elements (which will be absolutely positioned). We will give it pointer-events control so that it does not block the user’s interaction with YouTube controls (discussed below).

  

- **Styling and Positioning:** We will inject CSS rules to appropriately style these components. The popup component will be positioned in a **corner or below the player**. We can choose bottom-right corner of the video player for visibility. YouTube’s player container is relatively positioned, so placing our popup inside it and absolutely positioning it bottom-right might keep it in place even if the page scrolls. Alternatively, a fixed position at bottom-right of the window could work, but if the user scrolls away from the video, the popup might not make sense to be always visible. So anchoring it to the video area is preferred. We’ll likely insert our popup div as a child of #movie_player or #player-container and use CSS like position: absolute; bottom: 10px; right: 10px; z-index: 1000; to overlay it on the player controls area (ensuring a high z-index so it’s not hidden, but not too high to cover YouTube’s menus if any).

  The overlay component will cover the video. We can insert the overlay div inside the same player container, with position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; so that it covers the video but allows clicks to fall through (because pointer-events is none). This way, the user can still pause/resume by clicking the video, adjust volume, etc., without our overlay blocking those actions. The comment text elements within the overlay might momentarily intercept pointer events if not careful; we will ensure those are also non-interactive, or manage pointer-events CSS such that user interactions mostly ignore the overlay. If we include a control to turn off the overlay (like a “Hide Danmaku” button), that button would need to be clickable, which we could achieve by toggling pointer-events when the user moves the mouse (some implementations allow clicking on the overlay to toggle comments, but to keep it simple, we might just use the original popup button as a toggle: click once to show, click again to hide).

- **React for state management:** Using React will allow us to easily manage showing/hiding these components. For instance, the content script can maintain a state like matchData which, when populated with a Bilibili match, causes the popup to render. If no match, React simply doesn’t render the popup (so nothing shows up). When the user clicks “Show Comments”, we can update a state like overlayActive=true, which causes the overlay component to mount and begin rendering comments. React’s declarative nature makes it easy to add/remove elements from the DOM as state changes, instead of manually creating/removing DOM nodes with imperative code. This makes the extension more maintainable.

- **Minimal React usage:** We aim to keep the React component tree fairly small and the UI simplistic. This reduces overhead. The extension’s content script will include React (which is about 40KB gzipped) and our code; this is usually acceptable for modern extensions. We will run the content script at document_idle (after the main page has loaded) so it doesn’t interfere with page load performance significantly .

- **UI Visual Design:** The popup will likely have a small thumbnail image (which we get from Bilibili search results, e.g., item.pic URL ), scaled down to, say, 80x45 px, and next to it text like the title (maybe first 30 characters) and the bilibili icon or name. A “Show Danmaku” button could be a small blue button. We will also consider a close [x] on the popup if the user wants to dismiss it without activating the overlay. Once the overlay is active, the popup might change to show a “Hide Danmaku” or “Comments On [toggle]” state. Alternatively, the popup can disappear once activated, to reduce clutter, and perhaps a small floating toggle button can remain to turn it off. These are UI/UX choices we will refine during implementation and testing for best user experience.

- **Injection Timing:** The content script will inject the UI after ensuring the Bilibili search is done and a match is found. This means on page load, the extension will likely first run the matching logic in the background (which may take a second or two to fetch data), and only if a match is identified do we actually display the popup component. This avoids showing a UI that then disappears. To accomplish this cleanly, we might have the React app mounted but with state “loading” initially (render nothing or a hidden state), and once the search promise returns a result, we update state accordingly. Another approach is to only mount the React app after we have the data. However, mounting it upfront (with no UI rendered) then updating is fine. We should ensure that we don’t block the page – all network calls are async, and our script will yield control while waiting for results.

- **Respecting YouTube’s UI:** We should ensure our injected elements do not collide with YouTube’s own overlays (like captions, cards, etc.). By placing our popup in a corner with some margin, we minimize overlap. YouTube’s controls are usually at the bottom; our popup in the bottom-right might overlap with the YouTube “Settings” gear icon or fullscreen button if placed over the player. To avoid this, placing it just *below* the player might be safer. We could insert it in the DOM right below the player div so it pushes the page content slightly. However, modifying layout could cause reflows; a floating overlay might be better. We will likely iterate on the exact positioning during testing to ensure it doesn’t block important controls. Using a semi-transparent background and small size will also keep it from being too distracting.

- **Dynamic Page Navigation:** YouTube is a single-page application, meaning the user can navigate to a new video without a full page reload. Our content script must handle this. Since we inject on pages matching watch?v=, the script will run on the first load. If the user clicks another video, YouTube will update the URL and content via AJAX. Our script may not automatically run again (because the page hasn’t actually reloaded). We will implement a mechanism to detect YouTube’s navigation events. This can be done by listening to the popstate or using a MutationObserver on the document title or specific DOM nodes that change when a new video loads. For example, we can observe changes to the <h1 title> element of the video or the URL. Once a navigation to a new video is detected, we should reset our state (unmount or reset the React app) and then re-run the matching logic for the new video. React makes it easy to unmount the previous UI: we could call root.unmount() on our React root and then create a new root, or simply update the component state with the new video info (like storing the current video ID in state and having an effect that triggers new search when it changes). We will likely go for a full reset on navigation to keep things simple – essentially treat it as if a new content script instance, though technically it’s the same one running.

- **Testing UI injection:** We will use tools like React Developer Tools and Chrome’s inspector to ensure the elements are correctly inserted and styled. We’ll verify that our container is present in the DOM and can be shown/hidden as expected.





By using React and this injection approach, we leverage a “virtual DOM” diff for UI updates which is more robust than manually fiddling with DOM elements in response to events. The StackOverflow example confirms the viability of injecting a React root into a page and rendering content . Overall, this approach provides a clean separation (our UI lives in its own div, minimally affecting the rest of the page) and the ability to rapidly adjust the interface.





## **5. Danmaku Fetching, Transformation, and Rendering Pipeline**





Once a user chooses to enable the danmaku overlay (by clicking the popup’s button), the extension will go through a pipeline to fetch, process, and display the comments in sync with video playback. Here’s a step-by-step breakdown of that pipeline:



**a. Fetching Danmaku Data from Bilibili:**



- Using the **cid** obtained for the matched Bilibili video (from the view API in the matching phase), the extension will fetch the raw comments. As described, the primary method is an HTTP GET to https://comment.bilibili.com/<cid>.xml. This request will return an XML document containing all current danmaku comments for that video .
- The content script (or background) will perform this fetch. We include appropriate headers (e.g., a desktop Chrome user-agent). If this request fails (e.g., if the video requires login or the cid was invalid), we will catch that error and inform the user (possibly by an alert or a message in the popup, e.g., “Unable to load comments”). In most cases, it should succeed for normal videos.
- Bilibili’s XML is typically UTF-8 encoded, and comments can contain Chinese characters, English, emojis, etc. We must ensure we handle the encoding properly. The fetch API in modern browsers will handle UTF-8 XML by default, and we can parse it into a DOM or string.





**b. Parsing and Transforming the Data:**



- We will parse the XML using the browser’s DOMParser: const doc = new DOMParser().parseFromString(xmlText, "text/xml"). This gives us a document where each comment is a <d> element. We can then iterate through doc.getElementsByTagName('d') or similar.

- For each <d> element, we will extract the attributes and text. The important pieces are:

  

  - **Time**: encoded as the first value in the p attribute (a floating-point number representing seconds from the video start when this comment appears). We will parse this into a Number (e.g., 30.2345 seconds).
  - **Mode/Type**: the second value in p. This indicates the comment type. Common values: 1 for scrolling from right-to-left (common danmaku), 4 for bottom-center static, 5 for top-center static, 7 for special positioned (advanced). Since we only want **scrolling comments**, we will filter to include only mode 1 (and possibly 2, 3 if they exist as variations of scrolling). Typically, modes 1-3 are all scrolling (different speeds or directions) in Bilibili’s format. To be safe, we’ll treat mode 1 as the standard. If mode 2/3 occur, we’ll research: they might be reversed direction or slower scroll – but those are rarely used. We may include them as scrolling too. Modes 4 and 5 (top/bottom) will be ignored to adhere to the “scrolling-only” requirement.
  - **Color and Size**: We might ignore these for simplicity. The XML provides a color (in decimal) and font size. For a simplified experience, we can render all comments in a default style (e.g., white text on transparent background, standard font-size). This means we won’t mimic different colors or sizes. However, if using a library like CCL, it can honor those if we feed them. Initially, we’ll likely ignore color/size to keep things uniform and reduce complexity.
  - **Comment Text**: The text content of the <d> element is the comment message. We need to decode any HTML entities (the XML may have e.g. &#39; for apostrophes as seen in the og:description earlier , but in the XML the content is usually raw text or with basic escaping). We will ensure it’s properly decoded to a JavaScript string.

  

- We will create a data structure in JS for the comments, for example:



```
comments = [
   { time: 30.2345, text: "Great experiment!", mode: 1 },
   { time: 32.0, text: "哈哈，好可爱", mode: 1 },
   ... 
];
```



- We will sort this array by the time (if not already sorted). Typically, the XML is sorted by time already (comments appear in chronological order of sending), but it’s good to ensure it. Sorting a few thousand items is trivial performance-wise.
- If the video is extremely long with many comments, we might store this in a more memory-efficient structure or chunk it. But JavaScript can handle a list of e.g. 10,000 comments easily. We just have to be mindful if a video had 100k comments, iterating might have some performance hit. We assume normal use cases of a few thousand comments at most (which is typical for many videos).





**c. Initializing the Comment Rendering Engine:**



- We plan to use **CommentCoreLibrary (CCL)** or a similar library to manage the display of these comments. CCL provides a CommentManager that can handle comment streams on top of a <video> or any container. We will create a CommentManager instance and attach it to our overlay div. The overlay div effectively is our “stage” with the same size as the video player.
- For example, using CCL (pseudo-code):



```
const cm = new CommentManager(overlayDiv);
cm.init();  // initialize the manager
cm.options.global.scale = 1;  // ensure scaling matches video if needed
```



- Then we need to load our comments into it. CCL might have a method like cm.load(commentArray) where commentArray is an array of comment objects with structure { stime, mode, text, … }. If not, we can feed comments one by one at appropriate times using cm.send or by setting up a timer. The library, once initialized, typically expects to be fed with live comments or given the entire list and a mechanism to advance time.

- If we use our own implementation (not CCL), the steps would be:

  

  - Determine how to schedule comments: We can use the video’s timeupdate events or a timer to check the current playback time, and when the time crosses a comment’s timestamp, create a DOM element for that comment and animate it.
  - We would pre-create lanes/tracks for comments to avoid overlap. For example, have multiple rows (y positions) where comments can fly. A naive approach is to assign each new comment to the next available row (cycling through, or specifically checking if the previous comment in a row has moved enough to not collide).
  - For animation, we can use CSS transitions or requestAnimationFrame to move the comment from right to left. E.g., set the element’s initial CSS left: 100% (just off the right edge) and then transition it to left: -<width>% over a certain duration. A typical Bilibili comment stays on screen 56 seconds while scrolling across . We can pick a fixed duration like 6 seconds for all scrolling comments to traverse the entire video width. The speed would then depend on text length (longer text has to move slightly faster so it clears in the same time as a short text). CCL likely handles these details (ensuring constant on-screen time).
  - We’d also style the comments: white text with a small black outline (for contrast on any background). We can achieve outline by CSS text-shadow or stroke if using canvas. CCL might already render text with border for readability.

  





Considering the complexity of doing all this right (especially handling collisions between multiple fast comments), the **CommentCoreLibrary** is very appealing. It’s designed exactly for “timed comment streaming on top of video”  and has been used in similar projects. By using CCL:



- We convert our parsed comments into the format it expects (it might want keys like stime (start time in milliseconds), mode (an integer 1 for scrolling), text, and maybe size and color).
- We feed them in and tie the CommentManager’s time to the video time. Typically, CCL doesn’t automatically know the video’s current time; we must call something like cm.time(position) periodically to sync it, or hook it up to the video element so it listens for timeupdate events and uses those. There is a method to bind a timeline to it in some implementations.





**d. Rendering on Screen (During Playback):**



- We overlay the comments on the video by absolutely positioning them. Each comment will occupy one “line” (a horizontal strip) and move across. CCL will automatically allocate vertical positions for incoming comments to prevent overlap: it tracks active comments on screen and if one line is occupied (a comment hasn’t fully moved out of the way), it will choose the next line for a new comment that appears at the same time. This way, comments appearing at similar times stack vertically.

- We anticipate the overlay to look like classic Bilibili/Niconico style: multiple one-line texts flying from right to left at different heights.

- The overlay component’s state doesn’t need to track each comment if using a library – the library internally will manage DOM nodes or a canvas for comments. If implementing manually, we would keep track of active DOM nodes representing comments and remove them after they exit the left side (to avoid memory leak).

- We will ensure that when the video is **paused**, the comments pause as well. This means if we’re animating via CSS, we might need to toggle the animation-play-state to paused for all comment elements. If using CCL, it likely has a pause function (or we can simply stop calling the time update).

- If the user **seeks** (jumps to a different time): we need to handle that by clearing any comments that are on screen (since they might no longer be relevant) and possibly fast-forwarding or rewinding the comment engine to the new time. For example, if the user jumps to 10:00, we should quickly skip all comments before 10:00 (not show them) and be ready to show comments at 10:00 onward. CCL’s approach might be to simply call cm.time(newTime*1000) which will instantly update which comments should be on screen. We will research CCL documentation for the recommended seek handling. If implementing ourselves, we would:

  

  - If seek forward: skip spawning any comments whose timestamp is less than the new current time (they are now in the past relative to playback).
  - If seek backward (user rewound): we have to decide whether to show comments that were shown before. Typically, danmaku systems do allow rewatching – if you rewind, the comments that originally appeared at that time will appear again, recreating the original experience. We should support that. So a seek backward would involve clearing current comments and possibly reinitializing the comment scheduler from that time. We might simply reset our index into the comment list to the position matching the new time.
  - Ensuring no duplicate: If a user seeks backward slightly and then forward, we just follow the current time strictly. Our mechanism will likely be driven by the current time reading rather than absolute progress, so it should be okay.

  

- The **transformation of coordinates**: We will assume the overlay is the same size as the video player. If the user resizes the window or enters/exits full screen, our overlay should resize accordingly (since it’s set to width:100%, height:100% of the player container). We should verify that it adapts. For text scaling, if in full-screen the video is bigger, we might want slightly larger text. We could add a setting to scale comment font with the video size. CCL might handle DPI scaling. If not, we can at least pick a moderate font size (maybe ~18px) that is readable at most sizes. This is a fine-tuning detail.





**e. Toggling and Cleanup:**



- When the overlay is active, if the user decides to turn it off (e.g., by clicking the button again or a hide option), we will:

  

  - Pause the comment playback (stop any timers or event listeners that are adding comments).
  - Remove/hide all comment elements from the screen. If using CCL, we might call cm.clear() to remove all. If manual, we remove all child nodes of the overlay div.
  - Possibly unmount or hide the overlay React component.
  - Keep the match popup visible (maybe to allow re-enabling).
  - Essentially, return the page to normal YouTube appearance.

  

- If the user closes the popup or navigates away, we ensure to clear intervals/event listeners to avoid memory leaks in the content script.





**Using Open-Source Tools:**

We will leverage **CommentCoreLibrary (CCL)** as much as possible for the heavy lifting of comment rendering. CCL has been used in web-based danmaku players and supports basic danmaku features (scrolling, preventing overlap, etc.) . By using it, our pipeline from parsed comments to on-screen animation becomes:



- Convert XML -> comment objects.
- Initialize CCL with overlay div.
- Load comments into CCL.
- Tie CCL’s timeline to YouTube’s timeline (via periodic cm.time() updates or event binding).





This avoids us having to manually manage the lifecycle of each comment element, which can be error-prone. The library likely also handles things like not spawning too many comments at once (throttling if the screen is full), which is good for performance.



**Example Workflow (Putting it together):**



1. User clicks “Show Danmaku”.
2. Extension calls Bilibili API to get cid (if not already done) and fetches XML.
3. XML is parsed into, say, 5000 comments. We filter to ~4800 mode-1 comments (ignoring 200 static ones).
4. We initialize the overlay: insert overlay div, attach CommentManager.
5. Start a loop tied to video time: each time video time advances, we inform CommentManager. At video t=30s, CommentManager knows to display all comments with stime≈30000ms. It renders those comments, moving them across screen.
6. User pauses at 35s: our sync mechanism notices (via event) and calls CommentManager pause (freezing the comments in place) – so text stops moving .
7. User plays again: comments resume from where they left off.
8. User seeks to 100s: we call CommentManager with new time 100s, it jumps in its comment list to that time, clearing old on-screen ones and perhaps instantly adding any that should be on at 100s. (We may see a sudden jump in comments if any were exactly at 100s mark, which is fine).
9. Eventually user finishes video or toggles off the overlay: we unmount overlay and perhaps free CommentManager resources.





This pipeline ensures comments are **synchronized** and only shown at the correct times, providing the same experience as if watching on Bilibili.



We will thoroughly test this pipeline with a known example – for instance, find a specific YouTube video and its Bilibili counterpart, enable the overlay, and verify that at known timestamps, the same comments appear as one would see on Bilibili. We’ll also test performance (the page should not become laggy; if it does, we might limit how many comments can be on screen at once by filtering out very dense comment bursts or using CCL’s config to limit the density).



In summary, by using the fetched XML and an open-source comment engine, we transform the raw danmaku data into a live overlay that scrolls comments across the YouTube video in sync. The use of existing tools and simplified assumptions (only scrolling comments, uniform style) keeps the implementation manageable yet effective.





## **6. Playback Synchronization Using YouTube’s IFrame API**





Synchronizing the danmaku with the YouTube video playback is crucial. We need to ensure that comments appear at the exact times corresponding to the content. To achieve this, we’ll integrate with YouTube’s playback events and timeline. The plan is to use the **YouTube IFrame Player API** to listen for playback state changes and query the current time periodically, thereby driving the comment display.



**Loading the IFrame API:** When our content script initializes (or when the user activates the overlay), we will inject the YouTube IFrame API script into the page. This is done by adding a script element with src "https://www.youtube.com/iframe_api". According to YouTube’s documentation, this script will asynchronously load the API code . Once loaded, it calls a global function onYouTubeIframeAPIReady (which we can define in the page context) and then we can create a player instance.



**Creating a Player Instance:** We have two possible approaches:



- *Preferred:* Tie into the existing video player. Since we are on youtube.com, the video is already there. The IFrame API is typically used on external sites by embedding a YouTube iframe. On YouTube’s own site, there isn’t an iframe; it’s the native player. However, YouTube might still be running an iframe under the hood for the video or at least can be controlled by their internal player objects. An idea is to target the existing player’s element (there is a div with id “player” or “movie_player”). We could try new YT.Player('movie_player', { events: {...} }) to see if it hooks into the current video. If that doesn’t work, we may create a small hidden iframe player pointing to the same video (using the video ID). That would effectively duplicate the video stream (not ideal) just to get API control. So, we will attempt to attach to the current player if possible.
- If attaching fails, an alternative is to not use new YT.Player at all, and instead rely on the HTML5 video element events directly (as mentioned in Section 3). We know content scripts can access document.querySelector('video') and attach listeners for 'play', 'pause', 'seeked', etc. This might actually be simpler and avoids injecting the API. However, since the prompt specifically mentions the IFrame API, we will outline using it.





Assuming we get a player object from the IFrame API representing our video:



- We will set up event listeners via the API’s configuration. Particularly:

  

  - **onStateChange:** This event triggers whenever the player’s state changes (unstarted, playing, paused, buffering, ended, etc.). The API provides numeric codes for states . We care about at least:

    

    - State 1: Playing – when this occurs, we resume or start the comment playback.

    - State 2: Paused – when this occurs, we pause the comment flow.

    - State 0: Ended – when video ends, we might clear any remaining comments or stop timers.

    - State 3: Buffering – possibly treat it like paused (if buffering for a significant period, comments should probably pause, otherwise they’d desync).

      The onStateChange handler can check event.data for these codes  and act accordingly.

    

  

  For example:



```
onPlayerStateChange(event) {
    if(event.data == YT.PlayerState.PLAYING) {
       // resume comments
    } else if(event.data == YT.PlayerState.PAUSED) {
       // pause comments
    } else if(event.data == YT.PlayerState.ENDED) {
       // stop/clear comments
    }
}
```



- We will integrate this with our comment manager (CCL or manual). If playing, perhaps start or continue the interval that updates comment positions; if paused, we might freeze the comment animations.

- **Polling Current Time:** One limitation of the IFrame API is that it does not provide a continuous “timeupdate” event. We must poll the current time periodically . We will set up a timer (e.g., using setInterval) to run maybe every 500 milliseconds (0.5s) or even more frequently for better accuracy (perhaps 100-200ms). On each tick, we call player.getCurrentTime() which returns the elapsed time in seconds . This gives us the video’s current playback position. We then pass this value to our comment rendering engine. For instance, if using CCL, we might do cm.time(currentTime*1000) to update the comment manager’s timeline. If implementing manually, we would use this to decide which comments to display next (e.g., if currentTime just crossed 30.0 and we had a comment at 30.0, we trigger it).

  The reason for polling is confirmed by Stack Overflow discussions: the IFrame API doesn’t emit time tick events, so you either poll or intercept internal messages. Polling is simpler and reliable. A small interval of ~0.25s (4 times a second) might be enough resolution – bullet comments are usually not so time-critical that 0.25s off is noticeable, but we might go to 0.1s for smoothness. We’ll monitor performance; even 10 polls per second is negligible load.

  It’s worth noting that YouTube’s own player might fire a timeupdate on the video element more frequently (some report it fires ~4Hz). If using the video element directly, we could leverage that instead of our own interval. Either way, we get periodic time updates.

- **Seek Detection:** If a user drags the playhead or clicks a different time, the IFrame API will show a combination of events: likely a pause or buffering state, then a brief pause, then playing. Also, getCurrentTime polling will show a sudden jump in value (e.g., from 30s to 100s between polls). We can detect that jump. In our comment sync, if we see currentTime that is drastically different from the last time (more than, say, 1s difference forward, meaning a seek ahead, or any backward difference meaning a rewind), we will handle it as a seek:

  

  - For a forward seek, we skip comments between the old time and new time (which naturally happens if we always start from the current time).
  - For a backward seek, we might need to re-display previous comments. Our strategy (with CCL) would be to call something like cm.time(newTime*1000) which internally will handle jumping backwards (CCL can probably handle rewinding by clearing and then reloading comments appropriate for that time). If implementing manually, we may reset our comment index to the position for newTime.

  

  Additionally, the IFrame API has a onPlaybackRateChange event in case the user changes speed. If speed is changed, our timing still works since we rely on actual time progression. (If playback is 2x, getCurrentTime still increases in real seconds accordingly, and comments will just appear faster relative to real time, which is correct because the video is faster. Actually, at 2x, a comment meant for 30s will appear at 15s real time, which is fine as long as our sync is based on video time.)

- **Pause/Resume Comments:** When a pause is detected (either via state or when our interval sees the time not changing between checks, which is another clue), we will pause the comment animation. For example, if using CSS animations, we can add a class that sets animation-play-state: paused for all comment elements. If using CCL, we might call cm.stop() or similar if available. On resume, remove that class or call cm.start(). Pausing means the comments freeze in place on screen, exactly as YouTube’s own danmaku implementations do – viewers can pause to read the fast-flying comments. When resuming, the comments continue from where they left off.

- **End of Video:** When the video ends (state 0), we will likely clear the comments or stop the interval to avoid unnecessary work. We might leave any final comments on screen or just clear them. It might be neat to clear them a couple of seconds after video ends to clean up.





**Alternate Approach (without IFrame API):** As a backup, we will implement a similar mechanism using the HTML5 video element:



- Add an event listener for 'timeupdate' on the video element. This event fires periodically (not as often as one might want, but usually ~4Hz). On each event, get video.currentTime and do the sync logic (similar to polling).
- Add event listeners for 'play', 'pause', 'seeked' on the video element to handle state changes. 'seeked' fires after a user completes seeking (we can treat that similar to onStateChange for buffer or after user drop).
- 'ended' event on video element for end of playback.





Using these might actually be simpler. The content script can access the video element directly because it’s part of the DOM. We must be cautious that YouTube’s scripts also manipulate the video element, but listening should be fine. One thing: YouTube might remove and recreate the element when switching resolutions or ad playback, etc. We should ensure our listeners remain or reattach if needed (observing DOM changes to rebind if the video element is replaced).



For the scope of this plan, we’ll assume the IFrame API route, but keep in mind the direct DOM method if needed.



**Permissions & Context:** The IFrame API doesn’t require extra permissions, since it’s just a script we load into the page. Running it inside YouTube’s page context might require our injected script to run in the page context (not isolated). We can do that by creating a <script> tag and appending it (the code inside it will run with access to the page’s global variables). That’s how we’ll define onYouTubeIframeAPIReady and create the player, so it can interact with the global YT object.



**Example Code Flow:**

```
// Assume we have videoId and container ready
let player;
window.onYouTubeIframeAPIReady = function() {
  player = new YT.Player('player', {  // 'player' or appropriate element ID
    events: {
      'onStateChange': onPlayerStateChange
    }
  });
};

// In content script, after injecting iframe_api script:
function onPlayerStateChange(event) {
    if(event.data == YT.PlayerState.PLAYING) {
       startCommentSync();
    } else if(event.data == YT.PlayerState.PAUSED || event.data == YT.PlayerState.BUFFERING) {
       pauseCommentSync();
    } else if(event.data == YT.PlayerState.ENDED) {
       stopCommentSync();
    }
}
function startCommentSync() {
    // e.g., setInterval to poll currentTime
}
```

We will get the current time via player.getCurrentTime() inside our interval. According to the docs, getCurrentTime() returns a floating-point number of seconds . We can use that directly (no need to multiply to ms if our comment engine expects seconds, but CCL might expect milliseconds, so we’d multiply by 1000 in that case).



One important note: The IFrame API may only work once the YouTube player is ready. On youtube.com, by the time our script runs, the video is likely already loaded and possibly playing. If the video is already playing when we attach, we should immediately sync (we might get a onStateChange to “playing” as soon as we attach, or we might have to manually check player.getPlayerState() after initialization ). We’ll handle that: after creating the player, if player.getPlayerState() == 1 (playing), we call our start sync function right away.



**Synchronization Accuracy:** The polling every 0.1-0.5s should be sufficient. If we wanted to be extremely precise, we could poll faster, but that’s likely overkill. The comments have a certain length of stay (~5s), being off by 0.1s is hardly noticeable. We will test with different polling intervals to ensure smoothness (we prefer not to see comments jitter or appear late).



**Performance Consideration:** Polling and updating the comment engine at up to 10 Hz is trivial for modern JS (especially if the operations inside are not heavy). The heavier work is rendering the comments which is handled by the separate module (which likely does its own optimal rendering).



In summary, using the YouTube IFrame API, we will **listen for play/pause/seek events and poll the playback time**  . This keeps our danmaku timeline locked to the video’s timeline. By doing so, we ensure that a comment intended to appear at, say, 1:00 in the video always appears when the video’s currentTime passes 60 seconds, just as it would on Bilibili.



If any issues arise with the IFrame API (for instance, YouTube could potentially restrict it on their own site), we will fall back to directly using the video element events, which achieve the same effect. The goal is robust synchronization so that the user perceives the danmaku as part of the video experience – if they pause or seek, the comments respond exactly as expected.





## **7. Chrome Extension Architecture (Manifest V3, Permissions, Content Scripts)**





We have touched on the architecture in parts, but here we consolidate how the extension will be set up within Chrome’s extension framework, focusing on Manifest V3 specifics.



**Manifest Version 3:** We will use Manifest V3 which is required for new Chrome extensions as of 2023. Manifest V3 has some changes from V2, including the use of a service worker instead of a persistent background page, and different permission classifications (separating host permissions from general permissions). Our manifest.json will include:



- "manifest_version": 3
- "name", "description", "version" fields accordingly.
- "action" or "browser_action" (MV3 uses just "action") if we want an extension button in the toolbar. In our case, we might not need a visible browser action at all, since the extension works automatically on YouTube. We could include one without a popup just to allow the user to pin an icon, but it’s optional. We might provide a popup if we later add options or manual controls (not required for MVP).
- "content_scripts": This is crucial. We will specify a content script that runs on YouTube watch pages. For example:



```
"content_scripts": [ 
  { 
    "matches": ["https://www.youtube.com/watch*"],
    "js": ["contentScript.bundle.js"],
    "run_at": "document_idle"
  }
]
```



- This ensures our script loads for any YouTube watch page URL. We use a wildcard after watch to cover various query params (like watch?v=XYZ possibly with additional &t= etc). We deliberately exclude live videos; if live videos have a different URL pattern (like youtube.com/live or a live= parameter), we won’t match those. Only normal video pages will trigger the script. We set run_at: document_idle so it runs after the page is mostly loaded (ensuring the meta tags and video element are present to extract, and not to slow down initial page render).

  If needed, we might add a match for the short URL format (youtu.be/XYZ) redirect or others, but usually those redirect to normal watch pages before content loads. We’ll test such scenarios.

- "permissions": We will list needed permissions:

  

  - We might use "storage" if we plan to store any user settings (like the threshold or a toggle state) in chrome.storage. This allows persisting preferences.
  - We do **not** need "activeTab" since we are injecting content script via matches (activeTab is more for clicking the icon to grant temporary access).
  - We might include "scripting" if we intend to programmatically inject scripts (but in MV3, if we already declared the content script, we might not need the scripting API for this use case).
  - If we foresee needing to modify headers for the Bilibili requests (like adding cookies or referer), MV3 would require declarative_net_request with appropriate rules. However, we might handle cookies within fetch as discussed, so it might not be necessary to declare webRequest permissions (which are harder to get approval for). We will try to avoid requiring webRequest. If absolutely needed, we could use "declarative_net_request" to ensure Bilibili endpoints have a specific referer or something, but likely not needed.

  

- "host_permissions": This is where we declare cross-origin access. We will include:

  

  - "https://api.bilibili.com/*"

  - "https://*.bilibili.com/*" (to cover comment.bilibili.com and perhaps other subdomains like www.bilibili.com if we do the initial cookie fetch).

  - We might include "http://api.bilibili.com/*" as well, but Bilibili uses HTTPS predominantly, so not necessary.

    These host permissions will allow our extension to bypass CORS for those domains and use fetch or XHR. Chrome will also show the user that the extension can “Read and change data on bilibili.com” which is expected.

  

  We do **not** list youtube.com in host_permissions because our content script is already allowed on YouTube via the matches (which implicitly gives it access to that page’s DOM). If we needed to do something like fetch another YouTube URL (like the watch page in a different language or the YouTube Data API), we might include youtube domains. But we don’t have plans for cross-origin requests to YouTube (maybe except the IFrame API, but that’s just a script include from youtube.com which is allowed as it’s the same origin as the page).

- **Background Service Worker:** If we decide to use a background script, we’d add:



```
"background": {
  "service_worker": "background.js"
}
```



- In MV3, this file is a service worker that runs on-demand (it doesn’t stay alive indefinitely). We can have it listen for messages from the content script (e.g., using chrome.runtime.onMessage). For instance, the content script could send a message “fetchSearchResults” with the query, and the background could perform the fetch using fetch() or chrome.webRequest if needed, then send the results back. This offloads network from the content script. However, content scripts with host permissions can do fetch directly and might be simpler. The background approach might be useful if we want to reuse results between tabs or keep some cache (like if multiple YouTube tabs might search for the same video concurrently, a background could coordinate caching).

  For MVP, we might not need a background at all. We can try doing everything in the content script context. If that runs into issues (like the cookie requirement for Bilibili search), we might then implement a small background routine: e.g., the content script sends a message “performBiliSearch(query)”, background does:



```
const resp = await fetch(biliSearchUrl, {headers: {Cookie: dummyCookie}, credentials: 'omit'} );
let data = await resp.json();
sendResponse(data);
```



- And the content script continues. The background would need those host permissions too.

- **Content Security Policy (CSP):** MV3 extensions have a default CSP that disallows eval and remote code. We are injecting a script from youtube.com (the IFrame API). Since youtube.com is the same origin as where the content script is running (the page), adding a script tag pointing to youtube.com is allowed by the page’s CSP rather than the extension’s. We should confirm YouTube’s CSP allows its own domain (very likely yes, since they embed iframes). We are not injecting any script from an unapproved domain into the extension context, so we likely don’t need to specify content_security_policy in manifest. If needed, we could adjust it to allow the frames or media from Bilibili, but since we aren’t embedding iframes or anything from Bilibili (just fetching data), that’s fine. Also, images from Bilibili (thumbnails) might load in the popup via an <img src="/...bilibili...">. By default, content scripts shouldn’t be restricted from loading images, especially if those images are being loaded in the page context (the IMG tag is in the page DOM, so it will load like any image in the page would, subject to page’s CSP – YouTube’s CSP might restrict unknown domains in images? Possibly not for user-generated content. But if it does, we have a workaround: we could use the extension as a proxy for the image by fetching data and creating a blob URL. Or hopefully just include https://i*.hdslb.com/* (Bilibili image CDN domains) in host_permissions so that it’s allowed. We’ll check if necessary during development).

- **Isolation:** Content scripts run in an “isolated world”, meaning our variables don’t conflict with YouTube’s. When we inject the IFrame API script, that runs in page context so it can define YT object etc accessible to page. We just have to coordinate between content script and page context by maybe using window as a shared global or postMessage. We might not need messaging if we keep things straightforward: e.g., the content script can attach an event handler on window for custom events to know when to start, etc. But likely we can manage by simple function hooks as described with onYouTubeIframeAPIReady being global.

- **Memory and Cleanup:** Because the content script will persist as long as the YouTube tab is open (including navigating between videos), we must manage state carefully. We will likely use global variables (within the content script context) to store state per tab (like currentVideoId, matchFound, etc.). On navigation, we reset or overwrite them. On tab close, the content script is unloaded anyway, freeing memory.

- **Edge Cases in Architecture:** If a user has multiple YouTube tabs open, each will have its own instance of the content script running. They operate independently, which is fine (some may find matches, others not). If the extension needed to coordinate (unlikely), the background could facilitate that, but here it’s not needed.

- **Testing the Manifest and Permissions:** We will load the extension in Chrome’s developer mode and ensure:

  

  - It only activates on YouTube pages (check the icon or logs).
  - It can indeed fetch from Bilibili API (test by manually calling fetch in content script console).
  - No unwanted permission prompts appear (in MV3, if we include host_permissions, the user usually is not prompted at install time for those, but they can see them. They might have to allow them if the extension is from Chrome Web Store and those are considered “optional”, but we’ll mark them required in manifest so the user knows upfront).

  





**Optional: Options Page:** If we decide to allow user configuration (like adjusting threshold or turning on an auto-translate feature), we can add an "options_page": "options.html" in the manifest. This HTML would load a small page (with possibly React as well or simple form) accessible via extension details or an Options button. Through chrome.storage, we could save settings. For example, a user could set “Minimum title similarity = 0.9” if they want only exact matches. Initially, we might not include this to avoid extra complexity, but it’s a straightforward addition if needed later.



**Auto-updates and Versioning:** We will version the extension (starting 0.1, etc.). If publishing, we would ensure our manifest and code meet Chrome Web Store guidelines (no remote code, etc., which we do by bundling all logic in the extension itself).



By adhering to Manifest V3 structure and least privileges (only needed permissions), we maintain security and performance:



- The content script only runs on YouTube watch pages (not on every site).
- We only can access Bilibili domains as specified, which limits risk.
- No persistent background means minimal idle resource usage (the service worker spins up only if needed, say if we do a background fetch).





In conclusion, the extension’s Chrome-specific architecture is straightforward: a content script injected on YouTube that communicates (if necessary) with a background script for data fetching, all declared properly in the manifest. We leverage MV3’s capabilities to ensure our script can do what it needs (via host permissions for cross-origin). This structure will allow our extension to effectively bridge YouTube and Bilibili data while fitting within Chrome’s extension security model .





## **8. Edge Cases, Fallback Behavior, and Test Plan**





No project is complete without considering edge cases and how to handle unexpected situations. We outline potential edge cases and our planned fallback behaviors, followed by a comprehensive test plan to verify the extension works in all intended scenarios.



**Edge Cases & Fallbacks:**



- **No Bilibili Match Found:** If our search yields no result above the confidence threshold (or no results at all), the extension should remain invisible to the user. It will not inject any UI (the React app might not render anything). We want to avoid “false positives” where a random Bilibili video is suggested incorrectly. Thus, the absence of a match results in a no-op. Internally, we’ll probably log (for debugging) that no match was found for a given video ID. This case will be common for many videos (especially those not popular in China or not re-uploaded), and the extension essentially does nothing, which is fine.

- **Incorrect Match (False Positive):** It’s possible our algorithm picks a Bilibili video that isn’t actually the same content. For example, if the YouTube title is something generic like “Highlights” and Bilibili returns a different “Highlights” video. To mitigate this, our threshold is set conservatively. However, if a mismatch slips through, the user might click “Show Danmaku” and see comments that don’t align with the video. This will be confusing. As a fallback, if a user notices nonsense comments, they can simply click “Hide Danmaku” (we will provide a way to turn it off after enabling). In future, we might add a feedback mechanism (like “Wrong match? Click here to search manually.”). For now, our defense is mainly the matching accuracy. In testing, we’ll try to find any such borderline cases and adjust the threshold logic accordingly.

- **Multiple Potential Matches:** If there are multiple Bilibili videos that could be the same content (e.g., the video was re-uploaded by several users), our extension currently just picks the top result that meets criteria. This might not always be the “best” one (maybe a second result has more complete danmaku). Ideally, we’d choose the one with the most comments or views. Bilibili’s search might already rank by relevance or popularity (the order=totalrank default tends to bubble up the most relevant and popular matches ). If the top two are very similar, it usually means they both are the same content reuploaded. In edge cases, we might arbitrarily pick the first.

  *Fallback:* If needed, we could implement logic like: if two or more results have high similarity and similar duration, pick the one with the greater number of danmaku or views. We can get view count from the search results (item.play field might represent plays). For initial version, we won’t complicate this; we assume one clear match. If in testing we find a scenario of two equally plausible matches, we may refine selection by duration match exactness or choose the earliest upload (since first uploader might gather more comments).

- **Video with Multiple Parts on Bilibili:** Some Bilibili videos (especially longer content or series episodes) are split into multiple “parts” under one BV ID. For example, a YouTube video series might be combined into one Bilibili submission with part1, part2, etc. In such a case, our match might correspond to one part, not the whole. The Bilibili search result may indicate multiple parts (it might show a “(P1)” in the title or such, or the view API returns a list of pages with titles). If the YouTube video corresponds to, say, part 2 of a Bilibili multi-part video, we’d ideally fetch the danmaku for that part only (each part has its own cid). However, detecting this automatically is tricky (we would need to identify which part’s title or duration matches YouTube).

  *Simplified approach:* For now, we will assume a one-to-one match (YouTube video = Bilibili part 1). This will hold true for most single videos. If we inadvertently fetch part 1’s danmaku while the content was actually in part 2, the comments timing will not match and likely be obviously wrong. This is a rare edge case. If it happens, the user can disable the overlay. As an improvement, we could use duration: if YouTube video length matches closely one of the parts durations from Bilibili, use that part’s cid instead of part1.

- **Bilibili Video Requires Login or VIP:** Some content on Bilibili is behind login (like age-restricted content) or VIP (paywalled). If our match is such a video, fetching the danmaku might return nothing or an error because guests can’t access it. We should detect if the view API returns an error code or if the comment fetch returns an empty document (for example, if the response is an HTML saying “please login”).

  *Fallback:* In such cases, we won’t have data to show. We can either not show the popup at all (if we detect at search stage that it’s a restricted video), or show the popup but when clicked, show an error message like “Comments not available (login required)”. Given that reuploads are usually not restricted, this might not occur often. We’ll handle it gracefully by checking API response codes. (Bilibili’s API returns code: -104 or similar for needing login).

- **Network Failures:** If the user is offline or Bilibili is unreachable at that moment, the search request or comment fetch will fail.

  *Fallback:* We will implement retries for the search (maybe 1 retry after a short delay, in case of a transient issue). If it still fails, no popup is shown. If the popup was shown and then the comment fetch fails (rare because that means search succeeded but comment fetch failed), we can display an error in the popup or overlay (“Failed to load comments”). We’ll also ensure that a failing fetch doesn’t break the content script (wrap in try/catch).

- **YouTube Video Playback Changes:**

  

  - If an advertisement plays at the beginning or middle of the video, YouTube might treat it as a separate video temporarily. Our content script might receive onStateChange events for ads. Ads usually have their own short video IDs and then main video resumes. This could confuse our synchronization if we start seeing time resets. We likely should ignore any time spent in ads. Possibly detect that the video ID changed to an ad ID (not the original) and pause our comment sync until the ad is over (the main video ID returns). This might require hooking into YouTube’s events more deeply. For initial implementation, we might not handle this explicitly, and observe what happens: often YouTube doesn’t expose the ad as a normal state to the API (or it might just pause the main video). We’ll test with monetized videos. Worst case, some comments might appear during the ad because our timer kept running – but since the video is paused during ad, our onStateChange should have caught a pause, so maybe no issue. We’ll adjust if needed.
  - If the user uses YouTube’s theater mode or resizes the player, our overlay div still covers the player (because it’s inside it), so that should adjust automatically. We will test that.
  - If the user toggles captions or other YouTube features, should not conflict with us. Captions appear above the controls; our comments typically appear across the middle/top of the video. There could be overlap between captions and danmaku. This is a known issue even on Bilibili (subtitles vs danmaku). As a simple solution, the user might have to turn off one if they conflict. A future improvement could be an option to auto-move danmaku above the subtitle area if subtitles are detected, but that’s complex. We note it as an edge case but not solving now.

  

- **Memory and Performance Edge Cases:**

  

  - Very long videos (say 3+ hours) with many comments: The XML could be huge and parsing might be slow or memory heavy. If we encounter such a scenario, a fallback could be to not load the entire comment set at once. We could instead use the newer API to load in segments as needed (but implementing that is complex for MVP). Alternatively, we could throttle rendering if performance issues arise (e.g., limit to displaying at most X comments per second). We will monitor CPU usage during testing on a video with lots of danmaku (perhaps an anime episode).
  - Multiple YouTube tabs each with active danmaku: This means multiple content scripts doing work. This generally should be fine; modern browsers can handle it. But if the user has many such tabs, it could add load. Not much we can do except ensuring our code is efficient. The user can always close some tabs or not enable overlay on all simultaneously.

  

- **User toggling extension on/off:** If the user disables or uninstalls the extension while on a YouTube page, Chrome will remove our scripts. That’s fine—no specific handling needed beyond default.





**Test Plan:**



We will conduct thorough testing in the following areas:



1. **Basic Matching and Popup Display:**

   

   - Test a YouTube video that is known to be on Bilibili. For example, find a popular music video or meme that was reuploaded. Verify that within a short time (1-2s after page load) the extension displays the popup with correct title, thumbnail, and info from Bilibili.
   - Check that the information is accurate (thumbnail matches the Bilibili video, author name correct, etc.). This indirectly tests that our search and parsing works and that we chose the right result.
   - Test a YouTube video that likely isn’t on Bilibili (like a personal vlog). Ensure that no popup appears at all.
   - Test videos with various title languages: an English title, a Chinese title, etc. If possible, have a Chinese-titled YT video that’s on Bilibili. Ensure matching works (since in that case maybe the title might match exactly or we might use the same string).
   - Test the scenario of multiple matches: for example, “Rickroll” might be uploaded by many on Bilibili. Does our extension pick one and is it reasonable? If not, adjust logic.

   

2. **Danmaku Overlay Functionality:**

   

   - Click the “Show Danmaku” on a matched video. Verify that comments start appearing and scrolling at the correct times. We can cross-reference by playing the same Bilibili video (muted) side by side to ensure a given notable comment (like a distinctive phrase) appears at the same moment on YouTube.

   - Pause the YouTube video. Check that the comments stop moving. If one was mid-flight, it should freeze. Resume, it should continue. This tests pause/resume syncing.

   - Seek to different parts of the video:

     

     - Seek forward beyond the current point (e.g., from 1:00 to 2:30). Comments that were between 1:00-2:30 should not suddenly all show; only those after 2:30 should, aligned with the new time. We might expect an immediate burst at 2:30 if a comment is exactly at that time, but nothing from the skipped segment.
     - Seek backward (e.g., from 2:30 back to 0:30). Comments from 0:30 onward should replay. This is important: if we don’t see them, maybe our mechanism didn’t handle rewind. We’ll adjust so that rewinding re-initializes the comment stream properly (likely by resetting the comment index in our code or reloading CCL’s timeline).

     

   - Let the video play to the end. Ensure that either all remaining comments flew by or we clear them at end. Also see if any errors occur at end (like our polling trying to get time after video ended, etc.).

   - Test toggling the overlay off (if we provide a toggle). For example, click “Hide Danmaku” or the same button again if it’s a toggle. The comments should disappear, and no new ones should appear even as video plays. Then try re-enabling (if possible) to see if it picks up correctly at the current time (this might be more advanced; if tricky, we might not allow re-enable without reload).

   - Test with caption on: Turn on YouTube’s subtitles, also have danmaku on. Visually inspect if comments overlap captions badly. Not much to do but note it; ensure it doesn’t break functionality.

   

3. **Performance and Stress:**

   

   - Use a video with very heavy danmaku (if available). Perhaps a Bilibili video known for “comment army” (lots of comments). Play it and see if the extension can handle it without lagging the page. Scroll the page (the overlay should scroll with video since it’s attached to player). Monitor Chrome’s performance (via DevTools Performance profiler) to see CPU usage of the content script. If we see issues, consider optimizations (like lowering poll frequency or using requestAnimationFrame instead of setInterval for syncing, etc.).
   - Open two YouTube videos in two tabs both with overlay on and play them. See if both work simultaneously and system can handle it (should be fine, but good to test).

   

4. **Edge Cases from above:**

   

   - If possible, find a multi-part scenario. E.g., a YouTube video that corresponds to a Bilibili P2 in a collection. Check what our extension does. (This might be hard to identify without prior knowledge; we might skip if not easily found).
   - Test on a YouTube video that has a very similar title to another. For example, two different songs with same name. Ensure we matched the right one by comparing durations.
   - Simulate network failure: disconnect internet after YouTube video loads, then click “Show Danmaku”. It should handle gracefully (perhaps show error or simply no comments appear). Reconnect and maybe refresh page to test again.
   - Try videos of different lengths: a 30-second clip vs a 2-hour video. See if any issues arise (like any overflow in time calculation, etc.).

   

5. **Cross-Browser if applicable:** Our focus is Chrome, but since MV3, it should also work on Edge or other Chromium-based. Not necessary to test for this plan, but worth noting.

6. **Code Robustness Tests:**

   

   - Test that if the user navigates to a new video (via related videos sidebar) without refreshing, the extension correctly identifies the new video. To do this: Start on video A that has danmaku overlay running, click a related video B. The URL changes, the page content changes. We expect:

     

     - The overlay from A is removed.
     - The extension searches for B’s match and updates the popup for B.
     - If B has no match, the old popup should go away.

     

   - If this doesn’t work, we likely need a better navigation detection (maybe listen to history state changes or the YouTube player’s own events). We will adjust code accordingly and retest.

   





**Automated Testing:** While manual testing covers the essential user experience, we might also write some unit tests for pieces:



- Test the string similarity function with known pairs (like exact match vs different strings) to ensure threshold logic.
- Test the Bilibili search parsing with a saved sample JSON to ensure we correctly parse fields (title, pic, etc.).
- Test the XML parsing with a sample snippet to ensure we extract time and text correctly (especially with different encodings or special characters).





For integration testing, it’s tricky to automate because it involves loading actual web pages and extension context. We will rely mostly on manual testing in a Chrome browser for that.



After thorough testing, we will refine any discovered issues. The goal is to have the extension operate seamlessly: if a user installs it and goes to YouTube, they either see a neat “danmaku available” button (when relevant) or no visible change (when not relevant), with no negative impact on their normal YouTube usage.



By carefully handling edge conditions and verifying with the above test cases, we aim to deliver a robust extension that behaves well across a variety of scenarios.





## **9. Roadmap for Future Improvements**





While the initial implementation focuses on core functionality, there are several enhancements and new features we can consider for future versions. These would improve the user experience, broaden the extension’s applicability, and provide more control to the user:



- **Multi-language Support:** Currently, our matching relies primarily on the original title (often English) and possibly a Chinese translation if available. In the future, we could integrate an automatic translation step for better matching. For example, if a YouTube video’s title is in Spanish, we might translate it to Chinese (using an API like Google Translate or a free translation library) and query Bilibili with that. Similarly, for YouTube titles in languages that Bilibili might list differently, translation could help. However, adding translation means using either a third-party API (which could require keys) or an offline library (which may not be very accurate). This is a complex improvement and needs careful consideration of API quotas and privacy. Another angle of multi-language support is the UI: we could internationalize our extension’s popup text (English, Chinese, etc.). For example, show the popup messages in Chinese for users on Chinese YouTube interface. Using Chrome’s i18n system, we can provide translations for static text like “Show Danmaku”. This would make the extension more accessible to non-English users.

- **Advanced Danmaku Styling:** The initial plan is to keep comments uniform (white, medium font). In the future, we could incorporate more of Bilibili’s styling features:

  

  - Support colored danmaku (some comments are colored for emphasis).
  - Support different sizes (e.g., very large text for special comments).
  - Possibly even support the static top/bottom comments (if we find those are useful, like often announcements or subtitles in Bilibili are done via top static comments).
  - Allow user customization: e.g., an option to display comments in a more transparent form or limit the number of comments on screen (a density slider).
  - The user might want to filter out certain comments by keywords or by length (some danmaku might be just “2333” spam, etc.). We could allow a filter list or a toggle to hide trivial short comments.

  

- **Comment Interaction and Filtering:** On Bilibili, users can like or dislike comments, or toggle “show only high-quality comments” mode. We could consider a feature to only display comments that have a certain popularity or filter out those from bots. However, to get such data (like number of likes on each comment) might require additional API calls or might not even be exposed. Alternatively, a simpler filter: hide comments that are just laughter or repetitive characters, if users want a cleaner view. We could have an options panel where users input words to block (like profanity or spoilers).

- **Manual Search/Selection:** In cases where the extension doesn’t find a match or picks the wrong one, giving the user agency would be helpful. We could add a feature in the popup like “Not the right video? Search manually.” This would open a small interface where the user can edit the search query or choose from other Bilibili search results. For example, present the top 3 results and let the user click which one corresponds to the YouTube video. Then load danmaku from that. This caters to edge cases where our automation doesn’t get it perfect. It does add UI complexity (essentially a mini search UI), so it’s a future nice-to-have.

- **Caching and Preloading:** We could cache results to make the extension more efficient. If a user frequently toggles the overlay on the same video or replays it, we can store the fetched danmaku so that we don’t re-download the XML repeatedly. Also, if the user scrubs around a lot, having all comments in memory is good (which we do). Another caching aspect: we could maintain a mapping of YouTube video IDs to Bilibili IDs once found. Then if the user (or someone else) visits that video again, we skip the search step and immediately know the match. This could be stored in chrome.storage.local. However, memory is cheap enough and search is pretty fast, so this is minor priority.

  

  - Preloading: We might detect the next video in a playlist or recommendations and pre-search it in the background so that if the user clicks it, the danmaku is ready faster. But this could be wasted effort if user doesn’t go to those videos, so not sure if worthwhile.

  

- **UI/UX Enhancements:**

  

  - Possibly a small icon indicator on the YouTube player when danmaku is available. For example, an icon overlay (like how YouTube shows “CC” for subtitles). A small “弹” character or something that lights up if comments exist. This could be more integrated than a popup box. Clicking it toggles comments. This might be more intuitive for users familiar with bilibili.
  - Draggable or resizable comment overlay. Some users might want to confine comments to a portion of the screen. Probably overkill, since danmaku by nature covers the video.
  - Option to slow down or speed up the danmaku relative to video (some might want slower comments if too fast).
  - Dark mode/light mode styling: ensure our popup looks good in YouTube’s dark mode and light mode. (We will do this from the start: e.g., use neutral or dark semi-transparent background that works on both).

  

- **Supporting Other Platforms:** Our design is specific to YouTube and Bilibili. In the future, one could imagine extending support to other video sites:

  

  - If users wanted, this extension concept could overlay danmaku from Bilibili onto other platforms like Vimeo, or vice versa. But that multiplies complexity (matching across different platforms).
  - A more likely extension is supporting **YouTube <-> Niconico** (the Japanese site that invented danmaku). Niconico has its own danmaku comments; one could overlay Niconico comments on YouTube for Japanese content. That would involve searching Niconico by title. It’s an interesting idea for a broader “Danmaku Everywhere” extension. For now, we’ll stick to Bilibili, but the architecture (content script that fetches from another API) would be similar.

  

- **Historical Danmaku or Time-shift Controls:** Bilibili allows viewing comments as they were at a certain timestamp (e.g., what comments were present at a specific time after upload). We likely fetch the “default” which might be all combined. In future, if users want to simulate watching the video at its original release time, we could fetch “historical” danmaku (Bilibili has an API to get comments from a specific date in the past). This is a niche feature but could be fun for seeing how comment culture evolved. Not a priority.

- **Quality and Resilience Improvements:**

  

  - Better error handling and user messaging. Instead of silently failing, we can provide user feedback in the UI if something goes wrong (like “No comments found” or “Error loading comments”). In the first version, minimal UI is fine (no popup at all means either no match or error – user can’t tell which, but they might not need to). Later, distinguishing these (maybe a different message if a match is found but comments failed to load vs no match at all) could be helpful.
  - Possibly integration with Chrome’s context menu or shortcuts: e.g., a right-click on a YouTube video page to “Search Bilibili for this video” as an action. This would manually trigger our search and show results even if below threshold, as a power-user tool.

  

- **Performance Tuning:** If we find performance issues, future improvements could include:

  

  - Using Web Workers for parsing XML or heavy computations, so the main thread (where the video runs) isn’t blocked.
  - If not using a library, consider canvas rendering for comments instead of DOM, which can handle a lot of moving text more efficiently (CommentCoreLibrary might already use canvas option).
  - Reducing memory by disposing of comment data after use (though small anyway).

  

- **Security and Privacy:** Currently, we do not handle any personal data, we just fetch public comments. But as improvement, we should ensure all requests are over HTTPS (they are). We should consider if any user data could be inadvertently captured (we really don’t, as we don’t log or send anything beyond the queries needed). In future, if we add features like logging in to Bilibili to fetch restricted comments, that introduces security concerns (we’d need OAuth or user to input cookies – probably not doing that).

- **Compatibility:** We should keep an eye on YouTube or Bilibili site changes. For example, if Bilibili changes their search API or starts requiring a dynamic token, we might need to update our method (maybe scraping search HTML or using an official API route). So part of future maintenance is monitoring these endpoints. The SocialSisterYi repo is a good resource to track changes in Bilibili APIs.





Finally, we plan to gather user feedback once the extension is in use. This will drive many improvements. Maybe users will request things like “Can I adjust comment speed?” or “Show only comments with certain hashtag,” etc. We will prioritize those that enhance the experience for a broad range of users.



In conclusion, this roadmap envisions the project evolving from a simple tool to a more feature-rich platform for danmaku enthusiasts. The initial version provides the foundation – linking video by metadata and overlaying comments. Future iterations can refine accuracy (multi-language, manual override) and enrich functionality (style, filters, UI polish), making the extension a robust bridge between YouTube and Bilibili’s lively comment culture. By planning these improvements, we ensure the project can continue to delight users and remain useful even as requirements grow or change over time.