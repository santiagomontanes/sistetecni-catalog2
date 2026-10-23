export type FinishOption={finishId:string;name:string;baseColor:string;texture:string;imagePaths:string[];configuration:{cpu:string|null;ramGb:number|null;screen:string|null;storage:{capacityGb?:number;technology?:string;formFactor?:string;interface?:string}[]};priceCop:string;stock:number};
export function storageDescription(items:FinishOption["configuration"]["storage"]):string{
 return items.map(d=>[d.capacityGb==null?"Capacidad sin confirmar":`${d.capacityGb} GB`,d.technology,d.formFactor,d.interface].filter(Boolean).join(" ")).join(" + ")||"Sin confirmar";
}
export function finishKey(f:FinishOption):string{return `${f.finishId}:${f.priceCop}:${JSON.stringify(f.configuration)}`;}
