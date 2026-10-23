-- 074 AC-1/AC-2: "Tasks done per week" reads Done from delivery.task.done_at and Planned from a weekly
-- snapshot of each project's open backlog. The project_id-null portfolio rows were only ever written
-- by fixtures (041); a portfolio total is now the sum of the projects a page shows, so they go.
delete from delivery.weekly_stat where project_id is null;
alter table delivery.weekly_stat alter column project_id set not null;
comment on table delivery.weekly_stat is 'Weekly snapshot per project: planned = tasks open at the start of the week on Planned or Building proposals (074). done is unused; Done comes from delivery.task.done_at.';

create index task_done_at on delivery.task (tenant_id, done_at) where done;
create index weekly_stat_week on delivery.weekly_stat (tenant_id, week);
