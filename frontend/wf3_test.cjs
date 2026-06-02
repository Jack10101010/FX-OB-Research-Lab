const { transformFileSync } = require('@babel/core');
const Module = require('module');
let src = transformFileSync('src/data/projectWorkflow.js',{presets:['@babel/preset-env']}).code;
src = src.replace(/require\("@\/lib\/metrics"\)/g, '({ computeProfitFactor: (t)=> t&&t.length? 2.0 : null })');
const m = new Module('pw'); m.paths = Module._nodeModulePaths(process.cwd()); m._compile(src, 'pw.js');
const { resolveRunReference, summarizeRunForDelta, buildRunDelta, referenceReasonLabel } = m.exports;
const runs = [
  { id:'r4', importedAt:'2026-04', projectId:'p1', netR:30, winRate:55, trades:120, maxDd:-8 },
  { id:'r3', importedAt:'2026-03', projectId:'p1', netR:20, winRate:50, trades:100, maxDd:-10 },
  { id:'r2', importedAt:'2026-02', projectId:'p1', netR:15, winRate:48, trades:90,  maxDd:-12 },
  { id:'rX', importedAt:'2026-01', projectId:null, netR:5,  winRate:40, trades:50,  maxDd:-20 },
];
const proj = { id:'p1', baselineRunId:'r2', runIds:['r2','r3','r4'] };
const get = id => runs.find(r=>r.id===id);
const R = (a)=>`${a.run?.id||'-'}/${a.reason}`;
console.log('1 candidate r4   ->', R(resolveRunReference({currentRun:get('r4'),project:proj,runs})), '(expect r2/baseline)');
console.log('2 baseline r2    ->', R(resolveRunReference({currentRun:get('r2'),project:proj,runs})), '(expect rX/previous_imported, NOT self)');
const projNB = { id:'p1', baselineRunId:null, runIds:['r2','r3','r4'] };
console.log('3 noBaseline r3  ->', R(resolveRunReference({currentRun:get('r3'),project:projNB,runs})), '(expect r2/previous_project)');
console.log('4 standalone rX  ->', R(resolveRunReference({currentRun:get('rX'),project:null,runs})), '(expect -/none)');
console.log('5 standalone r3  ->', R(resolveRunReference({currentRun:get('r3'),project:null,runs})), '(expect r2/previous_imported)');
console.log('6 single run     ->', R(resolveRunReference({currentRun:get('r4'),project:null,runs:[get('r4')]})), '(expect -/none)');
const d = buildRunDelta(summarizeRunForDelta(get('r4'),[1,2,3]), summarizeRunForDelta(get('r2'),null));
console.log('netR  ', d.find(x=>x.key==='netR').delta, d.find(x=>x.key==='netR').direction, '(expect 15 up)');
console.log('maxDd ', d.find(x=>x.key==='maxDd').delta, d.find(x=>x.key==='maxDd').direction, '(expect 4 up)');
console.log('trades', d.find(x=>x.key==='trades').direction, '(expect neutral)');
console.log('PF    ', d.find(x=>x.key==='profitFactor').direction, '(expect na, ref trades null)');
console.log('broken netR', summarizeRunForDelta({id:'b'},null).netR, '| label', referenceReasonLabel('previous_project'));
