const LANG = "en-US";

const major = (navigator.userAgent.match(/Chrome\/(\d+)/) || [])[1] || "140";
const full = `${major}.0.0.0`;

const OVERRIDE = {
  userAgent:
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${full} Safari/537.36`,
  platform: "Win32",
  acceptLanguage: `${LANG},en`,
  userAgentMetadata: {
    brands: [
      { brand: "Chromium", version: major },
      { brand: "Not.A/Brand", version: "24" },
      { brand: "Google Chrome", version: major },
    ],
    fullVersionList: [
      { brand: "Chromium", version: full },
      { brand: "Not.A/Brand", version: "24.0.0.0" },
      { brand: "Google Chrome", version: full },
    ],
    platform: "Windows",
    platformVersion: "15.0.0",
    architecture: "x86",
    bitness: "64",
    model: "",
    mobile: false,
    wow64: false,
  },
};

const send = (target, method, params = {}) =>
  chrome.debugger.sendCommand(target, method, params);

const AUTO_ATTACH = { autoAttach: true, waitForDebuggerOnStart: true, flatten: true };

async function applyOverrides(target, type) {
  const isPage = type === "page" || type === "iframe";
  await send(
    target,
    isPage ? "Emulation.setUserAgentOverride" : "Network.setUserAgentOverride",
    OVERRIDE
  );
}

async function setupChild(target, type) {
  try {
    await applyOverrides(target, type);
    await send(target, "Target.setAutoAttach", AUTO_ATTACH);
  } catch (e) {
    console.warn("child setup failed", type, e.message);
  } finally {
    try { await send(target, "Runtime.runIfWaitingForDebugger"); } catch {}
  }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === "Target.attachedToTarget") {
    setupChild(
      { tabId: source.tabId, sessionId: params.sessionId },
      params.targetInfo.type
    );
  }
});

async function attachTab(tabId) {
  if (tabId == null) return;
  const target = { tabId };
  try {
    await chrome.debugger.attach(target, "1.3");
  } catch {
    return;
  }
  try {
    await applyOverrides(target, "page");
    await send(target, "Target.setAutoAttach", AUTO_ATTACH);
  } catch (e) {
    console.warn("tab setup failed", tabId, e.message);
  }
}

async function attachAll() {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) attachTab(t.id);
}

chrome.tabs.onCreated.addListener((t) => attachTab(t.id));
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.status === "loading") attachTab(id);
});
chrome.runtime.onStartup.addListener(attachAll);
chrome.runtime.onInstalled.addListener(attachAll);

chrome.alarms.create("keepalive", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(attachAll);

attachAll();

// ===== Icon =====
const ICON_BG = "#10243d";
const ICON_BLUE = "#3aa0ff";
// =====================================

function drawIcon(size) {
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext("2d");
  g.fillStyle = ICON_BG;
  g.beginPath();
  g.roundRect(0, 0, size, size, size * 0.18);
  g.fill();

  const pad = size * 0.2;
  const gap = size * 0.07;
  const pane = (size - pad * 2 - gap) / 2;
  g.fillStyle = ICON_BLUE;
  for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    g.fillRect(pad + i * (pane + gap), pad + j * (pane + gap), pane, pane);
  }
  return g.getImageData(0, 0, size, size);
}

chrome.action.setIcon({
  imageData: { 16: drawIcon(16), 32: drawIcon(32), 48: drawIcon(48), 128: drawIcon(128) },
});
