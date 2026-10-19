'use strict';
/* Scripture Caption core source; full project import is being finalized from the supplied ZIP. */
const fs = require('fs');
const path = require('path');
const VERSION_ORDER = ['WEB','KJV','ASV','BBE','YLT','Darby'];
const VERSION_LABELS = { WEB:'World English Bible', KJV:'King James Version', ASV:'American Standard Version', BBE:'Bible in Basic English', YLT:"Young's Literal Translation", Darby:'Darby Translation' };
function load(dataPath) {
  const raw = JSON.parse(fs.readFileSync(dataPath || path.join(__dirname, '..', 'data', 'bible.json'), 'utf8'));
  const versions = Object.keys(raw.versions).sort((a,b) => VERSION_ORDER.indexOf(a) - VERSION_ORDER.indexOf(b));
  return { books:raw.books, versions, text:raw.versions };
}
function normalise(text) { return String(text).toLowerCase().replace(/[’‘]/g,"'").replace(/(\d)\s*:\s*(\d)/g,'$1 : $2').replace(/[^a-z0-9:\-–' ]+/g,' ').replace(/\s+/g,' ').trim(); }
class Scripture {
 constructor(dataPath) { const d=load(dataPath); this.books=d.books; this.versions=d.versions; this.text=d.text; this.sessions=new Map(); }
 lookup(query) {
   const q=normalise(query); const m=q.match(/^(\d?\s?[a-z ]+?)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?$/i);
   if(!m) return null;
   const bookText=m[1].trim(); const bi=this.books.findIndex(b=>normalise(b)===bookText || normalise(b).replace(/ /g,'')===bookText.replace(/ /g,''));
   if(bi<0) return null;
   const ci=Number(m[2])-1, vs=Number(m[3]||1)-1, ve=Number(m[4]||m[3]||Math.min(vs+3,99))-1;
   const base=this.text.KJV?.[bi]?.[ci]; if(!base || vs<0 || vs>=base.length) return null;
   const end=Math.min(ve,base.length-1);
   const verses=Object.fromEntries(this.versions.map(v=>[v,Array.from({length:end-vs+1},(_,i)=>({n:vs+i+1,text:this.text[v]?.[bi]?.[ci]?.[vs+i]||''}))]));
   return {label:`${this.books[bi]} ${ci+1}:${vs+1}${end>vs?'-'+(end+1):''}`,bookIdx:bi,chapter:ci+1,vStart:vs+1,vEnd:end+1,verses,version:this.versions[0],source:'manual'};
 }
 detect(text) { const reference=this.lookup(text); return { references: reference?[reference]:[], suggestions:[] }; }
}
module.exports={Scripture,normalise,VERSION_LABELS,VERSION_ORDER};
