export interface OperationalReport {
 phaseLocations:{phase:string;location:string;units:number}[];
 phaseHours:{phase:string;hours:number}[];
 stalledCount:number;
 stalled:{id:string;unit_code:string;phase:string;phase_since:string}[];
 lotChecks:{lot:string;units:number;failed_checks:number}[];
 components:{kind:string;installations:number;removals:number}[];
 preparationCostCop:string;
 finishSales:{id:string;name:string;units:number;gross_cop:string}[];
 shipping:{pendingGuide:number;verifyDue:number;netPendingCop:string;differenceCop:string};
}
export const phaseNames:Record<string,string>={reception:"Recepción",diagnosis:"Diagnóstico",technical:"Preparación técnica",aesthetic:"Estética",final_check:"Control final",ready:"Lista",warehouse:"Bodega",unknown:"Sin fase"};
