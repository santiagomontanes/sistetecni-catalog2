import type { AdminSaleDetailDTO } from "../salesAdmin/types";

export interface SettledShipment { status: string; received_cop: string; balance_cop: string; guide: string | null; carrier: string }

/**
 * Comprobante interno de un envío contraentrega ya consignado: el equipo se describe por el valor
 * realmente consignado y la diferencia con el total de la venta es costo de envío y comisión de la
 * transportadora. No modifica la venta ni la caja: es una vista derivada de datos ya persistidos.
 */
export function shippingReceiptSale(sale: AdminSaleDetailDTO, shipment: SettledShipment): AdminSaleDetailDTO {
  const received = BigInt(shipment.received_cop), total = BigInt(sale.totalCop);
  if (shipment.status !== "delivered" || received <= BigInt(0) || BigInt(shipment.balance_cop) !== BigInt(0)) throw new Error("shipping_receipt_not_settled");
  if (received > total || !sale.items.length) throw new Error("shipping_receipt_inconsistent");
  const withheld = total - received;
  const first = sale.items[0];
  const equipment = sale.items.map(item => item.unitCodeSnapshot ? `${item.productName} · ${item.unitCodeSnapshot}` : item.productName).join(" + ");
  const items: AdminSaleDetailDTO["items"] = [{ ...first, id: `${first.id}-equipo`, productName: `${equipment} — valor real consignado`, originalUnitPriceCop: null, unitPriceCop: Number(received), quantity: 1, subtotalCop: Number(received) }];
  if (withheld > BigInt(0)) {
    items.push({ ...first, id: `${first.id}-envio`, productId: null, productUnitId: null, unitCodeSnapshot: null, serialNumberSnapshot: null, unitSpecOverridesSnapshot: null, productDescription: null, productImage: null, productSpecs: null,
      productName: `Costo de envío y comisión de ${shipment.carrier} (descontado de la consignación)`, originalUnitPriceCop: null, unitPriceCop: Number(withheld), quantity: 1, subtotalCop: Number(withheld) });
  }
  const note = `Envío contraentrega${shipment.guide ? `, guía ${shipment.guide}` : ""}. El valor del equipo es el valor real consignado por ${shipment.carrier}; el resto es costo de envío y comisión de la transportadora. Comprobante interno, no es factura electrónica DIAN.`;
  return { ...sale, subtotalCop: Number(total), discountCop: 0, paymentStatus: "pagado", items, notes: sale.notes ? `${sale.notes}\n${note}` : note };
}
