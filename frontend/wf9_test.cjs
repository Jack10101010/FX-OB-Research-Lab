function classify(f){ if(f?.source==="table_compare")return"table_compare"; if(f?.source==="run_workspace")return"run_workspace"; return"manual"; }
const F=[
 {id:1,note:'legacy, no source'},
 {id:2,source:'run_workspace',note:'rw'},
 {id:3,source:'table_compare',note:'tc'},
 {id:4,source:'weird_unknown',note:'unknown->manual'},
 {id:5,source:'table_compare',note:'tc2'},
];
const counts={all:0,manual:0,run_workspace:0,table_compare:0};
for(const f of F){counts.all++; counts[classify(f)]++;}
console.log('counts ->', JSON.stringify(counts), '(expect all5 manual2 rw1 tc2)');
const filt=(v)=> v==='all'?F:F.filter(f=>classify(f)===v);
console.log('manual ids ->', filt('manual').map(f=>f.id).join(','), '(expect 1,4)');
console.log('run_workspace ids ->', filt('run_workspace').map(f=>f.id).join(','), '(expect 2)');
console.log('table_compare ids ->', filt('table_compare').map(f=>f.id).join(','), '(expect 3,5)');
console.log('all count ->', filt('all').length, '(expect 5)');
console.log('empty filter on no-match ->', filt('run_workspace').length>0?'has':'empty');
