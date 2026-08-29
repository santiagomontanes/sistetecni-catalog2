import {test} from "node:test";
import assert from "node:assert/strict";
import {allocateIntegerAmount,safeMarginPercent} from "./allocation";

test("allocateIntegerAmount reparte proporcional y suma exacto",()=>{
  const a=allocateIntegerAmount(100,[500,300,200]);
  assert.deepEqual(a,[50,30,20]);
  assert.equal(a.reduce((x,y)=>x+y,0),100);
});

test("allocateIntegerAmount conserva pesos residuales",()=>{
  const a=allocateIntegerAmount(10,[1,1,1]);
  assert.deepEqual(a,[4,3,3]);
  assert.equal(a.reduce((x,y)=>x+y,0),10);
});

test("allocateIntegerAmount con pesos cero reparte determinísticamente",()=>{
  assert.deepEqual(allocateIntegerAmount(5,[0,0]),[3,2]);
});

test("allocateIntegerAmount rechaza floats y negativos",()=>{
  assert.throws(()=>allocateIntegerAmount(1.5,[1]));
  assert.throws(()=>allocateIntegerAmount(5,[-1,2]));
});

test("safeMarginPercent usa dos decimales y evita división por cero",()=>{
  assert.equal(safeMarginPercent(250000,1000000),25);
  assert.equal(safeMarginPercent(1,3),33.33);
  assert.equal(safeMarginPercent(1,0),null);
});
