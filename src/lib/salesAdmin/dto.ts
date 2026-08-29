/**
 * Mapeo Sale/SaleItem -> DTOs del panel admin. Nunca recalcula nada: usa
 * exclusivamente snapshots persistidos.
 */
import type { Sale, SaleItem, SaleWithItems } from "../../types/sale";
import { maskPhone } from "./mask";
import type { AdminSaleDetailDTO, AdminSaleItemDTO, AdminSaleListItemDTO } from "./types";

export function toAdminSaleListItemDTO(sale: Sale): AdminSaleListItemDTO {
  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    createdAt: sale.createdAt ? sale.createdAt.toISOString() : null,
    customerName: sale.customerName,
    customerPhoneMasked: maskPhone(sale.customerPhone),
    totalCop: sale.totalCop,
    paymentMethod: sale.paymentMethod,
    paymentStatus: sale.paymentStatus,
  };
}

function toAdminSaleItemDTO(item: SaleItem): AdminSaleItemDTO {
  return {
    id: item.id,
    itemType: item.itemType,
    productId: item.productId,
    productUnitId: item.productUnitId,
    unitCodeSnapshot: item.unitCodeSnapshot,
    serialNumberSnapshot: item.serialNumberSnapshot,
    unitSpecOverridesSnapshot: item.unitSpecOverridesSnapshot,
    productName: item.productName,
    productDescription: item.productDescription,
    productImage: item.productImage,
    productSpecs: item.productSpecs,
    originalUnitPriceCop: item.originalUnitPriceCop,
    unitPriceCop: item.unitPriceCop,
    quantity: item.quantity,
    subtotalCop: item.subtotalCop,
  };
}

export function toAdminSaleDetailDTO(sale: SaleWithItems): AdminSaleDetailDTO {
  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    createdAt: sale.createdAt ? sale.createdAt.toISOString() : null,
    customerId: sale.customerId,
    customerName: sale.customerName,
    customerDocument: sale.customerDocument,
    customerPhone: sale.customerPhone,
    customerEmail: sale.customerEmail,
    subtotalCop: sale.subtotalCop,
    discountCop: sale.discountCop,
    totalCop: sale.totalCop,
    paymentMethod: sale.paymentMethod,
    paymentStatus: sale.paymentStatus,
    warrantyMonths: sale.warrantyMonths,
    notes: sale.notes,
    items: sale.items.map(toAdminSaleItemDTO),
  };
}
