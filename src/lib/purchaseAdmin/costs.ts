export function allocateSharedCosts(totalCop:number,count:number):number[]{
  if(!Number.isInteger(totalCop)||totalCop<0) throw new Error("shared_cost_must_be_non_negative_integer");
  if(!Number.isInteger(count)||count<1||count>100) throw new Error("unit_count_invalid");
  const base=Math.floor(totalCop/count);const remainder=totalCop%count;
  return Array.from({length:count},(_,i)=>base+(i<remainder?1:0));
}

export function sumIntegerMoney(values:number[]):number{
  return values.reduce((sum,value)=>{if(!Number.isInteger(value)||value<0)throw new Error("money_must_be_non_negative_integer");return sum+value;},0);
}
