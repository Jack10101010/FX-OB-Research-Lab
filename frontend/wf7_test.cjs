// Re-implements the entry-building portion of addProjectFinding to verify the
// WF-7 metadata pass-through and ProjectDetail compatibility.
function build(finding={}) {
  const cleanTitle=String(finding.title||"").trim(), cleanNote=String(finding.note||"").trim();
  if(!cleanTitle && !cleanNote) return null;
  return {
    id:`finding_${Date.now()}`, type:finding.type||"finding",
    title:cleanTitle||"Finding", note:cleanNote,
    sourceRunId:finding.sourceRunId||finding.runId||"", createdAt:new Date().toISOString(),
    source:finding.source||"run_workspace", runId:finding.runId||finding.sourceRunId||"",
    ...(finding.tag?{tag:finding.tag}:{}),
    ...(finding.comparedRunId?{comparedRunId:finding.comparedRunId}:{}),
    ...(finding.table?{table:finding.table}:{}),
    ...(finding.bucket?{bucket:finding.bucket}:{}),
    ...(finding.meta&&typeof finding.meta==="object"?{meta:finding.meta}:{}),
  };
}
const e = build({ type:"finding", title:"Structure Quality · Strong vs Run B", note:'Bucket "Strong" — N 40 → 38. ΔNet R +3.2R',
  source:"table_compare", tag:"Table Compare", runId:"rA", sourceRunId:"rA", comparedRunId:"rB",
  table:"Structure Quality", bucket:"Strong", meta:{table:"Structure Quality",bucket:"Strong",comparedRunId:"rB"} });
const pdKeys = ['id','type','title','note','sourceRunId','createdAt'].every(k=>k in e);
console.log('ProjectDetail keys present ->', pdKeys);
console.log('source ->', e.source, '| tag ->', e.tag, '| comparedRunId ->', e.comparedRunId, '| table ->', e.table, '| bucket ->', e.bucket);
console.log('meta ->', JSON.stringify(e.meta));
console.log('empty input guarded ->', build({note:'   '}) === null);
// Legacy WF-4/WF-5 finding (no metadata) still builds clean:
const legacy = build({note:'plain note', runId:'rA'});
console.log('legacy still fine ->', legacy.note, '| no comparedRunId key ->', !('comparedRunId' in legacy));
