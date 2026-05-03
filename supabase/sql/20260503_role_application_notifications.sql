-- Notify admins when users apply for a new workspace role, then notify the
-- applicant when an admin approves or declines the admission.

begin;

create or replace function public.role_application_label(application_kind text, target_role text)
returns text
language sql
stable
as $$
  select case
    when application_kind = 'restaurant' then 'Restaurant'
    when application_kind = 'seller' then 'Seller'
    when application_kind = 'delivery' then 'Delivery Agent'
    when target_role = 'landlord' then 'Landlord'
    else 'Workspace'
  end;
$$;

create or replace function public.notify_role_application_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_label text;
  applicant_label text;
begin
  if to_regclass('public.notifications') is null then
    return new;
  end if;

  role_label := public.role_application_label(new.application_kind, new.target_role);
  applicant_label := coalesce(nullif(new.applicant_name, ''), nullif(new.applicant_email, ''), 'A user');

  insert into public.notifications (user_id, title, message, type, priority, data, is_read)
  select
    p.id,
    'New ' || role_label || ' admission',
    applicant_label || ' submitted a ' || lower(role_label) || ' role application.',
    'role_application_submitted',
    'important',
    jsonb_build_object(
      'applicationId', new.id,
      'applicantId', new.user_id,
      'targetRole', new.target_role,
      'applicationKind', new.application_kind
    ),
    false
  from public.profiles p
  where p.role = 'admin';

  return new;
end;
$$;

create or replace function public.notify_role_application_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_label text;
  approved boolean;
begin
  if to_regclass('public.notifications') is null then
    return new;
  end if;

  if new.status not in ('approved', 'declined') or old.status = new.status then
    return new;
  end if;

  role_label := public.role_application_label(new.application_kind, new.target_role);
  approved := new.status = 'approved';

  insert into public.notifications (user_id, title, message, type, priority, data, is_read)
  values (
    new.user_id,
    role_label || case when approved then ' admission approved' else ' admission declined' end,
    case
      when approved then 'Your ' || lower(role_label) || ' admission has been approved. You can now switch into that workspace.'
      else 'Your ' || lower(role_label) || ' admission was declined.' || case when coalesce(new.admin_note, '') <> '' then ' ' || new.admin_note else '' end
    end,
    case when approved then 'role_application_approved' else 'role_application_declined' end,
    'important',
    jsonb_build_object(
      'applicationId', new.id,
      'targetRole', new.target_role,
      'applicationKind', new.application_kind,
      'status', new.status
    ),
    false
  );

  return new;
end;
$$;

drop trigger if exists notify_role_application_submitted on public.role_applications;
create trigger notify_role_application_submitted
after insert on public.role_applications
for each row
when (new.status = 'pending')
execute function public.notify_role_application_submitted();

drop trigger if exists notify_role_application_reviewed on public.role_applications;
create trigger notify_role_application_reviewed
after update of status on public.role_applications
for each row
execute function public.notify_role_application_reviewed();

commit;
