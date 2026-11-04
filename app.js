'use strict';
const $ = id => document.getElementById(id);
const baseCategories = ['People', 'Travel', 'Documents', 'Food', 'Animals', 'Other'];
const icons = {People:'♙', Travel:'△', Documents:'▤', Food:'♧', Animals:'♘', Other:'▧'};
let mode = 'demo', token = '', items = [], custom = [], active = 'All photos', selected = new Set(), limit = 48, scanTimer, busy = false;
let demoItems;
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
  return items.filter(item => (active === 'All photos' || item.categories.includes(active)) && (!from || item.date >= from) && (!to || item.date <= to) && (!query || [item.name,...item.categories,...(item.labels || [])].join(' ').toLowerCase().includes(query)))
    .sort((a,b) => $('sort').value === 'name' ? a.name.localeCompare(b.name) : $('sort').value === 'old' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
}
function render() {
  $('modeBadge').textContent = mode === 'local' ? '● On your device' : '◈ Portfolio demo';
  $('navCount').textContent = items.length;
  $('demoButton').textContent = mode === 'local' ? 'Explore demo ↗' : 'About this demo ↗';
  $('folderPath').disabled = mode !== 'local';
  $('scanButton').textContent = mode === 'local' ? (busy ? 'Scanning…' : 'Scan folder →') : 'Local app required';
  $('scanButton').disabled = mode !== 'local' || busy;
  $('importHint').textContent = mode === 'local' ? 'Choose a folder on your Mac or a connected drive. Nothing is moved.' : 'Sample library · Run Frame locally to scan your drives. Photos never need to be uploaded.';
  $('categoryTotal').textContent = categories().length;
  $('categoryCards').innerHTML = categories().map(name => `<button class="category-card ${active === name ? 'active' : ''}" data-category="${escapeHTML(name)}" aria-pressed="${active === name}"><span class="cat-icon">${icons[name] || '◇'}</span><span class="cat-arrow">↗</span><span class="cat-name">${escapeHTML(name)}</span><span class="cat-count">${items.filter(item=>item.categories.includes(name)).length} photos</span></button>`).join('');
  $('categoryCards').querySelectorAll('button').forEach(button => button.onclick = () => {active = active === button.dataset.category ? 'All photos' : button.dataset.category; limit=48; render();});
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
  $('resultCount').textContent = `Showing ${Math.min(limit,visible.length)} of ${visible.length} photos${mode==='demo' ? ' · Sample images' : ''}`;
  $('selectionBar').hidden = !selected.size;
  $('selectionText').textContent = selected.size + ' selected';
  $('reviewButton').disabled = !selected.size || busy;
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
  modal('A little order. A lot of memories.', `<p>Frame groups photos visually before anything changes on disk.</p><ol><li>Run the local app and enter a folder path, including a mounted external drive.</li><li>On-device image analysis suggests content categories. Filter by date taken (or file modification date when unavailable).</li><li>Create your own categories and tag selected photos. These are visual labels.</li><li>Select photos, choose <b>Review moves</b>, and check each destination before confirming.</li></ol><p class="note">Moving uses the same drive, under <b>Organized / category</b> in your scanned folder. No full photo copies, no overwrites, no uploads. Small previews and a catalog use some local storage. Suggestions can be wrong; review them.</p><p>The portfolio version uses sample images and simulates moves only. The local app currently requires macOS, Python 3, and Apple command-line tools.</p>`,[{label:'Got it',primary:true,action:close}]);
}
$('helpButton').onclick = help;
$('demoButton').onclick = () => {if(mode==='local') window.open('?demo=1','_blank','noopener'); else help();};
$('emptyDemo').onclick = () => {if(mode==='local') window.open('?demo=1','_blank','noopener'); else loadDemo();};
$('libraryNav').onclick = () => {active='All photos';$('search').value='';$('fromDate').value='';$('toDate').value='';render();};
$('categoryNav').onclick = () => $('categoryCards').scrollIntoView({behavior:'smooth',block:'center'});
$('movesNav').onclick = () => selected.size ? reviewMoves() : notify('Select photos in your library, then choose Review moves.');
for(const id of ['search','fromDate','toDate','sort']) $(id).addEventListener('input',()=>{limit=48;render();});
$('clearFilters').onclick = () => {active='All photos';for(const id of ['search','fromDate','toDate']) $(id).value='';render();};
$('selectVisible').onclick = () => {const visible=visibleItems().slice(0,limit); if(visible.every(item=>selected.has(item.id))) visible.forEach(item=>selected.delete(item.id)); else visible.forEach(item=>selected.add(item.id));render();};
$('clearSelection').onclick = () => {selected.clear();render();};
$('loadMore').onclick = () => {limit+=48;render();};
function persistDemo() { try {sessionStorage.setItem('frame-demo',JSON.stringify({items,custom}));} catch {} }
function tagDialog(createOnly=false, replace=false) {
  if(busy) return notify('Wait for the scan to finish.');
  modal(createOnly?'Make it your own':replace?'Change photo categories':'Add photos to a category', `<p>${createOnly?'A category is a visual label. It won’t create folders or move files.':`${selected.size} selected photos. ${replace?'This replaces their existing categories.':'Their existing categories will be kept.'}`}</p><label for="tagName">${createOnly?'Category name':'Choose or type a category'}</label><input id="tagName" maxlength="60" placeholder="e.g. Family weekends" list="categoryOptions"><datalist id="categoryOptions">${categories().map(name=>`<option value="${escapeHTML(name)}">`).join('')}</datalist>`, [{label:'Cancel',action:close},{label:createOnly?'Create category':'Save category',primary:true,action:async()=>{
    const name=$('tagName').value;
    if(!/^[\p{L}\p{N}_][\p{L}\p{N}_ .&()-]{0,59}$/u.test(name)||name!==name.trim()) throw new Error('Use 1–60 letters, numbers, spaces, or & ( ) - .');
    const ids=createOnly?[]:[...selected];
    if(mode==='local'){const result=await request('/api/tag',{ids,category:name,replace});items=result.items;custom=result.custom;}
    else {if(!custom.includes(name))custom.push(name);items.forEach(item=>{if(ids.includes(item.id))item.categories=replace?[name]:[...new Set([...item.categories,name])];});persistDemo();}
    render();close();notify(createOnly?'Category created. Select photos to add them.':'Categories saved. No files moved.');
  }}]);
}
$('newCategory').onclick = () => tagDialog(true);
$('assignCategory').onclick = () => tagDialog();
$('replaceCategory').onclick = () => tagDialog(false,true);
async function reviewMoves() {
  if(!selected.size||busy) return;
  modal('Give these moments a home', `<p>${selected.size} selected photos will have one physical destination, even if they have several visual categories.</p><label for="moveCategory">Destination category</label><select id="moveCategory">${categories().map(name=>`<option>${escapeHTML(name)}</option>`).join('')}</select><p class="note">${mode==='demo'?'Demo only: no real files will be moved.':'Files will be moved within the same drive. Existing files are never overwritten.'}</p>`, [{label:'Cancel',action:close},{label:'Preview destinations →',primary:true,action:async()=>{
    const category=$('moveCategory').value;
    const plan=mode==='local'?await request('/api/preview',{ids:[...selected],category}):{entries:items.filter(item=>selected.has(item.id)).map(item=>({item_id:item.id,source:item.path,destination:`/Sample Photos/Organized/${category}/${item.name}`}))};
    modal(mode==='demo'?'Preview a demo move':'Review before moving', `<p>${plan.entries.length} originals · no copies. Check the paths below.</p><div class="note">${mode==='demo'?'This only updates the sample catalog.':'This changes file locations. Other apps or albums referencing the old paths may need to be updated.'}</div>${plan.entries.map(entry=>`<div class="move-entry"><b>${escapeHTML(entry.source)}</b><span>↳ ${escapeHTML(entry.destination)}</span></div>`).join('')}`, [{label:'Cancel',action:close},{label:mode==='demo'?'Simulate move':`Move ${plan.entries.length} originals`,primary:true,action:async()=>{
      if(mode==='local') {
        const result=await request('/api/move',{planId:plan.id});
        const state=await request('/api/state');items=state.items;
        selected.clear();render();
        modal('Move results', `<p>${result.moved.length} moved. ${result.errors.length} could not be moved.</p>${result.errors.map(entry=>`<div class="move-entry">${escapeHTML(entry.source)}<br>${escapeHTML(entry.error)}</div>`).join('')}<p class="note">A move log is saved locally in .local/moves.jsonl. No photos were copied.</p>`,[{label:'Back to library',primary:true,action:close}]);
      } else {plan.entries.forEach(entry=>{items.find(item=>item.id===entry.item_id).path=entry.destination;});persistDemo();selected.clear();render();close();notify('Demo move simulated. No real files were touched.');}
    }}]);
  }}]);
}
$('reviewButton').onclick = reviewMoves;
$('scanForm').onsubmit = async event => {
  event.preventDefault(); if(mode!=='local'||busy)return;
  try {await request('/api/scan',{path:$('folderPath').value});busy=true;selected.clear();render();poll();} catch(error){notify(error.message);}
};
async function poll() {
  clearTimeout(scanTimer);
  try {
    const state=await request('/api/state');token=state.token;items=state.items;custom=state.custom;busy=state.scan.running;
    if(state.root&&!$('folderPath').value)$('folderPath').value=state.root;
    $('scanStatus').hidden=!busy&&!state.scan.errors.length&&state.scan.total===0;
    $('scanStatus').replaceChildren();
    const text=document.createElement('span');text.textContent=busy?`Finding your moments… ${state.scan.processed} / ${state.scan.total} · ${state.scan.message}`:`Scan complete · ${items.length} photos · ${state.scan.errors.length} skipped`; $('scanStatus').append(text);
    if(busy){const progress=document.createElement('progress');progress.max=state.scan.total||1;progress.value=state.scan.processed;$('scanStatus').append(progress);}
    if(state.scan.errors.length){const detail=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Show skipped files';detail.append(summary);const list=document.createElement('pre');list.textContent=state.scan.errors.join('\n');list.style.whiteSpace='pre-wrap';detail.append(list);$('scanStatus').append(detail);}
    render();if(busy)scanTimer=setTimeout(poll,1500);
  }catch(error){busy=false;render();notify('Local app disconnected. Restart start.command and reload.');}
}
async function loadDemo() {
  try {const saved=JSON.parse(sessionStorage.getItem('frame-demo'));if(saved?.items?.length){items=saved.items;custom=saved.custom||[];render();return;}}catch{}
  const response=await fetch('assets/demo.json');if(!response.ok)throw new Error('Sample library could not load.');demoItems=await response.json();items=structuredClone(demoItems);custom=[];render();
}
async function init() {
  if(!new URLSearchParams(location.search).has('demo') && ['127.0.0.1','localhost'].includes(location.hostname)) {
    try {const state=await request('/api/state');if(state.mode==='local'){mode='local';token=state.token;await poll();return;}} catch {}
  }
  mode='demo';await loadDemo();
}
init().catch(error=>{render();notify(error.message);});
