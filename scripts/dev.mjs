import {spawn} from 'node:child_process';
const children=[];let ending=false;
const stop=()=>{if(ending)return;ending=true;for(const child of children)child.kill('SIGTERM');};
for(const args of [['--experimental-strip-types','server/index.ts'],['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4173','--strictPort']]){
 const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env});children.push(child);child.on('error',e=>{console.error(e.message);process.exitCode=1;stop();});child.on('exit',code=>{if(!ending){process.exitCode=code??1;stop();}});
}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
