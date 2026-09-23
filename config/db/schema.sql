-- Future PostgreSQL / Supabase store (implements the same ProjectStore interface
-- as the default FileProjectStore in packages/shared/src/node/store.ts).
-- Large artifacts (video, frames, audio) stay in object storage; only metadata here.

create table if not exists projects (
  id            text primary key,
  name          text not null,
  status        text not null check (status in ('UPLOADED','ANALYZING','NEEDS_REVIEW','READY_FOR_SCRIPT','GENERATING_VOICE','READY_TO_RENDER','RENDERING','COMPLETE','ERROR')),
  origin        text not null default 'video',
  source        jsonb,
  media         jsonb,
  settings      jsonb not null default '{}',
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists project_stages (
  project_id    text references projects(id) on delete cascade,
  stage         text not null,
  status        text not null,
  input_hash    text,
  started_at    timestamptz,
  completed_at  timestamptz,
  duration_ms   integer,
  attempts      integer not null default 0,
  provider      text,
  cost          jsonb,
  error         text,
  notes         jsonb not null default '[]',
  primary key (project_id, stage)
);

create table if not exists project_status_history (
  id            bigserial primary key,
  project_id    text references projects(id) on delete cascade,
  from_status   text,
  to_status     text not null,
  reason        text,
  at            timestamptz not null default now()
);

-- Reviewed tutorial documents (tutorial.json), versioned.
create table if not exists tutorials (
  project_id    text references projects(id) on delete cascade,
  version       integer not null,
  body          jsonb not null,
  edited_by     text,
  created_at    timestamptz not null default now(),
  primary key (project_id, version)
);
