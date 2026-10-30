# Usuarios y roles

Pantalla `/admin/usuarios` (solo rol Administrador, permiso `users.manage`).

- **Crear usuario**: nombre, correo, contraseña inicial (mínimo 10 caracteres) y rol. Crea la cuenta en Supabase Auth (correo ya confirmado) y su perfil con el rol elegido, con la clave de servicio del servidor; si el perfil falla, la cuenta recién creada se elimina. Correo repetido: mensaje claro, sin duplicar. Crear un Administrador pide confirmación.
- **Cambiar contraseña**: el administrador define una contraseña nueva para otra persona. No cierra sesiones ya abiertas.
- **Rol y activación**: cambiar rol o desactivar (no se pierde historial). No se puede quitar ni desactivar al último administrador activo.
- Un usuario desactivado o sin rol operativo (`viewer`) no accede a ningún módulo.

Roles: Administrador (todo), Supervisor (ventas, compras, caja, gastos, reportes; sin usuarios), Vendedor (clientes, cotizaciones, ventas, licencias), Técnico (taller, inventario, garantías), Caja (caja y gastos; consulta ventas y compras), Bodega (inventario y compras), Sin acceso operativo.

No requiere migración. Prueba: `tests/e2e/usuarios.spec.ts`.
