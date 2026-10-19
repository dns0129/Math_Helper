export const exampleQuestion='已知函数 y = x² − 4x + 3，求它的零点、顶点坐标和最小值，并画出函数图像。';
export const examples=[
  {title:'二次函数',tag:'代数 · 图像',question:exampleQuestion},
  {title:'三角形里的关系',tag:'几何 · 推导',question:'在直角三角形 ABC 中，∠C=90°，AC=3，BC=4。求斜边 AB 和 sin A，画出示意图，并解释所用公式。'},
  {title:'从面积理解积分',tag:'微积分 · 理解',question:'计算定积分 ∫₀² (x² + 1) dx，逐步解释为什么可以用原函数求面积，并画出函数与积分区间。'}
];
export const demo={model:'讲解示例',source:'内置示例，未调用模型',mode:'detailed',createdAt:new Date().toISOString(),usage:{totalTokens:0},checks:[],solution:{
  title:'用配方法看懂二次函数',subject:'高中数学 · 二次函数',overview:'我们要找到抛物线与 x 轴的交点，以及它的最低点。因式分解适合求零点，配方法适合读出顶点。',
  givens:['函数：$y=x^2-4x+3$，定义域为 $\\mathbb{R}$。','求两个零点、顶点坐标、最小值，并作图。'],
  formulas:[{name:'因式分解与零积性质',latex:'ab=0\\quad\\Longrightarrow\\quad a=0\\;\\text{或}\\;b=0',why:'零点满足 $y=0$。把多项式写成两个因式的乘积，就可以分别求解。',conditions:'在实数范围内成立。'},
    {name:'二次函数的顶点式',latex:'y=a(x-h)^2+k',why:'当 $a>0$ 时，平方项最小为零，因此顶点为 $(h,k)$，最小值为 $k$。',conditions:'$a\\ne0$；本题 $a=1>0$，抛物线开口向上。'}],
  steps:[{title:'让 y 等于零，找到横轴交点',explanation:'寻找两个数，使乘积为 3、和为 −4，它们是 −1 和 −3。',latex:'x^2-4x+3=(x-1)(x-3)=0',why:'因为零点的定义就是函数值等于零，得到 $x=1$ 或 $x=3$。'},
    {title:'配成完全平方，读出顶点',explanation:'前两项是 $x^2-4x$，加上 4 就是 $(x-2)^2$；为保持等式成立，要同时减去 4。',latex:'y=x^2-4x+4-4+3=(x-2)^2-1',why:'平方项永远非负，在 $x=2$ 时取到零，此时函数值最小。'},
    {title:'用三个关键点描出抛物线',explanation:'先标出 $(1,0)$、$(3,0)$ 和 $(2,-1)$。图像关于直线 $x=2$ 对称，且开口向上。',why:'图像把零点、对称轴和最小值联系起来，帮助我们检查代数结果。'}],
  answer:'零点为 $x=1,3$；顶点为 $(2,-1)$；最小值为 $-1$，在 $x=2$ 时取得。',
  verification:'代入：$f(1)=1-4+3=0$，$f(3)=9-12+3=0$。又因为 $(x-2)^2\\ge0$，所以 $y\\ge-1$，且等号在 $x=2$ 时成立。',
  pitfalls:['零点是自变量的值 $1$ 和 $3$；对应的图像交点是 $(1,0)$ 和 $(3,0)$。','配方时加上 4 后也要减去 4，避免改变原函数。'],
  diagrams:[{title:'零点与最低点，在一张图里',caption:'图像在 (1,0)、(3,0) 处穿过 x 轴，在 (2,−1) 处达到最低点。虚线为对称轴 x=2。',kind:'function',range:{xMin:-1,xMax:5,yMin:-2,yMax:10},curves:[{expression:'x^2-4*x+3',label:'y = x² − 4x + 3',samples:Array.from({length:401},(_,i)=>{const x=-1+6*i/400;return [x,x*x-4*x+3];})}],points:[{x:1,y:0,label:'(1, 0)'},{x:3,y:0,label:'(3, 0)'},{x:2,y:-1,label:'顶点 (2, −1)'}],segments:[{from:{x:2,y:-2},to:{x:2,y:10},dashed:true}]}],
  followups:['为什么配方法能找到最小值？','如果把常数 3 改成 5，图像会怎样变化？','能用求根公式再做一次吗？'],needsClarification:false
}};
