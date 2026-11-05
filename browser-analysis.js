'use strict';
(function(root){
  function findMatchingHashes(entries) {
    const grouped=new Map();
    for(const entry of entries) {if(!grouped.has(entry.digest))grouped.set(entry.digest,[]);grouped.get(entry.digest).push(entry.id);}
    return [...grouped.values()].filter(group=>group.length>1);
  }
  function difference(a,b) {
    let count=0;
    for(let i=0;i<a.length;i++){let v=parseInt(a[i],16)^parseInt(b[i],16);while(v){count+=v&1;v>>=1;}}
    return count;
  }
  function chooseRecommended(a,b){
    const score=item=>Math.log1p(Math.max(0,item.sharpness))*Math.max(0,Math.min(1,item.exposure))**2;
    return score(a)>=score(b)?a.id:b.id;
  }
  function categoriesFromDetections(detections, name) {
    const found=new Set(detections.filter(d=>d.score>=.55).map(d=>d.class));
    const categories=[];
    const includes=values=>values.some(value=>found.has(value));
    if(found.has('person')) categories.push('People');
    if(includes(['airplane','train','boat'])) categories.push('Travel');
    if(includes(['bird','cat','dog','horse','sheep','cow','elephant','bear','zebra','giraffe'])) categories.push('Animals');
    if(includes(['banana','apple','sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake'])) categories.push('Food');
    if(/(?:^|[ _.-])screen[ _-]?shot(?:[ _.-]|$)/i.test(name)) categories.push('Screenshots');
    else if(/(?:^|[ _.-])(?:receipt|invoice|document|scan)(?:[ _.-]|$)/i.test(name)) categories.push('Documents');
    return categories.length?categories:['Other'];
  }
  const api={findMatchingHashes,difference,chooseRecommended,categoriesFromDetections};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  if(root)root.FrameBrowserAnalysis=api;
})(typeof window==='undefined'?null:window);
