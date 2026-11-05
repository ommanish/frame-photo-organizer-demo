'use strict';
const $ = id => document.getElementById(id);
const baseCategories = ['People', 'Travel', 'Documents', 'Screenshots', 'Food', 'Animals', 'Duplicates', 'Similar shots', 'Other'];
const icons = {People:'♙', Travel:'△', Documents:'▤', Screenshots:'▣', Food:'♧', Animals:'♘', Duplicates:'▣', 'Similar shots':'◫', Other:'▧'};
let mode = 'demo', token = '', items = [], custom = [], active = 'All photos', selected = new Set(), limit = 48, scanTimer, busy = false;
let demoItems;
let browserUrls = [], browserFiles = new Map(), browserGroups = [], browserRun = 0;
function releaseBrowserUrls(){browserUrls.forEach(url=>URL.revokeObjectURL(url));browserUrls=[];}
let duplicateIds = new Set(), duplicatesChecked = false, catalogRoot = "", similarPairs = [], similarIds = new Set();
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmtDate = date => new Date(date + 'T12:00:00').toLocaleDateString(undefined, {month:'short',day:'numeric',year:'numeric'});
const size = value => value > 1048576 ? (value/1048576).toFixed(1)+' MB' : Math.round(value/1024)+' KB';
function notify(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(notify.timer); notify.timer = setTimeout(() => $('toast').hidden = true, 5500); }
async function request(path, data) {
  const response = await fetch(path, {method: data ? 'POST' : 'GET', headers: data ? {'Content-Type':'application/json','X-Frame-Token':token} : {}, body: data ? JSON.stringify(data) : undefined});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
function categories() { return [...new Set([...baseCategories,...custom,...items.flatMap(item=>item.categories)])]; }
function visibleItems() {
  const query = $('search').value.toLowerCase().trim(), from = $('fromDate').value, to = $('toDate').value;
  return items.filter(item => (active === 'All photos' || (active === 'Duplicates' ? duplicateIds.has(item.id) : active === 'Similar shots' ? similarIds.has(item.id) : item.categories.includes(active))) && (!from || item.date >= from) && (!to || item.date <= to) && (!query || [item.name,...item.categories,...(item.labels || [])].join(' ').toLowerCase().includes(query)))
    .sort((a,b) => $('sort').value === 'name' ? a.name.localeCompare(b.name) : $('sort').value === 'old' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
}
function render() {
  $('modeBadge').textContent = mode === 'local' ? '● On your device' : mode === 'browser' ? '● Browser library' : '◈ Portfolio demo';
  $('navCount').textContent = items.length;
  $('demoButton').textContent = mode === 'local' ? 'Explore demo ↗' : mode === 'browser' ? 'Open sample demo ↗' : 'About this demo ↗';
  $('folderPath').hidden = mode !== 'local';
  $('folderPath').disabled = mode !== 'local';
  $('scanButton').textContent = mode === 'local' ? (busy ? 'Scanning…' : 'Scan folder →') : 'Local app required';
  $('scanButton').hidden = mode !== 'local';
  $('scanButton').disabled = mode !== 'local' || busy;
  $('chooseFolder').hidden = false;
  $('chooseFolder').textContent = mode === 'local' ? 'Choose folder…' : 'Choose photo folder…';
  $('chooseFolder').disabled = busy;
  $('importHint').textContent = mode === 'local' ? 'Choose a folder on your Mac or a connected drive. Nothing is moved.' : mode === 'browser' ? 'Your folder stays in this browser. Photos are analyzed on your device. Content labels are suggestions; dates use file modification time.' : 'Choose a folder. Some browsers say “upload”; Frame processes the files on your device without sending your photos to a server.';
  $('categoryTotal').textContent = categories().length;
  $('categoryCards').innerHTML = categories().map(name => `<button class="category-card ${active === name ? 'active' : ''}" data-category="${escapeHTML(name)}" aria-pressed="${active === name}"><span class="cat-icon">${icons[name] || '◇'}</span><span class="cat-arrow">↗</span><span class="cat-name">${escapeHTML(name)}</span><span class="cat-count">${name === 'Duplicates' ? (duplicatesChecked ? duplicateIds.size + ' photos' : (mode==='browser' ? 'Checking…' : 'Run duplicate check')) : name === 'Similar shots' ? similarIds.size + ' photos' : items.filter(item=>item.categories.includes(name)).length + ' photos'}</span></button>`).join('');
  $('categoryCards').querySelectorAll('button').forEach(button => button.onclick = () => {if (button.dataset.category === 'Similar shots') { showSimilar(); return; } if (button.dataset.category === 'Duplicates' && mode === 'browser' && duplicatesChecked) {showBrowserDuplicates(); return;} if (button.dataset.category === 'Duplicates' && !duplicatesChecked) { $('duplicatesNav').click(); return; } active = active === button.dataset.category ? 'All photos' : button.dataset.category; limit=48; render();});
  const visible = visibleItems();
  $('libraryTitle').textContent = active + ' ';
  const count = document.createElement('span'); count.textContent = visible.length; $('libraryTitle').append(count);
  $('photoGrid').innerHTML = visible.slice(0,limit).map(item => `<article class="photo-card ${selected.has(item.id) ? 'selected' : ''}"><div class="photo-image"><img src="${escapeHTML(item.thumbnail)}" alt="${escapeHTML(item.name)}" loading="lazy"><button class="photo-open" data-id="${item.id}" aria-label="View ${escapeHTML(item.name)}"></button><input class="photo-checkbox" type="checkbox" data-id="${item.id}" aria-label="Select ${escapeHTML(item.name)}" ${selected.has(item.id)?'checked':''}><span class="photo-tag">${escapeHTML(item.categories[0] || 'Other')}${item.categories.length>1?' +'+(item.categories.length-1):''}</span></div><p class="photo-name">${escapeHTML(item.name)}</p><p class="photo-meta"><span>${fmtDate(item.date)}</span><span>${size(item.size)}</span></p></article>`).join('');
  $('photoGrid').querySelectorAll('.photo-checkbox').forEach(box => box.onchange = () => {box.checked ? selected.add(box.dataset.id) : selected.delete(box.dataset.id); render();});
  $('photoGrid').querySelectorAll('.photo-open').forEach(button => button.onclick = () => showPhoto(items.find(item=>item.id===button.dataset.id)));
  $('emptyState').hidden = visible.length > 0;
  $('emptyState').querySelector('h3').textContent = items.length ? 'No moments match these filters' : 'Your memories start here';
  $('emptyState').querySelector('p').textContent = items.length ? 'Try another category, a wider date range, or a different search.' : 'Scan a photo folder, or explore the sample library to see Frame in action.';
  $('emptyDemo').hidden = items.length > 0;
  $('loadMore').hidden = visible.length <= limit;
  if (typeof moreObserver !== 'undefined') { moreObserver.unobserve($('loadMore')); moreObserver.observe($('loadMore')); }
  $('resultCount').textContent = `Showing ${Math.min(limit,visible.length)} of ${visible.length} photos${mode==='demo' ? ' · Sample images' : ''}`;
  $('selectionBar').hidden = !selected.size;
  $('selectionText').textContent = selected.size + ' selected';
  $('reviewButton').disabled = !selected.size || busy || mode === 'browser';
  $('reviewDeletion').hidden = mode === 'browser';
  $('newCategory').disabled = busy;
}
function modal(title, html, buttons = []) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = html;
  $('modalActions').replaceChildren();
  for (const spec of buttons) {
    const button = document.createElement('button'); button.textContent = spec.label; button.className = 'button ' + (spec.primary ? 'primary' : 'secondary');
    button.onclick = async () => {button.disabled=true; try { await spec.action(); } catch(error) { notify(error.message); } finally {button.disabled=false;} };
    $('modalActions').append(button);
  }
  if (!$('modal').open) $('modal').showModal();
}
const close = () => $('modal').close();
$('closeModal').onclick = close;
function showPhoto(item) {
  modal(item.name, `<img class="detail-image" src="${escapeHTML(item.thumbnail)}" alt="${escapeHTML(item.name)}"><p>${escapeHTML(item.categories.join(' · '))}</p><p>${escapeHTML(item.dateSource || 'Date taken')}: ${fmtDate(item.date)} · ${size(item.size)}</p><p class="detail-path">${escapeHTML(item.path || 'Portfolio sample')}</p><p class="note">Categories are suggestions, not certainty. Select photos to add or change categories.</p>`, [{label:selected.has(item.id)?'Deselect photo':'Select photo', primary:true, action:()=>{selected.has(item.id)?selected.delete(item.id):selected.add(item.id);render();close();}}]);
}
function help() {
  modal('A little order. A lot of memories.', `<p>Frame groups photos visually before anything changes on disk.</p><ol><li>Run the local app and enter a folder path, including a mounted external drive.</li><li>On-device image analysis suggests content categories. Filter by date taken (or file modification date when unavailable).</li><li>Create your own categories and tag selected photos. These are visual labels.</li><li>Select photos, choose <b>Review moves</b>, and check each destination before confirming.</li></ol><p class="note">Moving uses the same drive, under <b>Organized / category</b> in your scanned folder. No full photo copies, no overwrites, no uploads. Small previews and a catalog use some local storage. Suggestions can be wrong; review them.</p><p>On the live website, choose a folder to view supported photos locally, filter by modified date, and assign categories manually for this session. Exact duplicates and similar shots are checked locally in your browser. The lightweight model suggests People, Animals, Food and some Travel. Screenshots and Documents are suggested from filenames and may be incomplete. Moving files requires the macOS local app.</p>`,[{label:'Got it',primary:true,action:close}]);
}
$('helpButton').onclick = help;
$('demoButton').onclick = () => {if(mode==='local') window.open('?demo=1','_blank','noopener'); else if(mode==='browser') {browserRun++;busy=false;releaseBrowserUrls();browserFiles.clear();mode='demo';selected.clear();active='All photos';$('scanStatus').hidden=true;loadDemo();} else help();};
$('emptyDemo').onclick = () => {if(mode==='local') window.open('?demo=1','_blank','noopener'); else loadDemo();};
$('libraryNav').onclick = () => {active='All photos';$('search').value='';$('fromDate').value='';$('toDate').value='';render();};
$('categoryNav').onclick = () => $('categoryCards').scrollIntoView({behavior:'smooth',block:'center'});
$('movesNav').onclick = () => selected.size ? reviewMoves() : notify('Select photos in your library, then choose Review moves.');
function showSimilar() {
  if(mode==='browser' && busy) return notify('Still checking this folder.');
  active='Similar shots'; limit=48; render();
  const byId=new Map(items.map(item=>[item.id,item]));
  const chosen=new Set(selected);
  const pairs=similarPairs.filter(pair=>byId.has(pair.a)&&byId.has(pair.b));
  const cards=pairs.map((pair,i)=>`<h3>Possible match ${i+1}</h3><div class="duplicate-group">${[pair.a,pair.b].map(id=>{const item=byId.get(id);return `<div><img src="${escapeHTML(item.thumbnail)}" alt="${escapeHTML(item.name)}"><p>${escapeHTML(item.name)} ${id===pair.recommended?'<strong>· Suggested to keep</strong>':''}</p><p>${size(item.size)}</p><p class="detail-path">${escapeHTML(item.path)}</p><label><input type="checkbox" class="similar-select" value="${escapeHTML(id)}" ${chosen.has(id)?'checked':''}>${mode==='browser'?' Select photo':' Select for review folder'}</label></div>`;}).join('')}</div>`).join('');
  modal('Similar shots', `<p>${pairs.length} visually similar pairs. These may be different moments; compare carefully. Suggested shots use estimated sharpness and exposure from previews. Compare expressions and composition yourself; the suggestion may be wrong. Photos are compared with nearby dates.</p>${cards || '<p>No similar-shot comparison is available for this folder yet.</p>'}`, [{label:'Cancel',action:close},{label:'Keep selection',primary:true,action:()=>{selected=chosen;render();close();if(selected.size && mode==='local')reviewMoves(true); else if(selected.size && mode==='browser')notify('Selection saved for this session. Moving files requires the local app.');}}]);
  document.querySelectorAll('.similar-select').forEach(box=>box.onchange=()=>{box.checked?chosen.add(box.value):chosen.delete(box.value);document.querySelectorAll('.similar-select').forEach(other=>{if(other.value===box.value)other.checked=box.checked;});});
}
$('duplicatesNav').onclick = async () => {
  if (mode === 'browser') { if(!duplicatesChecked) return notify('Still checking this folder.'); return showBrowserDuplicates(); }
  if (mode !== 'local') return notify('Choose a real photo folder first.');
  try {
    await request('/api/find-duplicates', {});
    modal('Checking for exact duplicates', '<p>Comparing file contents on your device. Nothing is moved or deleted.</p>', []);
    const check = async () => {
      try {
        const result = await request('/api/duplicates');
        if (result.running) { setTimeout(check, 1500); return; }
        const byId = new Map(items.map(item => [item.id, item]));
        const groups = result.groups.map(group => group.map(id => byId.get(id)).filter(Boolean)).filter(group=>group.length>1);
        if (result.root !== catalogRoot) { close(); notify('The library changed; check duplicates again.'); return; }
        duplicateIds = new Set(groups.flat().map(item => item.id)); duplicatesChecked = true; active = 'Duplicates'; limit = 48; render();
        const cards = groups.map((group,i)=>`<h3>Matching group ${i+1}</h3><div class="duplicate-group">${group.map(item=>`<div><img src="${escapeHTML(item.thumbnail)}" alt="${escapeHTML(item.name)}"><p>${escapeHTML(item.name)}</p><p class="detail-path">${escapeHTML(item.path)}</p><label><input type="checkbox" class="duplicate-select" value="${escapeHTML(item.id)}" ${selected.has(item.id)?'checked':''}> Select for review</label></div>`).join('')}</div>`).join('');
        modal('Exact duplicates', `<p>${groups.length} matching groups. Files are identical byte for byte; choose which ones you want to review. Nothing is moved or deleted.</p>${result.errors.length?`<p class="note">${result.errors.length} files could not be checked.</p>`:''}${cards || '<p>No exact duplicates found.</p>'}`, [{label:'Close',action:close},{label:'Keep selection',primary:true,action:()=>{document.querySelectorAll('.duplicate-select').forEach(box=>box.checked?selected.add(box.value):selected.delete(box.value));render();close();}}]);
      } catch(error) {close();notify(error.message);}
    };
    check();
  } catch(error) {notify(error.message);}
};
for(const id of ['search','fromDate','toDate','sort']) $(id).addEventListener('input',()=>{limit=48;render();});
$('clearFilters').onclick = () => {active='All photos';for(const id of ['search','fromDate','toDate']) $(id).value='';$('sort').value='new';limit=48;render();};
$('selectVisible').onclick = () => {const visible=visibleItems().slice(0,limit); if(visible.every(item=>selected.has(item.id))) visible.forEach(item=>selected.delete(item.id)); else visible.forEach(item=>selected.add(item.id));render();};
$('clearSelection').onclick = () => {selected.clear();render();};
$('loadMore').onclick = () => {limit+=48;render();};
const moreObserver = new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting) && !$('loadMore').hidden) {
    limit += 48;
    render();
  }
}, {rootMargin:'300px'});
moreObserver.observe($('loadMore'));
function persistDemo() { try {sessionStorage.setItem('frame-demo',JSON.stringify({items,custom}));} catch {} }
function tagDialog(createOnly=false, replace=false) {
  if(busy) return notify('Wait for the scan to finish.');
  modal(createOnly?'Make it your own':replace?'Change photo categories':'Add photos to a category', `<p>${createOnly?'A category is a visual label. It won’t create folders or move files.':`${selected.size} selected photos. ${replace?'This replaces their existing categories.':'Their existing categories will be kept.'}`}</p><label for="tagName">${createOnly?'Category name':'Choose or type a category'}</label><input id="tagName" maxlength="60" placeholder="e.g. Family weekends" list="categoryOptions"><datalist id="categoryOptions">${categories().map(name=>`<option value="${escapeHTML(name)}">`).join('')}</datalist>`, [{label:'Cancel',action:close},{label:createOnly?'Create category':'Save category',primary:true,action:async()=>{
    const name=$('tagName').value;
    if(!/^[\p{L}\p{N}_][\p{L}\p{N}_ .&()-]{0,59}$/u.test(name)||name!==name.trim()) throw new Error('Use 1–60 letters, numbers, spaces, or & ( ) - .');
    const ids=createOnly?[]:[...selected];
    if(mode==='local'){const result=await request('/api/tag',{ids,category:name,replace});items=result.items;custom=result.custom;}
    else {if(!custom.includes(name))custom.push(name);items.forEach(item=>{if(ids.includes(item.id))item.categories=replace?[name]:[...new Set([...item.categories,name])];});if(mode==='demo')persistDemo();}
    render();close();notify(createOnly?'Category created. Select photos to add them.':'Categories saved. No files moved.');
  }}]);
}
$('newCategory').onclick = () => tagDialog(true);
$('assignCategory').onclick = () => tagDialog();
$('replaceCategory').onclick = () => tagDialog(false,true);
async function reviewMoves(reviewDeletion=false) {
  if(!selected.size||busy) return;
  if(mode==='browser') return notify('Moving files requires the local app.');
  modal(reviewDeletion?'Review folder for later deletion':'Give these moments a home', `<p>${selected.size} selected photos will have one physical destination, even if they have several visual categories.</p>${reviewDeletion?'<p class="note">Destination: Organized / Review for deletion. Files are not deleted; you can inspect the folder and decide what to do later.</p>':`<label for="moveCategory">Destination category</label><select id="moveCategory">${categories().filter(name=>!['Duplicates','Similar shots'].includes(name)).map(name=>`<option>${escapeHTML(name)}</option>`).join('')}</select>`}<p class="note">${mode==='demo'?'Demo only: no real files will be moved.':'Files will be moved within the same drive. Existing files are never overwritten.'}</p>${mode==='local'?'<label><input type="checkbox" id="allowCopy"> If a safe rename is unavailable, copy and verify one file at a time before removing its original. Needs free space; interrupted operations can leave a copy for review.</label>':''}`, [{label:'Cancel',action:close},{label:'Preview destinations →',primary:true,action:async()=>{
    const category=reviewDeletion?'Review for deletion':$('moveCategory').value;
    const allowCopy=mode==='local' && $('allowCopy').checked;
    const plan=mode==='local'?await request('/api/preview',{ids:[...selected],category,allowCopy}):{entries:items.filter(item=>selected.has(item.id)).map(item=>({item_id:item.id,source:item.path,destination:`/Sample Photos/Organized/${category}/${item.name}`}))};
    modal(mode==='demo'?'Preview a demo move':'Review before moving', `<p>${plan.entries.length} originals. Check the paths below.</p>${allowCopy?'<p class="note">Opted in: on drives without safe rename, each file will be copied, verified, then its original removed. Temporary space is needed.</p>':''}<div class="note">${mode==='demo'?'This only updates the sample catalog.':'This changes file locations. Other apps or albums referencing the old paths may need to be updated.'}</div>${plan.entries.map(entry=>`<div class="move-entry"><b>${escapeHTML(entry.source)}</b><span>↳ ${escapeHTML(entry.destination)}</span></div>`).join('')}`, [{label:'Cancel',action:close},{label:mode==='demo'?'Simulate move':`Move ${plan.entries.length} originals`,primary:true,action:async()=>{
      if(mode==='local') {
        const result=await request('/api/move',{planId:plan.id});
        const state=await request('/api/state');items=state.items;
        selected.clear();render();
        modal('Move results', `<p>${result.moved.length} moved. ${result.errors.length} could not be moved.</p>${[...result.errors, ...(result.warnings || [])].map(entry=>`<div class="move-entry">${escapeHTML(entry.source)}<br>${escapeHTML(entry.error)}</div>`).join('')}<p class="note">A move log is saved locally in .local/moves.jsonl. If a copy failed, the original is retained and a partial copy may remain for review.</p>`,[{label:'Back to library',primary:true,action:close}]);
      } else {plan.entries.forEach(entry=>{items.find(item=>item.id===entry.item_id).path=entry.destination;});persistDemo();selected.clear();render();close();notify('Demo move simulated. No real files were touched.');}
    }}]);
  }}]);
}
$('reviewButton').onclick = () => reviewMoves();
$('reviewDeletion').onclick = () => reviewMoves(true);
$('chooseFolder').onclick = async () => {
  if(mode!=='local') {
    if (typeof window.showDirectoryPicker === 'function' && !new URLSearchParams(location.search).has('compat')) {
      try { const root=await window.showDirectoryPicker({mode:'read'}); const files=[]; await collectDirectory(root, files, root.name); openBrowserFiles(files); }
      catch(error) {if(error.name!=='AbortError')notify('Could not open the folder: '+error.message);} return;
    }
    $('browserFolder').click(); return;
  }
  try {const {path}=await request('/api/choose-folder',{}); if(path){$('folderPath').value=path;$('scanButton').focus();}} catch(error){notify(error.message);}
};
async function collectDirectory(directory, result, prefix) {
  for await(const [name,handle] of directory.entries()) {
    if(name.startsWith('.')) continue;
    const path=prefix+'/'+name;
    if(handle.kind==='directory') await collectDirectory(handle,result,path);
    else if(/\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(name)) result.push({file:await handle.getFile(),path});
  }
}
function yieldBrowser(){return new Promise(resolve=>setTimeout(resolve,0));}
async function browserVisual(file, detector) {
  const image=await createImageBitmap(file);
  try {
    let detections=[];
    if(detector) { const sample=document.createElement('canvas');const scale=Math.min(1,600/Math.max(image.width,image.height));sample.width=Math.max(1,Math.round(image.width*scale));sample.height=Math.max(1,Math.round(image.height*scale));sample.getContext('2d').drawImage(image,0,0,sample.width,sample.height);detections=await detector.detect(sample,20,.55); }
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,64,64);
    const raw=ctx.getImageData(0,0,64,64).data, gray=new Float32Array(4096);
    for(let i=0;i<4096;i++)gray[i]=.299*raw[i*4]+.587*raw[i*4+1]+.114*raw[i*4+2];
    let sum=0,sum2=0,clipped=0;
    for(let y=1;y<63;y++)for(let x=1;x<63;x++){const i=y*64+x,v=gray[i],lap=4*v-gray[i-1]-gray[i+1]-gray[i-64]-gray[i+64];sum+=lap;sum2+=lap*lap;if(v<=5||v>=250)clipped++;}
    const n=62*62;
    canvas.width=9;canvas.height=8;ctx.drawImage(image,0,0,9,8);const small=ctx.getImageData(0,0,9,8).data;
    let bits='';for(let y=0;y<8;y++)for(let x=0;x<8;x++){const a=(y*9+x)*4,b=a+4;bits+=(small[a]*.299+small[a+1]*.587+small[a+2]*.114)>(small[b]*.299+small[b+1]*.587+small[b+2]*.114)?'1':'0';}
    let hash='';for(let i=0;i<bits.length;i+=4)hash+=parseInt(bits.slice(i,i+4),2).toString(16);
    return {hash,sharpness:Math.max(0,sum2/n-(sum/n)**2),exposure:1-clipped/n,aspect:image.width/image.height,detections};
  } finally {image.close();}
}
let browserDetectorPromise;
function loadBrowserDetector(){
  if(!browserDetectorPromise) browserDetectorPromise=FrameDetector.load('assets/model/model.json').catch(error=>{browserDetectorPromise=null;throw error;});
  return browserDetectorPromise;
}
async function analyzeBrowserFiles(run) {
  let detector=null, detectorError='';
  $('scanStatus').hidden=false;$('scanStatus').textContent='Loading the on-device recognition model (about 18 MB, cached by your browser)…';
  try{detector=await loadBrowserDetector();}catch(error){detectorError=error.message||'Model could not be loaded';}
  if(run!==browserRun)return;
  const groups=new Map(), digestEntries=[], features=[], errors=[];
  for(const item of items){if(!groups.has(item.size))groups.set(item.size,[]);groups.get(item.size).push(item);}
  let count=0;
  for(const item of items) {
    if(run!==browserRun)return;
    $('scanStatus').hidden=false;$('scanStatus').textContent=`Checking photos on this device… ${++count} / ${items.length}`;
    try {const feature=await browserVisual(browserFiles.get(item.id),detector);item.categories=FrameBrowserAnalysis.categoriesFromDetections(feature.detections,item.name);features.push({...feature,id:item.id,date:item.date});} catch {errors.push(item.name);}
    if(groups.get(item.size).length>1 && item.size<=128*1024*1024) {
      try {const bytes=await browserFiles.get(item.id).arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);digestEntries.push({id:item.id,digest:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')});}catch{errors.push(item.name);}
    } else if(groups.get(item.size).length>1) errors.push(item.name);
    if(count%5===0)await yieldBrowser();
  }
  if(run!==browserRun)return;
  browserGroups=FrameBrowserAnalysis.findMatchingHashes(digestEntries); duplicateIds=new Set(browserGroups.flat());duplicatesChecked=true;
  features.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)); similarPairs=[];
  for(let i=0;i<features.length;i++) {for(let j=i+1;j<Math.min(features.length,i+151);j++){
    const a=features[i],b=features[j];if(Math.abs(Math.log(a.aspect/b.aspect))>.15)continue;
    if(FrameBrowserAnalysis.difference(a.hash,b.hash)<=6)similarPairs.push({a:a.id,b:b.id,recommended:FrameBrowserAnalysis.chooseRecommended(a,b)});
  } if(i%25===0)await yieldBrowser();if(run!==browserRun)return;}
  similarIds=new Set(similarPairs.flatMap(pair=>[pair.a,pair.b]));busy=false;
  $('scanStatus').textContent=`Local check complete · ${browserGroups.length} exact duplicate groups · ${similarPairs.length} possible similar pairs${errors.length?' · '+new Set(errors).size+' files could not be fully checked':''}${detectorError?' · content recognition unavailable: '+detectorError+'; categories may be incomplete':''}.`;
  render();
}
function openBrowserFiles(entries) {
  const files=entries.filter(entry=>!entry.file.name.startsWith('.') && /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(entry.file.name));
  if(!files.length) {notify('No supported browser images found. Try JPEG, PNG, GIF, WebP, AVIF, or BMP.');return;}
  const run=++browserRun;releaseBrowserUrls();browserFiles.clear();selected.clear();custom=[];active='All photos';limit=48;
  duplicateIds.clear();duplicatesChecked=false;similarIds.clear();similarPairs=[];browserGroups=[];mode='browser';busy=true;
  items=files.map(({file,path},index)=>{const thumbnail=URL.createObjectURL(file);browserUrls.push(thumbnail);const id='browser-'+index;browserFiles.set(id,file);
    const date=new Date(file.lastModified),pad=n=>String(n).padStart(2,'0');return {id,name:file.name,path:path||file.name,date:`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`,dateSource:'File modified',size:file.size,categories:['Other'],labels:[],thumbnail};});
  render();analyzeBrowserFiles(run).catch(error=>{if(run===browserRun){busy=false;$('scanStatus').textContent='Local analysis stopped: '+error.message;render();}});
}
$('browserFolder').onchange = event => openBrowserFiles(Array.from(event.target.files||[],file=>({file,path:file.webkitRelativePath||file.name})));
function showBrowserDuplicates() {
  const byId=new Map(items.map(item=>[item.id,item])),chosen=new Set(selected);
  const cards=browserGroups.map((group,i)=>`<h3>Exact match ${i+1}</h3><div class="duplicate-group">${group.map(id=>{const item=byId.get(id);return `<div><img src="${escapeHTML(item.thumbnail)}" alt="${escapeHTML(item.name)}"><p>${escapeHTML(item.name)}</p><p class="detail-path">${escapeHTML(item.path)}</p><label><input type="checkbox" class="browser-duplicate-select" value="${escapeHTML(id)}" ${chosen.has(id)?'checked':''}> Select</label></div>`;}).join('')}</div>`).join('');
  active='Duplicates';limit=48;render();modal('Exact duplicates',`<p>${browserGroups.length} matching groups. Files have identical SHA-256 checksums. Nothing has been moved or deleted.</p>${cards||'<p>No exact matches found.</p>'}`,[{label:'Close',action:close},{label:'Keep selection',primary:true,action:()=>{selected=chosen;render();close();}}]);
  document.querySelectorAll('.browser-duplicate-select').forEach(box=>box.onchange=()=>box.checked?chosen.add(box.value):chosen.delete(box.value));
}
$('scanForm').onsubmit = async event => {
  event.preventDefault(); if(mode!=='local'||busy)return;
  try {await request('/api/scan',{path:$('folderPath').value});busy=true;selected.clear();render();poll();} catch(error){notify(error.message);}
};
async function poll() {
  clearTimeout(scanTimer);
  try {
    const state=await request('/api/state');token=state.token;items=state.items;custom=state.custom;busy=state.scan.running;
    if (catalogRoot !== state.root) { catalogRoot=state.root; duplicateIds.clear(); duplicatesChecked=false; similarPairs=[]; similarIds.clear(); if(['Duplicates','Similar shots'].includes(active)) active='All photos'; }
    if(state.root&&!$('folderPath').value)$('folderPath').value=state.root;
    $('scanStatus').hidden=!busy&&!state.scan.errors.length&&state.scan.total===0;
    $('scanStatus').replaceChildren();
    const text=document.createElement('span');text.textContent=busy?`Finding your moments… ${state.scan.processed} / ${state.scan.total} · ${state.scan.message}`:`Scan complete · ${items.length} photos · ${state.scan.errors.length} skipped`; $('scanStatus').append(text);
    if(busy){const progress=document.createElement('progress');progress.max=state.scan.total||1;progress.value=state.scan.processed;$('scanStatus').append(progress);}
    if(state.scan.errors.length){const detail=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Show skipped files';detail.append(summary);const list=document.createElement('pre');list.textContent=state.scan.errors.join('\n');list.style.whiteSpace='pre-wrap';detail.append(list);$('scanStatus').append(detail);}
    if (!busy && catalogRoot) { const similar=await request('/api/similar'); if(similar.root===catalogRoot) {similarPairs=similar.pairs; similarIds=new Set(similarPairs.flatMap(pair=>[pair.a,pair.b]));} }
    render();if(busy)scanTimer=setTimeout(poll,1500);
  }catch(error){busy=false;render();notify('Local app disconnected. Restart start.command and reload.');}
}
async function loadDemo() {
  try {const saved=JSON.parse(sessionStorage.getItem('frame-demo'));if(saved?.items?.length){items=saved.items;custom=saved.custom||[];render();return;}}catch{}
  const response=await fetch('assets/demo.json');if(!response.ok)throw new Error('Sample library could not load.');demoItems=await response.json();items=structuredClone(demoItems);custom=[];render();
}
async function init() {
  if(!new URLSearchParams(location.search).has('demo') && ['127.0.0.1','localhost'].includes(location.hostname)) {
    try {const state=await request('/api/state');if(state.mode==='local'){mode='local';token=state.token;await poll(); const similar=await request('/api/similar'); if(similar.root===catalogRoot) { similarPairs=similar.pairs; similarIds=new Set(similarPairs.flatMap(pair=>[pair.a,pair.b])); render(); } const duplicates=await request('/api/duplicates'); if(!duplicates.running && duplicates.root === catalogRoot && duplicates.root) { duplicateIds = new Set(duplicates.groups.flat()); duplicatesChecked=true; render(); } return;}} catch {}
  }
  mode='demo';await loadDemo();
}
init().catch(error=>{render();notify(error.message);});
