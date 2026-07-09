-- Rollback for 0010_generalize_return_requests_table.sql
-- Safe only if no 'cancellation' rows exist yet (dropping the column loses
-- that data). Check first: select count(*) from return_requests where
-- request_type = 'cancellation';

alter table public.return_requests
  drop column if exists request_type;
