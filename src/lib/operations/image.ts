/** Inspección de firma, además del MIME declarado. No acepta SVG ni ejecutables. */
export function imageKind(bytes:Uint8Array):"image/jpeg"|"image/png"|"image/webp"|null {
 if(bytes.length<12)return null;
 if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return "image/jpeg";
 if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return "image/png";
 if(String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")return "image/webp";
 return null;
}
