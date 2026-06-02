function classify(f){ if(f?.source==="table_compare")return"table_compare"; if(f?.source==="run_workspace")return"run_workspace"; return"manual"; }
const SOURCE_ORDER=["manual","run_workspace","table_compare"];
// filtered list (filters already applied upstream)
const filtered=[
 {id:'b',projectId:'p1',projectName:'EUR',source:'table_compare',createdAt:'2026-05'},
 {id:'c',projectId:'p2',projectName:'GBP',source:'run_workspace',createdAt:'2026-04'},
 {id:'a',projectId:'p1',projectName:'EUR',createdAt:'2026-03'},
 {id:'d',projectId:'p2',projectName:'GBP',source:'table_compare',createdAt:'2026-02'},
];
function group(mode){
 if(mode==="flat") return [{key:"__all__",label:null,items:filtered}];
 if(mode==="project"){ const order=[],m=new Map();
   for(const f of filtered){const k=f.projectId||"__none__"; if(!m.has(k)){m.set(k,{key:k,label:f.projectName,items:[]});order.push(k);} m.get(k).items.push(f);}
   return order.map(k=>m.get(k)); }
 const m=new Map(); for(const f of filtered){const k=classify(f); if(!m.has(k))m.set(k,[]); m.get(k).push(f);}
 return SOURCE_ORDER.filter(k=>m.has(k)).map(k=>({key:k,items:m.get(k)}));
}
const total=g=>g.reduce((s,x)=>s+x.items.length,0);
for(const mode of ["flat","project","source"]){
 const g=group(mode);
 console.log(mode,'-> groups', g.map(x=>`${x.key}:${x.items.map(i=>i.id).join('')}`).join(' | '), '| total', total(g));
}
console.log('all totals equal filtered.length(4)?', ["flat","project","source"].every(m=>total(group(m))===filtered.length));
