export function allocateIntegerAmount(total:number, weights:number[]):number[]{
  if(!Number.isInteger(total)||total<0) throw new Error("total must be a non-negative integer");
  if(weights.some(w=>!Number.isInteger(w)||w<0)) throw new Error("weights must be non-negative integers");
  if(weights.length===0) return [];
  const weightSum=weights.reduce((a,b)=>a+b,0);
  if(total===0) return weights.map(()=>0);
  if(weightSum<=0){
    const base=Math.floor(total/weights.length);const rem=total%weights.length;
    return weights.map((_,i)=>base+(i<rem?1:0));
  }
  const base=weights.map(w=>Math.floor(total*w/weightSum));
  let remainder=total-base.reduce((a,b)=>a+b,0);
  // El residuo siempre es menor que la cantidad de líneas. Se reparte por orden
  // para conservar determinismo y suma exacta en pesos enteros.
  for(let i=0;i<base.length&&remainder>0;i++,remainder--) base[i]+=1;
  return base;
}

export function safeMarginPercent(profit:number,revenue:number):number|null{
  if(!Number.isFinite(profit)||!Number.isFinite(revenue)||revenue<=0)return null;
  return Math.round((profit/revenue)*10000)/100;
}
