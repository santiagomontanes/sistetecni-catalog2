import {test} from "node:test";
import assert from "node:assert/strict";
import {addCostEntrySchema,reverseCostEntrySchema,unitCodeLookupSchema} from "./validation";
const ID="11111111-1111-1111-1111-111111111111";
test("addCostEntrySchema acepta costo válido",()=>{assert.equal(addCostEntrySchema.safeParse({scopeType:"unit",scopeId:ID,category:"upgrade",description:"RAM 16 GB",amountCop:80000}).success,true);});
test("addCostEntrySchema rechaza costo cero/negativo y campos extra",()=>{assert.equal(addCostEntrySchema.safeParse({scopeType:"unit",scopeId:ID,category:"repair",description:"Reparación",amountCop:0}).success,false);assert.equal(addCostEntrySchema.safeParse({scopeType:"sale",scopeId:ID,category:"sale_fee",description:"Comisión",amountCop:1000,fake:true}).success,false);});
test("reverseCostEntrySchema exige razón",()=>{assert.equal(reverseCostEntrySchema.safeParse({costEntryId:ID,reason:"Error de digitación"}).success,true);assert.equal(reverseCostEntrySchema.safeParse({costEntryId:ID,reason:"x"}).success,false);});
test("unitCodeLookupSchema normaliza y valida STU",()=>{const ok=unitCodeLookupSchema.safeParse(" stu-000123 ");assert.equal(ok.success,true);if(ok.success)assert.equal(ok.data,"STU-000123");assert.equal(unitCodeLookupSchema.safeParse("STU-123").success,false);});
