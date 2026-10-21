import {Type} from 'typebox';
import {calculate} from './math.mjs';

// Generate once; execute the same restricted local engines before accepting.
export function verifiedPresentation({presentation,calculations,record,onEvent,signal}){
  const schemas=calculations.map(tool=>Type.Object({engine:Type.Literal(tool.name),...tool.parameters.properties}));
  const reject=check=>record({engine:'local',operation:'verify',status:'ERROR',completed:false,...check});
  return {
    name:'present_verified_solution',label:'验算并提交解答',
    description:'一次给出教学讲解、末尾从头到尾不跳步骤的独立完整解答 fullSolution 及1-3项关键计算，本地验算成功才提交。calculations填安全工具参数；approximations复核解答中的小数近似。verification写具体检查方法，不预先声称工具通过。',
    parameters:Type.Object({...presentation.parameters.properties,
      calculations:Type.Array(schemas.length===1?schemas[0]:Type.Union(schemas),{minItems:1,maxItems:3}),
      approximations:Type.Array(Type.Object({expression:Type.String({maxLength:300}),value:Type.Number(),decimalPlaces:Type.Integer({minimum:0,maximum:10})}),{maxItems:4})}),
    async execute(id,args,toolSignal){
      signal?.throwIfAborted();toolSignal?.throwIfAborted();
      if(args.needsClarification)return reject({note:'条件不足请使用request_clarification。'});
      if(!Array.isArray(args.calculations) || !args.calculations.length || args.calculations.length>3)return reject({note:'需提供1-3项本题相关计算，不能省略验算。'});
      for(const [i,{engine,...request}] of args.calculations.entries()){
        const tool=calculations.find(t=>t.name===engine);
        if(!tool)return reject({note:'使用本题已开放的计算引擎。'});
        onEvent({type:'progress',message:'解答已生成，正在本机复核关键计算…'});
        const result=await tool.execute(`${id}-check-${i}`,request,toolSignal);
        if(!result.details.completed || !['COMPUTED','NUMERICAL','PASS'].includes(result.details.status))return result;
      }
      for(const a of args.approximations || []){
        signal?.throwIfAborted();toolSignal?.throwIfAborted();
        if(!Number.isFinite(a.value) || !Number.isInteger(a.decimalPlaces) || a.decimalPlaces<0 || a.decimalPlaces>10)return reject({note:'近似值和小数精度无效。'});
        try{
          const result=calculate(a.expression);
          const tolerance=.5*10**(-a.decimalPlaces)+Number.EPSILON*Math.max(1,Math.abs(result))*8;
          const status=Math.abs(result-a.value)<=tolerance?'PASS':'FAIL';
          const response=record({engine:'mathjs',operation:'evaluate',expression:a.expression,candidate:String(a.value),result,status,completed:true,accuracy:'numerical',note:`按${a.decimalPlaces}位小数检查近似值；该检查不是符号证明。`});
          if(status==='FAIL')return response;
        }catch(error){return reject({expression:a.expression,note:error.message});}
      }
      const {calculations:ignored,approximations:unused,...solution}=args;
      return presentation.execute(id,solution,toolSignal);
    }
  };
}
