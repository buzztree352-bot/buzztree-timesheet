/* Pure bulk-attendance planning. No storage or network calls. */
(function(root){
"use strict";
const statuses=["W","A","S","L","F","R","NW","PH","PHW"];
function plan(input){
 const {people,days,selected,start,end,status,match,unlock}=input;
 if(!statuses.includes(status))throw Error("Choose a valid attendance status.");
 if(!start||!end||start>end||!days.some(d=>d.date===start)||!days.some(d=>d.date===end))throw Error("Choose a date range within this run.");
 const chosen=new Set(selected),changes=[],skipped=[];
 for(const p of people.filter(p=>chosen.has(p.code))){
  for(const d of days.filter(d=>d.date>=start&&d.date<=end)){
   const before=p.values[d.date];let why="";
   if(p.hold)why="On hold";
   else if((p.start&&d.date<p.start)||(p.end&&d.date>p.end))why="Outside employment dates";
   else if(p.partial[d.date]!==undefined&&p.partial[d.date]!==null&&p.partial[d.date]!=="")why="Partial hours recorded";
   else if(match&&before!==match)why="Different current status";
   else if((status==="PH"||status==="PHW")&&d.default!=="PH"&&d.default!=="PHW"&&before!=="PH"&&before!=="PHW")why="Not a public-holiday date";
   else if(d.lock&&!unlock)why="Fixed day";
   else if(before===status)why="Already "+status;
   if(why)skipped.push({code:p.code,date:d.date,why});
   else changes.push({code:p.code,name:p.name,date:d.date,before,after:status});
  }
 }
 return{changes,skipped,employees:new Set(changes.map(c=>c.code)).size};
}
const api={plan,statuses};if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.BULKCORE=api;
})(typeof window!=="undefined"?window:globalThis);
