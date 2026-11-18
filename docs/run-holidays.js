/* Date-specific public holidays. Never writes employee entries or the active-run pointer. */
(function(root){
 'use strict';
 function changeHoliday(period,iso,enabled,reason){
  if(!period||!Array.isArray(period.days))throw new Error('No run calendar is loaded.');
  const matches=period.days.filter(d=>d.d===iso);
  if(matches.length!==1||iso<period.start||iso>period.end)throw new Error('Choose one date inside this run.');
  const old=matches[0];let next;
  if(enabled){
   const why=String(reason||'').trim();
   if(!why)throw new Error('Enter the public holiday name or reason.');
   next={...old,def:'PH',lock:false,why};
   if(old.def!=='PH')next.phPrevious={def:old.def,lock:!!old.lock,why:old.why||''};
  }else{
   if(old.def!=='PH')throw new Error('This date is not a public holiday.');
   if(!old.phPrevious)throw new Error('The original day type is unknown. Use Run / month to review this date.');
   next={...old,...old.phPrevious};delete next.phPrevious;
  }
  return {...period,days:period.days.map(d=>d.d===iso?next:{...d})};
 }
 async function persistHoliday(db,expected,iso,enabled,reason,by){
  const ref=db.collection('runs').doc('_periods');
  const original=expected.days.find(d=>d.d===iso);
  return db.runTransaction(async tx=>{
   const snap=await tx.get(ref);const registry=snap.exists?snap.data():{};
   const list=registry.list||[];const found=list.filter(p=>p.id===expected.id);
   if(found.length!==1)throw new Error('The run was removed or duplicated. Reload before editing.');
   const current=found[0];
   if(current.start!==expected.start||current.end!==expected.end||
      JSON.stringify(current.days.find(d=>d.d===iso))!==JSON.stringify(original))
    throw new Error('This date changed on another device. Reload before editing.');
   const updated=changeHoliday(current,iso,enabled,reason);
   const at=new Date().toISOString();updated.by=by;updated.at=at;
   const nextList=list.map(p=>p.id===updated.id?updated:p);
   tx.set(ref,{...registry,list:nextList,_ts:Date.now(),by,at});
   return {period:updated,list:nextList};
  });
 }
 function open(ctx){
  const state=ctx.current();
  if(!state.user||!state.db||!state.period||state.signOnly){alert('Sign in to the office view to edit the run public holidays.');return;}
  const period=state.period;
  document.getElementById('holidayDialog')?.remove();
  const dialog=document.createElement('dialog');dialog.id='holidayDialog';
  dialog.style.cssText='width:min(520px,calc(100% - 40px));padding:22px;border:1px solid #cbd5e1;border-radius:12px;color:#1a2733';
  dialog.setAttribute('aria-labelledby','holidayTitle');
  dialog.innerHTML='<h2 id="holidayTitle" style="margin-top:0">Public holidays</h2>'+
   '<p data-run></p><label style="display:block;margin:12px 0">Date in this run<br><select id="holidayDate" style="width:100%;padding:9px"></select></label>'+
   '<label style="display:block;margin:12px 0"><input id="holidayEnabled" type="checkbox"> Public holiday</label>'+
   '<label style="display:block;margin:12px 0">Holiday name / reason<br><input id="holidayReason" maxlength="160" style="box-sizing:border-box;width:100%;padding:9px"></label>'+
   '<p id="holidayPreview" style="background:#f1f5f9;padding:12px;line-height:1.5"></p>'+
   '<p style="font-size:13px">Existing attendance, PHW, leave and overtime entries are preserved. Review recorded work separately and use PHW for anyone who worked on the holiday.</p>'+
   '<p style="font-size:13px">This updates the selected date in this run for signed-in devices. It does not switch the live run or change other months.</p>'+
   '<p id="holidayStatus" role="status" aria-live="polite"></p>'+
   '<div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="btn" id="holidayClose">Close</button><button type="button" class="btn grn" id="holidaySave">Save public holiday</button></div>';
  dialog.querySelector('[data-run]').textContent=period.label+' · '+period.start+' to '+period.end;
  const select=dialog.querySelector('#holidayDate'),check=dialog.querySelector('#holidayEnabled');
  const reason=dialog.querySelector('#holidayReason'),preview=dialog.querySelector('#holidayPreview');
  const status=dialog.querySelector('#holidayStatus'),save=dialog.querySelector('#holidaySave');
  for(const d of period.days){const option=document.createElement('option');option.value=d.d;option.textContent=d.w+' '+d.lbl+' — '+d.def;select.appendChild(option);}
  const initial=period.days.find(d=>d.def==='PH')||period.days[0];if(initial)select.value=initial.d;
  function paint(reset){
   const d=period.days.find(x=>x.d===select.value);if(!d){save.disabled=true;return;}
   if(reset){check.checked=d.def==='PH';reason.value=d.def==='PH'?d.why||'':'';status.textContent='';}
   reason.disabled=!check.checked;
   const s=ctx.entries();const recorded=Object.entries(s).filter(([code,e])=>code[0]!=='_'&&e&&
    ((e.d&&Object.prototype.hasOwnProperty.call(e.d,d.d))||(e.h&&Object.prototype.hasOwnProperty.call(e.h,d.d))));
   const work=recorded.filter(([,e])=>e.d&&e.d[d.d]==='W').length;
   const target=check.checked?'PH':d.phPrevious?.def||d.def;
   preview.textContent=d.w+' '+d.lbl+': '+d.def+' → '+target+'. '+recorded.length+' recorded employee entries stay unchanged.'+
    (work?' '+work+' recorded W entries need a PH/PHW review.':'');
   save.disabled=check.checked?(!reason.value.trim()||(d.def==='PH'&&reason.value.trim()===(d.why||''))):d.def!=='PH'||!d.phPrevious;
   if(!check.checked&&d.def==='PH'&&!d.phPrevious)status.textContent='The previous day type was not saved. Review it under Run / month.';
  }
  select.onchange=()=>paint(true);check.onchange=()=>{status.textContent='';paint(false);};reason.oninput=()=>paint(false);
  dialog.querySelector('#holidayClose').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
  save.onclick=async()=>{
   const now=ctx.current();
   if(!now.user||now.user.email!==state.user.email||now.signOnly||now.period?.id!==period.id){status.textContent='The signed-in account or run changed. Close and reopen this panel.';return;}
   save.disabled=true;select.disabled=true;check.disabled=true;reason.disabled=true;status.textContent='Saving…';
   try{
    const result=await persistHoliday(now.db,period,select.value,check.checked,reason.value,now.user.email);
    ctx.saved(result);dialog.close();ctx.message('Public holiday saved for '+select.value+' ✓',true);
   }catch(error){status.textContent=error.message||'Save failed. No calendar change was confirmed.';select.disabled=false;check.disabled=false;reason.disabled=!check.checked;save.disabled=false;}
  };
  document.body.appendChild(dialog);paint(true);dialog.showModal();select.focus();
 }
 const api={changeHoliday,persistHoliday,open};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.RunHolidays=api;
})(typeof window==='object'?window:this);
