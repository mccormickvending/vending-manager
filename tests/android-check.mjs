// Drives the installed Android app through its WebView debugger and saves screenshots + a report.
import { execSync } from "node:child_process";
import fs from "node:fs";
const APP = "com.mccormickvending.vendingmanager";
const sh = c => execSync(c, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const shot = n => { execSync(`adb exec-out screencap -p > shots/${n}.png`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { steps: [] };
const log = (k, v) => { R.steps.push({ step: k, result: v }); console.log(k, JSON.stringify(v)); };

async function connect() {
  let pid = "";
  for (let i = 0; i < 30 && !pid; i++) { try { pid = sh(`adb shell pidof ${APP}`); } catch { await sleep(1000); } }
  try { sh("adb forward --remove tcp:9222"); } catch {}
  sh(`adb forward tcp:9222 localabstract:webview_devtools_remote_${pid}`);
  let page = null;
  for (let i = 0; i < 30 && !page; i++) {
    try { const l = await (await fetch("http://127.0.0.1:9222/json")).json(); page = l.find(p => p.type === "page"); } catch {}
    if (!page) await sleep(1000);
  }
  if (!page) throw new Error("WebView debugger not reachable");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
  const send = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => {
    const m = await send("Runtime.evaluate", { expression: `(async()=>{ ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (m.result && m.result.exceptionDetails) return { error: m.result.exceptionDetails.exception && m.result.exceptionDetails.exception.description || m.result.exceptionDetails.text };
    return m.result && m.result.result ? m.result.result.value : m;
  };
  for (let i = 0; i < 30; i++) { if (await ev("return typeof D !== 'undefined' && typeof render === 'function'")) break; await sleep(1000); }
  return { ws, ev };
}

fs.mkdirSync("shots", { recursive: true });
let { ws, ev } = await connect();
await ev("window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message))); return 1");
log("environment", await ev("return { ua: navigator.userAgent, native: window.Capacitor && Capacitor.isNativePlatform(), platform: window.Capacitor && Capacitor.getPlatform(), vbmNative: vbmNative(), storageOK, LS_OK }"));
shot("01-first-open");
log("load sample data", await ev("loadSampleNow(); await new Promise(r => setTimeout(r, 800)); D.settings.storageNoticeSeen = true; save(); render(); return { sales: D.sales.length, machines: D.locations.length }"));
shot("02-dashboard");
log("all pages", await ev("const bad = []; for (const v of Object.keys(VIEWS)) { try { go(v, true); const t = document.querySelector('#view').innerText; if (/NaN|undefined|Infinity/.test(t)) bad.push(v + ': odd text'); if (document.documentElement.scrollWidth > innerWidth + 2) bad.push(v + ': wider than screen'); } catch (e) { bad.push(v + ': ' + e.message); } } go('sales', true); return { pages: Object.keys(VIEWS).length, problems: bad }"));
shot("03-sales-log");
log("add a sale", await ev("const s = D.sales[0]; D.sales.push(Object.assign({}, s, { id: uid(), date: today(), imp: undefined, nx: undefined })); const ok = save(); render(); return { saved: ok, sales: D.sales.length }"));
log("export backup", await ev("go('settings', true); let err = null; try { exportJSON(); } catch (e) { err = e.message; } await new Promise(r => setTimeout(r, 2500)); return { error: err }"));
shot("04-backup-share-sheet");
sh("adb shell input keyevent KEYCODE_BACK"); await sleep(1500);
log("pdf from reports", await ev("go('reports', true); window.print(); await new Promise(r => setTimeout(r, 9000)); return { modal: document.querySelector('#modal').hidden ? '' : document.querySelector('#modal').innerText.slice(0, 200) }"));
shot("05-pdf-share-sheet");
sh("adb shell input keyevent KEYCODE_BACK"); await sleep(1500);
log("csv export", await ev("go('sales', true); exportCSV('sales'); await new Promise(r => setTimeout(r, 2500)); return 1"));
shot("06-csv-share-sheet");
sh("adb shell input keyevent KEYCODE_BACK"); await sleep(1500);
const before = await ev("return D.sales.length");
log("phone screen pages", await ev("go('settings', true); return { fileCardHidden: !document.getElementById('cl-file'), syncCard: (document.querySelector('.clcard') || {}).innerText ? document.querySelector('.clcard').innerText.slice(0, 40) : '' }"));
shot("07-settings");
log("page errors so far", await ev("return window.__errs"));
ws.close();
// close the app completely and reopen it
sh(`adb shell am force-stop ${APP}`); await sleep(2000);
sh(`adb shell am start -n ${APP}/.MainActivity`); await sleep(8000);
({ ws, ev } = await connect());
log("data kept after restart", await ev(`return { before: ${before}, after: D.sales.length }`));
shot("08-after-restart");
ws.close();
fs.writeFileSync("shots/report.json", JSON.stringify(R, null, 1));
