create or replace function public.protect_ticket_event_review_state()
returns trigger
language plpgsql
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := coalesce(public.is_admin(), false);
begin
  if old.status = new.status then
    return new;
  end if;

  if old.status = 'draft' and new.status = 'pending_review' then
    if old.organizer_id = v_actor
       and new.submitted_by = v_actor
       and new.submitted_at is not null then
      return new;
    end if;
    raise exception 'Organizer drafts must be submitted through the Event Studio.';
  end if;

  if old.status = 'changes_requested' and new.status = 'draft' then
    if old.organizer_id = v_actor then
      return new;
    end if;
    raise exception 'Requested changes must be revised by the organizer through Event Studio.';
  end if;

  if old.status = 'pending_review' then
    if v_is_admin
       and new.status in ('published', 'changes_requested', 'rejected')
       and new.reviewed_by = v_actor
       and new.reviewed_at is not null then
      return new;
    end if;
    raise exception 'Pending organizer events must be handled through the EYA Event Reviews queue.';
  end if;

  if old.status = 'rejected' then
    if v_is_admin and new.status = 'archived' then
      return new;
    end if;
    raise exception 'Rejected organizer events are locked. Archive them or create a new submission.';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_ticket_event_review_state() from public, anon, authenticated;

drop trigger if exists protect_ticket_event_review_state_trigger on public.ticket_events;
create trigger protect_ticket_event_review_state_trigger
before update of status on public.ticket_events
for each row
execute function public.protect_ticket_event_review_state();
