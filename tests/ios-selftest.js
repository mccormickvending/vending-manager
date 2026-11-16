/* Test-only script: the iOS test workflow adds it to the app it builds for the simulator.
   It runs checks inside the real app and writes the results to the app's Documents folder. */
(function(){
  const write = async (name, obj) => { try{ await vbmPlugins().Filesystem.writeFile({path:name, data:JSON.stringify(obj, null, 1), directory:"DOCUMENTS", encoding:"utf8"}); }catch(e){ console.log("write failed", e); } };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function run(){
    for(let i = 0; i < 60 && !(typeof D !== "undefined" && typeof render === "function" && typeof vbmPlugins === "function"); i++) await wait(500);
    const R = {}, errs = [];
    window.addEventListener("error", e => errs.push(String(e.message)));
    let phase = ""; try{ phase = localStorage.getItem("__selftest") || ""; }catch(e){}
    if(phase === "1"){
      R.afterRestart = {sales:D.sales.length, expected:+localStorage.getItem("__selftest_n")};
      R.errors = errs; await write("selftest-2.json", R); return;
    }
    R.environment = {ua:navigator.userAgent, native:!!(window.Capacitor && Capacitor.isNativePlatform()), platform:window.Capacitor && Capacitor.getPlatform(), vbmNative:vbmNative(), storageOK, LS_OK};
    loadSampleNow(); await wait(800); D.settings.storageNoticeSeen = true; save(); render();
    R.sample = {sales:D.sales.length, machines:D.locations.length};
    const bad = []; for(const v of Object.keys(VIEWS)){ try{ go(v, true); const t = document.querySelector("#view").innerText; if(/NaN|undefined|Infinity/.test(t)) bad.push(v + ": odd text"); if(document.documentElement.scrollWidth > innerWidth + 2) bad.push(v + ": wider than screen"); }catch(e){ bad.push(v + ": " + e.message); } }
    R.pages = {count:Object.keys(VIEWS).length, problems:bad};
    const s0 = D.sales[0]; D.sales.push(Object.assign({}, s0, {id:uid(), date:today(), imp:undefined, nx:undefined})); R.addSale = {saved:save(), sales:D.sales.length};
    /* exports, captured instead of shared so the test can keep going */
    const real = vbmShareFile, got = [];
    window.vbmShareFile = async (n, d) => { got.push(n + " " + (d.length || d.byteLength)); return true; };
    try{ exportJSON(); exportCSV("sales"); downloadAccountant(); }catch(e){ got.push("error " + e.message); }
    go("reports", true); window.print();
    for(let i = 0; i < 40 && !got.some(g => /\.pdf /.test(g)); i++) await wait(500);
    R.exports = got;
    window.vbmShareFile = real;
    /* the plugins themselves: write and read back a file */
    try{ const F = vbmPlugins().Filesystem; const w = await F.writeFile({path:"probe.txt", data:"hello", directory:"CACHE", encoding:"utf8"}); const r = await F.readFile({path:"probe.txt", directory:"CACHE", encoding:"utf8"}); R.filesystem = {uri:!!w.uri, readBack:r.data}; }catch(e){ R.filesystem = {error:e.message}; }
    try{ localStorage.setItem("__selftest", "1"); localStorage.setItem("__selftest_n", String(D.sales.length)); }catch(e){}
    R.errors = errs;
    await write("selftest-1.json", R);
    /* finally open the real share sheet so the workflow can screenshot it */
    go("settings", true); exportJSON();
  }
  run();
})();
