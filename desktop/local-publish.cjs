const {execFileSync}=require('node:child_process');const path=require('node:path');const fs=require('node:fs');
function publishLocal(config,configPath,scope='all'){
 if(!config.pythonExecutable||!config.githubExecutable)throw Error('LOCAL_SETUP_REQUIRED: run Configure-Local.cmd');
 try{execFileSync(config.pythonExecutable,[path.join(__dirname,'local-sync','publish.py'),'--config',configPath,'--scope',scope],{windowsHide:true,timeout:25*60*1000,encoding:'utf8',maxBuffer:4*1024*1024});}
 catch{throw Error('LOCAL_PUBLISH_FAILED: inspect local-publish-status.json and local-sync/pipeline.log');}
 return JSON.parse(fs.readFileSync(path.join(config.stateDirectory,'local-publish-status.json'),'utf8'));
}
module.exports={publishLocal};
