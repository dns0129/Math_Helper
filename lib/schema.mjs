import {Type} from 'typebox';
const text=()=>Type.String({maxLength:8000});
const point=Type.Object({x:Type.Number(),y:Type.Number(),label:Type.Optional(Type.String({maxLength:80}))});
export const solutionSchema=Type.Object({
  title:Type.String({maxLength:120}),
  subject:Type.String({maxLength:60}),
  overview:text(),
  givens:Type.Array(text(),{maxItems:12}),
  formulas:Type.Array(Type.Object({name:Type.String({maxLength:100}),latex:text(),why:text(),conditions:text()}),{maxItems:12}),
  steps:Type.Array(Type.Object({title:Type.String({maxLength:120}),explanation:text(),latex:Type.Optional(text()),why:text()}),{minItems:1,maxItems:20}),
  answer:text(),
  verification:text(),
  pitfalls:Type.Array(text(),{maxItems:8}),
  diagrams:Type.Array(Type.Object({
    title:Type.String({maxLength:100}),caption:text(),
    kind:Type.Union([Type.Literal('function'),Type.Literal('geometry')]),
    range:Type.Object({xMin:Type.Number(),xMax:Type.Number(),yMin:Type.Number(),yMax:Type.Number()}),
    xLabel:Type.Optional(Type.String({maxLength:40})),yLabel:Type.Optional(Type.String({maxLength:40})),
    curves:Type.Optional(Type.Array(Type.Object({expression:Type.String({maxLength:300}),label:Type.String({maxLength:80})}),{maxItems:6})),
    points:Type.Optional(Type.Array(point,{maxItems:30})),
    segments:Type.Optional(Type.Array(Type.Object({from:point,to:point,label:Type.Optional(Type.String({maxLength:80})),dashed:Type.Optional(Type.Boolean())}),{maxItems:40})),
    circles:Type.Optional(Type.Array(Type.Object({center:point,radius:Type.Number(),label:Type.Optional(Type.String({maxLength:80}))}),{maxItems:8}))
  }),{maxItems:3}),
  followups:Type.Array(Type.String({maxLength:160}),{maxItems:4}),
  needsClarification:Type.Boolean(),
  fullSolution:Type.String({maxLength:16000,description:'在前面的讲解结束后，另给一份可独立阅读的完整解答。按题目条件、公式及适用依据、逐步代入与变形、分类讨论、最终结果、检验的顺序编号书写，保留所有必要中间步骤，不能用“由上可知”“同理”“略”等代替推导。追问也须结合原题从头整理，检查模式须给出完整正确解法；仅提示模式或条件不足时为空字符串。'})
});
