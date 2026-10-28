/* PDF rendering for the September-style two-up cut-and-fold pack. */
(function(){
"use strict";
let deps;
async function load(){
 if(!deps)deps=(async()=>{
  if(!window.PDFLib)await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="vendor/pdf-lib.min.js";s.onload=resolve;s.onerror=()=>reject(Error("Could not load the PDF builder. Reopen the app online."));document.head.appendChild(s)});
  const js=await import("./vendor/pdf.mjs");js.GlobalWorkerOptions.workerSrc=new URL("./vendor/pdf.worker.mjs",document.baseURI).href;
  return{js,lib:window.PDFLib};
 })().catch(e=>{deps=null;throw e});
 return deps;
}
async function open(file,password){
 const{js,lib}=await load(),bytes=new Uint8Array(await file.arrayBuffer());
 const task=js.getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:true});
 task.onPassword=(update,reason)=>{const pw=password(file.name,reason);if(pw===null){task.destroy();return}update(pw)};
 const doc=await task.promise;
 let vector=null;try{vector=await lib.PDFDocument.load(bytes)}catch(e){/* password-protected slips use the decoded PDF.js page image */}
 return{name:file.name,doc,vector};
}
async function parsePage(source,index){
 const page=await source.doc.getPage(index+1);
 const data=await page.getTextContent();
 return{...PAYPRINTCORE.parse(data.items),source,index,rotation:0};
}
function fitText(font,t,max,size){
 t=String(t??"").replace(/[^\x20-\x7E\u00a0-\u00ff]/g,"-");
 while(size>6&&font.widthOfTextAtSize(t,size)>max)size-=.2;
 return{t,size};
}
async function build(people,run,company,onProgress){
 const{lib}=await load(),{PDFDocument,StandardFonts,rgb,degrees}=lib;
 if(!people.length)throw Error("No employees are ready to print.");
 const out=await PDFDocument.create(),reg=await out.embedFont(StandardFonts.Helvetica),bold=await out.embedFont(StandardFonts.HelveticaBold);
 const W=841.8898,H=595.2756,half=W/2,scale=H/816,pad=(half-570*scale)/2;
 const color=h=>rgb(parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255);
 const fmt=s=>new Date(s+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});
 function calendar(page,person,side){
  const ox=side*half+pad;
  const box=(x,y,w,h,fill,stroke)=>page.drawRectangle({x:ox+x*scale,y:y*scale,width:w*scale,height:h*scale,color:color(fill),...(stroke?{borderColor:color(stroke),borderWidth:.5*scale}:{})});
  const text=(t,x,y,size=8,fill="#475569",weight=false,max=518)=>{
   const f=weight?bold:reg,fit=fitText(f,t,max,size);page.drawText(fit.t,{x:ox+x*scale,y:y*scale,size:fit.size*scale,font:f,color:color(fill)});
  };
  const right=(t,y,size,fill)=>{const fit=fitText(reg,t,240,size);text(fit.t,544-reg.widthOfTextAtSize(fit.t,fit.size),y,fit.size,fill)};
  box(0,734,570,82,"#0f2233");box(0,730,570,4,"#facc15");
  text(company.name.toUpperCase(),26,788,12,"#ffffff",true,260);
  text("Timesheet record - the days behind your payslip",26,773,8,"#9fb0c2");
  text(person.code+"   "+person.name,26,750,14,"#ffffff",true,450);
  right(fmt(run.start)+" - "+fmt(run.end)+" "+run.end.slice(0,4),788,9,"#facc15");
  right("pay day "+fmt(run.payday)+" "+run.payday.slice(0,4),773,8,"#9fb0c2");
  right(person.team,738,7,"#9fb0c2");
  const counts={};person.days.forEach(d=>counts[d.status]=(counts[d.status]||0)+1);
  let cx=26,cy=704;
  for(const k of ["W","PH","PHW","S","F","L","A","R","P","NE"]){
   if(!counts[k])continue;
   const label=counts[k]+" "+(k==="W"?"days worked":PAYPRINTCORE.LABELS[k])+((k==="A"||k==="R")?" (no pay)":"");
   const width=bold.widthOfTextAtSize(label,7.5)+16;
   if(cx+width>544){cx=26;cy-=20}box(cx,cy,width,15,PAYPRINTCORE.COLORS[k][0]);text(label,cx+8,cy+4.5,7.5,PAYPRINTCORE.COLORS[k][1],true);cx+=width+6;
  }
  const first=(new Date(run.start+"T12:00:00").getDay()+6)%7,rows=Math.ceil((first+person.days.length)/7);
  const ytop=Math.min(676,cy-20),gap=5,cw=69.7,ch=Math.min(82,(ytop-12-190-(rows-1)*gap)/rows),step=cw+gap;
  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach((s,i)=>text(s,26+i*step+24,ytop,8,"#475569",true));
  person.days.forEach((d,i)=>{
   const col=(first+i)%7,row=Math.floor((first+i)/7),bx=26+col*step,by=ytop-12-(row+1)*(ch+gap)+gap;
   const colors=PAYPRINTCORE.COLORS[d.status]||PAYPRINTCORE.COLORS.NW;
   box(bx,by,cw,ch,colors[0]);
   text(fmt(d.date),bx+10,by+ch-14,7.5,colors[1],false,cw-16);
   text(d.status,bx+22,by+ch-35,15,colors[1],true,cw-20);
   text(d.hours!==null&&d.hours!==undefined?d.hours+"h worked":PAYPRINTCORE.LABELS[d.status],bx+5,by+7,6.5,colors[1],false,cw-10);
  });
  const by=ytop-12-rows*(ch+gap)-68;
  box(26,by,518,62,"#f8fafc","#e2e8f0");
  text("Attendance record: "+(person.salaried?"monthly salary":(counts.W||0)+" worked days")+(counts.S?" + "+counts.S+" sick":"")+(counts.F?" | "+person.frlPaid+" funeral days paid":""),38,by+45,10,"#166534",true,494);
  text("W worked | A absent | S sick | L leave | F funeral | PH public holiday | PHW holiday worked",38,by+32,6.6,"#64748b",false,494);
  text("PW payweekend | SUN Sunday | NW no work | R rain | P partial hours | NE not employed",38,by+22,6.6,"#64748b",false,494);
  text("Queries about your days: speak to your supervisor BEFORE signing for your payslip.",38,by+10,6.8,"#64748b",false,494);
  text([company.name,company.address,company.uif?"UIF Reg "+company.uif:""].filter(Boolean).join(" | "),26,by-20,6.5,"#64748b",false,518);
  text("This sheet accompanies your payslip for the same period and is not a payslip on its own.",26,by-31,6.5,"#64748b",false,518);
 }
 async function slip(page,p,side){
  const s=p.slip,sp=await s.source.doc.getPage(s.index+1);
  const raw=sp.view,portrait=raw[3]-raw[1]>=raw[2]-raw[0];
  // Bureau portrait pages can carry erroneous /Rotate flags (September Team C).
  const rotation=((portrait?0:sp.rotate)+(s.rotation||0))%360;
  if(s.source.vector&&rotation===0){
   const original=s.source.vector.getPage(s.index);
   const embed=await out.embedPage(original),sc=Math.min(half/embed.width,H/embed.height);
   page.drawPage(embed,{x:side*half+(half-embed.width*sc)/2,y:(H-embed.height*sc)/2,width:embed.width*sc,height:embed.height*sc});
  }else{
   const viewport=sp.getViewport({scale:2,rotation}),can=document.createElement("canvas");can.width=Math.ceil(viewport.width);can.height=Math.ceil(viewport.height);
   await sp.render({canvasContext:can.getContext("2d"),viewport}).promise;
   const png=await out.embedPng(can.toDataURL("image/png")),sc=Math.min(half/png.width,H/png.height);
   page.drawImage(png,{x:side*half+(half-png.width*sc)/2,y:(H-png.height*sc)/2,width:png.width*sc,height:png.height*sc});can.width=can.height=0;
  }
 }
 const manifest=[],sheets=PAYPRINTCORE.pair(people);
 for(let i=0;i<sheets.length;i++){
  const sheet=sheets[i],front=out.addPage([W,H]);
  for(let side=0;side<2;side++)if(sheet.front[side])await slip(front,sheet.front[side],side);
  const back=out.addPage([W,H]);
  for(let side=0;side<2;side++)if(sheet.back[side])calendar(back,sheet.back[side],side);
  if(run.preview)for(const p of [front,back])p.drawText("PREVIEW - CHECK BEFORE PRINT",{x:90,y:285,size:29,font:bold,color:rgb(.8,.1,.1),opacity:.55,rotate:degrees(12)});
  for(const p of [front,back])p.drawLine({start:{x:half,y:6},end:{x:half,y:H-6},color:rgb(.75,.75,.75),thickness:.5,dashArray:[4,4]});
  manifest.push({sheet:i+1,team:sheet.team,front:sheet.front.map(p=>p?.code||null),back:sheet.back.map(p=>p?.code||null)});
  if(onProgress)onProgress(i+1,sheets.length);
 }
 out.setTitle((run.label||run.end)+" - payslips and calendars - two per sheet");
 out.setSubject("A4 landscape. Duplex, flip on short edge. Actual size 100%. Cut centre then fold.");
 out.catalog.getOrCreateViewerPreferences().setDuplex(lib.Duplex.DuplexFlipShortEdge);
 out.catalog.getOrCreateViewerPreferences().setPrintScaling(lib.PrintScaling.None);
 return{bytes:await out.save(),manifest,people:people.length,sheets:sheets.length};
}
window.PAYPRINTPDF={open,parsePage,build};
})();
