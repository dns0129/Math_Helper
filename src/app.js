import katex from 'katex';
import 'katex/dist/katex.min.css';
import {marked} from 'marked';
import DOMPurify from 'dompurify';
import './style.css';
import {mountDiagram} from './diagram.js';
import {demo,examples,exampleQuestion} from './demo.js';
import {checkPresentation,checkSummary,checkText} from './checks.js';
import {createTextStream} from './text-stream.js';
import {solutionDraftBlocks} from '../lib/solution-draft.mjs';
import {cloudAppUrl} from './hosting.js';

const staticSite=import.meta.env.MODE==='pages';
const cloudTarget=cloudAppUrl(import.meta.env.VITE_MATH_CLOUD_URL);
const repositoryUrl='https://github.com/dns0129/Math_Helper';

const paths={moon:'M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',plus:'M12 5v14M5 12h14',book:'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4zM20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-3h3z',history:'M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2',spark:'m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z',arrow:'M5 12h14m-6-6 6 6-6 6',image:'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 8h.01',chevron:'m9 5 7 7-7 7',check:'m5 12 4 4L19 6',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',copy:'M9 9h11v11H9zM5 15H3V3h12v2',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',printer:'M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6z',close:'m6 6 12 12M6 18 18 6',trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',link:'m10 14 4-4M8 15l-2 2a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0M16 9l2-2a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0',plot:'M4 3v17h17M6 15l4-7 4 4 5-6',help:'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 18h.01',menu:'M4 6h16M4 12h16M4 18h16',stop:'M6 6h12v12H6z'};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.spark}"/></svg>`;
const escape=s=>String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderChecks(checks){
  if(!checks?.length)return '';
  return `<details class="calculation-details"><summary>${escape(checkSummary(checks))}</summary>${checks.map(check=>{
    const p=checkPresentation(check);
    return `<div class="calculation-check" data-status="${escape(p.status)}"><div><strong>${escape(p.label)}</strong><code>${escape(p.expression)}</code>${p.notes.map(note=>`<small>${escape(note)}</small>`).join('')}</div><span>${escape(p.result)}</span></div>`;
  }).join('')}</details>`;
}
const $=s=>document.querySelector(s);
const stored=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}};
const history=stored('tuiyan-history-v1',[]);
const savedSettings=stored('tuiyan-settings-v1',{});
const settings={level:'自动判断',mode:'detailed',reasoning:'medium',...savedSettings};
// Apply the requested defaults once; later manual choices remain persistent.
if(settings.defaultsVersion!==3){settings.model=undefined;settings.reasoning='medium';settings.defaultsVersion=3;}
const state={history:Array.isArray(history)?history.filter(h=>h?.id&&h?.result?.solution).slice(0,20):[],settings,status:null,csrf:'',current:null,question:'',image:null,busy:false,controller:null,tab:'all',isDemo:false,view:'home'};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{toast('浏览器存储空间不足，当前解答仍可查看或导出。');}};
function math(latex,display=true){try{return katex.renderToString(latex,{displayMode:display,throwOnError:false,trust:false,strict:'ignore',maxExpand:1000,maxSize:20,output:'htmlAndMathml'});}catch{return `<code>${escape(latex)}</code>`;}}
function inlineMath(value){return String(value ?? '').split(/(\$[^\n$]+\$)/g).map(part=>/^\$[^\n$]+\$$/.test(part)?math(part.slice(1,-1),false):escape(part)).join('');}
function fitFormulaCards(){
  const cards=[...document.querySelectorAll('.formula-card')];
  cards.forEach(card=>card.classList.remove('formula-card-wide'));
  cards.forEach(card=>{const formula=card.querySelector('.math-display .katex-display') || card.querySelector('.math-display');if(formula.scrollWidth>formula.clientWidth+1)card.classList.add('formula-card-wide');});
}
window.addEventListener('resize',fitFormulaCards);
function md(value){
  const formulas=[];
  const source=String(value ?? '').replace(/\$\$([\s\S]+?)\$\$|\$([^\n$]+?)\$/g,(_,block,inline)=>{const key=`MATHPLACEHOLDER${formulas.length}END`;formulas.push(math(block || inline,Boolean(block)));return key;});
  const html=DOMPurify.sanitize(marked.parse(source,{breaks:true}));
  return html.replace(/MATHPLACEHOLDER(\d+)END/g,(_,i)=>formulas[Number(i)] || '');
}
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
function formatDate(value){return new Intl.DateTimeFormat('zh-CN',{month:'short',day:'numeric'}).format(new Date(value));}
function settingsSave(){save('tuiyan-settings-v1',state.settings);}

$('#app').innerHTML=`
  <aside class="sidebar">
    <a class="brand" href="${import.meta.env.BASE_URL}" aria-label="推演首页"><span class="brand-mark">π</span><div><strong>推演</strong><span>MATH STUDIO</span></div></a>
    <button class="new-button" id="new-question">${icon('plus')}开始一道新题<span>⌘ K</span></button>
    <nav aria-label="主导航"><button class="nav-item selected" data-view="home">${icon('book')}解题工作台</button><button class="nav-item" data-view="history">${icon('history')}我的解题记录<span id="history-count">0</span></button><button class="nav-item" data-view="formulas">${icon('spark')}公式笔记</button></nav>
    <div class="recent-heading"><span>最近的题目</span><span>本机保存</span></div><div id="recent-list" class="recent-list"></div>
    <div class="sidebar-footer"><div class="subscription-card"><div class="subscription-head"><span class="connection-dot"></span><strong id="connection-title">检查 DeepSeek 连接</strong></div><p id="connection-description">正在读取后端配置…</p><button id="connect-button">连接 DeepSeek${icon('arrow')}</button></div><div class="local-note"><span class="local-dot"></span>个人学习空间<button id="help-button" aria-label="使用说明">${icon('help')}</button></div></div>
  </aside>
  <div class="workspace"><header class="topbar"><div class="breadcrumbs"><button id="mobile-menu" aria-label="展开导航">${icon('menu')}</button><span>学习空间</span><i>/</i><strong id="page-label">解题工作台</strong></div><div class="topbar-right"><span class="local-pill">${staticSite?'GitHub Pages 演示':'仅在本机运行'}</span><button id="theme-button" class="icon-button" aria-label="切换深色模式" title="切换深色模式">${icon('spark')}</button><button id="settings-button" class="icon-button" aria-label="解答设置">${icon('settings')}</button><div class="avatar">Y</div></div></header>
  <main id="main-content"></main><footer class="workspace-footer">把答案变成理解。<span>Powered by DeepSeek · SymPy 验算</span></footer></div>
  <div id="modal-root"></div><div id="toast" class="toast" role="status" aria-live="polite"></div>`;

function renderSidebar(){
  $('#history-count').textContent=state.history.length;
  $('#recent-list').innerHTML=state.history.length?state.history.slice(0,7).map(h=>`<button class="recent-item" data-history="${escape(h.id)}" title="${escape(h.question)}"><span class="recent-dot"></span><span>${escape(h.result.solution.title)}</span></button>`).join(''):`<div class="empty-recent">解过的题目会留在这里。<br>慢慢积累，看见自己的进步。</div>`;
  $('#recent-list').querySelectorAll('[data-history]').forEach(b=>b.addEventListener('click',()=>loadHistory(b.dataset.history)));
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===state.view));
}
function renderConnection(){
  if(staticSite){
    $('#connection-title').textContent='GitHub Pages 演示版';
    $('#connection-description').textContent='可查看内置讲解、公式与图形。真实解题需运行完整应用。';
    $('#connect-button').innerHTML=`完整应用说明${icon('arrow')}`;
    return;
  }
  $('.local-pill').textContent=state.status?.deployment?.mode==='cloud'?'云端运行':'仅在本机运行';
  if(state.settings.model && !state.status?.models?.some(model=>model.id===state.settings.model)){state.settings.model=undefined;settingsSave();}
  const connected=state.status?.connected;
  $('.connection-dot').classList.toggle('connected',Boolean(connected));
  $('#connection-title').textContent=connected?'DeepSeek 已配置':'连接 DeepSeek';
  $('#connection-description').textContent=connected?(state.status.lastVerification?'本次运行已完成真实模型调用。':`${state.status.source} · 等待首次解答验证`):'填写 DeepSeek 官方 API Key，由云端后端直接调用。';
  $('#connect-button').innerHTML=`${connected?'管理连接':'连接 DeepSeek'}${icon('arrow')}`;
}
function composer(){return `<form class="composer" id="question-form"><div class="composer-heading"><span>${icon('book')} ${state.current?'继续追问，把疑惑说具体':'把题目交给推演'}</span><span class="keyboard-tip">⌘ / Ctrl + Enter 提交</span></div>${state.current?`<div class="context-tag">${icon('link')}正在追问：${escape(state.current.solution.title)}<button type="button" id="detach-context">作为新题</button></div>`:''}<label class="sr-only" for="question-input">数学或物理题目</label><textarea id="question-input" maxlength="8000" rows="4" placeholder="输入数学或物理题，也可以上传题目图片。\n例如：为什么求极值要先求导？请结合图像一步步解释。">${escape(state.question)}</textarea><div id="image-preview"></div><div class="composer-bottom"><div class="input-tools"><button type="button" class="upload-button" id="upload-button">${icon('image')}上传题目</button><input type="file" id="image-input" accept="image/png,image/jpeg,image/webp" hidden/><span class="input-note">${staticSite?'完整版支持题目图片':'可拖入或粘贴图片'}</span></div><button class="submit-button" id="submit-button" type="submit">${icon(state.busy?'stop':'arrow')}${state.busy?'停止解答':'开始解析'}</button></div><div class="composer-options"><div class="mode-switch" aria-label="讲解模式">${[['detailed','详细解析'],['hint','只给提示'],['check','检查我的解法']].map(([key,label])=>`<button type="button" class="${state.settings.mode===key?'active':''}" data-mode="${key}">${label}</button>`).join('')}</div><label class="level-select">学习程度<select id="level-select" aria-label="学习程度">${['自动判断','初中','高中','大学'].map(x=>`<option ${state.settings.level===x?'selected':''}>${x}</option>`).join('')}</select></label></div></form><p class="privacy-note">${staticSite?'在线演示不会发送题目或图片；真实解题、图片识别与 API 配置需运行完整应用。':'题目与图片会发送至 DeepSeek 进行解答；解题记录仅保存在此浏览器。图片最长边不限，文件最大 6 MB。'}</p>`;}
const diagramCleanups=[];
function clearDiagrams(){diagramCleanups.splice(0).forEach(dispose=>dispose());}
function showDiagram(container,diagram,options){diagramCleanups.push(mountDiagram(container,diagram,options));}
function renderHome(){
  clearDiagrams();
  state.view='home';$('#page-label').textContent='解题工作台';renderSidebar();
  $('#main-content').className=state.current?'main-content result-layout':'main-content';
  if(state.current){renderResult();return;}
  $('#main-content').innerHTML=`${staticSite?'<div class="demo-notice">在线演示版 · 可查看内置讲解、公式和交互图形。真实解题需要运行完整应用。</div>':''}${composer()}<section class="examples-section"><div class="section-heading"><h2>从一道题开始</h2><span>${staticSite?'题目可预览，内置讲解可直接查看':'选择示例，体验真正的模型解答'}</span></div><div class="example-grid">${examples.map((e,i)=>`<button class="example-card" data-example="${i}"><span class="example-symbol">${['ƒ(x)','△','∫'][i]}</span><strong>${e.title}</strong><span>${e.tag}</span><i>${icon('arrow')}</i></button>`).join('')}</div><button class="secondary-button wide" id="view-demo">查看内置讲解：二次函数 ${icon('arrow')}</button></section>`;
  $('#view-demo').onclick=showDemo;
  document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>{state.question=examples[Number(b.dataset.example)].question;$('#question-input').value=state.question;$('#question-input').focus();}));
  bindComposer();
}
function section(title,number,html,cls=''){return `<section class="solution-section ${cls}"><div class="solution-section-title"><span>${number}</span><h2>${title}</h2></div>${html}</section>`;}
function renderResult(){
  clearDiagrams();
  const r=state.current,s=r.solution;
  const formulas=s.formulas || [],diagrams=s.diagrams || [];
  const all=state.tab==='all';
  $('#main-content').innerHTML=`<div class="result-intro"><div><div class="eyebrow">${state.isDemo?'内置讲解示例':'已整理成可复习的解答'}</div><h1>${escape(s.title)}</h1><p>${escape(s.subject)}<span>·</span>${state.isDemo?'示例未调用模型':`${escape(r.model)} · ${formatDate(r.createdAt)}`}</p></div><div class="result-actions"><button id="copy-result" class="icon-button" aria-label="复制解答">${icon('copy')}</button><button id="export-result" class="icon-button" aria-label="导出 Markdown 解答">${icon('download')}</button><button id="print-result" class="icon-button" aria-label="打印或保存 PDF">${icon('printer')}</button></div></div>
  ${state.isDemo?`<div class="demo-notice">${staticSite?'这是内置讲解示例，未调用模型。真实解题与追问需运行完整应用。':'这是内置讲解示例。输入你自己的题目后，才会直接调用 DeepSeek API。'}</div>`:''}
  <div class="question-summary"><span>题目</span><div>${md(state.isDemo?exampleQuestion:state.current.question || '图片题目')}</div></div>
  <div class="result-tabs" aria-label="解答视图">${[['all','完整解析'],['formulas',`公式卡片 · ${formulas.length}`],['diagrams',`图形 · ${diagrams.length}`]].map(([key,label])=>`<button data-tab="${key}" class="${state.tab===key?'active':''}">${label}</button>`).join('')}</div>
  <div class="solution-paper">${all?section('先读懂题目','01',`<div class="prose overview">${md(s.overview)}</div><div class="givens">${(s.givens || []).map(x=>`<div>${icon('check')}<div class="prose">${md(x)}</div></div>`).join('')}</div>`):''}
  ${all||state.tab==='formulas'?section('这些公式，为什么可以用','02',formulas.length?`<div class="formula-grid">${formulas.map(f=>`<article class="formula-card"><span class="formula-card-label">${escape(f.name)}</span><div class="math-display">${math(f.latex)}</div><div class="formula-why prose">${md(f.why)}</div><div class="formula-condition prose"><strong>适用条件</strong>${md(f.conditions)}</div></article>`).join('')}</div>`:'<p class="empty-state">本题无需额外公式，直接依据定义或条件推理。</p>'):''}
  ${all?section(r.mode==='hint'?'从提示开始思考':'一步步推导，连起思路','03',`<div class="steps">${(s.steps || []).map((step,i)=>`<article class="step"><span class="step-number">${String(i+1).padStart(2,'0')}</span><div class="step-body"><h3>${inlineMath(step.title)}</h3><div class="prose">${md(step.explanation)}</div>${step.latex?`<div class="step-equation">${math(step.latex)}</div>`:''}${step.why?`<div class="step-why prose"><span>为什么</span>${md(step.why)}</div>`:''}</div></article>`).join('')}</div>`):''}
  ${all||state.tab==='diagrams'?section('让图像帮你理解','04',diagrams.length?diagrams.map((d,i)=>`<article class="diagram-card"><h3>${escape(d.title)}</h3><div class="interactive-diagram" data-diagram="${i}"></div><div class="diagram-caption prose">${md(d.caption)}</div></article>`).join(''):'<p class="empty-state">本题以文字和公式即可完整解释，未额外生成图形。</p>'):''}
  ${all?`${s.answer?`<section class="answer-card"><span class="answer-icon">${icon('check')}</span><div><h2>得到答案，也知道为什么</h2><div class="prose">${md(s.answer)}</div></div></section>`:''}${section(s.needsClarification?'需要补充的条件':'再检验一次，确认结果','05',`<div class="verification prose">${md(s.verification)}</div>${renderChecks(r.checks)}`)}${s.pitfalls?.length?`<aside class="pitfalls"><h3>${icon('help')}容易忽略的细节</h3><ul>${s.pitfalls.map(p=>`<li class="prose">${md(p)}</li>`).join('')}</ul></aside>`:''}`:''}</div>
  ${s.followups?.length?`<section class="followup-section"><h2>还想弄懂哪一步？</h2><div>${s.followups.map((q,i)=>`<button data-followup="${i}">${inlineMath(q)}${icon('arrow')}</button>`).join('')}</div></section>`:''}${composer()}<div class="result-footnote">${state.isDemo?'内置教学示例':`模型解答已完成 · ${escape(r.source)} · ${r.usage?.totalTokens || 0} tokens（并非剩余额度）`}<span>模型可能出错，关键推导请结合题目核对。</span></div>`;
  fitFormulaCards();document.fonts.ready.then(fitFormulaCards);
  document.querySelectorAll('[data-diagram]').forEach(el=>showDiagram(el,diagrams[Number(el.dataset.diagram)]));
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.tab;renderResult();}));
  document.querySelectorAll('[data-followup]').forEach(b=>b.addEventListener('click',()=>{state.question=s.followups[Number(b.dataset.followup)];$('#question-input').value=state.question;$('#question-input').focus();$('#question-form').scrollIntoView({behavior:'smooth',block:'center'});}));
  $('#copy-result').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(exportText());toast('解答已复制。');}catch{toast('无法使用剪贴板，请导出解答。');}});
  $('#export-result').addEventListener('click',()=>download(exportText(),`${s.title}.md`,'text/markdown;charset=utf-8'));
  $('#print-result').addEventListener('click',()=>{if(state.tab!=='all'){state.tab='all';renderResult();}window.print();});
  bindComposer();
}
function exportText(){const r=state.current,s=r.solution;return `# ${s.title}\n\n题目：${state.isDemo?exampleQuestion:r.question || '图片题目'}\n\n${s.overview}\n\n## 已知条件\n\n${s.givens.map(x=>'- '+x).join('\n')}\n\n## 公式及依据\n\n${s.formulas.map(f=>`### ${f.name}\n\n$$${f.latex}$$\n\n${f.why}\n\n适用条件：${f.conditions}`).join('\n\n')}\n\n## 逐步解析\n\n${s.steps.map((p,i)=>`### ${i+1}. ${p.title}\n\n${p.explanation}\n\n${p.latex?'$$'+p.latex+'$$\n\n':''}${p.why?'原因：'+p.why:''}`).join('\n\n')}\n\n## 答案\n\n${s.answer || '提示模式未提供最终答案'}\n\n## 检验\n\n${s.verification}\n\n## 图形说明\n\n${s.diagrams.map(d=>`### ${d.title}\n\n${d.caption}\n\n${(d.curves || []).map(c=>'- '+c.label+': '+c.expression).join('\n')}`).join('\n\n')}\n\n## 实际计算记录\n\n${(r.checks || []).map(checkText).join('\n\n')}\n\n## 易错点\n\n${s.pitfalls.map(x=>'- '+x).join('\n')}\n\n模型：${r.model}；来源：${r.source}\n`;}
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function renderImage(){const el=$('#image-preview');if(!el)return;el.innerHTML=state.image?`<div class="attached-image"><img src="data:${state.image.mimeType};base64,${state.image.data}" alt="上传的题目图片"/><span>${escape(state.image.name)}</span><button type="button" id="remove-image" aria-label="移除题目图片">${icon('close')}</button></div>`:'';$('#remove-image')?.addEventListener('click',()=>{state.image=null;renderImage();});}
async function attachImage(file){
  if(staticSite){toast('图片识别需在完整应用中使用。');return;}
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('请上传 PNG、JPG 或 WebP 图片。');return;}
  if(file.size>6*1024*1024){toast('图片超过 6 MB，请先缩小图片。');return;}
  if(state.busy){toast('请先停止当前解答。');return;}
  const reader=new FileReader();reader.onload=()=>{state.image={mimeType:file.type,data:String(reader.result).split(',')[1],name:file.name || '粘贴的题目'};renderImage();};reader.onerror=()=>toast('图片读取失败，请重试。');reader.readAsDataURL(file);
}
function bindComposer(){
  const form=$('#question-form'),input=$('#question-input');
  input.addEventListener('input',()=>state.question=input.value);
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();form.requestSubmit();}});
  input.addEventListener('paste',e=>{const file=[...e.clipboardData.items].find(i=>i.type.startsWith('image/'))?.getAsFile();if(file){e.preventDefault();attachImage(file);}});
  $('#upload-button').addEventListener('click',()=>$('#image-input').click());
  $('#image-input').addEventListener('change',e=>{const file=e.target.files[0];if(file)attachImage(file);e.target.value='';});
  form.addEventListener('dragover',e=>{e.preventDefault();form.classList.add('dragging');});form.addEventListener('dragleave',()=>form.classList.remove('dragging'));
  form.addEventListener('drop',e=>{e.preventDefault();form.classList.remove('dragging');if(e.dataTransfer.files[0])attachImage(e.dataTransfer.files[0]);});
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(state.busy)return;state.settings.mode=b.dataset.mode;settingsSave();document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x.dataset.mode===state.settings.mode));}));
  $('#level-select').addEventListener('change',e=>{state.settings.level=e.target.value;settingsSave();});
  $('#detach-context')?.addEventListener('click',()=>{if(state.busy)return;state.current=null;state.isDemo=false;state.tab='all';renderHome();});
  form.addEventListener('submit',e=>{e.preventDefault();if(state.busy){state.controller?.abort();return;}submitQuestion();});
  renderImage();updateBusy();
}
function updateBusy(){
  const btn=$('#submit-button');if(!btn)return;btn.innerHTML=`${icon(state.busy?'stop':'arrow')}${state.busy?'停止解答':'开始解析'}`;btn.classList.toggle('stop-button',state.busy);
  $('#question-input').readOnly=state.busy;$('#upload-button').disabled=state.busy;$('#level-select').disabled=state.busy;
  if(staticSite){btn.innerHTML=`${icon('help')}真实解题说明`;$('#upload-button').disabled=true;}
}
async function events(response,onEvent){
  if(!response.ok){const body=await response.json();throw new Error(body.error || '请求失败。');}
  if(!response.body)throw new Error('浏览器不支持流式解答，请使用较新的浏览器。');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let index;while((index=buffer.indexOf('\n\n'))>=0){const message=buffer.slice(0,index);buffer=buffer.slice(index+2);const data=message.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(data)onEvent(JSON.parse(data));}}}finally{reader.releaseLock();}
}
async function api(path,body,signal){return fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Math-CSRF':state.csrf},body:JSON.stringify(body),signal});}
async function submitQuestion(){
  if(staticSite){openStaticInfo();return;}
  const question=state.question.trim();if(!question&&!state.image){toast('先输入题目，或上传题目图片。');$('#question-input').focus();return;}
  if(!state.csrf){toast('后台服务尚未连接，请刷新后重试。');return;}
  if(!state.status?.connected){openConnection();return;}
  document.querySelectorAll('.live-answer,.generation-progress').forEach(el=>el.remove());
  state.busy=true;state.controller=new AbortController();updateBusy();
  const payload={question,...state.settings,image:state.image?{mimeType:state.image.mimeType,data:state.image.data}:undefined,context:state.current?{question:state.current.question || exampleQuestion,solution:{...state.current.solution,diagrams:state.current.solution.diagrams.map(d=>({...d,curves:d.curves?.map(({samples,...c})=>c)}))}}:undefined};
  const progress=document.createElement('div');progress.className='generation-progress';progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');progress.innerHTML='<span class="thinking-spinner"></span><div><strong>正在分析题目…</strong><span>需要一些时间，推演会逐步复核关键计算。</span></div>';
  $('#question-form').after(progress);progress.scrollIntoView({behavior:'smooth',block:'nearest'});
  const live=document.createElement('section');live.className='live-answer';live.hidden=true;live.setAttribute('aria-label','正在生成的解答');
  live.innerHTML='<div class="live-answer-heading"><span class="live-answer-label">推演正在解答</span><span class="typing-cursor" aria-hidden="true"></span></div><div class="live-answer-body"></div>';
  progress.after(live);
  let firstVisible=true,follow=true;
  const onScroll=()=>{if(!live.hidden)follow=live.getBoundingClientRect().bottom<window.innerHeight+140;};
  window.addEventListener('scroll',onScroll,{passive:true});
  const stream=createTextStream(live,{
    signal:state.controller.signal,renderText:md,
    renderMath:latex=>{try{return katex.renderToString(latex,{displayMode:true,throwOnError:true,trust:false,strict:'ignore',maxExpand:1000,maxSize:20,output:'htmlAndMathml'});}catch{return ''; }},
    onUpdate:active=>{
      if(!active)return;
      if(firstVisible){firstVisible=false;live.scrollIntoView({block:'start',behavior:'instant'});}
      else if(follow && active.getBoundingClientRect().bottom>window.innerHeight-30)active.scrollIntoView({block:'end',behavior:'instant'});
    }
  });
  let result,error;
  try{
    const response=await api('/api/solve',payload,state.controller.signal);
    await events(response,e=>{if(e.type==='progress')progress.querySelector('strong').textContent=e.message;if(e.type==='check')progress.querySelector('span:last-child').textContent=checkText(e.check);if(e.type==='answer_delta')stream.update(e);if(e.type==='result')result=e;if(e.type==='error')error=e.message;});
    if(error)throw new Error(error);if(!result)throw new Error('解答连接提前结束，题目已保留，请重试。');
    progress.querySelector('strong').textContent='解答已生成，正在显示讲解…';
    await stream.finish(solutionDraftBlocks(result.solution,payload.mode,true));
    const finishAtBottom=follow,previousScroll=window.scrollY;
    const record={id:crypto.randomUUID(),question:question || '图片题目',result:{...result,question:question || '图片题目'}};
    state.history.unshift(record);state.history=state.history.slice(0,20);save('tuiyan-history-v1',state.history);
    state.current=record.result;state.isDemo=false;state.question='';state.image=null;state.tab='all';
    state.status.lastVerification={model:result.model,at:result.createdAt};renderConnection();state.busy=false;renderHome();
    if(finishAtBottom)document.querySelector('.solution-paper')?.lastElementChild?.scrollIntoView({block:'end',behavior:'instant'});
    else window.scrollTo({top:previousScroll,behavior:'instant'});
  }catch(e){
    live.classList.remove('is-typing');live.querySelector('.live-answer-label').textContent='解答尚未完成';
    const message=e.name==='AbortError'?'已停止解答，题目已保留。':e.message;
    progress.className='generation-progress failed';progress.innerHTML=`${icon('help')}<div><strong>${escape(message)}</strong><span>题目和图片仍保留，点击「开始解析」可以重试。</span></div>`;
  }finally{stream.dispose();window.removeEventListener('scroll',onScroll);state.busy=false;state.controller=null;updateBusy();}
}
function newQuestion(){if(state.busy){toast('请先停止当前解答，再开启新题。');return;}state.view='home';state.current=null;state.isDemo=false;state.question='';state.image=null;state.tab='all';renderHome();window.scrollTo(0,0);$('#question-input').focus();$('.sidebar').classList.remove('mobile-open');}
function loadHistory(id){if(state.busy){toast('请先停止当前解答。');return;}const record=state.history.find(h=>h.id===id);if(!record)return;state.current=record.result;state.isDemo=false;state.question='';state.image=null;state.tab='all';renderHome();window.scrollTo(0,0);$('.sidebar').classList.remove('mobile-open');}
function renderLibrary(view){
  if(state.busy){toast('请先停止当前解答。');return;}if($('#question-input'))state.question=$('#question-input').value;
  state.view=view;renderSidebar();$('#page-label').textContent=view==='history'?'我的解题记录':'公式笔记';$('#main-content').className='main-content library-layout';
  clearDiagrams();
  const isHistory=view==='history';
  $('#main-content').innerHTML=`<div class="library-heading"><div class="eyebrow">${isHistory?'每一次推导，都留下一点进步':'理解公式，也理解它的边界'}</div><h1>${isHistory?'我的解题记录':'公式笔记'}</h1><p>${isHistory?'最多保存最近 20 道题，仅存储在此浏览器。':'从你已完成的解答中，整理公式、使用原因与适用条件。'}</p>${isHistory&&state.history.length?'<button id="clear-history" class="text-button">清空全部记录</button>':''}</div><div class="library-list">${state.history.length?state.history.map(h=>isHistory?`<article class="history-card"><button class="history-open" data-open="${escape(h.id)}"><span class="history-card-icon">${icon('book')}</span><div><h3>${escape(h.result.solution.title)}</h3><p>${escape(h.question.slice(0,90))}</p><span>${formatDate(h.result.createdAt)} · ${escape(h.result.model)}</span></div>${icon('chevron')}</button><button class="icon-button delete-record" data-delete="${escape(h.id)}" aria-label="删除此记录">${icon('trash')}</button></article>`:(h.result.solution.formulas || []).map(f=>`<article class="formula-card library-formula"><span class="formula-card-label">${escape(f.name)}</span><div class="math-display">${math(f.latex)}</div><div class="prose">${md(f.why)}</div><div class="formula-condition prose"><strong>适用条件</strong>${md(f.conditions)}</div><button data-open="${escape(h.id)}" class="text-button">回到题目：${escape(h.result.solution.title)} ${icon('arrow')}</button></article>`).join('')).join(''):`<div class="library-empty">${icon(isHistory?'book':'spark')}<h2>${isHistory?'你的解题旅程，从这里开始':'解过一道题，就多一份理解'}</h2><p>完成第一道题后，${isHistory?'解答会自动留在这里':'用过的公式会自动整理到这里'}。</p><button class="primary-button" id="library-start">开始解题${icon('arrow')}</button></div>`}</div>`;
  $('#library-start')?.addEventListener('click',newQuestion);
  document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>loadHistory(b.dataset.open)));
  document.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>{state.history=state.history.filter(h=>h.id!==b.dataset.delete);save('tuiyan-history-v1',state.history);renderLibrary(view);toast('已删除此浏览器中的记录。');}));
  $('#clear-history')?.addEventListener('click',()=>openModal('<h2>清空本机解题记录？</h2><p>这会删除此浏览器保存的解答和公式笔记，无法恢复。</p><div class="modal-actions"><button class="secondary-button" id="cancel-clear">保留记录</button><button class="primary-button" id="confirm-clear">清空记录</button></div>',()=>{$('#cancel-clear').onclick=closeModal;$('#confirm-clear').onclick=()=>{state.history=[];save('tuiyan-history-v1',[]);state.current=null;closeModal();renderLibrary(view);};}));
  $('.sidebar').classList.remove('mobile-open');
}
let modalCleanup=null,previousFocus;
function closeModal(){modalCleanup?.();modalCleanup=null;$('#modal-root').innerHTML='';previousFocus?.focus();}
function openModal(content,bind,cleanup){closeModal();previousFocus=document.activeElement;modalCleanup=cleanup;$('#modal-root').innerHTML=`<div class="modal-overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="推演设置"><button class="modal-close icon-button" aria-label="关闭窗口">${icon('close')}</button>${content}</section></div>`;$('.modal-close').onclick=closeModal;$('.modal-overlay').addEventListener('click',e=>{if(e.target.classList.contains('modal-overlay'))closeModal();});bind?.();$('.modal-close').focus();}
function openSettings(){
  if(staticSite){openStaticInfo();return;}
  openModal(`<div class="eyebrow">你的学习节奏</div><h2>解答设置</h2><p>选择模型和推理强度。模型目录不代表账户权限，成功解答才确认本次调用可用。</p><label class="settings-label">DeepSeek 模型<select id="model-setting">${(state.status?.models || []).map(m=>`<option value="${escape(m.id)}" ${m.id===(state.settings.model || state.status.defaultModel)?'selected':''}>${escape(m.name)}${m.image?' · 支持图片':''}</option>`).join('')}</select></label><label class="settings-label">推理强度<select id="reasoning-setting"><option value="medium" ${state.settings.reasoning==='medium'?'selected':''}>标准 · 适合日常题目</option><option value="high" ${state.settings.reasoning==='high'?'selected':''}>深入 · 适合复杂证明和综合题</option></select></label><div class="settings-note">更强的模型和更深的推理可能消耗更多 API 额度，按 DeepSeek 官方价格计费。调用失败会明确提示。</div><button class="primary-button wide" id="save-settings">保存设置${icon('check')}</button>`,()=>{$('#save-settings').onclick=()=>{state.settings.model=$('#model-setting').value || undefined;state.settings.reasoning=$('#reasoning-setting').value;settingsSave();closeModal();toast('设置已保存。');};});
}
function openConnection(){
  if(staticSite){openStaticInfo();return;}
  const status=state.status || {};
  const cloud=status.deployment?.mode==='cloud';
  const storageNote=status.deployment?.authStorage==='persistent'?'API Key 保存在云服务器持久数据卷中，正常更新和重启后保留。':status.deployment?.authStorage==='ephemeral'?'当前实例不持久保存配置，重启后可能需要重新填写 API Key。':'API Key 仅保存在后端数据目录中。';
  openModal(`<div class="eyebrow">DEEPSEEK API</div><h2>${status.connected?'DeepSeek 已配置':'连接 DeepSeek'}</h2><p>由${cloud?'云端':'本机'}后端直接调用 DeepSeek 官方 API。密钥不会回传网页，也不会保存在浏览器记录中。</p><div class="auth-status-box"><span class="connection-dot ${status.connected?'connected':''}"></span><div><strong>${status.connected?escape(status.source):'尚未配置 API Key'}</strong><span>${status.lastVerification?'本次运行已完成真实解题验证':status.connectionVerifiedAt?'官方接口验证通过，等待首次解题验证':escape(status.message || '等待连接')}</span></div></div><form id="deepseek-config-form"><label class="settings-label">DeepSeek API Key<input type="password" id="deepseek-api-key" name="deepseekApiKey" placeholder="输入 sk- 开头的 API Key" autocomplete="off" autocapitalize="none" spellcheck="false" required maxlength="256"/></label><p class="auth-help">${status.connected?'填写新 Key 会在验证通过后替换现有配置；不填写则保留。':''}保存时仅向本网站后端与 DeepSeek 官方接口传送密钥。</p><div id="login-progress" role="status"></div><button type="submit" class="primary-button wide" id="save-deepseek-key">保存并验证${icon('check')}</button></form><button class="secondary-button wide" id="refresh-connection">重新检查连接</button><a class="secondary-button wide" href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer">打开 DeepSeek 开放平台${icon('arrow')}</a><div class="auth-help small">${storageNote} DeepSeek API 按官方 API 余额计费，网页聊天服务与 API 额度分别管理。</div>`,()=>{
    $('#refresh-connection').onclick=async()=>{await refreshStatus();closeModal();toast(state.status.connected?'DeepSeek 配置已保存。':state.status.message);};
    $('#deepseek-config-form').onsubmit=async event=>{
      event.preventDefault();const field=$('#deepseek-api-key'),button=$('#save-deepseek-key');
      const apiKey=field.value.trim();field.value='';
      if(!apiKey){toast('请先输入 DeepSeek API Key。');return;}
      button.disabled=true;$('#login-progress').textContent='正在向 DeepSeek 官方接口验证…';
      try{
        const response=await api('/api/config/deepseek',{apiKey});const result=await response.json();
        if(!response.ok)throw new Error(result.error || '配置失败，请重试。');
        state.status=result;renderConnection();closeModal();toast('DeepSeek 已配置，可以开始解题。');
      }catch(error){if($('#login-progress')){$('#login-progress').textContent=error.message;button.disabled=false;}}
    };
  });
}
function openHelp(){if(staticSite){openStaticInfo();return;}openModal(`<div class="eyebrow">从题目到理解</div><h2>怎样使用推演</h2><ol class="help-list"><li><strong>连接 DeepSeek</strong><span>在「连接 DeepSeek」中填写官方 API Key，验证通过后保存在后端。</span></li><li><strong>输入题目</strong><span>输入文字、上传图片，或将截图粘贴到输入框。选择「详细解析」「只给提示」或「检查我的解法」。</span></li><li><strong>看懂每一步</strong><span>公式会说明适用条件，推导会解释原因。函数和几何图可缩放、查看坐标及下载。</span></li><li><strong>继续追问或复习</strong><span>解答下方可以追问；记录仅存此浏览器。可复制、导出 Markdown，或通过打印保存 PDF。</span></li></ol><div class="settings-note">尚未配置 API Key 时，仍可查看内置讲解示例。题目和上传图片会发送至 DeepSeek；历史记录不会同步到其他设备。关闭启动终端会停止本机服务。</div>`);}
async function refreshStatus(){try{const response=await fetch('/api/status');if(!response.ok)throw new Error('服务连接已断开，请刷新页面。');state.status=await response.json();renderConnection();}catch(e){toast(e.message);}}
$('#new-question').onclick=newQuestion;
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(state.busy){toast('请先停止当前解答。');return;}b.dataset.view==='home'?renderHome():renderLibrary(b.dataset.view);});
const themeMedia=window.matchMedia('(prefers-color-scheme: dark)');
let themeChoice=stored('tuiyan-theme-v1',null);
function applyTheme(){
  const dark=themeChoice ? themeChoice==='dark' : themeMedia.matches;
  document.documentElement.dataset.theme=dark?'dark':'light';
  const button=$('#theme-button');
  button.innerHTML=dark?icon('sun'):icon('moon');
  button.setAttribute('aria-label',dark?'切换浅色模式':'切换深色模式');
  button.title=dark?'切换浅色模式':'切换深色模式';
  button.setAttribute('aria-pressed',String(dark));
  document.querySelector('meta[name="theme-color"]').content=dark?'#111722':'#f7f8fc';
}
$('#theme-button').onclick=()=>{themeChoice=document.documentElement.dataset.theme==='dark'?'light':'dark';save('tuiyan-theme-v1',themeChoice);applyTheme();};
themeMedia.addEventListener('change',()=>{if(!themeChoice)applyTheme();});
applyTheme();
$('#settings-button').onclick=openSettings;$('#connect-button').onclick=openConnection;$('#help-button').onclick=openHelp;
$('#mobile-menu').onclick=()=>$('.sidebar').classList.toggle('mobile-open');
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeModal();$('.sidebar').classList.remove('mobile-open');}
  if(e.key.toLowerCase()==='k'&&(e.metaKey||e.ctrlKey)){e.preventDefault();newQuestion();}
  if(e.key==='Tab'&&$('.modal')){const focusable=[...$('.modal').querySelectorAll('button:not(:disabled),a[href],input,select')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
function showDemo(){
  if(state.busy){toast('请先停止当前解答。');return;}
  state.current={...structuredClone(demo),question:exampleQuestion};state.isDemo=true;state.question='';state.image=null;state.tab='all';
  closeModal();renderHome();window.scrollTo(0,0);$('.sidebar').classList.remove('mobile-open');
}
function openStaticInfo(){
  openModal(`<div class="eyebrow">GITHUB PAGES · 在线演示</div><h2>真实解题需要运行完整应用</h2><p>这里提供内置讲解、公式卡片和交互图形，不运行模型或验算后端。输入内容不会从此演示页发送给模型。</p><div class="settings-note">下载仓库后，运行「启动数学助手.command」，或按仓库说明安装并启动应用，再在完整应用中连接 DeepSeek。</div><button class="primary-button wide" id="static-demo">查看内置讲解${icon('arrow')}</button><a class="secondary-button wide static-source-link" href="${repositoryUrl}" target="_blank" rel="noopener noreferrer">打开完整源码</a>`,()=>{$('#static-demo').onclick=showDemo;});
}
renderHome();
settingsSave();
async function initialize(){if(staticSite && cloudTarget){window.location.replace(cloudTarget);return;}if(staticSite){state.status={connected:false,staticSite:true};renderConnection();return;}try{const response=await fetch('/api/bootstrap');if(!response.ok)throw new Error('后台服务连接失败。');state.status=await response.json();state.csrf=state.status.csrf;renderConnection();}catch(e){state.status={connected:false,message:e.message};renderConnection();toast(e.message);}}
initialize();
