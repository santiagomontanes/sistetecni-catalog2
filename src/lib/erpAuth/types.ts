export type ErpRole="admin"|"supervisor"|"vendedor"|"tecnico"|"caja"|"bodega"|"viewer";
export type ErpPermission=
  |"customers.manage"|"inventory.read"|"inventory.manage"|"inventory.reserve"
  |"sales.read"|"sales.manage"|"warranties.open"|"warranties.manage"
  |"purchases.read"|"purchases.manage"|"cash.read"|"cash.manage"
  |"expenses.read"|"expenses.manage"|"reports.view"|"profitability.view"
  |"profitability.manage"|"users.manage"|"quotes.manage";
const MATRIX:Record<ErpRole,readonly ErpPermission[]>={
  admin:["customers.manage","inventory.read","inventory.manage","inventory.reserve","sales.read","sales.manage","warranties.open","warranties.manage","purchases.read","purchases.manage","cash.read","cash.manage","expenses.read","expenses.manage","reports.view","profitability.view","profitability.manage","users.manage","quotes.manage"],
  supervisor:["customers.manage","inventory.read","inventory.manage","inventory.reserve","sales.read","sales.manage","warranties.open","warranties.manage","purchases.read","purchases.manage","cash.read","cash.manage","expenses.read","expenses.manage","reports.view","profitability.view","quotes.manage"],
  vendedor:["customers.manage","inventory.read","inventory.reserve","sales.read","sales.manage","warranties.open","quotes.manage"],
  tecnico:["inventory.read","inventory.manage","warranties.open","warranties.manage"],
  caja:["sales.read","purchases.read","cash.read","cash.manage","expenses.read","expenses.manage"],
  bodega:["inventory.read","inventory.manage","inventory.reserve","purchases.read","purchases.manage"],viewer:[]};
export function roleHasPermission(role:ErpRole,permission:ErpPermission):boolean{return MATRIX[role].includes(permission);}
export function isErpRole(value:unknown):value is ErpRole{return typeof value==="string"&&value in MATRIX;}
export const ERP_ROLE_LABELS:Record<ErpRole,string>={admin:"Administrador",supervisor:"Supervisor",vendedor:"Vendedor",tecnico:"Técnico",caja:"Caja",bodega:"Bodega",viewer:"Sin acceso operativo"};
