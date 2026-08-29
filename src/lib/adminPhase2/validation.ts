import{z}from"zod";
export const paymentMethodSchema=z.enum(["efectivo","transferencia","nequi","daviplata","tarjeta","otro"]);
export const expenseCategorySchema=z.enum(["arriendo","servicios","publicidad","nomina","transporte","hosting","software","papeleria","impuestos","mantenimiento","otro"]);
const money=z.number().int().min(0).max(10_000_000_000);
export const openCashSchema=z.object({openingCashCop:money,notes:z.string().trim().max(500).optional()}).strict();
export const closeCashSchema=z.object({sessionId:z.string().uuid(),countedCashCop:money,notes:z.string().trim().max(500).optional()}).strict();
export const cashMovementSchema=z.object({movementType:z.enum(["purchase_payment","manual_in","manual_out"]),paymentMethod:paymentMethodSchema,amountCop:money.positive(),description:z.string().trim().min(3).max(500),purchaseId:z.string().uuid().optional()}).strict().superRefine((v,ctx)=>{if(v.movementType==="purchase_payment"&&!v.purchaseId)ctx.addIssue({code:z.ZodIssueCode.custom,message:"Selecciona la compra pagada.",path:["purchaseId"]});});
export const expenseSchema=z.object({category:expenseCategorySchema,description:z.string().trim().min(3).max(500),amountCop:money.positive(),paymentMethod:paymentMethodSchema,payee:z.string().trim().max(150).optional(),receiptUrl:z.string().url().refine(v=>/^https?:\/\//i.test(v),"Solo URL http/https.").optional(),occurredOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict();
export const voidExpenseSchema=z.object({expenseId:z.string().uuid(),reason:z.string().trim().min(3).max(500)}).strict();
export const reverseMovementSchema=z.object({movementId:z.string().uuid(),reason:z.string().trim().min(3).max(500)}).strict();
export const reportSchema=z.object({from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict().refine(v=>v.from<=v.to,{message:"Rango de fechas inválido."});
export const userRoleSchema=z.object({profileId:z.string().uuid(),role:z.enum(["admin","supervisor","vendedor","tecnico","caja","bodega","viewer"]),displayName:z.string().trim().max(120).optional(),active:z.boolean()}).strict();
export function issues(error:z.ZodError){return error.issues.map(i=>i.message);}
