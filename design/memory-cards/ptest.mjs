import fs from 'fs';
import { ITEMS } from './mc.mts';
function parseTree(src){const root={tag:"div",cls:"",style:"",kids:[]};const st=[root];const re=/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/g;let m;
while((m=re.exec(src))!==null){const top=st[st.length-1];if(m[4]!==undefined){const t=m[4].replace(/\s+/g," ");if(t.trim())top.kids.push(t);continue}
if(m[1]==="/"){if(st.length>1)st.pop();continue}const a=m[3]||"";const cm=/class="([^"]*)"/.exec(a),sm=/style="([^"]*)"/.exec(a);
const n={tag:m[2],cls:cm?cm[1]:"",style:sm?sm[1]:"",kids:[]};top.kids.push(n);st.push(n)}return root}
const tags=new Set();const walk=n=>{if(typeof n==='string')return;tags.add(n.tag);n.kids.forEach(walk)};
let bad=0;for(const it of ITEMS){const t=parseTree(it.html);walk(t); const opens=(it.html.match(/<[a-z]/g)||[]).length, closes=(it.html.match(/<\//g)||[]).length; if(opens!==closes){bad++;console.log('unbalanced',it.id,opens,closes)}}
console.log('tags',[...tags].join(','),'bad',bad);
