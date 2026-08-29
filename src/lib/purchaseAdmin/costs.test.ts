import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateSharedCosts, sumIntegerMoney } from "./costs";

test("allocateSharedCosts reparte exacto sin perder pesos",()=>{
  const parts=allocateSharedCosts(10,3);
  assert.deepEqual(parts,[4,3,3]);
  assert.equal(sumIntegerMoney(parts),10);
});

test("allocateSharedCosts reparte uniforme cuando divide exacto",()=>{
  assert.deepEqual(allocateSharedCosts(30000,3),[10000,10000,10000]);
});

test("allocateSharedCosts acepta costo cero",()=>{
  assert.deepEqual(allocateSharedCosts(0,2),[0,0]);
});

test("allocateSharedCosts rechaza floats, negativos o cantidad inválida",()=>{
  assert.throws(()=>allocateSharedCosts(1.5,2));
  assert.throws(()=>allocateSharedCosts(-1,2));
  assert.throws(()=>allocateSharedCosts(10,0));
});
