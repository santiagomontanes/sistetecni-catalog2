-- Persistencia REAL PostgreSQL, datos sintéticos; transacción descartada al terminar.
-- La selfie ready es un fixture de METADATOS, no verifica Supabase Storage/cámara.
begin;
create or replace function pg_temp.attendance_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end;$$;
insert into auth.users(id,email) values
 ('a3000000-0000-4000-8000-000000000001','attendance-admin@example.invalid'),
 ('a3000000-0000-4000-8000-000000000002','attendance-worker@example.invalid'),
 ('a3000000-0000-4000-8000-000000000003','attendance-other@example.invalid');
insert into public.profiles(id,is_admin,erp_role,active,display_name) values
 ('a3000000-0000-4000-8000-000000000001',true,'admin',true,'Prueba administrador'),
 ('a3000000-0000-4000-8000-000000000002',false,'tecnico',true,'Prueba empleado'),
 ('a3000000-0000-4000-8000-000000000003',false,'tecnico',true,'Prueba otro empleado')
on conflict(id) do update set erp_role=excluded.erp_role,is_admin=excluded.is_admin,active=true;
insert into public.attendance_evidence(id,employee_id,storage_path,mime_type,bytes,status,expires_at) values
 ('a3000000-0000-4000-8000-000000000010','a3000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000002/fixture.jpg','image/jpeg',100,'ready',now()+interval '1 day');
do $$
declare v_shift jsonb; v_result jsonb; v_set jsonb; v_payment jsonb; v_id uuid; v_events bigint; v_failed boolean;
 v_admin uuid:='a3000000-0000-4000-8000-000000000001'; v_worker uuid:='a3000000-0000-4000-8000-000000000002';
 v_key uuid:=gen_random_uuid(); v_evidence uuid:='a3000000-0000-4000-8000-000000000010';
begin
  perform set_config('request.jwt.claim.sub',v_worker::text,true);
  v_failed:=false; begin perform public.attendance_command('start',jsonb_build_object('evidenceId',v_evidence),v_key); exception when others then v_failed:=sqlerrm like '%attendance_disabled%'; end;
  perform pg_temp.attendance_assert(v_failed,'módulo apagado impide iniciar');
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.attendance_command('settings','{"enabled":true,"retentionDays":7,"reason":"Prueba local"}',gen_random_uuid());
  perform public.attendance_command('rate',jsonb_build_object('employeeId',v_worker,'effectiveFrom','2019-01-01T00:00:00Z','modality','hourly','amountCop','10000','paidLunch',false,'reason','Tarifa inicial de prueba'),gen_random_uuid());
  perform set_config('request.jwt.claim.sub',v_worker::text,true);
  v_shift:=public.attendance_command('start',jsonb_build_object('evidenceId',v_evidence),v_key);
  v_result:=public.attendance_command('start',jsonb_build_object('evidenceId',v_evidence),v_key);
  perform pg_temp.attendance_assert(v_shift=v_result,'doble clic entrada retorna mismo turno');
  perform pg_temp.attendance_assert((select count(*)=1 from public.attendance_shifts where employee_id=v_worker),'exactamente un turno');
  perform pg_temp.attendance_assert((v_shift->>'started_at')::timestamptz=now(),'entrada usa hora servidor');
  v_failed:=false; begin perform public.attendance_command('start',jsonb_build_object('evidenceId',v_evidence),gen_random_uuid()); exception when others then v_failed:=sqlerrm like '%attendance_shift_already_open%'; end;
  perform pg_temp.attendance_assert(v_failed,'no admite turnos simultáneos');
  v_failed:=false; begin perform public.attendance_command('end',jsonb_build_object('shiftId',v_shift->>'id','version',99),gen_random_uuid()); exception when serialization_failure then v_failed:=true; end;
  perform pg_temp.attendance_assert(v_failed,'version vieja no sobrescribe');
  v_failed:=false; begin perform public.attendance_command('lunch.end',jsonb_build_object('shiftId',v_shift->>'id','version',1),gen_random_uuid()); exception when others then v_failed:=sqlerrm like '%attendance_lunch_not_open%'; end;
  perform pg_temp.attendance_assert(v_failed,'almuerzo no puede terminar sin iniciar');
  v_shift:=public.attendance_command('lunch.start',jsonb_build_object('shiftId',v_shift->>'id','version',1),gen_random_uuid());
  v_failed:=false; begin perform public.attendance_command('end',jsonb_build_object('shiftId',v_shift->>'id','version',2),gen_random_uuid()); exception when others then v_failed:=sqlerrm like '%attendance_lunch_not_closed%'; end;
  perform pg_temp.attendance_assert(v_failed,'salida exige almuerzo consistente');
  v_shift:=public.attendance_command('lunch.end',jsonb_build_object('shiftId',v_shift->>'id','version',2),gen_random_uuid());
  v_shift:=public.attendance_command('end',jsonb_build_object('shiftId',v_shift->>'id','version',3),gen_random_uuid());
  perform pg_temp.attendance_assert(v_shift->>'ended_at' is not null,'entrada almuerzo salida persisten');
  v_failed:=false; begin perform public.attendance_command('correct',jsonb_build_object('shiftId',v_shift->>'id','version',4,'reason','Cambio no autorizado'),gen_random_uuid()); exception when insufficient_privilege then v_failed:=true; end;
  perform pg_temp.attendance_assert(v_failed,'empleado no corrige su turno');
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  v_failed:=false; begin perform public.attendance_command('correct',jsonb_build_object('shiftId',v_shift->>'id','version',4,'startedAt','2020-01-02T22:00:00-05:00','endedAt','2020-01-01T06:00:00-05:00','lunchStartedAt',null,'lunchEndedAt',null,'reason','Cronología inválida'),gen_random_uuid()); exception when check_violation then v_failed:=true; end;
  perform pg_temp.attendance_assert(v_failed,'salida anterior a entrada rechazada por constraint');
  v_shift:=public.attendance_command('correct',jsonb_build_object('shiftId',v_shift->>'id','version',4,'startedAt','2020-01-01T22:00:00-05:00','endedAt','2020-01-02T06:00:00-05:00','lunchStartedAt','2020-01-02T01:00:00-05:00','lunchEndedAt','2020-01-02T01:30:00-05:00','reason','Olvido de marcación sintético'),gen_random_uuid());
  perform pg_temp.attendance_assert((select count(*)=1 from public.attendance_events where shift_id=(v_shift->>'id')::uuid and event_type='correct' and before_snapshot is not null and after_snapshot is not null and reason is not null),'corrección conserva antes después responsable motivo');
  perform public.attendance_command('rate',jsonb_build_object('employeeId',v_worker,'effectiveFrom','2020-01-01T00:00:00Z','modality','hourly','amountCop','20000','paidLunch',true,'reason','Cambio posterior de tarifa'),gen_random_uuid());
  perform pg_temp.attendance_assert((select rate_snapshot->>'amount_cop'='10000' from public.attendance_shifts where id=(v_shift->>'id')::uuid),'nueva tarifa no cambia snapshot histórico');
  v_set:=public.attendance_command('settlement.create',jsonb_build_object('employeeId',v_worker,'from','2020-01-01','to','2020-01-01'),gen_random_uuid());
  perform pg_temp.attendance_assert(v_set->>'base_cop'='75000' and v_set->>'seconds_worked'='27000','medianoche y almuerzo: 7.5 horas a 10000 = 75000');
  v_failed:=false; begin perform public.attendance_command('correct',jsonb_build_object('shiftId',v_shift->>'id','version',5,'reason','Cambio liquidado'),gen_random_uuid()); exception when others then v_failed:=sqlerrm like '%attendance_shift_already_settled%'; end;
  perform pg_temp.attendance_assert(v_failed,'liquidación congela turnos');
  perform public.attendance_command('settlement.adjust',jsonb_build_object('settlementId',v_set->>'id','amountCop','5000','reason','Bono autorizado sintético'),gen_random_uuid());
  v_key:=gen_random_uuid();
  v_payment:=public.attendance_command('payment',jsonb_build_object('settlementId',v_set->>'id','amountCop','10000','kind','advance','method','efectivo','reference','ATT-ADVANCE-001'),v_key);
  perform public.attendance_command('payment',jsonb_build_object('settlementId',v_set->>'id','amountCop','10000','kind','advance','method','efectivo','reference','ATT-ADVANCE-001'),v_key);
  perform pg_temp.attendance_assert((select count(*)=1 from public.attendance_payments where settlement_id=(v_set->>'id')::uuid),'anticipo idempotente');
  perform pg_temp.attendance_assert((select sum(amount_cop)=-10000 from public.cash_movements where expense_id=(v_payment->>'expenseId')::uuid),'anticipo integra gasto/caja existentes una sola vez');
  v_failed:=false; begin perform public.attendance_command('settlement.approve',jsonb_build_object('settlementId',v_set->>'id','amountCop','5000','reason','Menor que anticipos'),gen_random_uuid()); exception when others then v_failed:=sqlerrm like '%attendance_approval_invalid%'; end;
  perform pg_temp.attendance_assert(v_failed,'no aprueba menos de lo ya pagado');
  perform public.attendance_command('settlement.approve',jsonb_build_object('settlementId',v_set->>'id','amountCop','80000','reason','Aprobación responsable'),gen_random_uuid());
  v_payment:=public.attendance_command('payment',jsonb_build_object('settlementId',v_set->>'id','amountCop','70000','kind','payment','method','transferencia','reference','ATT-PAYMENT-001'),gen_random_uuid());
  v_failed:=false; begin perform public.attendance_command('payment',jsonb_build_object('settlementId',v_set->>'id','amountCop','1','kind','payment','method','efectivo','reference','ATT-EXCESS-001'),gen_random_uuid()); exception when others then v_failed:=sqlerrm like '%attendance_payment_exceeds_balance%'; end;
  perform pg_temp.attendance_assert(v_failed,'saldo liquidado impide pago adicional');
  perform public.attendance_command('payment.reverse',jsonb_build_object('settlementId',v_set->>'id','paymentId',v_payment->>'paymentId','reason','Prueba reverso auditado'),gen_random_uuid());
  perform pg_temp.attendance_assert((select sum(amount_cop)=0 from public.cash_movements where expense_id=(v_payment->>'expenseId')::uuid),'reverso conserva movimientos y netea caja');
  perform pg_temp.attendance_assert((select expense_status='voided' from public.attendance_payment_status(array[(v_set->>'id')::uuid]) where id=(v_payment->>'paymentId')::uuid),'saldo reconoce gasto reversado');
  perform set_config('request.jwt.claim.sub','a3000000-0000-4000-8000-000000000003',true);
  perform pg_temp.attendance_assert((select count(*)=0 from public.attendance_payment_status(array[(v_set->>'id')::uuid])),'otro empleado no ve pagos');
end;$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a3000000-0000-4000-8000-000000000003',true);
select pg_temp.attendance_assert((select count(*)=0 from public.attendance_shifts where employee_id='a3000000-0000-4000-8000-000000000002'),'RLS aísla turnos entre empleados');
select pg_temp.attendance_assert((select count(*)=0 from public.attendance_evidence where employee_id='a3000000-0000-4000-8000-000000000002'),'RLS aísla selfies entre empleados');
do $$ declare denied boolean:=false; begin
 begin update public.attendance_settings set enabled=false; exception when insufficient_privilege then denied:=true; end;
 perform pg_temp.attendance_assert(denied,'escritura directa denegada incluso con sesión autenticada');
end;$$;
reset role;
rollback;
