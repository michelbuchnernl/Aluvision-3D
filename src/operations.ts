import { clone, definition, isLocked, makeUnique, MATERIALS, newInstance, parseProject, validate } from './model.ts';
import type { Project, MaterialId, Vec3 } from './model.ts';
export type SceneOperation =
 | {type:'add';definitionId:string;name:string;position:Vec3;rotation:number}
 | {type:'transform';id:string;position:Vec3;rotation:number}
 | {type:'remove';ids:string[]}
 | {type:'make_unique';ids:string[]}
 | {type:'resize_definition';id:string;size:Vec3}
 | {type:'material';id:string;scope:'instance'|'definition';material:MaterialId}
 | {type:'room';length:number;depth:number;height:number};
export interface SceneProposal {summary:string;questions:string[];operations:SceneOperation[]}
const string={type:'string'} as const;
const vecSchema={type:'object',properties:{x:{type:'number'},y:{type:'number'},z:{type:'number'}},required:['x','y','z'],additionalProperties:false};
const op=(type:string,fields:Record<string,unknown>)=>({type:'object',properties:{type:{type:'string',enum:[type]},...fields},required:['type',...Object.keys(fields)],additionalProperties:false});
export const PROPOSAL_SCHEMA={type:'object',properties:{summary:string,questions:{type:'array',items:string},operations:{type:'array',items:{anyOf:[
 op('add',{definitionId:string,name:string,position:vecSchema,rotation:{type:'number'}}),
 op('transform',{id:string,position:vecSchema,rotation:{type:'number'}}),
 op('remove',{ids:{type:'array',items:string}}),op('make_unique',{ids:{type:'array',items:string}}),
 op('resize_definition',{id:string,size:vecSchema}),op('material',{id:string,scope:{type:'string',enum:['instance','definition']},material:{type:'string',enum:Object.keys(MATERIALS)}}),
 op('room',{length:{type:'number'},depth:{type:'number'},height:{type:'number'}})
 ]}}},required:['summary','questions','operations'],additionalProperties:false};
const isText=(s:unknown,max=300):s is string=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
const number=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e7;
const vector=(v:any):v is Vec3=>v&&typeof v==='object'&&Object.keys(v).length===3&&['x','y','z'].every(k=>number(v[k]));
function keys(o:any,allowed:string[]){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!allowed.includes(k))||allowed.some(k=>!Object.hasOwn(o,k)))throw Error('Ongeldig wijzigingsformaat.');}
export function parseProposal(value:unknown):SceneProposal{
 const p=value as SceneProposal;keys(p,['summary','questions','operations']);
 if(!isText(p.summary,2000)||!Array.isArray(p.questions)||p.questions.length>10||p.questions.some(q=>!isText(q,1000))||!Array.isArray(p.operations)||p.operations.length>100)throw Error('Voorstel is ongeldig of te groot.');
 for(const raw of p.operations){const o=raw as any;
  const fields:Record<string,string[]>={add:['definitionId','name','position','rotation'],transform:['id','position','rotation'],remove:['ids'],make_unique:['ids'],resize_definition:['id','size'],material:['id','scope','material'],room:['length','depth','height']};
  if(!o||!Object.hasOwn(fields,o.type))throw Error('Niet-ondersteunde scènebewerking.');keys(o,['type',...fields[o.type]]);
  if(('id'in o&&!isText(o.id))||('definitionId'in o&&!isText(o.definitionId))||('name'in o&&!isText(o.name))||('rotation'in o&&!number(o.rotation))||('position'in o&&!vector(o.position))||('size'in o&&(!vector(o.size)||!Object.values(o.size).every(v=>(v as number)>0))))throw Error('Ongeldige operatiegegevens.');
  if('ids'in o&&(!Array.isArray(o.ids)||!o.ids.length||o.ids.length>1000||o.ids.some((v:unknown)=>!isText(v))||new Set(o.ids).size!==o.ids.length))throw Error('Ongeldige selectie in voorstel.');
  if(o.type==='material'&&(!['instance','definition'].includes(o.scope)||!Object.hasOwn(MATERIALS,o.material)))throw Error('Ongeldige materiaalwijziging.');
  if(o.type==='room'&&!['length','depth','height'].every(k=>number(o[k])&&o[k]>=10&&o[k]<=100000))throw Error('Ongeldige ruimteafmetingen.');
 }
 return clone(p);
}
/** Atomic deterministic preview. An invalid operation rejects the whole proposal. No partial edits. */
export function previewProposal(project:Project,input:unknown){
 const proposal=parseProposal(input);let next=clone(project);
 const instance=(id:string)=>{const o=next.objects.find(o=>o.id===id);if(!o)throw Error(`Object ontbreekt: ${id}`);if(isLocked(next,o))throw Error(`Object is vergrendeld: ${o.name}`);return o;};
 for(const o of proposal.operations){
  if(o.type==='add'){if(next.objects.length>=10000)throw Error('Maximaal 10.000 objecten.');const added=newInstance(next,o.definitionId,clone(o.position));added.name=o.name;added.rotation=o.rotation;next.objects.push(added);}
  else if(o.type==='transform'){const target=instance(o.id);target.position=clone(o.position);target.rotation=o.rotation;}
  else if(o.type==='remove'){o.ids.forEach(instance);next.objects=next.objects.filter(v=>!o.ids.includes(v.id));next.groups=next.groups.filter(g=>next.objects.some(v=>v.groupId===g.id));}
  else if(o.type==='make_unique'){o.ids.forEach(instance);next=makeUnique(next,o.ids);}
  else if(o.type==='resize_definition'){const target=instance(o.id),d=definition(next,target);if(next.objects.some(v=>v.definitionId===d.id&&isLocked(next,v)))throw Error('Gedeelde definitie heeft vergrendelde exemplaren.');d.size=clone(o.size);}
  else if(o.type==='material'){const target=instance(o.id);if(o.scope==='instance')target.material=o.material;else{const d=definition(next,target);if(next.objects.some(v=>v.definitionId===d.id&&isLocked(next,v)))throw Error('Gedeelde definitie heeft vergrendelde exemplaren.');d.material=o.material;}}
  else if(o.type==='room')next.room={length:o.length,depth:o.depth,height:o.height};
 }
 next=parseProject(JSON.stringify(next));const issues=validate(next);const roomChanged=JSON.stringify(project.room)!==JSON.stringify(next.room);
 return {proposal,project:next,issues,roomChanged,canApply:proposal.operations.length>0&&proposal.questions.length===0&&!issues.some(i=>i.severity==='error')};
}
export function compactScene(p:Project){
 return {id:p.id,name:p.name,units:p.units,room:p.room,definitions:p.definitions.map(d=>({id:d.id,name:d.name,kind:d.kind,size:d.size,material:d.material,source:d.source})),instances:p.objects.map(o=>({id:o.id,definitionId:o.definitionId,name:o.name,position:o.position,rotation:o.rotation,groupId:o.groupId,tag:o.tag,locked:isLocked(p,o),material:o.material})),warnings:validate(p).slice(0,20)};
}
