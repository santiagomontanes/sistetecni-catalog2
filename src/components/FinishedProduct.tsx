"use client";
/* eslint-disable @next/next/no-img-element -- Imágenes del acabado servido directamente por Storage. */
import {useEffect,useState} from "react";
import {supabase} from "@/supabase/client";
import type {Product} from "@/types/product";
import {finishKey,storageDescription,type FinishOption} from "@/lib/operations/finishes";
import ProductGallery from "@/components/ProductGallery";
import WhatsAppButton from "@/components/WhatsAppButton";
export default function FinishedProduct({product}:{product:Product}){
 const [options,setOptions]=useState<FinishOption[]>([]),[key,setKey]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{let live=true;async function load(){const {data,error:e}=await supabase.rpc("catalog_finish_options",{p_product:product.id});if(!live)return;setLoading(false);if(e||!data){setError("No pudimos verificar la disponibilidad. Vuelve a intentarlo.");setOptions([]);return;}setError("");setOptions(data.options);setKey(previous=>previous||((data.options as FinishOption[])[0]?finishKey(data.options[0]):""));}void load();const timer=setInterval(()=>void load(),20000);window.addEventListener("focus",load);return()=>{live=false;clearInterval(timer);window.removeEventListener("focus",load);};},[product.id]);
 const selected=options.find(o=>finishKey(o)===key);
 const publicUrl=(p:string)=>supabase.storage.from("catalog-finishes").getPublicUrl(p).data.publicUrl;
 const images=selected?.imagePaths.map(publicUrl)??[];
 const money=(n:string)=>new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(BigInt(n));
 const selectedProduct:Product=selected?{...product,title:`${product.title} · ${selected.name} · ${selected.configuration.ramGb??"?"} GB RAM · ${storageDescription(selected.configuration.storage)}`,price:Number(selected.priceCop),images,stock:selected.stock}:product;
 return <section className="space-y-6"><header><p className="text-sm text-muted">{product.brand} {product.model}</p><h1 className="text-3xl font-bold">{product.title}</h1><p className="mt-2 text-sm">Selecciona el acabado y la configuración disponibles.</p></header>
 {loading?<p role="status">Consultando unidades disponibles…</p>:error?<p role="alert">{error}</p>:!options.length?<p role="status">Por ahora no hay unidades disponibles para venta.</p>:<>
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Acabados disponibles">{options.map(o=><button key={finishKey(o)} type="button" aria-pressed={finishKey(o)===key} onClick={()=>setKey(finishKey(o))} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${finishKey(o)===key?"border-primary ring-2 ring-primary/20":"border-border"}`}>
 {/* eslint-disable-next-line @next/next/no-img-element */}<img src={publicUrl(o.imagePaths[0])} alt={o.name} className="h-20 w-20 rounded object-cover"/><span><strong className="block">{o.name}</strong><span className="block text-sm">{o.baseColor} · {o.texture}</span><span className="block text-sm">{o.configuration.ramGb==null?"RAM sin confirmar":`${o.configuration.ramGb} GB RAM`} · {storageDescription(o.configuration.storage)}</span><span className="block">{money(o.priceCop)} · {o.stock} disponible(s)</span></span></button>)}</div>
 {selected?<div className="grid gap-6 lg:grid-cols-2"><ProductGallery key={key} images={images} title={`${product.title} ${selected.name}`}/><div className="space-y-4 rounded-xl border border-border p-5"><h2 className="text-xl font-semibold">{selected.name}</h2><p className="text-2xl font-bold text-primary">{money(selected.priceCop)}</p><dl className="space-y-3"><div><dt className="text-muted">CPU</dt><dd>{selected.configuration.cpu||"Sin confirmar"}</dd></div><div><dt className="text-muted">RAM</dt><dd>{selected.configuration.ramGb==null?"Sin confirmar":`${selected.configuration.ramGb} GB`}</dd></div><div><dt className="text-muted">Almacenamiento</dt><dd>{storageDescription(selected.configuration.storage)}</dd></div><div><dt className="text-muted">Pantalla</dt><dd>{selected.configuration.screen||"Sin confirmar"}</dd></div></dl><p>{selected.stock} unidad(es) disponible(s) de esta configuración y acabado.</p><WhatsAppButton product={selectedProduct} fixed={false}/></div></div>:<p>La selección anterior ya no está disponible. Selecciona otra configuración.</p>}</>}
 <a href="/catalog" className="inline-block underline">Volver al catálogo</a></section>;
}
