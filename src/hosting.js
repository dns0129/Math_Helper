export function cloudAppUrl(value){
  if(!value?.trim())return '';
  const url=new URL(value.trim());
  if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash)throw new Error('云端应用地址必须是仅含域名的 HTTPS 地址。');
  return url.origin+'/';
}
