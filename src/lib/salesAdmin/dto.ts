/**
 * Mapeo Sale/SaleItem -> DTOs del panel admin. Nunca recalcula nada — todo
 * sale de las columnas ya persistidas (el snapshot congelado en la venta).
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
