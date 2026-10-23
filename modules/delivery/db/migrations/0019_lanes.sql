-- 074 AC-18: a project's own board lanes, each a step inside one phase before Released ("Code review"
-- in Building). Default lanes aren't stored: a proposal with no lane sits in its phase's default lane,
-- so existing proposals, projects and syncs need no data change.
create table delivery.lane (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  project_id uuid not null references delivery.project(id),
  phase text not null check (phase in ('proposed', 'planned', 'building', 'verified')),
  name text not null check (length(btrim(name)) between 1 and 40),
  position int not null check (position > 0),
  created_at timestamptz not null default now()
);
create unique index lane_name on delivery.lane (project_id, lower(name));
create index lane_order on delivery.lane (project_id, phase, position);
select core.enable_tenant_rls('delivery.lane');
grant select, insert, update, delete on delivery.lane to amax_app;

alter table delivery.proposal add column lane_id uuid references delivery.lane(id);

-- A lane belongs to one phase: whatever moves a proposal to another phase (a sync, a Prod deployment,
-- a void) takes it out of a lane that isn't in that phase, back to the phase's default lane.
create function delivery.proposal_lane_follows_phase() returns trigger language plpgsql as $$
begin
  if new.lane_id is not null and not exists (select 1 from delivery.lane l where l.id = new.lane_id and l.phase = new.phase and l.project_id = new.project_id) then
    new.lane_id := null;
  end if;
  return new;
end $$;
create trigger proposal_lane_follows_phase before insert or update of phase, lane_id on delivery.proposal
  for each row execute function delivery.proposal_lane_follows_phase();
