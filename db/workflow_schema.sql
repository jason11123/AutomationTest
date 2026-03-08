create extension if not exists pgcrypto;

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  topic text not null,
  source_prompt text,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  instruction text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, step_order)
);

create table if not exists public.workflow_step_executions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  workflow_step_id uuid references public.workflow_steps(id) on delete set null,
  step_order integer not null,
  step_instruction text not null,
  input_context text,
  output_text text,
  status text not null check (status in ('success', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.llm_token_consumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workflow_id uuid references public.workflows(id) on delete set null,
  workflow_step_id uuid references public.workflow_steps(id) on delete set null,
  workflow_execution_id uuid references public.workflow_step_executions(id) on delete set null,
  source text not null check (source in ('workflow_builder', 'workflow_execute_step', 'llm')),
  model text,
  provider_response_id text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workflows_user_updated on public.workflows (user_id, updated_at desc);
create index if not exists idx_workflow_steps_workflow on public.workflow_steps (workflow_id, step_order);
create index if not exists idx_step_exec_workflow on public.workflow_step_executions (workflow_id, created_at desc);
create index if not exists idx_token_consumptions_user_created on public.llm_token_consumptions (user_id, created_at desc);
create index if not exists idx_token_consumptions_workflow_created on public.llm_token_consumptions (workflow_id, created_at desc);
