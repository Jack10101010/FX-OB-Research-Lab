function classify(f){ if(f?.source==="table_compare")return"table_compare"; if(f?.source==="run_workspace")return"run_workspace"; return"manual"; }
const PROJECTS=[
 {id:'p1',name:'EUR',findings:[{id:'a',createdAt:'2026-03',note:'manual1'},{id:'b',createdAt:'2026-05',source:'table_compare',table:'T',bucket:'X',comparedRunId:'rB',note:'tc'}]},
 {id:'p2',name:'GBP',findings:[{id:'c',createdAt:'2026-04',source:'run_workspace',runId:'rA',note:'rw'}]},
 {id:'p3',name:'JPY',findings:[]},
 {id:'p4',name:'XAU'}, // no findings key at all
];
const out=[];
for(const p of PROJECTS){ for(const f of (p.findings||[])){ out.push({...f,projectId:p.id,projectName:p.name}); } }
out.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
console.log('flattened order ->', out.map(f=>f.id).join(','), '(expect b,c,a newest-first)');
console.log('null-safe (p4 no findings) -> total', out.length, '(expect 3)');
const filt=(src,proj)=>out.filter(f=>(src==='all'||classify(f)===src)&&(proj==='all'||f.projectId===proj));
console.log('all/all ->', filt('all','all').map(f=>f.id).join(','));
console.log('table_compare/all ->', filt('table_compare','all').map(f=>f.id).join(','), '(expect b)');
console.log('manual/all ->', filt('manual','all').map(f=>f.id).join(','), '(expect a)');
console.log('all/p2 ->', filt('all','p2').map(f=>f.id).join(','), '(expect c)');
console.log('run_workspace/p1 (no match) ->', JSON.stringify(filt('run_workspace','p1')), '(expect [])');
const counts={all:0,manual:0,run_workspace:0,table_compare:0}; for(const f of out){counts.all++;counts[classify(f)]++;}
console.log('counts ->', JSON.stringify(counts), '(expect all3 manual1 rw1 tc1)');
