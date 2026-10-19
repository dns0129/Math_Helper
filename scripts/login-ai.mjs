import {activeProvider,configureDeepSeek,publicError} from '../lib/auth.mjs';
if(activeProvider==='pi'){
  await import('./login-pi.mjs');
}else if(!process.env.DEEPSEEK_API_KEY){
  console.log('请打开数学助手网页，在「连接 DeepSeek」中填写 API Key。不要把密钥写入命令历史或源码。');
  process.exitCode=1;
}else{
  try{await configureDeepSeek(process.env.DEEPSEEK_API_KEY);console.log('DeepSeek 官方接口验证通过，密钥已保存在后端私有配置中。');}
  catch(error){console.error(publicError(error));process.exitCode=1;}
}
