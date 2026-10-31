# Usuarios y roles

Pantalla `/admin/usuarios` (solo rol Administrador, permiso `users.manage`).

- **Crear usuario**: nombre, correo, contraseña inicial (mínimo 10 caracteres) y rol. Crea la cuenta en Supabase Auth (correo ya confirmado) y su perfil con el rol elegido, con la clave de servicio del servidor; si el perfil falla, la cuenta recién creada se elimina. Correo repetido: mensaje claro, sin duplicar. Crear un Administrador pide confirmación.
- **Cambiar contraseña**: el administrador define una contraseña nueva para otra persona. No cierra sesiones ya abiertas.
- **Rol y activación**: cambiar rol o desactivar (no se pierde historial). No se puede quitar ni desactivar al último administrador activo.
- Un usuario desactivado o sin rol operativo (`viewer`) no accede a ningún módulo.

Roles: Administrador (todo), Supervisor (ventas, compras, caja, gastos, reportes; sin usuarios), Vendedor (clientes, cotizaciones, ventas, licencias), Técnico (taller, inventario, garantías), Caja (caja y gastos; consulta ventas y compras), Bodega (inventario y compras), Sin acceso operativo.

No requiere migración. Prueba: `tests/e2e/usuarios.spec.ts`.

## Una sesión por usuario

Al iniciar sesión, `erp_claim_single_session()` cierra las demás sesiones de **esa misma persona** (no afecta a otras personas). La sesión anterior detecta el cierre (al cargar, cada 30 s y al volver a la pestaña) y vuelve a `/admin/login?sesion=cerrada` con un aviso. Excepciones: sesiones de un vínculo computador–celular vigente (lector remoto de QR) y el celular que está iniciando sesión mientras hay un código de vínculo pendiente (5 min). «Cerrar sesión» solo cierra el dispositivo actual. Migración `20261101020000_single_session_per_user.sql`. Pruebas: `tests/e2e/sesiones.spec.ts`.
