import {test} from "node:test";
import assert from "node:assert/strict";
import {imageKind} from "./image";
import {finishKey,storageDescription,type FinishOption} from "./finishes";
import {evaluateCandidate} from "../personalizador/matching";
import {PRODUCT_1_DIRECT_MATCH, TYPICAL_REQUIREMENTS} from "../personalizador/fixtures";
test("acaba­dos con mismo color conservan identidad y configuración distinta",()=>{
 const a:FinishOption={finishId:"one",name:"Gris 3D",baseColor:"Gris",texture:"3D",imagePaths:[],priceCop:"800000",stock:1,configuration:{cpu:null,ramGb:4,storage:[],screen:null}};
 assert.notEqual(finishKey(a),finishKey({...a,finishId:"two",name:"Gris chinas"}));
 assert.notEqual(finishKey(a),finishKey({...a,configuration:{...a.configuration,ramGb:8}}));
 assert.equal(storageDescription([{capacityGb:256,technology:"SSD",formFactor:"M.2",interface:"SATA"}]),"256 GB SSD M.2 SATA");
 assert.equal(storageDescription([]),"Sin confirmar");
});
test("archivo no imagen y SVG rechazados aunque se declare MIME imagen",()=>{
 assert.equal(imageKind(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),null);
 assert.equal(imageKind(new Uint8Array([255,216,255,...Array(9).fill(0)])),"image/jpeg");
 assert.equal(imageKind(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])),"image/png");
});
test("personalizador no atribuye configuración de modelo a producto activado por acabados",()=>{
 // La exclusión ocurre antes del matching: no cotiza un precio genérico sin selección.
 const candidate={product:{...PRODUCT_1_DIRECT_MATCH,finishesEnabled:true},compatibleUpgrades:[]};
 assert.equal(evaluateCandidate(candidate,TYPICAL_REQUIREMENTS),null);
});
