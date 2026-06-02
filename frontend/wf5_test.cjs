function selectRecentFindings(findings, runId, max = 3) {
  const list = Array.isArray(findings) ? findings.filter(Boolean) : [];
  const isCurrent = (f) => (f.sourceRunId && f.sourceRunId === runId) || (f.runId && f.runId === runId);
  const current = list.filter(isCurrent);
  const others = list.filter((f) => !isCurrent(f));
  return [...current, ...others].slice(0, max);
}
// newest-first list (as stored)
const F = [
  {id:'f5', note:'newest other', sourceRunId:'rB', createdAt:'05'},
  {id:'f4', note:'cur new', sourceRunId:'rA', createdAt:'04'},
  {id:'f3', note:'legacy no run fields', createdAt:'03'},                 // legacy: no sourceRunId/runId/source/tag
  {id:'f2', note:'cur old via runId', runId:'rA', createdAt:'02'},        // matches via runId
  {id:'f1', note:'old other', sourceRunId:'rC', createdAt:'01'},
];
const r = selectRecentFindings(F, 'rA', 3);
console.log('order ->', r.map(x=>x.id).join(','), '(expect f4,f2,f5 — current-run first, then newest other)');
console.log('legacy safe (no crash) ->', selectRecentFindings([{id:'x',note:'n'}], 'rA',3).map(x=>x.id).join(','));
console.log('empty ->', JSON.stringify(selectRecentFindings([], 'rA',3)), '(expect [])');
console.log('all current (5) capped at 3 ->', selectRecentFindings([
  {id:'a',sourceRunId:'rA'},{id:'b',sourceRunId:'rA'},{id:'c',sourceRunId:'rA'},{id:'d',sourceRunId:'rA'}
],'rA',3).map(x=>x.id).join(','), '(expect a,b,c)');
