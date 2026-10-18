import {useEffect,useRef,useSyncExternalStore} from 'react';
import type {Project} from './model';
import {ProjectConnection} from './serverClient';
export function useProjectServer(project:Project,onLoad:(p:Project)=>void){
 const onLoadRef=useRef(onLoad);onLoadRef.current=onLoad;const ref=useRef<ProjectConnection|null>(null);if(!ref.current)ref.current=new ProjectConnection(project,p=>onLoadRef.current(p));const connection=ref.current;
 const state=useSyncExternalStore(connection.subscribe,connection.getSnapshot,connection.getSnapshot);
 useEffect(()=>{connection.setCurrent(project);},[connection,project]);
 useEffect(()=>{if(state.mode!=='connected')return;const timer=setInterval(()=>connection.heartbeat(),10000);return()=>clearInterval(timer);},[connection,state.mode]);
 useEffect(()=>{if(state.mode!=='connected'||!state.dirty||state.saving)return;const timer=setTimeout(()=>{connection.save().catch(()=>{});},1200);return()=>clearTimeout(timer);},[connection,state.mode,state.dirty,state.saving,project]);
 useEffect(()=>()=>{connection.disconnect();},[connection]);
 return {connection,state};
}
