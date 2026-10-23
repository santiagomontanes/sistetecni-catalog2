import type {Shipment,TransportConcept} from "./contracts";
export const TRANSPORT_BEARERS={sistetecni:"Sistetecni",customer:"Cliente",unclassified:"Pendiente de clasificar"};
export const TRANSPORT_SETTLEMENTS={withheld:"Descontado del recaudo",prepaid:"Pagado anticipadamente",payable:"Pendiente de pago separado",customer_direct:"Cliente paga directo a transportadora",unclassified:"Pendiente de confirmar"};
export function expectedShipmentNet(s:Shipment):string{
 return s.payment_mode==="prepaid"?"0":(BigInt(s.collect_cop)-BigInt(s.carrier_withheld_cop??(BigInt(s.freight_cop??"0")+BigInt(s.deductions_cop)).toString())).toString();
}
export function transportFromFields(v:Record<string,string>,prefix:string,code:string,kind:string,amount:string|null,description:string){
 return {code,kind,description,amountCop:amount,costBearer:v[`${prefix}Bearer`],settlement:v[`${prefix}Settlement`],provisional:v[`${prefix}Provisional`]==="on"||amount===null,
  customerChargeCop:v[`${prefix}CustomerCharge`]||"0",customerChargeMode:v[`${prefix}ChargeMode`]||"none",
  ...(v[`${prefix}Prepayment`]?{prepaymentMovementId:v[`${prefix}Prepayment`]}:{}),...(v[`${prefix}ExistingCost`]?{existingCostEntryId:v[`${prefix}ExistingCost`]}:{})};
}
export function guideTransportFromFields(v:Record<string,string>){
 const items=[transportFromFields(v,"freight","freight","freight",v.freightCop,"Flete de la guía")];
 if(BigInt(v.deductionsCop||"0")>0)items.push(transportFromFields(v,"deduction","guide_fees","commission",v.deductionsCop,v.deductionReason));
 return items;
}
export function conceptFields(t?:TransportConcept):Record<string,string>{
 return t?{costBearer:t.cost_bearer,settlement:t.settlement,customerCharge:t.customer_charge_cop,chargeMode:t.customer_charge_mode,prepayment:t.prepayment_movement_id??"",existingCost:t.existing_cost_entry_id??""}:{};
}
