import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { platform as osPlatform } from "@tauri-apps/plugin-os";

// ─── THEMES ───────────────────────────────────────────────────────────────────
const TH={dark:{bg:"#1a1816",srf:"#242220",srfH:"rgba(255,255,255,0.07)",srfS:"rgba(255,255,255,0.025)",tx:"#e8e4de",txM:"#a09b93",txD:"#7a7670",bd:"rgba(255,255,255,0.06)",bdL:"rgba(255,255,255,0.04)",bdI:"rgba(255,255,255,0.1)",ac:"#7BA89D",acBg:"rgba(123,168,157,0.18)",acBd:"rgba(123,168,157,0.4)",acS:"rgba(123,168,157,0.2)",wn:"#D2856B",wnBg:"rgba(210,133,107,0.15)",wnBd:"rgba(210,133,107,0.4)",wnS:"rgba(210,133,107,0.12)",pp:"#9B7BB8",ppBg:"rgba(155,123,184,0.15)",bl:"#6B8FD2",inBg:"rgba(255,255,255,0.03)",btnBg:"rgba(255,255,255,0.07)",bsBg:"rgba(255,255,255,0.07)",tgBg:"rgba(255,255,255,0.06)",cr:"#3a3835",mBg:"#242220",selBg:"#242220",selTx:"#e8e4de",selH:"#3a3835",tBg:"#2d2a27",tBd:"rgba(123,168,157,0.3)",dBg:"#2d2a27",dH:"#3a3835",dBd:"rgba(255,255,255,0.1)"},
light:{bg:"#FEFCEF",srf:"#f2f0e3",srfH:"rgba(0,0,0,0.06)",srfS:"rgba(0,0,0,0.02)",tx:"#2a2722",txM:"#6b665e",txD:"#9b9588",bd:"rgba(0,0,0,0.08)",bdL:"rgba(0,0,0,0.05)",bdI:"rgba(0,0,0,0.12)",ac:"#4d8577",acBg:"rgba(77,133,119,0.12)",acBd:"rgba(77,133,119,0.4)",acS:"rgba(77,133,119,0.15)",wn:"#c46545",wnBg:"rgba(196,101,69,0.1)",wnBd:"rgba(196,101,69,0.4)",wnS:"rgba(196,101,69,0.08)",pp:"#7a5a9e",ppBg:"rgba(122,90,158,0.1)",bl:"#4a6aaa",inBg:"rgba(0,0,0,0.02)",btnBg:"rgba(0,0,0,0.06)",bsBg:"rgba(0,0,0,0.06)",tgBg:"rgba(0,0,0,0.06)",cr:"#ccc8b8",mBg:"#f5f3e6",selBg:"#f5f3e6",selTx:"#2a2722",selH:"#e8e5d6",tBg:"#f0eedd",tBd:"rgba(77,133,119,0.3)",dBg:"#f5f3e6",dH:"#e8e5d6",dBd:"rgba(0,0,0,0.12)"}};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const VERSION="v1.4.5";
const TI={unit:"◈",room:"▣",zone:"◫",furniture:"▤",container:"▨",fixture:"◉"};
const TOPTS=["container","fixture","furniture","room","zone"];
const CC={Skincare:"#7BA89D","Body Care":"#7BA89D","Hair Care":"#7BA89D",Fixture:"#8B8FA3",Textile:"#A38B7B",Cleaning:"#6B9BD2",Cookware:"#D2856B",Appliance:"#D2856B",Kitchen:"#D2856B",Furniture:"#9B7BB8",Electronics:"#6B8FD2",Organization:"#8B8FA3",Fitness:"#B87B7B",Laundry:"#7B8FA3"};
const FREQ=["","Daily","Weekdays","Weekends","2x per Week","3x per Week","4x per Week","5x per Week","6x per Week","Weekly","Bi-Weekly","Monthly","Quarterly","As Needed"];
const uid=p=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;

// Number formatting
const fmt=n=>{if(n==null||isNaN(n))return"0";const v=Number(n);return v%1===0?v.toLocaleString("en-US"):v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})};
const fmtInt=n=>{if(n==null||isNaN(n))return"0";return Number(n).toLocaleString("en-US")};

function migrate(d){if(!d?.items)return d;d.items.forEach(i=>{
  if(i.brand===undefined)i.brand="";if(i.model===undefined)i.model="";if(i.url===undefined)i.url="";
  if(i.qtyNeeded===undefined){i.qtyNeeded=1;i.qtyOwned=i.owned?1:0}
  if(i.modelInTitle===undefined)i.modelInTitle=true;
  if(i.configuration===undefined)i.configuration="";
  if(i.configInTitle===undefined)i.configInTitle=true;
  // Migrate multi-location to single
  if(Array.isArray(i.spaces)&&i.spaces.length>1)i.spaces=[i.spaces[0]];
  // Clean dead fields
  delete i.owned;delete i.processSteps});
  const fMap={"2x/week":"2x per Week","3x/week":"3x per Week","4x/week":"4x per Week","Bi-weekly":"Bi-Weekly","As needed":"As Needed"};
  d.processes?.forEach(p=>{if(p.parent===undefined)p.parent=null;if(fMap[p.frequency])p.frequency=fMap[p.frequency];p.steps?.forEach(st=>{if(st.duration===undefined)st.duration="";if(st.subProcId===undefined)st.subProcId=null})});
  d.schemaVersion=3;return d}
function isOw(i){return(i.qtyOwned||0)>=(i.qtyNeeded||1)}
function sfall(i){return Math.max(0,(i.qtyNeeded||1)-(i.qtyOwned||0))}
function dName(i){const p=[i.brand];if(i.modelInTitle&&i.model)p.push(i.model);p.push(i.name);const base=p.filter(Boolean).join(" ");return i.configInTitle&&i.configuration?`${base} (${i.configuration})`:base}

const mk=(id,n,br,mo,cat,qN,qO,cost,dim,url,notes,sp,ias,cfg)=>({id,name:n,brand:br||"",model:mo||"",configuration:cfg||"",category:cat,qtyNeeded:qN,qtyOwned:qO,cost,dimensions:dim||"",url:url||"",notes:notes||"",spaces:Array.isArray(sp)?sp:[sp||"s_apt"],isAlsoSpace:ias||"",modelInTitle:true,configInTitle:true});

// ─── DEFAULT DATA ─────────────────────────────────────────────────────────────
const BLANK={name:"New Apartment",lastSaved:null,schemaVersion:3,items:[],spaces:[{id:"s_apt",name:"Apartment",type:"unit",parent:null,dimensions:"",notes:"",linkedItemId:null}],processes:[]};
const DEF={name:"My Apartment (Sample)",lastSaved:null,schemaVersion:3,
items:[mk("i1","Hydrating Cleanser","CeraVe","200ml","Skincare",1,1,null,"","","Replace every 2-3mo.",["s_bath_vanity_top_left"]),mk("i2","2% BHA Exfoliant","Paula's Choice","118ml","Skincare",1,1,null,"","https://www.paulaschoice.com/skin-perfecting-2pct-bha-liquid-exfoliant/201.html","PM only.",["s_bath_vanity_top_left"]),mk("i3","Vitamin C Serum","Timeless","20% CE Ferulic 1oz","Skincare",1,0,26,"","","Refrigerate. AM only.",["s_bath_vanity_top_left"]),mk("i4","Moisturizing Cream","CeraVe","16oz Tub","Skincare",1,1,null,"","","AM+PM.",["s_bath_vanity_top_right"]),mk("i5","Anthelios SPF 50","La Roche-Posay","Melt-In Milk 3oz","Skincare",1,1,null,"","","AM only.",["s_bath_vanity_top_right"]),mk("i6","Filtered Showerhead","AquaBliss","SF220","Fixture",1,0,45,'3.5" dia',"","Removes chlorine.",["s_bath_shower"]),mk("i7","Pure-Castile Soap","Dr. Bronner's","Peppermint 32oz","Body Care",1,1,null,"","","Dilute.",["s_bath_shower_caddy"]),mk("i8","Bond Maintenance Shampoo","Olaplex","No.4","Hair Care",1,1,null,"","","",["s_bath_shower_caddy"]),mk("i9","Bond Maintenance Conditioner","Olaplex","No.5","Hair Care",1,1,null,"","","Leave 3 min.",["s_bath_shower_caddy"]),mk("i10","Microfiber Hair Towel","","","Textile",1,1,null,"","","",["s_bath_towel_bar"]),mk("i11","Cleaning Caddy","","","Cleaning",1,0,15,'11"x7"x9"',"","",["s_bath_undersink"]),mk("i12","All-Purpose Cleaner","Method","Lavender 28oz","Cleaning",1,1,null,"","","",["s_bath_undersink"]),mk("i13","Chef's Knife 8\"","Victorinox","Fibrox Pro","Cookware",1,1,null,'8" blade',"","Hone before use.",["s_kit_knife_block"]),mk("i14","Cutting Board","","Large Wood","Cookware",1,1,null,'18"x12"',"","Oil monthly.",["s_kit_counter_zone"]),mk("i15","Cast Iron Skillet 12\"","Lodge","L10SK3","Cookware",1,1,null,'12" dia',"","No soap.",["s_kit_cabinet_lower_1"]),mk("i16","Pressure Cooker 6qt","Instant Pot","Duo 7-in-1","Appliance",1,1,null,'13.4"x12.2"x12.5"',"","",["s_kit_counter_appliance"]),mk("i17","Compact Dish Rack","SimpleHuman","KT1179","Kitchen",1,0,30,'16"x12"x5"',"","",["s_kit_counter_sink"]),mk("i18","Standing Desk 60\"","Uplift","V2 C-Frame","Furniture",1,0,599,'60"x30"x28-50"',"https://www.upliftdesk.com/uplift-v2-standing-desk/","",["s_office_desk_zone"],"s_office_desk"),mk("i19","27\" 4K Monitor","LG","27UN850-W","Electronics",1,1,null,'24.1"x17.9"',"","VESA.",["s_office_desk_surface_center"]),mk("i20","Monitor Arm","Ergotron","LX","Electronics",1,0,130,""  ,"","",["s_office_desk_surface_center"]),mk("i21","MacBook Pro 14\"","Apple","M3 Pro","Electronics",1,1,null,'12.3"x8.7"',"","",["s_office_desk_surface_left"]),mk("i22","TB4 Dock","CalDigit","TS4","Electronics",1,0,280,'5.5"x3.7"',"","Single-cable.",["s_office_desk_surface_left"]),mk("i23","Drawer Organizer","","","Organization",1,0,18,'12"x9"x2"',"","",["s_office_desk_drawer"]),mk("i24","Low Profile Keyboard","Keychron","K3 v2 Brown","Electronics",1,1,null,'11.7"x4.2"',"","",["s_office_desk_surface_center"]),mk("i25","PRO Yoga Mat","Manduka","PRO 71\"","Fitness",1,1,null,'71"x26"',"","",["s_den_floor"]),mk("i26","Adjustable Dumbbells","Bowflex","552","Fitness",1,0,349,'15.75"x8"x9" ea',"","",["s_den_rack"]),mk("i27","Resistance Bands","","5-band set","Fitness",1,1,null,"","","",["s_den_door_hook"]),mk("i28","Mesh Laundry Bags","","Set of 4","Laundry",1,0,12,"","","",["s_laundry_shelf"]),mk("i29","Liquid Detergent","Tide","Free & Gentle","Laundry",1,1,null,"","","",["s_laundry_shelf"]),mk("i30","Stain Remover Pen","Tide","To Go","Laundry",2,0,6,"","","One laundry+one closet.",["s_laundry_shelf"]),mk("i31","Tension Pole Shower Caddy","","","Organization",1,0,35,'11"x4.5"x60-97"',"","",["s_bath_shower"],"s_bath_shower_caddy")],
spaces:[{id:"s_apt",name:"Apartment",type:"unit",parent:null,dimensions:"",notes:"2BR+Den",linkedItemId:null},{id:"s_bath",name:"Bathroom (Primary)",type:"room",parent:"s_apt",dimensions:"",notes:"",linkedItemId:null},{id:"s_bath_vanity",name:"Vanity",type:"furniture",parent:"s_bath",dimensions:'36"x20"x34"',notes:"Built-in.",linkedItemId:null},{id:"s_bath_vanity_top_left",name:"Top Drawer — Left",type:"container",parent:"s_bath_vanity",dimensions:'8"x14"x3"',notes:"",linkedItemId:null},{id:"s_bath_vanity_top_right",name:"Top Drawer — Right",type:"container",parent:"s_bath_vanity",dimensions:'8"x14"x3"',notes:"",linkedItemId:null},{id:"s_bath_undersink",name:"Under-Sink Cabinet",type:"container",parent:"s_bath",dimensions:'30"x18"x18"',notes:"",linkedItemId:null},{id:"s_bath_shower",name:"Shower",type:"zone",parent:"s_bath",dimensions:"",notes:"",linkedItemId:null},{id:"s_bath_shower_caddy",name:"Shower Caddy",type:"container",parent:"s_bath_shower",dimensions:'11"x4.5"x26"',notes:"",linkedItemId:"i31"},{id:"s_bath_towel_bar",name:"Towel Bar",type:"fixture",parent:"s_bath",dimensions:'24"',notes:"",linkedItemId:null},{id:"s_kit",name:"Kitchen",type:"room",parent:"s_apt",dimensions:"",notes:"",linkedItemId:null},{id:"s_kit_counter_zone",name:"Counter — Prep",type:"zone",parent:"s_kit",dimensions:'24"x24"',notes:"",linkedItemId:null},{id:"s_kit_counter_appliance",name:"Counter — Appliance",type:"zone",parent:"s_kit",dimensions:'18"x24"',notes:"",linkedItemId:null},{id:"s_kit_counter_sink",name:"Counter — Sink",type:"zone",parent:"s_kit",dimensions:'16"x24"',notes:"",linkedItemId:null},{id:"s_kit_knife_block",name:"Knife Block",type:"container",parent:"s_kit",dimensions:'6"x4"x9"',notes:"",linkedItemId:null},{id:"s_kit_cabinet_lower_1",name:"Lower Cabinet #1",type:"container",parent:"s_kit",dimensions:'24"x22"x14"',notes:"",linkedItemId:null},{id:"s_bed",name:"Bedroom (Primary)",type:"room",parent:"s_apt",dimensions:"",notes:"Also office",linkedItemId:null},{id:"s_office_desk_zone",name:"Desk Zone",type:"zone",parent:"s_bed",dimensions:'60"x36"',notes:"",linkedItemId:null},{id:"s_office_desk",name:"Standing Desk",type:"furniture",parent:"s_office_desk_zone",dimensions:'60"x30"x28-50"',notes:"Uplift V2",linkedItemId:"i18"},{id:"s_office_desk_surface_left",name:"Desk — Left",type:"container",parent:"s_office_desk",dimensions:'20"x30"',notes:"",linkedItemId:null},{id:"s_office_desk_surface_center",name:"Desk — Center",type:"container",parent:"s_office_desk",dimensions:'24"x30"',notes:"",linkedItemId:null},{id:"s_office_desk_drawer",name:"Desk Drawer",type:"container",parent:"s_office_desk",dimensions:'14"x20"x3"',notes:"",linkedItemId:null},{id:"s_bed2",name:"Bedroom (Secondary)",type:"room",parent:"s_apt",dimensions:"",notes:"Guest/flex",linkedItemId:null},{id:"s_den",name:"Den (Exercise)",type:"room",parent:"s_apt",dimensions:"8'x10'",notes:"",linkedItemId:null},{id:"s_den_floor",name:"Floor Space",type:"zone",parent:"s_den",dimensions:"6'x4'",notes:"",linkedItemId:null},{id:"s_den_rack",name:"Equipment Shelf",type:"furniture",parent:"s_den",dimensions:'24"x18"x36"',notes:"",linkedItemId:null},{id:"s_den_door_hook",name:"Door Hook",type:"fixture",parent:"s_den",dimensions:"",notes:"",linkedItemId:null},{id:"s_laundry",name:"Laundry Area",type:"zone",parent:"s_apt",dimensions:"",notes:"",linkedItemId:null},{id:"s_laundry_shelf",name:"Laundry Shelf",type:"container",parent:"s_laundry",dimensions:'24"x12"',notes:"",linkedItemId:null},{id:"s_living",name:"Living Room",type:"room",parent:"s_apt",dimensions:"",notes:"",linkedItemId:null},{id:"s_entry",name:"Entryway",type:"zone",parent:"s_apt",dimensions:"",notes:"",linkedItemId:null}],
processes:[{id:"p_morning",name:"Full Morning Routine",frequency:"Daily",location:"s_bath",parent:null,steps:[{num:1,action:"Shower Routine",itemId:null,subProcId:"p_shower"},{num:2,action:"Morning Skincare",itemId:null,subProcId:"p_morning_skincare"},{num:3,action:"Work Session Setup",itemId:null,subProcId:"p_work_session"}]},{id:"p_shower",name:"Shower Routine",frequency:"Daily",location:"s_bath_shower",parent:"p_morning",steps:[{num:1,action:"Warm water",itemId:"i6"},{num:2,action:"Body wash",itemId:"i7"},{num:3,action:"Shampoo",itemId:"i8"},{num:4,action:"Conditioner 3 min",itemId:"i9"},{num:5,action:"Cool rinse",itemId:null},{num:6,action:"Microfiber towel",itemId:"i10"}]},{id:"p_morning_skincare",name:"Morning Skincare",frequency:"Daily",location:"s_bath",parent:"p_morning",steps:[{num:1,action:"Rinse face",itemId:"i6"},{num:2,action:"Cleanser 60s",itemId:"i1"},{num:3,action:"Vitamin C",itemId:"i3"},{num:4,action:"Moisturizer",itemId:"i4"},{num:5,action:"SPF",itemId:"i5"}]},{id:"p_work_session",name:"Work Session Setup",frequency:"Daily",location:"s_office_desk_zone",parent:"p_morning",steps:[{num:1,action:"Raise desk",itemId:"i18"},{num:2,action:"Wake monitor",itemId:"i19"},{num:3,action:"Connect USB-C",itemId:"i22"},{num:4,action:"Task manager",itemId:null}]},{id:"p_evening_skincare",name:"Evening Skincare",frequency:"Daily",location:"s_bath",parent:null,steps:[{num:1,action:"Cleanse",itemId:"i1"},{num:2,action:"Pat dry",itemId:null},{num:3,action:"BHA exfoliant",itemId:"i2"},{num:4,action:"Moisturizer",itemId:"i4"}]},{id:"p_meal_prep",name:"Meal Prep",frequency:"2x per Week",location:"s_kit",parent:null,steps:[{num:1,action:"Sanitize, cutting board",itemId:"i14"},{num:2,action:"Hone knife, prep veg",itemId:"i13"},{num:3,action:"Prep proteins",itemId:null},{num:4,action:"Cast iron cook",itemId:"i15"},{num:5,action:"Instant Pot batch",itemId:"i16"},{num:6,action:"Portion & label",itemId:null}]},{id:"p_workout",name:"Home Workout",frequency:"4x per Week",location:"s_den",parent:null,steps:[{num:1,action:"Unroll mat",itemId:"i25"},{num:2,action:"Warm-up bands",itemId:"i27"},{num:3,action:"Dumbbells",itemId:"i26"},{num:4,action:"Cool-down",itemId:"i25"}]},{id:"p_laundry",name:"Laundry Cycle",frequency:"Weekly",location:"s_laundry",parent:null,steps:[{num:1,action:"Sort, mesh bags",itemId:"i28"},{num:2,action:"Pre-treat",itemId:"i30"},{num:3,action:"Wash cold",itemId:"i29"},{num:4,action:"Dry/hang",itemId:null},{num:5,action:"Fold",itemId:null}]},{id:"p_clean_bathroom",name:"Bathroom Clean",frequency:"Weekly",location:"s_bath",parent:null,steps:[{num:1,action:"Cleaning caddy",itemId:"i11"},{num:2,action:"Spray surfaces",itemId:"i12"},{num:3,action:"Scrub",itemId:null},{num:4,action:"Mirror+fixtures",itemId:null},{num:5,action:"Mop",itemId:null}]},{id:"p_clean_kitchen",name:"Kitchen Cleanup",frequency:"Daily",location:"s_kit",parent:null,steps:[{num:1,action:"Clear dishes",itemId:null},{num:2,action:"Wash",itemId:null},{num:3,action:"Wipe counters",itemId:"i12"},{num:4,action:"Stovetop",itemId:null},{num:5,action:"Cast iron",itemId:"i15"},{num:6,action:"Rack dry",itemId:"i17"}]},{id:"p_evening_wind_down",name:"Evening Wind-Down",frequency:"Daily",location:"s_bed",parent:null,steps:[{num:1,action:"Phone away",itemId:null},{num:2,action:"Dim lights",itemId:null},{num:3,action:"Lower desk, read",itemId:"i18"},{num:4,action:"Evening skincare",itemId:null}]}]};

// ─── COMBOBOX ─────────────────────────────────────────────────────────────────
function ComboBox({t,options,value,onChange,placeholder,onAdd,addLabel,s,extraTop}){
  const[q,setQ]=useState("");const[open,setOpen]=useState(false);const ref=useRef(null);
  const cur=options.find(o=>o.value===value);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h)},[]);
  const filt=options.filter(o=>o.label.toLowerCase().includes(q.toLowerCase()));
  return(<div ref={ref} style={{position:"relative"}}><input style={s.input} value={open?q:(cur?.label||"")} onChange={e=>{setQ(e.target.value);if(!open)setOpen(true)}} onFocus={()=>{setQ("");setOpen(true)}} placeholder={placeholder||"Search…"}/>{open&&<div onMouseDown={e=>e.stopPropagation()} style={{position:"absolute",top:"100%",left:0,right:0,maxHeight:200,overflowY:"auto",background:t.dBg,border:`1px solid ${t.dBd}`,borderRadius:6,marginTop:2,zIndex:50,boxShadow:"0 8px 24px rgba(0,0,0,0.3)"}}><div onClick={()=>{onChange(null);setOpen(false);setQ("")}} style={{padding:"6px 12px",fontSize:12,color:t.txD,cursor:"pointer"}}>✕ None</div>{extraTop&&<div onClick={()=>setOpen(false)}>{extraTop}</div>}<div style={{borderTop:`1px solid ${t.bdL}`}}/>{filt.map(o=><div key={o.value} onClick={()=>{onChange(o.value);setOpen(false);setQ("")}} style={{padding:"6px 12px",fontSize:12,color:t.tx,cursor:"pointer",background:o.value===value?t.acS:"transparent"}} onMouseEnter={e=>e.currentTarget.style.background=t.dH} onMouseLeave={e=>e.currentTarget.style.background=o.value===value?t.acS:"transparent"}>{o.label}</div>)}{filt.length===0&&!extraTop&&<div style={{padding:"6px 12px",fontSize:11,color:t.txD}}>No matches</div>}{onAdd&&q.trim()&&<div onClick={()=>{onAdd(q.trim());setOpen(false);setQ("")}} style={{padding:"6px 12px",fontSize:12,color:t.ac,cursor:"pointer",borderTop:`1px solid ${t.bdL}`,fontWeight:500}}>+ {addLabel||"Create"} "{q.trim()}"</div>}</div>}</div>);
}

// ─── UI BITS ──────────────────────────────────────────────────────────────────
function Mod({t,title,onClose,children,width=500}){return(<div style={{position:"fixed",top:32,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}><div style={{background:t.mBg,border:`1px solid ${t.bdI}`,borderRadius:12,width:"100%",maxWidth:width,maxHeight:"calc(85vh - 32px)",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}><div style={{padding:"16px 20px",borderBottom:`1px solid ${t.bd}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:15,fontWeight:600,color:t.tx}}>{title}</span><span onClick={onClose} style={{cursor:"pointer",color:t.txD,fontSize:18}}>✕</span></div><div style={{padding:"16px 20px",overflowY:"auto",flex:1}}>{children}</div></div></div>)}
function Fld({t,label,children,error}){return(<div style={{marginBottom:14}}><label style={{fontSize:11,color:error?t.wn:t.txD,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:5}}>{label}{error&&<span style={{fontStyle:"italic",textTransform:"none",letterSpacing:0}}> — {error}</span>}</label>{children}</div>)}

const mkS=t=>({
  input:{width:"100%",padding:"8px 12px",background:t.inBg,border:`1px solid ${t.bdI}`,borderRadius:6,color:t.tx,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"},
  inputE:{width:"100%",padding:"8px 12px",background:t.inBg,border:`1px solid ${t.wnBd}`,borderRadius:6,color:t.tx,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"},
  sel:{width:"100%",padding:"8px 12px",background:t.inBg,border:`1px solid ${t.bdI}`,borderRadius:6,color:t.tx,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",appearance:"none",cursor:"pointer"},
  bP:{padding:"8px 20px",background:t.ac,color:t.bg,border:"none",borderRadius:6,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  bS:{padding:"8px 20px",background:t.btnBg,color:t.txM,border:`1px solid ${t.bdI}`,borderRadius:6,fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  bD:{padding:"8px 20px",background:t.btnBg,color:t.wn,border:`1px solid ${t.wnBd}`,borderRadius:6,fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  bSm:{padding:"4px 10px",background:t.bsBg,border:`1px solid ${t.bd}`,borderRadius:4,fontSize:11,cursor:"pointer",color:t.txM,fontFamily:"inherit"},
});

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App(){
  const[dark,setDark]=useState(true); // will be set from config on load
  const t=dark?TH.dark:TH.light;const s=useMemo(()=>mkS(t),[t]);
  const[data,setData]=useState(null);const[loading,setLoading]=useState(true);
  const[view,setView]=useState("spatial");const[selSp,setSelSp]=useState("s_apt");const[selPr,setSelPr]=useState(null);const[selIt,setSelIt]=useState(null);
  const[search,setSearch]=useState("");const[filter,setFilter]=useState("all");const[modal,setModal]=useState(null);
  const[toastMsg,setToastMsg]=useState(null);const[toastUndo,setToastUndo]=useState(null);const[toastWarn,setToastWarn]=useState(false);
  const[exp,setExp]=useState({});const[pExp,setPExp]=useState({});const[valE,setValE]=useState({});
  const[editName,setEditName]=useState(false);const[nameVal,setNameVal]=useState("");
  const[dirty,setDirty]=useState(false);const[lastSaved,setLastSaved]=useState(null);
  const[activePath,setActivePath]=useState(null); // file path on disk, or null for sample
  const[recentFiles,setRecentFiles]=useState([]); // [{path, name, last_opened}]
  const[lastDir,setLastDir]=useState(""); // last-used directory for dialogs
  const[treeFilter,setTreeFilter]=useState(null); // null | "owned" | "needed"
  const[depth,setDepth]=useState("full"); // "full" | "current"
  const nameRef=useRef(null);const undoRef=useRef(null);const toastTimer=useRef(null);const listRef=useRef(null);const scrollSave=useRef(null);
  const[ctxMenu,setCtxMenu]=useState(null); // {x, y} for right-click context menu
  const[cfm,setCfm]=useState(null); // {title, msg, okLabel, buttons, resolve}
  const[isMaximized,setIsMaximized]=useState(false);
  const[latestVersion,setLatestVersion]=useState(null); // {version, url} or null
  const[isMac,setIsMac]=useState(false);
  const[winFocused,setWinFocused]=useState(true);
  const askConfirm=useCallback((msgOrOpts)=>{
    const opts=typeof msgOrOpts==="string"?{msg:msgOrOpts}:msgOrOpts;
    return new Promise(resolve=>setCfm({title:opts.title||null,msg:opts.msg,okLabel:opts.okLabel||"Ok",buttons:opts.buttons||null,resolve}));
  },[]);
  const isSample=!activePath&&data?.name==="My Apartment (Sample)"; // differentiates sample from new blank

  const toast=useCallback((msg,undoFn,warn)=>{
    if(toastTimer.current)clearTimeout(toastTimer.current);
    setToastMsg(msg);setToastUndo(()=>undoFn||null);setToastWarn(!!warn);
    toastTimer.current=setTimeout(()=>{setToastMsg(null);setToastUndo(null);setToastWarn(false)},undoFn?10000:2500);
  },[]);
  const clearToast=useCallback(()=>{if(toastTimer.current)clearTimeout(toastTimer.current);setToastMsg(null);setToastUndo(null);setToastWarn(false)},[]);

  useEffect(()=>{invoke("set_theme",{theme:dark?"dark":"light"}).catch(()=>{});getCurrentWindow().setTheme(dark?"dark":"light").catch(()=>{})},[dark]);
  useEffect(()=>{let el=document.getElementById("apt-ts");if(!el){el=document.createElement("style");el.id="apt-ts";document.head.appendChild(el)}el.textContent=`select,option{background:${t.selBg}!important;color:${t.selTx}!important}option:checked{background:${t.selH}!important}select:focus{outline:1px solid ${t.acBd}}body{background:${t.bg}}`},[t]);
  // Track maximized state for title bar button
  useEffect(()=>{const w=getCurrentWindow();const check=async()=>{setIsMaximized(await w.isMaximized())};check();const iv=setInterval(check,500);return()=>clearInterval(iv)},[]);
  // Detect platform once
  useEffect(()=>{try{setIsMac(osPlatform()==="macos")}catch{}},[]);
  // Track window focus for traffic light dimming on Mac
  useEffect(()=>{const w=getCurrentWindow();const unlisten=w.onFocusChanged(({payload})=>setWinFocused(payload));return()=>{unlisten.then(f=>f()).catch(()=>{})}},[]);

  // Disable default browser right-click menu
  useEffect(()=>{const h=e=>{if(!e.target.closest("[data-allow-ctx]"))e.preventDefault()};document.addEventListener("contextmenu",h);return()=>document.removeEventListener("contextmenu",h)},[]);

  // Check GitHub for latest release on launch — silent failure if offline
  useEffect(()=>{(async()=>{
    try{
      const res=await tauriFetch("https://api.github.com/repos/MarkC-Developer/apartment-planner/releases/latest",{method:"GET"});
      if(!res.ok)return;
      const d=await res.json();
      if(d?.tag_name&&d.tag_name!==VERSION&&d?.html_url){
        setLatestVersion({version:d.tag_name,url:d.html_url});
      }
    }catch{}
  })()},[]);

  // Persistence — Plans are .json files on disk, config tracks recents + last file
  useEffect(()=>{(async()=>{
    try{
      const cfg=await invoke("get_app_config");
      // Use system theme if config has default "dark" and user hasn't customized
      if(cfg.theme==="dark"&&window.matchMedia){
        const prefersLight=window.matchMedia("(prefers-color-scheme: light)").matches;
        if(prefersLight)setDark(false);else setDark(true);
      } else setDark(cfg.theme!=="light");
      setRecentFiles(cfg.recent_files||[]);
      setLastDir(cfg.last_dir||"");
      // Try to open last file
      if(cfg.last_file){
        try{
          const content=await invoke("read_plan",{path:cfg.last_file});
          const d=migrate(JSON.parse(content));
          setData(d);setActivePath(cfg.last_file);setLastSaved(new Date());setLoading(false);return;
        }catch{}
      }
    }catch{}
    // Fallback: sample
    setData(JSON.parse(JSON.stringify(DEF)));setActivePath(null);setLoading(false);
  })()},[]);

  // Write to disk helper
  const writePlan=useCallback(async(path,d)=>{
    const u={...d,lastSaved:new Date().toISOString()};
    await invoke("write_plan",{path,content:JSON.stringify(u,null,2)});
    const cfg=await invoke("touch_recent",{path,name:u.name||"Untitled"});
    setRecentFiles(cfg.recent_files);setLastDir(cfg.last_dir);
    setLastSaved(new Date());setDirty(false);
    return u;
  },[]);

  // Periodic autosave — only if we have an active file, paused during confirm dialogs
  useEffect(()=>{if(!dirty||!data||!activePath||cfm)return;const tm=setTimeout(()=>{writePlan(activePath,data).then(u=>setData(u)).catch(()=>{})},5000);return()=>clearTimeout(tm)},[dirty,data,writePlan,activePath,cfm]);

  // Save As: native Save dialog, writes new file, switches to it
  const saveAs=useCallback(async(suggestedName)=>{
    // Flush current file if dirty
    if(activePath&&dirty)await writePlan(activePath,data).catch(()=>{});
    const path=await saveDialog({defaultPath:lastDir?`${lastDir}/${suggestedName||"plan"}.json`:`${suggestedName||"plan"}.json`,filters:[{name:"Plan",extensions:["json"]}]});
    if(!path)return;
    const u=await writePlan(path,{...data,name:suggestedName||data.name});
    setData(u);setActivePath(path);
    toast(`Saved as "${u.name}"`);
  },[data,dirty,activePath,lastDir,writePlan,toast]);

  // Quick save: write to current file
  const quickSave=useCallback(async()=>{
    if(!activePath)return;
    const u=await writePlan(activePath,data);
    setData(u);toast("Saved");
  },[activePath,data,writePlan,toast]);

  // Ctrl+S quick save
  useEffect(()=>{const h=e=>{if((e.ctrlKey||e.metaKey)&&e.key==="s"){e.preventDefault();if(activePath){quickSave()}else{saveAs(data?.name||"plan")}}};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h)},[activePath,quickSave,saveAs,data]);

  // Open file: native Open dialog
  const openFile=useCallback(async()=>{
    if(activePath&&dirty&&data){const save=await askConfirm("You have unsaved changes. Save before opening?");if(save)await writePlan(activePath,data).catch(()=>{})}
    const path=await openDialog({defaultPath:lastDir||undefined,filters:[{name:"Plan",extensions:["json"]}],multiple:false});
    if(!path)return;
    try{
      const content=await invoke("read_plan",{path});
      const d=migrate(JSON.parse(content));setData(d);
      const cfg=await invoke("touch_recent",{path,name:d.name||"Untitled"});
      setRecentFiles(cfg.recent_files);setLastDir(cfg.last_dir);
      setActivePath(path);setLastSaved(new Date());setDirty(false);
      setSelSp("s_apt");setSelPr(null);setSelIt(null);toast(`Opened "${d.name}"`);
    }catch(err){toast(`Failed to open: ${err}`,null,true)}
  },[activePath,dirty,data,lastDir,writePlan,toast]);

  // Load from recent file
  const loadRecent=useCallback(async(path)=>{
    if(activePath&&dirty&&data){const save=await askConfirm("You have unsaved changes. Save before switching?");if(save)await writePlan(activePath,data).catch(()=>{})}
    try{
      const content=await invoke("read_plan",{path});
      const d=migrate(JSON.parse(content));setData(d);
      const cfg=await invoke("touch_recent",{path,name:d.name||"Untitled"});
      setRecentFiles(cfg.recent_files);setLastDir(cfg.last_dir);
      setActivePath(path);setLastSaved(new Date());setDirty(false);
      setSelSp("s_apt");setSelPr(null);setSelIt(null);toast(`Loaded "${d.name}"`);
    }catch(err){
      toast(`File not found — removing from recents`,null,true);
      const cfg=await invoke("remove_recent",{path}).catch(()=>({recent_files:[]}));
      setRecentFiles(cfg.recent_files||[]);
    }
  },[activePath,dirty,data,writePlan,toast]);

  // Remove from recents
  const removeRecent=useCallback(async(path)=>{
    const cfg=await invoke("remove_recent",{path});
    setRecentFiles(cfg.recent_files||[]);
  },[]);

  const startNew=useCallback(async()=>{
    const needsConfirm=dirty&&!isSample;
    if(needsConfirm){
      const proceed=await askConfirm({title:"Start a New Plan?",msg:"Your current work is unsaved. If you proceed, you may lose work.",okLabel:"Proceed"});
      if(!proceed)return;
    }
    const d=JSON.parse(JSON.stringify(BLANK));setData(d);
    setActivePath(null);setDirty(false);setLastSaved(null);
    invoke("clear_last_file").catch(()=>{});
    setSelSp("s_apt");setSelPr(null);setSelIt(null);setExp({});toast("New blank — save to create a file")
  },[dirty,isSample,activePath,data,writePlan,toast,askConfirm]);

  const resetDef=useCallback(async()=>{
    if(activePath&&dirty&&data){const save=await askConfirm("You have unsaved changes. Save before switching?");if(save)await writePlan(activePath,data).catch(()=>{})}
    if(!await askConfirm("Switch to the sample data?\n\nYour saved files will not be affected."))return;
    const d=JSON.parse(JSON.stringify(DEF));setData(d);
    setActivePath(null);setDirty(false);setLastSaved(null);
    invoke("clear_last_file").catch(()=>{});
    setSelSp("s_apt");setSelPr(null);setSelIt(null);toast("Viewing sample")
  },[activePath,dirty,data,writePlan,toast,askConfirm]);

  // Rename: write to new path, delete old file (within same directory)
  const renamePlan=useCallback(async(newName)=>{
    if(!activePath)return;
    const dir=activePath.substring(0,activePath.lastIndexOf(/[\\/]/.test(activePath)?activePath.match(/[\\/]/g).pop():"/")+0);
    // Just update the name inside the file and re-save to same path
    const u={...data,name:newName};
    await writePlan(activePath,u);
    setData(u);setDirty(false);
  },[activePath,data,writePlan]);

  // Lookups
  const sM=useMemo(()=>{const m={};(data?.spaces||[]).forEach(x=>m[x.id]=x);return m},[data]);
  const iM=useMemo(()=>{const m={};(data?.items||[]).forEach(x=>m[x.id]=x);return m},[data]);
  const pM=useMemo(()=>{const m={};(data?.processes||[]).forEach(x=>m[x.id]=x);return m},[data]);
  const gCh=useCallback(p=>(data?.spaces||[]).filter(x=>x.parent===p),[data]);
  const gPC=useCallback(p=>(data?.processes||[]).filter(x=>x.parent===p),[data]);
  const gIn=useCallback(sid=>(data?.items||[]).filter(i=>i.spaces.includes(sid)),[data]);
  const gRec=useCallback(sid=>{let r=gIn(sid);gCh(sid).forEach(c=>{r=r.concat(gRec(c.id))});return r},[gIn,gCh]);
  const gBd=useCallback(sid=>{const r=[];let c=sid;while(c&&sM[c]){r.unshift(sM[c]);c=sM[c].parent}return r},[sM]);
  const gPt=useCallback(sid=>gBd(sid).map(x=>x.name).join(" → "),[gBd]);
  const gPF=useCallback(iid=>(data?.processes||[]).filter(p=>p.steps.some(st=>st.itemId===iid)),[data]);
  const gLk=useCallback(sid=>{const sp=sM[sid];return sp?.linkedItemId?iM[sp.linkedItemId]:null},[sM,iM]);
  const isDs=useCallback((c,p)=>{let x=sM[c];while(x){if(x.parent===p)return true;x=sM[x.parent]}return false},[sM]);
  const isPDs=useCallback((c,p)=>{let x=pM[c];while(x){if(x.parent===p)return true;x=pM[x.parent]}return false},[pM]);

  // Check if space subtree has owned/needed items
  const hasOwned=useCallback(sid=>{return gRec(sid).some(i=>isOw(i))},[gRec]);
  const hasNeeded=useCallback(sid=>{return gRec(sid).some(i=>!isOw(i))},[gRec]);
  const procHasOwned=useCallback(pid=>{const p=pM[pid];if(!p)return false;const items=p.steps.filter(st=>st.itemId).map(st=>iM[st.itemId]).filter(Boolean);if(items.some(i=>isOw(i)))return true;return gPC(pid).some(c=>procHasOwned(c.id))},[pM,iM,gPC]);
  const procHasNeeded=useCallback(pid=>{const p=pM[pid];if(!p)return false;const items=p.steps.filter(st=>st.itemId).map(st=>iM[st.itemId]).filter(Boolean);if(items.some(i=>!isOw(i)))return true;return gPC(pid).some(c=>procHasNeeded(c.id))},[pM,iM,gPC]);

  // Mutations with undo
  const upd=useCallback(fn=>{setData(prev=>{const n=JSON.parse(JSON.stringify(prev));fn(n);setDirty(true);return n})},[]);
  const updU=useCallback((fn,msg)=>{const snap=JSON.parse(JSON.stringify(data));upd(fn);toast(msg,()=>{setData(snap);setDirty(true);clearToast()})},[data,upd,toast,clearToast]);

  const addIt=useCallback(i=>upd(d=>d.items.push(i)),[upd]);
  const edIt=useCallback((id,u)=>upd(d=>{const i=d.items.findIndex(x=>x.id===id);if(i>=0)Object.assign(d.items[i],u)}),[upd]);
  const rmIt=useCallback(id=>{const snap=JSON.parse(JSON.stringify(data));upd(d=>{d.items=d.items.filter(i=>i.id!==id);d.processes.forEach(p=>p.steps.forEach(st=>{if(st.itemId===id)st.itemId=null}));d.spaces.forEach(sp=>{if(sp.linkedItemId===id)sp.linkedItemId=null})});toast("Deleted item",()=>{setData(snap);setDirty(true);clearToast()})},[data,upd,toast,clearToast]);
  const addSp=useCallback(sp=>upd(d=>d.spaces.push(sp)),[upd]);
  const edSp=useCallback((id,u)=>upd(d=>{const i=d.spaces.findIndex(x=>x.id===id);if(i>=0)Object.assign(d.spaces[i],u)}),[upd]);
  const rmSp=useCallback(id=>{const snap=JSON.parse(JSON.stringify(data));const desc=[];const coll=pid=>{gCh(pid).forEach(c=>{desc.push(c.id);coll(c.id)})};coll(id);const all=[id,...desc];
    const linkedItems=all.map(sid=>{const sp=sM[sid];return sp?.linkedItemId}).filter(Boolean);
    upd(d=>{
      d.spaces=d.spaces.filter(x=>!all.includes(x.id));
      d.items.forEach(i=>{i.spaces=i.spaces.filter(x=>!all.includes(x));if(all.includes(i.isAlsoSpace))i.isAlsoSpace=""});
      if(linkedItems.length)d.items=d.items.filter(i=>!linkedItems.includes(i.id));
      if(linkedItems.length)d.processes.forEach(p=>p.steps.forEach(st=>{if(linkedItems.includes(st.itemId))st.itemId=null}));
    });toast("Deleted space"+(linkedItems.length?" and linked item"+(linkedItems.length>1?"s":""):""),()=>{setData(snap);setDirty(true);clearToast()})},[data,upd,gCh,sM,toast,clearToast]);
  // Delete space only — preserves linked items (used when unchecking sub-space or "Delete Only Space")
  const rmSpOnly=useCallback(id=>{const snap=JSON.parse(JSON.stringify(data));const desc=[];const coll=pid=>{gCh(pid).forEach(c=>{desc.push(c.id);coll(c.id)})};coll(id);const allSp=[id,...desc];
    upd(d=>{
      d.spaces=d.spaces.filter(x=>!allSp.includes(x.id));
      d.items.forEach(i=>{i.spaces=i.spaces.filter(x=>!allSp.includes(x));if(allSp.includes(i.isAlsoSpace))i.isAlsoSpace=""});
    });toast("Deleted space",()=>{setData(snap);setDirty(true);clearToast()})},[data,upd,gCh,toast,clearToast]);
  const addPr=useCallback(p=>upd(d=>d.processes.push(p)),[upd]);
  const edPr=useCallback((id,u)=>upd(d=>{const i=d.processes.findIndex(x=>x.id===id);if(i>=0)Object.assign(d.processes[i],u)}),[upd]);

  const rmPr=useCallback(id=>{const snap=JSON.parse(JSON.stringify(data));upd(d=>{
    d.processes=d.processes.filter(p=>p.id!==id);
    d.processes.forEach(p=>{
      if(p.parent===id)p.parent=null;
      // Remove steps that reference this deleted sub-process, unless it's the only step
      if(p.steps&&p.steps.some(st=>st.subProcId===id)){
        if(p.steps.length>1){
          p.steps=p.steps.filter(st=>st.subProcId!==id);
          p.steps.forEach((s,i)=>s.num=i+1);
        } else {
          // Only step — keep it but unlink
          p.steps.forEach(st=>{if(st.subProcId===id)st.subProcId=null});
        }
      }
    });
  });toast("Deleted process",()=>{setData(snap);setDirty(true);clearToast()})},[data,upd,toast,clearToast]);

  // Move up/down among siblings
  const moveSp=useCallback((id,dir)=>{upd(d=>{const sp=d.spaces.find(x=>x.id===id);if(!sp)return;const siblings=d.spaces.filter(x=>x.parent===sp.parent);const idx=siblings.findIndex(x=>x.id===id);const swapIdx=idx+dir;if(swapIdx<0||swapIdx>=siblings.length)return;const swapId=siblings[swapIdx].id;const ai=d.spaces.findIndex(x=>x.id===id);const bi=d.spaces.findIndex(x=>x.id===swapId);[d.spaces[ai],d.spaces[bi]]=[d.spaces[bi],d.spaces[ai]]})},[upd]);
  const movePr=useCallback((id,dir)=>{upd(d=>{const pr=d.processes.find(x=>x.id===id);if(!pr)return;const siblings=d.processes.filter(x=>x.parent===pr.parent);const idx=siblings.findIndex(x=>x.id===id);const swapIdx=idx+dir;if(swapIdx<0||swapIdx>=siblings.length)return;const swapId=siblings[swapIdx].id;const ai=d.processes.findIndex(x=>x.id===id);const bi=d.processes.findIndex(x=>x.id===swapId);[d.processes[ai],d.processes[bi]]=[d.processes[bi],d.processes[ai]];
    // Sync parent's step order to match new sibling order
    if(pr.parent){const parent=d.processes.find(p=>p.id===pr.parent);if(parent){
      const newSiblings=d.processes.filter(x=>x.parent===pr.parent);
      const linkedSteps=parent.steps.filter(s=>s.subProcId);
      const unlinkedSteps=parent.steps.filter(s=>!s.subProcId);
      // Reorder linked steps to match sibling order
      const reordered=[];
      newSiblings.forEach(sib=>{const st=linkedSteps.find(s=>s.subProcId===sib.id);if(st)reordered.push(st)});
      // Rebuild: interleave — put unlinked steps in their original relative positions, linked steps in sibling order
      const result=[];let li=0;let ui=0;
      parent.steps.forEach(s=>{if(s.subProcId){if(li<reordered.length)result.push(reordered[li++])}else{result.push(unlinkedSteps[ui++])}});
      result.forEach((s,i)=>s.num=i+1);parent.steps=result;
    }}})},[upd]);

  const quickAddIt=useCallback(n=>{const nid=uid("i");addIt({id:nid,name:n,brand:"",model:"",configuration:"",category:"",qtyNeeded:1,qtyOwned:0,cost:null,dimensions:"",url:"",notes:"",spaces:["s_apt"],isAlsoSpace:"",modelInTitle:true,configInTitle:true});toast(`Created "${n}"`);return nid},[addIt,toast]);
  const quickAddSp=useCallback(n=>{const nid=uid("s");addSp({id:nid,name:n,type:"container",parent:"s_apt",dimensions:"",notes:"",linkedItemId:null});toast(`Created "${n}"`);return nid},[addSp,toast]);
  const quickAddPr=useCallback((n,parentId)=>{const nid=uid("p");addPr({id:nid,name:n,frequency:"",location:"s_apt",parent:parentId||null,steps:[{num:1,action:"",itemId:null,subProcId:null}]});toast(`Created sub-process "${n}"`);return nid},[addPr,toast]);

  // ComboBox option lists
  const itemOpts=useMemo(()=>(data?.items||[]).map(i=>({value:i.id,label:dName(i)})),[data]);
  const spOpts=useMemo(()=>(data?.spaces||[]).filter(x=>x.id!=="s_apt").map(x=>({value:x.id,label:gPt(x.id)})),[data,gPt]);
  const allSpOpts=useMemo(()=>(data?.spaces||[]).map(x=>({value:x.id,label:gPt(x.id)})),[data,gPt]);
  const gPrPt=useCallback(pid=>{const r=[];let c=pid;while(c&&pM[c]){r.unshift(pM[c].name);c=pM[c].parent}return r.join(" → ")},[pM]);

  // Build depth-first tree order for consistent sub-space sorting
  const treeOrder=useMemo(()=>{const order=[];const walk=pid=>{gCh(pid).forEach(c=>{order.push(c.id);walk(c.id)})};walk("s_apt");return order},[gCh]);

  // Recursively collect items from a process and all descendants
  const collectProcItems=useCallback((pid)=>{const proc=pM[pid];if(!proc)return[];const items=proc.steps.filter(st=>st.itemId).map(st=>iM[st.itemId]).filter(Boolean);const children=(data?.processes||[]).filter(p=>p.parent===pid);children.forEach(c=>items.push(...collectProcItems(c.id)));return items},[pM,iM,data]);

  // Filtered + stats
  const filtered=useMemo(()=>{let items;
    if(view==="spatial"){items=depth==="current"?gIn(selSp):gRec(selSp)}
    else{if(!selPr||!pM[selPr])return[];items=depth==="current"?pM[selPr].steps.filter(st=>st.itemId).map(st=>iM[st.itemId]).filter(Boolean):collectProcItems(selPr)}
    if(search){const q=search.toLowerCase();items=items.filter(i=>(i.name+i.category+i.brand+i.model+(i.configuration||"")+i.notes).toLowerCase().includes(q))}if(filter==="owned")items=items.filter(isOw);if(filter==="needed")items=items.filter(i=>!isOw(i));const unique=[...new Map(items.map(i=>[i.id,i])).values()];
    // Sort: sub-space items first (in tree-traversal order), then non-sub-space alphabetically
    unique.sort((a,b)=>{const aIsSub=!!a.isAlsoSpace;const bIsSub=!!b.isAlsoSpace;if(aIsSub&&!bIsSub)return-1;if(!aIsSub&&bIsSub)return 1;if(aIsSub&&bIsSub)return treeOrder.indexOf(a.isAlsoSpace)-treeOrder.indexOf(b.isAlsoSpace);return dName(a).localeCompare(dName(b))});return unique},[view,selSp,selPr,search,filter,depth,gIn,gRec,collectProcItems,pM,iM,treeOrder]);
  const stats=useMemo(()=>{let all;if(view==="spatial"){all=gRec(selSp)}else if(selPr&&pM[selPr]){
    all=collectProcItems(selPr);
  }else{all=data?.items||[]}const u=[...new Map(all.map(i=>[i.id,i])).values()];const nd=u.filter(i=>!isOw(i));return{total:u.length,owned:u.length-nd.length,needed:nd.length,cost:u.reduce((s,i)=>s+sfall(i)*(i.cost||0),0),ownedCost:u.reduce((s,i)=>s+Math.min(i.qtyOwned||0,i.qtyNeeded||1)*(i.cost||0),0)}},[view,selSp,selPr,gRec,collectProcItems,pM,iM,data]);
  const shopItems=useMemo(()=>(data?.items||[]).filter(i=>sfall(i)>0),[data]);
  const shopTotal=useMemo(()=>shopItems.reduce((s,i)=>s+sfall(i)*(i.cost||0),0),[shopItems]);

  const exportShop=useCallback(async()=>{const rows=shopItems.map(i=>({Item:dName(i),Model:i.model||"",Configuration:i.configuration||"",Category:i.category||"","Qty Needed":sfall(i),"Cost/Item":i.cost||"","Line Total":sfall(i)*(i.cost||0),URL:i.url||"",Notes:i.notes||""}));rows.push({Item:"",Model:"",Configuration:"",Category:"","Qty Needed":"","Cost/Item":"TOTAL:","Line Total":shopTotal,URL:"",Notes:""});const ws=XLSX.utils.json_to_sheet(rows);rows.forEach((r,i)=>{if(r.URL){const cell=XLSX.utils.encode_cell({r:i+1,c:7});if(ws[cell])ws[cell].l={Target:r.URL}}});ws["!cols"]=[{wch:35},{wch:20},{wch:20},{wch:14},{wch:10},{wch:10},{wch:12},{wch:40},{wch:30}];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Shopping List");
    const planLabel=(data?.name||"Plan").replace(/[<>:"/\\|?*]/g,"");
    const path=await saveDialog({defaultPath:lastDir?`${lastDir}/Shopping List - ${planLabel}.xlsx`:`Shopping List - ${planLabel}.xlsx`,filters:[{name:"Excel",extensions:["xlsx"]}]});
    if(!path)return;
    const buf=XLSX.write(wb,{type:"array",bookType:"xlsx"});
    const bytes=Array.from(new Uint8Array(buf));
    await invoke("write_binary",{path,bytes});
    toast("Exported")},[shopItems,shopTotal,lastDir,toast]);

  // Validation
  const valIt=f=>{const e={};if(!f.name?.trim())e.name="Required";if(f.cost!==""&&f.cost!=null){const c=Number(f.cost);if(isNaN(c))e.cost="Number";else if(c<0)e.cost="≥0"}return e};
  const valSp=f=>{const e={};if(!f.name?.trim())e.name="Required";if(f.id!=="s_apt"&&!f.parent)e.parent="Required";return e};
  const valPr=f=>{const e={};if(!f.name?.trim())e.name="Required";if(!f.steps?.length)e.steps="≥1";else if(f.steps.some(x=>!x.action?.trim()))e.steps="Steps need text";return e};

  // Modal openers
  const openIt=useCallback((item=null,defSp=null)=>{
    if(listRef.current)scrollSave.current=listRef.current.scrollTop;
    setValE({});setModal({type:"item",isEdit:!!item,form:item?{...item,cost:item.cost??"",configuration:item.configuration||"",configInTitle:item.configInTitle!==false,modelInTitle:item.modelInTitle!==false}:{name:"",brand:"",model:"",configuration:"",category:"",qtyNeeded:1,qtyOwned:0,cost:"",dimensions:"",url:"",notes:"",spaces:defSp?[defSp]:[],isAlsoSpace:"",modelInTitle:true,configInTitle:true},setForm:fn=>setModal(p=>({...p,form:typeof fn==="function"?fn(p.form):{...p.form,...fn}}))})},[]);
  const openSp=useCallback((sp=null,defP=null)=>{if(listRef.current)scrollSave.current=listRef.current.scrollTop;setValE({});const par=defP||"s_apt";const parType=sM[par]?.type;const defType=parType==="unit"?"room":parType==="room"?"furniture":"container";setModal({type:"space",isEdit:!!sp,form:sp?{...sp}:{name:"",type:defType,parent:par,dimensions:"",notes:"",linkedItemId:null},setForm:fn=>setModal(p=>({...p,form:typeof fn==="function"?fn(p.form):{...p.form,...fn}}))})},[sM]);
  const openPr=useCallback((proc=null,defPar=null)=>{if(listRef.current)scrollSave.current=listRef.current.scrollTop;setValE({});setModal({type:"process",isEdit:!!proc,form:proc?JSON.parse(JSON.stringify(proc)):{name:"",frequency:"",location:"s_apt",parent:defPar||null,steps:[{num:1,action:"",itemId:null,subProcId:null}]},setForm:fn=>setModal(p=>({...p,form:typeof fn==="function"?fn(p.form):{...p.form,...fn}}))})},[]);
  const dupIt=useCallback(item=>{const nid=uid("i");const dup={...JSON.parse(JSON.stringify(item)),id:nid,name:item.name+" (Copy)",isAlsoSpace:""};addIt(dup);setSelIt(nid);toast(`Duplicated "${item.name}"`);openIt(dup)},[addIt,toast,openIt]);

  // Expand
  const togE=useCallback(sid=>setExp(p=>({...p,[sid]:!p[sid]})),[]);
  const togPE=useCallback(pid=>setPExp(p=>({...p,[pid]:!p[pid]})),[]);
  const collapseAll=useCallback(()=>{if(view==="spatial"){const e={};(data?.spaces||[]).forEach(sp=>{e[sp.id]=false});e["s_apt"]=true;setExp(e)}else{const e={};(data?.processes||[]).forEach(p=>{e[p.id]=false});setPExp(e)}},[view,data]);
  const expandAll=useCallback(()=>{if(view==="spatial"){const e={};(data?.spaces||[]).forEach(sp=>{e[sp.id]=true});setExp(e)}else{const e={};(data?.processes||[]).forEach(p=>{e[p.id]=true});setPExp(e)}},[view,data]);

  useEffect(()=>{const tr=gBd(selSp);const e={};tr.slice(0,-1).forEach(x=>{e[x.id]=true});setExp(p=>({...p,...e}))},[selSp,gBd]);
  useEffect(()=>{if(!selPr||!pM[selPr])return;const e={};let c=selPr;while(c&&pM[c]){e[c]=true;c=pM[c].parent}setPExp(p=>({...p,...e}))},[selPr,pM]);
  // Restore scroll position synchronously after any render while modal is open or just closed
  useLayoutEffect(()=>{if(scrollSave.current!=null&&listRef.current){listRef.current.scrollTop=scrollSave.current;if(!modal)scrollSave.current=null}});

  if(loading||!data)return<div style={{fontFamily:"'DM Sans',sans-serif",background:t.bg,color:t.tx,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>Loading…</div>;

  // Move position helpers
  const canMoveSp=(id,dir)=>{const sp=sM[id];if(!sp)return false;const siblings=gCh(sp.parent);const idx=siblings.findIndex(x=>x.id===id);return idx+dir>=0&&idx+dir<siblings.length};
  const canMovePr=(id,dir)=>{const pr=pM[id];if(!pr)return false;const siblings=gPC(pr.parent);const idx=siblings.findIndex(x=>x.id===id);return idx+dir>=0&&idx+dir<siblings.length};

  // ─── TREE NODES ───────────────────────────────────────────────────────────
  const SpaceNode=({sid,depth=0})=>{const sp=sM[sid];if(!sp)return null;const ch=gCh(sid);const di=gIn(sid);const isSel=selSp===sid;const lk=gLk(sid);const isRoot=sid==="s_apt";const isE=isRoot?true:exp[sid]!==false;const hasCh=ch.length>0;const showDot=treeFilter==="owned"?hasOwned(sid):treeFilter==="needed"?hasNeeded(sid):false;
    return(<div>
      <div style={{display:"flex",alignItems:"center",paddingLeft:isRoot?6:4+depth*20,margin:"1px 0"}}>
        {isRoot?null:hasCh?<span onClick={()=>togE(sid)} style={{fontSize:8,width:16,height:24,display:"flex",alignItems:"center",justifyContent:"center",opacity:0.45,flexShrink:0,cursor:"pointer"}}>{isE?"▼":"▶"}</span>:<span style={{width:16,flexShrink:0}}/>}
        <div onClick={()=>{setSelSp(sid);setSelIt(null)}}
          style={{display:"flex",alignItems:"center",flex:1,minWidth:0,padding:"5px 6px",borderRadius:6,cursor:"pointer",
            background:isSel?t.acBg:"transparent",
            borderLeft:isSel?`3px solid ${t.ac}`:"3px solid transparent",
            gap:6,fontSize:13,color:isSel?t.tx:t.txM,fontWeight:isSel?600:400,transition:"background 0.1s"}}>
          {!isRoot&&<span style={{opacity:0.4,fontSize:10,flexShrink:0}}>{TI[sp.type]||"·"}</span>}
          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sp.name}</span>
          {lk&&!isRoot&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:8,flexShrink:0,marginLeft:4,background:isOw(lk)?t.acS:t.wnS,color:isOw(lk)?t.ac:t.wn}}>ITEM</span>}
          {showDot&&<span style={{width:6,height:6,borderRadius:"50%",flexShrink:0,marginLeft:4,background:treeFilter==="owned"?t.ac:t.wn}}/>}
          <span style={{flex:1}}/>
          {di.length>0&&<span style={{fontSize:9,opacity:0.35,background:t.tgBg,borderRadius:10,padding:"1px 5px",flexShrink:0}}>{di.length}</span>}
        </div>
      </div>
      {isE&&ch.map(c=><SpaceNode key={c.id} sid={c.id} depth={depth+1}/>)}
    </div>);
  };

  const ProcNode=({pid,depth=0})=>{const proc=pM[pid];if(!proc)return null;const ch=gPC(pid);const isSel=selPr===pid;const isE=pExp[pid]!==false;const hasCh=ch.length>0;const showDot=treeFilter==="owned"?procHasOwned(pid):treeFilter==="needed"?procHasNeeded(pid):false;
    return(<div>
      <div style={{display:"flex",alignItems:"center",paddingLeft:4+depth*20,margin:"1px 0"}}>
        {hasCh?<span onClick={()=>togPE(pid)} style={{fontSize:8,width:16,height:24,display:"flex",alignItems:"center",justifyContent:"center",opacity:0.45,flexShrink:0,cursor:"pointer"}}>{isE?"▼":"▶"}</span>:<span style={{width:16,flexShrink:0}}/>}
        <div onClick={()=>{setSelPr(pid);setSelIt(null)}}
          style={{display:"flex",alignItems:"center",flex:1,minWidth:0,padding:"5px 6px",borderRadius:6,cursor:"pointer",
            background:isSel?t.ppBg:"transparent",
            borderLeft:isSel?`3px solid ${t.pp}`:"3px solid transparent",
            gap:6,transition:"background 0.1s"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:13,color:isSel?t.tx:t.txM,fontWeight:isSel?600:400}}>{proc.name}</span>
              {showDot&&<span style={{width:6,height:6,borderRadius:"50%",flexShrink:0,background:treeFilter==="owned"?t.ac:t.wn}}/>}
            </div>
            <div style={{fontSize:10,color:t.txD,marginTop:1}}>{[proc.frequency,proc.steps.length>1?`${proc.steps.length} steps`:null].filter(Boolean).join(" · ")||""}</div>
          </div>
        </div>
      </div>
      {isE&&ch.map(c=><ProcNode key={c.id} pid={c.id} depth={depth+1}/>)}
    </div>);
  };

  // ─── ITEM CARD ────────────────────────────────────────────────────────────
  const ItemCard=({item})=>{const isSel=selIt===item.id;const procs=gPF(item.id);const cc=CC[item.category]||"#8B8FA3";const lsp=(data.spaces||[]).filter(x=>x.linkedItemId===item.id);const dn=dName(item);const own=isOw(item);const sh=sfall(item);const totalCost=sh*(item.cost||0);
    return(<div onClick={()=>setSelIt(isSel?null:item.id)} style={{padding:"12px 14px",margin:"0 0 6px",borderRadius:8,cursor:"pointer",background:isSel?t.srfH:t.srfS,border:`1px solid ${isSel?t.acBd:t.bd}`,transition:"all 0.1s"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
        <div style={{width:8,height:8,borderRadius:"50%",marginTop:5,flexShrink:0,background:own?t.ac:t.wn}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
            <span style={{fontSize:13,fontWeight:500,color:t.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {dn}{sh>1&&<span style={{fontSize:11,color:t.wn,fontWeight:400}}> ({sh})</span>}
            </span>
            {!own&&totalCost>0&&<span style={{fontSize:12,color:t.wn,fontWeight:600,flexShrink:0}}>
              ${fmt(totalCost)}{sh>1&&<span style={{fontWeight:400,fontSize:10}}> ({sh})</span>}
            </span>}
          </div>
          {item.model&&!item.modelInTitle&&<div style={{fontSize:11,color:t.txD,marginTop:1}}>{item.model}</div>}
          {item.configuration&&!item.configInTitle&&<div style={{fontSize:11,color:t.txD,marginTop:1}}>{item.configuration}</div>}
          <div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
            {lsp.length>0&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:10,background:t.ppBg,color:t.pp}}>Sub-Space</span>}
            {item.category&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:10,background:`${cc}22`,color:cc,fontWeight:500}}>{item.category}</span>}
            {!own&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:10,background:t.wnS,color:t.wn}}>{sh<=1?"Needed":`Need ${sh}`}</span>}
            {!item.brand&&!item.model&&!item.configuration&&!item.url&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:10,background:t.tgBg,color:t.txD}}>Unspecified</span>}
          </div>
        </div>
      </div>
      {isSel&&(<div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${t.bdL}`}}>
        {item.dimensions&&<div style={{fontSize:12,color:t.txM,marginBottom:5}}>{item.dimensions}</div>}
        {item.cost!=null&&<div style={{fontSize:12,color:t.txD,marginBottom:5}}>Cost per item: ${fmt(item.cost)}</div>}
        {item.url&&<div style={{fontSize:12,marginBottom:5,display:"flex",alignItems:"center"}}><span onClick={e=>{e.stopPropagation();shellOpen(item.url)}} style={{color:t.bl,textDecoration:"underline dotted",textUnderlineOffset:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"85%",cursor:"pointer"}}>{item.url}</span><span onClick={e=>{e.stopPropagation();shellOpen(item.url)}} style={{cursor:"pointer",fontSize:14,opacity:0.6,flexShrink:0,marginLeft:4}} title="Open">↗</span></div>}
        {item.notes&&<div style={{fontSize:12,color:t.txM,marginBottom:8,lineHeight:1.5,fontStyle:"italic"}}>{item.notes}</div>}
        {lsp.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:10,color:t.pp,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Sub-Space</div>{lsp.map(sp=><div key={sp.id} onClick={e=>{e.stopPropagation();setView("spatial");setSelSp(sp.id)}} style={{fontSize:11,color:t.pp,cursor:"pointer",padding:"2px 0",textDecoration:"underline dotted",textUnderlineOffset:3}}>{gPt(sp.id)}</div>)}</div>}
        <div style={{marginBottom:8}}><div style={{fontSize:10,color:t.txD,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Location</div>{item.spaces.filter(sid=>sM[sid]).map(sid=><div key={sid} onClick={e=>{e.stopPropagation();setView("spatial");setSelSp(sid)}} style={{fontSize:11,color:t.ac,cursor:"pointer",padding:"2px 0",textDecoration:"underline dotted",textUnderlineOffset:3}}>{gPt(sid)}</div>)}{item.spaces.filter(sid=>sM[sid]).length===0&&<div style={{fontSize:11,color:t.txD,fontStyle:"italic"}}>Unassigned</div>}</div>
        {procs.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:10,color:t.txD,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Used In</div>{procs.map(p=><div key={p.id} onClick={e=>{e.stopPropagation();setView("process");setSelPr(p.id)}} style={{fontSize:11,color:t.pp,cursor:"pointer",padding:"2px 0",textDecoration:"underline dotted",textUnderlineOffset:3}}>{p.name}</div>)}</div>}
        <div style={{display:"flex",gap:6,marginTop:8}}>
          <button style={s.bSm} onClick={e=>{e.stopPropagation();openIt(item)}}>Edit Item</button>
          <button style={s.bSm} onClick={e=>{e.stopPropagation();dupIt(item)}}>Duplicate</button>
        </div>
      </div>)}
    </div>);
  };

  // ─── MODALS ───────────────────────────────────────────────────────────────
  const renderItemModal=()=>{const{isEdit,form,setForm}=modal;const e=valE;
    const handleSubSpaceToggle=async(checked)=>{
      if(checked){
        const parentId=(form.spaces||[])[0]||"s_apt";
        const parentType=sM[parentId]?.type||"unit";
        const defType=parentType==="unit"?"room":parentType==="room"?"furniture":"container";
        const nid=uid("s");addSp({id:nid,name:form.name||"Sub-space",type:defType,parent:parentId,dimensions:"",notes:"",linkedItemId:null});
        setForm({isAlsoSpace:nid});
      } else {
        if(form.isAlsoSpace){
          const ok=await askConfirm({title:"Remove Sub-Space?",msg:"This will delete the sub-space and any items within it. The current item will not be deleted.",okLabel:"Remove"});
          if(!ok)return;
          // Delete space only — item is being kept
          rmSpOnly(form.isAlsoSpace);
        }
        setForm({isAlsoSpace:""});
      }
    };
    return(<Mod t={t} title={isEdit?"Edit Item":"Add Item"} onClose={()=>setModal(null)} width={580}>
      <Fld t={t} label="Name *" error={e.name}><input style={e.name?s.inputE:s.input} value={form.name} onChange={ev=>setForm({name:ev.target.value})} placeholder="e.g. Standing Desk"/></Fld>
      <div style={{display:"flex",gap:8}}>
        <div style={{flex:1}}><Fld t={t} label="Brand"><input style={s.input} value={form.brand||""} onChange={ev=>setForm({brand:ev.target.value})}/></Fld></div>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
            <label style={{fontSize:11,color:t.txD,textTransform:"uppercase",letterSpacing:1}}>Model</label>
            <label style={{fontSize:9,color:t.txD,display:"flex",alignItems:"center",gap:3,cursor:"pointer",whiteSpace:"nowrap"}}>(IN TITLE) <input type="checkbox" checked={form.modelInTitle!==false} onChange={ev=>setForm({modelInTitle:ev.target.checked})} style={{accentColor:t.ac,margin:0}}/></label>
          </div>
          <input style={s.input} value={form.model||""} onChange={ev=>setForm({model:ev.target.value})}/>
        </div>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
            <label style={{fontSize:11,color:t.txD,textTransform:"uppercase",letterSpacing:1}}>Configuration</label>
            <label style={{fontSize:9,color:t.txD,display:"flex",alignItems:"center",gap:3,cursor:"pointer",whiteSpace:"nowrap"}}>(IN TITLE) <input type="checkbox" checked={form.configInTitle!==false} onChange={ev=>setForm({configInTitle:ev.target.checked})} style={{accentColor:t.ac,margin:0}}/></label>
          </div>
          <input style={s.input} value={form.configuration||""} onChange={ev=>setForm({configuration:ev.target.value})}/>
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <div style={{flex:1}}><Fld t={t} label="Category"><input style={s.input} value={form.category} onChange={ev=>setForm({category:ev.target.value})} list="cats"/><datalist id="cats">{[...new Set(data.items.map(i=>i.category))].filter(Boolean).sort().map(c=><option key={c} value={c}/>)}</datalist></Fld></div>
        <div style={{flex:1}}><Fld t={t} label="Dimensions"><input style={s.input} value={form.dimensions} onChange={ev=>setForm({dimensions:ev.target.value})}/></Fld></div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <div style={{flex:1}}><Fld t={t} label="Qty Needed" error={e.qtyNeeded}><input style={e.qtyNeeded?s.inputE:s.input} type="number" min="1" value={form.qtyNeeded} onChange={ev=>setForm({qtyNeeded:ev.target.value===""?"":Number(ev.target.value)})}/></Fld></div>
        <div style={{flex:1}}><Fld t={t} label="Qty Owned" error={e.qtyOwned}><input style={e.qtyOwned?s.inputE:s.input} type="number" min="0" value={form.qtyOwned} onChange={ev=>setForm({qtyOwned:ev.target.value===""?"":Number(ev.target.value)})}/></Fld></div>
        <div style={{flex:1}}><Fld t={t} label="Cost (per item)" error={e.cost}><div style={{position:"relative"}}><span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:t.txD,fontSize:13,pointerEvents:"none"}}>$</span><input style={{...s.input,paddingLeft:24}} value={form.cost} onChange={ev=>{const v=ev.target.value.replace(/[^\d.]/g,"");setForm({cost:v})}} placeholder="0.00"/></div></Fld></div>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
          <label style={{fontSize:11,color:t.txD,textTransform:"uppercase",letterSpacing:1}}>Location</label>
          <label style={{fontSize:9,color:t.txD,display:"flex",alignItems:"center",gap:3,cursor:"pointer",whiteSpace:"nowrap"}}>(SPACE WITHIN) <input type="checkbox" checked={!!form.isAlsoSpace} onChange={ev=>handleSubSpaceToggle(ev.target.checked)} style={{accentColor:t.ac,margin:0}}/></label>
        </div>
        <ComboBox t={t} s={s} options={spOpts} value={(form.spaces||[])[0]||null} placeholder="Select location…" onChange={v=>setForm({spaces:v?[v]:[]})} onAdd={n=>{const nid=quickAddSp(n);setForm({spaces:[nid]})}} addLabel="Create space"/>
      </div>
      <Fld t={t} label="URL"><div style={{display:"flex",gap:0}}><input style={{...s.input,borderTopRightRadius:0,borderBottomRightRadius:0}} value={form.url||""} onChange={ev=>setForm({url:ev.target.value})} placeholder="https://…"/><button onClick={()=>{if(form.url)shellOpen(form.url)}} disabled={!form.url} style={{...s.bSm,borderRadius:0,borderTopRightRadius:6,borderBottomRightRadius:6,padding:"8px 10px",fontSize:13,opacity:form.url?1:0.3,borderLeft:"none"}} title="Open">↗</button></div></Fld>
      <Fld t={t} label="Notes"><textarea style={{...s.input,minHeight:50,resize:"vertical"}} value={form.notes} onChange={ev=>setForm({notes:ev.target.value})}/></Fld>
      {isEdit&&(()=>{const procs=(data?.processes||[]).filter(p=>p.steps.some(st=>st.itemId===form.id));return procs.length>0?<div style={{marginBottom:14}}><label style={{fontSize:11,color:t.txD,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:5}}>Used In</label>{procs.map(p=><div key={p.id} onClick={()=>{setModal(null);setView("process");setSelPr(p.id)}} style={{fontSize:12,color:t.pp,cursor:"pointer",padding:"2px 0",textDecoration:"underline dotted",textUnderlineOffset:3}}>{p.name}</div>)}</div>:null})()}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        {isEdit&&<button style={s.bD} onClick={async()=>{if(await askConfirm({title:`Delete "${dName(form)}"?`,msg:"This item will be removed from all locations and processes.",okLabel:"Delete"})){rmIt(form.id);setSelIt(null);setModal(null)}}}>Delete</button>}
        <div style={{flex:1}}/><button style={s.bS} onClick={()=>setModal(null)}>Cancel</button>
        <button style={s.bP} onClick={()=>{const e=valIt(form);setValE(e);if(Object.keys(e).length)return;const cost=form.cost===""||form.cost==null?null:Math.max(0,Number(form.cost));const qN=Math.max(1,Number(form.qtyNeeded)||1);const qO=Math.min(Math.max(0,Number(form.qtyOwned)||0),qN);
          if(isEdit){
            edIt(form.id,{...form,cost,qtyNeeded:qN,qtyOwned:qO});
            if(form.isAlsoSpace){edSp(form.isAlsoSpace,{linkedItemId:form.id,dimensions:form.dimensions||"",name:form.name})}
            else{data.spaces.filter(x=>x.linkedItemId===form.id).forEach(x=>edSp(x.id,{linkedItemId:null}))}
          }else{
            const nid=uid("i");addIt({...form,id:nid,cost,qtyNeeded:qN,qtyOwned:qO});
            if(form.isAlsoSpace)edSp(form.isAlsoSpace,{linkedItemId:nid,dimensions:form.dimensions||"",name:form.name});
          }
          setModal(null)}}>{isEdit?"Save":"Add Item"}</button>
      </div>
    </Mod>);
  };

  const renderSpaceModal=()=>{const{isEdit,form,setForm}=modal;const e=valE;const isRoot=form.id==="s_apt";const itemsLink=data.items.filter(i=>!data.spaces.some(x=>x.linkedItemId===i.id)||(isEdit&&sM[form.id]?.linkedItemId===i.id));
    return(<Mod t={t} title={isRoot?"Edit Apartment":isEdit?"Edit Space":"Add Space"} onClose={()=>setModal(null)}>
      <Fld t={t} label="Name *" error={e.name}><input style={e.name?s.inputE:s.input} value={form.name} onChange={ev=>setForm({name:ev.target.value})}/></Fld>
      <div style={{display:"flex",gap:10}}>
        {!isRoot&&<div style={{flex:1}}><Fld t={t} label="Type"><select style={s.sel} value={form.type} onChange={ev=>setForm({type:ev.target.value})}>{TOPTS.map(tp=><option key={tp} value={tp}>{TI[tp]} {tp.charAt(0).toUpperCase()+tp.slice(1)}</option>)}</select></Fld></div>}
        <div style={{flex:1}}><Fld t={t} label="Dimensions"><input style={s.input} value={form.dimensions} onChange={ev=>setForm({dimensions:ev.target.value})}/></Fld></div>
      </div>
      {!isRoot&&<Fld t={t} label="Parent *" error={e.parent}><select style={e.parent?s.inputE:s.sel} value={form.parent||""} onChange={ev=>setForm({parent:ev.target.value})}><option value="">Select…</option>{data.spaces.filter(x=>x.id!==form.id).map(x=><option key={x.id} value={x.id}>{gPt(x.id)}</option>)}</select></Fld>}
      {!isRoot&&<Fld t={t} label="Linked Item"><select style={s.sel} value={form.linkedItemId||""} onChange={ev=>setForm({linkedItemId:ev.target.value||null})}><option value="">None</option>{itemsLink.map(i=><option key={i.id} value={i.id}>{dName(i)}</option>)}</select></Fld>}
      <Fld t={t} label="Notes"><textarea style={{...s.input,minHeight:40,resize:"vertical"}} value={form.notes} onChange={ev=>setForm({notes:ev.target.value})}/></Fld>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        {isEdit&&form.id!=="s_apt"&&<button style={s.bD} onClick={async()=>{
          const lk=gLk(form.id);
          if(lk){
            const result=await askConfirm({title:`Delete "${form.name}"?`,msg:`This space is linked to "${dName(lk)}". All sub-spaces will also be deleted.`,buttons:[
              {label:"Cancel",value:"cancel",style:"secondary"},
              {label:"Delete Only Space",value:"space",style:"primary",minWidth:130},
              {label:"Delete Space & Item",value:"both",style:"danger",minWidth:140}
            ]});
            if(result==="cancel")return;
            if(result==="space"){
              rmSpOnly(form.id);
            } else { rmSp(form.id); }
          } else {
            if(!await askConfirm({title:`Delete "${form.name}"?`,msg:"This will also delete all sub-spaces.",okLabel:"Delete"}))return;
            rmSp(form.id);
          }
          setSelSp(form.parent||"s_apt");setModal(null);
        }}>Delete</button>}
        <div style={{flex:1}}/><button style={s.bS} onClick={()=>setModal(null)}>Cancel</button>
        <button style={s.bP} onClick={()=>{const e=valSp(form);setValE(e);if(Object.keys(e).length)return;const saveForm=isRoot?{...form,type:"unit",linkedItemId:null}:form;if(isEdit){edSp(form.id,saveForm);if(!isRoot&&saveForm.linkedItemId){const it=iM[saveForm.linkedItemId];if(it)edIt(it.id,{...it,isAlsoSpace:form.id,dimensions:saveForm.dimensions||"",name:saveForm.name})}}else{const ns={...saveForm,id:uid("s")};addSp(ns);if(saveForm.linkedItemId){const it=iM[saveForm.linkedItemId];if(it)edIt(it.id,{...it,isAlsoSpace:ns.id,dimensions:saveForm.dimensions||"",name:saveForm.name})}setSelSp(ns.id)}setModal(null)}}>{isRoot?"Save":isEdit?"Save":"Add Space"}</button>
      </div>
    </Mod>);
  };

  const renderProcModal=()=>{const{isEdit,form,setForm}=modal;const e=valE;
    return(<Mod t={t} title={isEdit?"Edit Process":"Add Process"} onClose={()=>setModal(null)} width={580}>
      <Fld t={t} label="Name *" error={e.name}><input style={e.name?s.inputE:s.input} value={form.name} onChange={ev=>setForm({name:ev.target.value})}/></Fld>
      <Fld t={t} label="Frequency"><select style={s.sel} value={form.frequency} onChange={ev=>setForm({frequency:ev.target.value})}>{FREQ.map(f=><option key={f||"_none"} value={f}>{f||"—"}</option>)}</select></Fld>
      <Fld t={t} label="Location"><ComboBox t={t} s={s} options={allSpOpts} value={form.location} placeholder="Search…" onChange={v=>setForm({location:v||"s_apt"})} onAdd={n=>{const nid=quickAddSp(n);setForm({location:nid})}} addLabel="Create space"/></Fld>
      <Fld t={t} label="Parent Process">
        <ComboBox t={t} s={s} options={data.processes.filter(p=>p.id!==form.id).map(p=>({value:p.id,label:gPrPt(p.id)}))} value={form.parent} placeholder="None — top-level (search…)" onChange={v=>setForm({parent:v})}/>
      </Fld>
      <Fld t={t} label="Steps *" error={e.steps}>
        {(form.steps||[]).map((step,idx)=>{const total=(form.steps||[]).length;const isFirst=idx===0;const isLast=idx===total-1;
          const hasSubProc=!!step.subProcId;const linkedProc=hasSubProc?pM[step.subProcId]:null;
          // Swap helper that also reorders sub-processes in the data array to match step order
          const swapSteps=(a,b)=>{setForm(f=>{const st=[...f.steps];[st[a],st[b]]=[st[b],st[a]];const updated=st.map((x,i)=>({...x,num:i+1}));
            // Sync tree order: reorder sub-processes in data.processes to match step order
            const subIds=updated.filter(x=>x.subProcId).map(x=>x.subProcId);
            if(subIds.length>1)setTimeout(()=>{upd(d=>{const parent=form.id;const others=d.processes.filter(p=>p.parent!==parent);const children=subIds.map(id=>d.processes.find(p=>p.id===id)).filter(Boolean);const nonLinked=d.processes.filter(p=>p.parent===parent&&!subIds.includes(p.id));d.processes=[...others,...children,...nonLinked]})},0);
            return{...f,steps:updated}})};
          return(<div key={idx} style={{display:"flex",gap:6,marginBottom:8,alignItems:"stretch"}}>
            <span style={{fontSize:13,color:t.txD,width:22,textAlign:"center",flexShrink:0,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:9,fontWeight:500}}>{idx+1}</span>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
              {hasSubProc?(
                <>
                  <input style={{...s.input}} value={step.action} onChange={ev=>{setForm(f=>{const st=[...f.steps];st[idx]={...st[idx],action:ev.target.value};return{...f,steps:st}});if(linkedProc)edPr(step.subProcId,{name:ev.target.value})}} placeholder="Step…"/>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:11,color:t.pp,flex:1,padding:"6px 12px",background:t.ppBg,borderRadius:6}}>{linkedProc?.name||"Sub-process"}</span>
                    <button style={{...s.bSm,color:t.wn,padding:"6px 10px"}} onClick={async()=>{if(await askConfirm(`Delete process "${linkedProc?.name||"sub-process"}"?`)){rmPr(step.subProcId);setForm(f=>{const st=[...f.steps];st[idx]={...st[idx],subProcId:null};return{...f,steps:st}})}}}>Delete Process</button>
                  </div>
                </>
              ):(
                <>
                  <input style={{...s.input}} value={step.action} onChange={ev=>{setForm(f=>{const st=[...f.steps];st[idx]={...st[idx],action:ev.target.value};return{...f,steps:st}})}} placeholder="Step…"/>
                  <ComboBox t={t} s={{...s,input:{...s.input,fontSize:11,padding:"6px 12px"}}} options={itemOpts} value={step.itemId} placeholder="Link Item"
                    onChange={v=>{setForm(f=>{const st=[...f.steps];st[idx]={...st[idx],itemId:v};return{...f,steps:st}})}}
                    onAdd={n=>{const nid=quickAddIt(n);setForm(f=>{const st=[...f.steps];st[idx]={...st[idx],itemId:nid};return{...f,steps:st}})}} addLabel="Create item"
                    extraTop={<div onClick={()=>{
                      const name=step.action||`Step ${idx+1} detail`;
                      const nid=quickAddPr(name,form.id||null);
                      setForm(f=>{const st=[...f.steps];st[idx]={...st[idx],itemId:null,subProcId:nid};return{...f,steps:st}});
                    }} style={{padding:"6px 12px",fontSize:12,color:t.txD,cursor:"pointer"}}>→ Create Detailed Sub-Process</div>}
                  />
                </>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",flexShrink:0,width:26}}>
              {!isFirst?<button style={{...s.bSm,padding:"2px 6px",fontSize:10,flex:1}} onClick={()=>swapSteps(idx-1,idx)}>↑</button>:<div style={{flex:1}}/>}
              {!isLast?<button style={{...s.bSm,padding:"2px 6px",fontSize:10,flex:1}} onClick={()=>swapSteps(idx,idx+1)}>↓</button>:<div style={{flex:1}}/>}
              <button style={{...s.bSm,padding:"2px 6px",fontSize:14,color:t.wn,flex:1,lineHeight:1}} onClick={()=>{if(form.steps.length<=1)return;if(step.subProcId)rmPr(step.subProcId);setForm(f=>({...f,steps:f.steps.filter((_,i)=>i!==idx).map((x,i)=>({...x,num:i+1}))}));}}>×</button>
            </div>
          </div>)
        })}
        <div style={{marginLeft:28}}><button style={s.bSm} onClick={()=>setForm(f=>({...f,steps:[...f.steps,{num:f.steps.length+1,action:"",itemId:null,subProcId:null}]}))}>+ Step</button></div>
      </Fld>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        {isEdit&&<button style={s.bD} onClick={async()=>{if(await askConfirm({title:`Delete "${form.name}"?`,msg:"Sub-processes will become top-level. Items will not be deleted.",okLabel:"Delete"})){rmPr(form.id);setSelPr(form.parent||null);setModal(null)}}}>Delete</button>}
        <div style={{flex:1}}/><button style={s.bS} onClick={()=>setModal(null)}>Cancel</button>
        <button style={s.bP} onClick={()=>{const e=valPr(form);setValE(e);if(Object.keys(e).length)return;
          if(isEdit){
            const oldProc=pM[form.id];const oldParent=oldProc?.parent;const newParent=form.parent;
            edPr(form.id,form);
            // Sync name to any parent step that references this process
            upd(d=>{
              d.processes.forEach(p=>{p.steps?.forEach(st=>{if(st.subProcId===form.id)st.action=form.name})});
              // If parent changed, manage step references
              if(oldParent!==newParent){
                // Remove step from old parent
                if(oldParent){const op=d.processes.find(p=>p.id===oldParent);if(op){op.steps=op.steps.filter(st=>st.subProcId!==form.id);op.steps.forEach((s,i)=>s.num=i+1)}}
                // Add step to new parent
                if(newParent){const np=d.processes.find(p=>p.id===newParent);if(np&&!np.steps.some(st=>st.subProcId===form.id)){np.steps.push({num:np.steps.length+1,action:form.name,itemId:null,subProcId:form.id})}}
              }
            });
          } else {
            const np={...form,id:uid("p")};addPr(np);setSelPr(np.id);
            // If new process has a parent, append as step
            if(np.parent){upd(d=>{const parent=d.processes.find(p=>p.id===np.parent);if(parent&&!parent.steps.some(st=>st.subProcId===np.id)){parent.steps.push({num:parent.steps.length+1,action:np.name,itemId:null,subProcId:np.id})}})}
          }
          setModal(null)}}>{isEdit?"Save":"Add"}</button>
      </div>
    </Mod>);
  };


  // ─── MAIN RENDER ──────────────────────────────────────────────────────────
  const topProcs=(data.processes||[]).filter(p=>!p.parent);
  const win=getCurrentWindow();
  return(<div style={{fontFamily:"'DM Sans','Helvetica Neue',sans-serif",background:t.bg,color:t.tx,height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
    {/* Custom title bar */}
    <div data-tauri-drag-region style={{height:32,flexShrink:0,background:t.srf,borderBottom:`1px solid ${t.bd}`,display:"flex",alignItems:"center",userSelect:"none",WebkitUserSelect:"none",position:"relative",zIndex:1100}}>
      {isMac?<>
        {/* macOS traffic lights on left */}
        <div style={{display:"flex",gap:8,padding:"0 13px",alignItems:"center"}} className="tl-group">
          {[
            {c:"#ff5f57",hc:"#e0443e",sym:"×",act:()=>win.close()},
            {c:"#febc2e",hc:"#dea123",sym:"−",act:()=>win.minimize()},
            {c:"#28c840",hc:"#1aab29",sym:"+",act:()=>win.toggleMaximize()}
          ].map((b,i)=><div key={i} onClick={b.act} onMouseDown={e=>{e.currentTarget.style.filter="brightness(0.85)"}} onMouseUp={e=>{e.currentTarget.style.filter=""}} onMouseLeave={e=>{e.currentTarget.style.filter="";e.currentTarget.querySelector("span").style.opacity=0}} onMouseEnter={e=>{e.currentTarget.querySelector("span").style.opacity=1}} style={{width:12,height:12,borderRadius:"50%",background:winFocused?b.c:"#4d4d4d",border:winFocused?`0.5px solid ${b.hc}`:"0.5px solid #3d3d3d",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"filter 0.08s"}}><span style={{fontSize:9,color:"rgba(0,0,0,0.6)",fontWeight:700,lineHeight:1,opacity:0,transition:"opacity 0.1s",pointerEvents:"none"}}>{b.sym}</span></div>)}
        </div>
        {/* Centered title (absolute so update dot doesn't shift it) */}
        <div data-tauri-drag-region style={{position:"absolute",left:0,right:0,top:0,bottom:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
          <span data-tauri-drag-region style={{fontSize:12,color:t.txM,fontWeight:600,letterSpacing:"0.01em"}}>Apartment Planner {VERSION}</span>
          {latestVersion&&<span onClick={()=>shellOpen(latestVersion.url)} title={`Version ${latestVersion.version} now available`} style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#4a9eff",cursor:"pointer",marginLeft:6,pointerEvents:"auto"}}/>}
        </div>
        {/* App icon on right */}
        <div data-tauri-drag-region style={{marginLeft:"auto",paddingRight:10,display:"flex",alignItems:"center"}}>
          <img src="/app-icon.png" alt="" style={{width:16,height:16,borderRadius:2}}/>
        </div>
      </>:<>
        {/* Windows: icon+title left, controls right */}
        <div data-tauri-drag-region style={{paddingLeft:10,fontSize:12,color:t.txM,fontWeight:600,letterSpacing:"0.01em",display:"flex",alignItems:"center",gap:7,flex:1}}>
          <img src="/app-icon.png" alt="" style={{width:16,height:16,borderRadius:2}}/> Apartment Planner {VERSION}{latestVersion&&<span onClick={()=>shellOpen(latestVersion.url)} title={`Version ${latestVersion.version} now available`} style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#4a9eff",cursor:"pointer",marginLeft:6,flexShrink:0}}/>}
        </div>
        <div style={{display:"flex",height:"100%"}}>
          <div onClick={()=>win.minimize()} style={{width:46,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:t.txD}} onMouseEnter={e=>e.currentTarget.style.background=t.srfH} onMouseLeave={e=>e.currentTarget.style.background="transparent"} onMouseDown={e=>e.currentTarget.style.background=t.srfS}>
            <svg width="10" height="1" viewBox="0 0 10 1"><line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" strokeWidth="1"/></svg>
          </div>
          <div onClick={()=>win.toggleMaximize()} style={{width:46,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:t.txD}} onMouseEnter={e=>e.currentTarget.style.background=t.srfH} onMouseLeave={e=>e.currentTarget.style.background="transparent"} onMouseDown={e=>e.currentTarget.style.background=t.srfS}>
            {isMaximized?<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1"/><polyline points="2,2 2,0 10,0 10,8 8,8" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
            :<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1"/></svg>}
          </div>
          <div onClick={()=>win.close()} style={{width:46,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:t.txD}} onMouseEnter={e=>{e.currentTarget.style.background="#c42b1c";e.currentTarget.style.color="#fff"}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=t.txD}}>
            <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2"/><line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2"/></svg>
          </div>
        </div>
      </>}
    </div>

    {/* Custom confirm modal */}
    {cfm&&<div style={{position:"fixed",top:32,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(3px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3000}}>
      <div style={{background:t.mBg,border:`1px solid ${t.bdI}`,borderRadius:10,padding:"20px 24px",maxWidth:440,width:"90%",boxShadow:"0 16px 50px rgba(0,0,0,0.4)"}}>
        {cfm.title&&<div style={{fontSize:15,fontWeight:700,color:t.tx,marginBottom:8}}>{cfm.title}</div>}
        <div style={{fontSize:13,color:t.txM,marginBottom:18,lineHeight:1.5,whiteSpace:"pre-line"}}>{cfm.msg}</div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
          {cfm.buttons?cfm.buttons.map(b=><button key={b.value} style={{...(b.style==="danger"?s.bD:b.style==="primary"?s.bP:s.bS),padding:"7px 0",minWidth:b.minWidth||100,textAlign:"center"}} onClick={()=>{cfm.resolve(b.value);setCfm(null)}}>{b.label}</button>)
          :<><button style={{...s.bS,padding:"7px 0",minWidth:100,textAlign:"center"}} onClick={()=>{cfm.resolve(false);setCfm(null)}}>Cancel</button>
          <button style={{...s.bP,padding:"7px 0",minWidth:100,textAlign:"center"}} onClick={()=>{cfm.resolve(true);setCfm(null)}}>{cfm.okLabel}</button></>}
        </div>
      </div>
    </div>}

    {toastMsg&&<div style={{position:"fixed",top:48,left:"50%",transform:"translateX(-50%)",zIndex:2000,padding:"8px 20px",borderRadius:8,background:toastWarn?(dark?"#3d3520":"#fef6e0"):t.tBg,border:`1px solid ${toastWarn?"#c9a84c":t.tBd}`,color:toastWarn?"#c9a84c":t.ac,fontSize:13,fontWeight:500,boxShadow:"0 8px 30px rgba(0,0,0,0.3)",display:"flex",alignItems:"center",gap:10}}>
      <span>{toastMsg}</span>
      {toastUndo&&<span onClick={()=>{toastUndo();}} style={{cursor:"pointer",color:t.wn,fontWeight:600,textDecoration:"underline",fontSize:12}}>(undo)</span>}
    </div>}

    <div style={{padding:"14px 20px 12px",borderBottom:`1px solid ${t.bd}`,background:t.bg,flexShrink:0}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8,flexWrap:"wrap"}}>
        <div>
          {editName?<input ref={nameRef} value={nameVal} onChange={e=>setNameVal(e.target.value)} onBlur={()=>{const n=nameVal.trim();if(n&&n!==data.name){if(activePath)renamePlan(n);else setData(prev=>{const nd={...prev,name:n};setDirty(true);return nd})}setEditName(false)}} onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setEditName(false)}} style={{fontSize:17,fontWeight:700,letterSpacing:"-0.02em",background:t.inBg,border:`1px solid ${t.acBd}`,borderRadius:6,color:t.tx,padding:"2px 8px",outline:"none",fontFamily:"inherit",width:280}}/>
          :<h1 onClick={()=>{setNameVal(data.name);setEditName(true);setTimeout(()=>nameRef.current?.select(),0)}} style={{fontSize:17,fontWeight:700,margin:0,letterSpacing:"-0.02em",cursor:"pointer",borderBottom:`1px dashed ${t.bd}`,paddingBottom:1}} title="Click to rename">{data.name}</h1>}
          <div style={{fontSize:10,color:t.txD,marginTop:2,display:"flex",gap:8,alignItems:"center"}}>
            <span>{data.items.length} items · {data.spaces.length} spaces · {data.processes.length} processes</span>
            {activePath?<span style={{color:dirty?t.wn:t.ac}}>{dirty?"● unsaved":lastSaved?`✓ ${lastSaved.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}).toLowerCase()} auto-saved`:""}</span>:<span style={{fontSize:10,color:t.txD,fontStyle:"italic"}}>{isSample?"sample — save to create a file":"save to create a file"}</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
          <button style={{...s.bSm,height:28,display:"flex",alignItems:"center"}} onClick={()=>startNew()} title="New blank plan">New</button>
          <div style={{position:"relative"}}>
            <button data-allow-ctx style={{...s.bSm,height:28,display:"flex",alignItems:"center"}} onClick={()=>openFile()} onContextMenu={e=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY})}} title="Open plan (right-click for options)">Open</button>
            {ctxMenu&&<><div onClick={()=>setCtxMenu(null)} style={{position:"fixed",inset:0,zIndex:999}}/><div style={{position:"fixed",left:ctxMenu.x,top:ctxMenu.y,background:t.dBg,border:`1px solid ${t.dBd}`,borderRadius:6,padding:4,zIndex:1000,boxShadow:"0 8px 24px rgba(0,0,0,0.3)",minWidth:140}}>
              <div onClick={()=>{openFile();setCtxMenu(null)}} style={{padding:"6px 12px",fontSize:12,color:t.tx,cursor:"pointer",borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background=t.dH} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Open file…</div>
              {recentFiles.length>0&&<><div style={{borderTop:`1px solid ${t.bdL}`,margin:"2px 0"}}/>{recentFiles.slice(0,5).map(f=><div key={f.path} onClick={()=>{loadRecent(f.path);setCtxMenu(null)}} style={{padding:"6px 12px",fontSize:11,color:t.txM,cursor:"pointer",borderRadius:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} onMouseEnter={e=>e.currentTarget.style.background=t.dH} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{f.name}</div>)}</>}
              <div style={{borderTop:`1px solid ${t.bdL}`,margin:"2px 0"}}/>
              <div onClick={()=>{resetDef();setCtxMenu(null)}} style={{padding:"6px 12px",fontSize:12,color:t.txD,cursor:"pointer",borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background=t.dH} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>See sample</div>
            </div></>}
          </div>
          <button style={{...s.bSm,height:28,display:"flex",alignItems:"center"}} onClick={()=>saveAs(data?.name||"plan")} title="Save as">Save</button>
          <div style={{width:1,height:20,background:t.bd,margin:"0 2px"}}/>
          <button onClick={()=>setDark(d=>!d)} style={{...s.bSm,fontSize:13,padding:"4px 8px",lineHeight:1,height:28,width:28,display:"flex",alignItems:"center",justifyContent:"center"}} title={dark?"Light":"Dark"}>{dark?"☼":"☽"}</button>
          <div style={{width:1,height:20,background:t.bd,margin:"0 2px"}}/>
          <div style={{display:"flex",background:t.bsBg,borderRadius:8,padding:2}}>{[{k:"spatial",l:"Spaces",i:"▣"},{k:"process",l:"Processes",i:"▷"}].map(v=><div key={v.k} onClick={()=>{setView(v.k);setSelIt(null)}} style={{padding:"5px 12px",borderRadius:6,fontSize:12,cursor:"pointer",fontWeight:view===v.k?600:400,background:view===v.k?t.acS:"transparent",color:view===v.k?t.tx:t.txD}}>{v.i} {v.l}</div>)}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:12,padding:"8px 12px",background:t.srfS,borderRadius:8,fontSize:12,flexWrap:"wrap",alignItems:"center"}}>
        <div><span style={{color:t.txD}}>Items: </span><strong>{fmtInt(stats.total)}</strong></div>
        <div onClick={()=>setTreeFilter(f=>f==="owned"?null:"owned")} style={{cursor:"pointer",userSelect:"none",display:"flex",alignItems:"center",gap:2}}><span style={{color:t.ac,fontSize:treeFilter==="owned"?14:12,lineHeight:1}}>●</span><span style={{color:treeFilter==="owned"?t.tx:t.txD,fontWeight:treeFilter==="owned"?800:400}}>Owned: </span><span style={{color:treeFilter==="owned"?t.tx:undefined,fontWeight:treeFilter==="owned"?800:400}}>{fmtInt(stats.owned)}</span></div>
        <div onClick={()=>setTreeFilter(f=>f==="needed"?null:"needed")} style={{cursor:"pointer",userSelect:"none",display:"flex",alignItems:"center",gap:2}}><span style={{color:t.wn,fontSize:treeFilter==="needed"?14:12,lineHeight:1}}>●</span><span style={{color:treeFilter==="needed"?t.tx:t.txD,fontWeight:treeFilter==="needed"?800:400}}>Needed: </span><span style={{color:treeFilter==="needed"?t.tx:undefined,fontWeight:treeFilter==="needed"?800:400}}>{fmtInt(stats.needed)}</span></div>
        <div style={{position:"relative",cursor:"default"}} title={`Unpurchased: $${fmt(stats.cost)}\nOwned: $${fmt(stats.ownedCost)}`}><span style={{color:t.txD}}>Unpurchased: </span><strong style={{color:stats.cost>0?t.wn:t.ac}}>${fmt(stats.cost)}</strong></div>
        <div style={{flex:1}}/>
        <button style={{...s.bSm,fontSize:11}} onClick={exportShop} title="Export shopping list as Excel">Export List</button>
      </div>
    </div>

    <div style={{display:"flex",flex:1,minHeight:0,overflow:"hidden"}}>
      <div style={{width:280,minWidth:280,borderRight:`1px solid ${t.bd}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"10px 10px 6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:10,color:t.txD,textTransform:"uppercase",letterSpacing:1.5}}>{view==="spatial"?"Spatial":"Procedural"}</span>
          <div style={{display:"flex",gap:3}}>
            <button style={{...s.bSm,fontSize:10,padding:"3px 8px"}} onClick={()=>{if(view==="spatial")openSp(null,"s_apt");else openPr(null,null)}}>+</button>
          </div>
        </div>
        <div tabIndex={-1} style={{flex:1,overflowY:"auto",padding:"0 6px 10px",outline:"none"}}>{view==="spatial"?<SpaceNode sid="s_apt"/>:topProcs.map(p=><ProcNode key={p.id} pid={p.id}/>)}</div>
        <div style={{padding:"6px 10px",borderTop:`1px solid ${t.bd}`,display:"flex",gap:6}}>
          <button onClick={expandAll} style={{...s.bSm,flex:1,textAlign:"center",fontSize:11}}>Expand All</button>
          <button onClick={collapseAll} style={{...s.bSm,flex:1,textAlign:"center",fontSize:11}}>Collapse All</button>
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"12px 18px 8px",borderBottom:`1px solid ${t.bdL}`,flexShrink:0}}>
          {view==="spatial"&&<>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",marginBottom:4}}>{gBd(selSp).map((sp,i,a)=><span key={sp.id} style={{display:"inline-flex",alignItems:"center",gap:5}}><span onClick={()=>setSelSp(sp.id)} style={{fontSize:12,cursor:"pointer",color:i===a.length-1?t.tx:t.txD,fontWeight:i===a.length-1?600:400}}>{sp.name}</span>{i<a.length-1&&<span style={{color:t.cr,fontSize:9}}>›</span>}</span>)}</div>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              {sM[selSp]?.dimensions&&<span style={{fontSize:11,color:t.txD,fontFamily:"'JetBrains Mono',monospace"}}>{sM[selSp].dimensions}</span>}
              {sM[selSp]?.notes&&<span style={{fontSize:11,color:t.txM,fontStyle:"italic"}}>{sM[selSp].notes}</span>}
              {(()=>{const lk=gLk(selSp);if(!lk)return null;const o=isOw(lk);return<span onClick={()=>openIt(lk)} style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:o?t.acS:t.wnS,color:o?t.ac:t.wn,cursor:"pointer"}} title="Click to edit item">Item: {dName(lk)}{!o&&lk.cost?` ($${fmt(lk.cost)})`:""}</span>})()}
            </div>
            <div style={{display:"flex",gap:6,marginTop:8}}>
              <button style={s.bSm} onClick={()=>openIt(null,selSp)}>+ Item Here</button>
              <button style={s.bSm} onClick={()=>openSp(null,selSp)}>+ Sub-Space</button>
              <button style={s.bSm} onClick={()=>openSp(sM[selSp])}>Edit Space</button>
              {canMoveSp(selSp,-1)&&<button style={s.bSm} onClick={()=>moveSp(selSp,-1)}>↑ Move Up</button>}
              {canMoveSp(selSp,1)&&<button style={s.bSm} onClick={()=>moveSp(selSp,1)}>↓ Move Down</button>}
            </div>
          </>}
          {view==="process"&&selPr&&pM[selPr]&&(()=>{const p=pM[selPr];const par=p.parent?pM[p.parent]:null;const ch=gPC(p.id);return<>
            <div style={{fontSize:15,fontWeight:600,marginBottom:3}}>{p.name}</div>
            <div style={{display:"flex",gap:10,fontSize:12,color:t.txD,flexWrap:"wrap"}}>
              {p.frequency&&<span>↻ {p.frequency}</span>}
              <span onClick={()=>{setView("spatial");setSelSp(p.location)}} style={{color:t.ac,cursor:"pointer",textDecoration:"underline dotted",textUnderlineOffset:3}}>{TI[sM[p.location]?.type]||"◎"} {sM[p.location]?.name||""}</span>
              {par&&<span onClick={()=>setSelPr(par.id)} style={{color:t.pp,cursor:"pointer",textDecoration:"underline dotted",textUnderlineOffset:3}}>↑ {par.name}</span>}
            </div>
            {ch.length>0&&<div style={{marginTop:6,display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}><span style={{fontSize:10,color:t.txD,letterSpacing:0.5}}>Sub: </span>{ch.map((c,i)=><span key={c.id} style={{display:"inline-flex",alignItems:"center",gap:4}}>{i>0&&<span style={{color:t.txD,fontSize:10}}>→</span>}<span onClick={()=>setSelPr(c.id)} style={{fontSize:11,color:t.pp,cursor:"pointer",textDecoration:"underline dotted",textUnderlineOffset:3}}>{c.name}</span></span>)}</div>}
            <div style={{display:"flex",gap:6,marginTop:8}}>
              <button style={s.bSm} onClick={()=>openPr(null,p.id)}>+ Sub-Process</button>
              <button style={s.bSm} onClick={()=>openPr(p)}>Edit Process</button>
              {canMovePr(p.id,-1)&&<button style={s.bSm} onClick={()=>movePr(p.id,-1)}>↑ Move Up</button>}
              {canMovePr(p.id,1)&&<button style={s.bSm} onClick={()=>movePr(p.id,1)}>↓ Move Down</button>}
            </div>
            <div style={{marginTop:12}}>{p.steps.map(step=>{
              const item=step.itemId?iM[step.itemId]:null;
              const subProc=step.subProcId?pM[step.subProcId]:null;
              return<div key={step.num} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:`1px solid ${t.bdL}`}}>
                <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,background:t.ppBg,color:t.pp,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>{step.num}</div>
                <div style={{flex:1}}>
                  {subProc?
                    <span onClick={()=>setSelPr(subProc.id)} style={{fontSize:13,color:t.pp,cursor:"pointer",textDecoration:"underline dotted",textUnderlineOffset:3}}>{step.action}</span>
                    :<span style={{fontSize:13}}>{step.action}</span>}
                  {item&&<div onClick={()=>setSelIt(selIt===item.id?null:item.id)} style={{fontSize:11,marginTop:3,display:"inline-flex",alignItems:"center",gap:4,color:isOw(item)?t.ac:t.wn,cursor:"pointer",background:t.srfS,padding:"2px 7px",borderRadius:4}}><span style={{width:5,height:5,borderRadius:"50%",background:isOw(item)?t.ac:t.wn}}/>{dName(item)}</div>}
                </div>
              </div>})}</div>
          </>})()}
          {view==="process"&&!selPr&&<div style={{color:t.txD,fontSize:13}}>Select a process.</div>}
        </div>

        <div style={{padding:"10px 18px 6px",flexShrink:0,display:"flex",gap:6,alignItems:"center"}}>
          <input type="text" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:80,padding:"7px 11px",background:t.inBg,border:`1px solid ${t.bd}`,borderRadius:6,color:t.tx,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
          <div style={{display:"flex",background:t.bsBg,borderRadius:6,padding:2,flexShrink:0}}>{[{k:"full",l:"Full Depth"},{k:"current",l:"At Current Level"}].map(d=><div key={d.k} onClick={()=>setDepth(d.k)} style={{padding:"4px 9px",borderRadius:4,fontSize:11,cursor:"pointer",background:depth===d.k?t.acS:"transparent",color:depth===d.k?t.tx:t.txD,fontWeight:depth===d.k?600:400,whiteSpace:"nowrap"}}>{d.l}</div>)}</div>
          <div style={{display:"flex",background:t.bsBg,borderRadius:6,padding:2,flexShrink:0}}>{["all","owned","needed"].map(f=><div key={f} onClick={()=>setFilter(f)} style={{padding:"4px 9px",borderRadius:4,fontSize:11,cursor:"pointer",textTransform:"capitalize",background:filter===f?t.acS:"transparent",color:filter===f?t.tx:t.txD,fontWeight:filter===f?600:400}}>{f}</div>)}</div>
        </div>
        <div ref={listRef} style={{flex:1,overflowY:"auto",padding:"6px 18px 20px"}}>{filtered.length===0?<div style={{textAlign:"center",padding:30,color:t.txD,fontSize:13}}>{search?"No match.":"No items here."}</div>:filtered.map(i=><ItemCard key={i.id} item={i}/>)}</div>
      </div>
    </div>

    {modal?.type==="item"&&renderItemModal()}
    {modal?.type==="space"&&renderSpaceModal()}
    {modal?.type==="process"&&renderProcModal()}
  </div>);
}
