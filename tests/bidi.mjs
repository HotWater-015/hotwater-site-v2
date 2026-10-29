export async function browser() {
 const ws=new WebSocket(`ws://127.0.0.1:${process.env.BIDI_PORT||9222}/session`);let id=0;const pending=new Map();const errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.type==='error'?p.reject(Error(m.message)):p.resolve(m.result)}else if(m.method==='log.entryAdded'&&m.params.level==='error')errors.push(m.params.text)};
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}))});
 await call('session.new',{capabilities:{alwaysMatch:{acceptInsecureCerts:true}}});await call('session.subscribe',{events:['log.entryAdded']});
 const {context}=await call('browsingContext.create',{type:'tab'});
 await call('network.setCacheBehavior',{cacheBehavior:'bypass',contexts:[context]});
 return {call,context,errors,async run(expression){const r=await call('script.evaluate',{expression,target:{context},awaitPromise:true});if(r.type==='exception')throw Error(r.exceptionDetails.text);return r.result.value},async go(url){await call('browsingContext.navigate',{context,url,wait:'complete'})},async viewport(width,height=960){await call('browsingContext.setViewport',{context,viewport:{width,height}})},async close(){try{await call('browsingContext.close',{context});await call('session.end')}finally{ws.close()}}};
}
