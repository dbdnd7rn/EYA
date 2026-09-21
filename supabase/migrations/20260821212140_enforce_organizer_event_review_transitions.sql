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

  -- Legacy/Admin-created catalog events do not participate in organizer review
  -- until an organizer is explicitly attached to them.
  if old.organizer_id is null then
    return new;
  end if;

  if old.status = 'draft' then
    if new.status = 'pending_review'
       and old.organizer_id = v_actor
       and new.submitted_by = v_actor
       and new.submitted_at is not null then
      return new;
    end if;
    if v_is_admin and new.status in ('cancelled', 'archived') then
      return new;
    end if;
    raise exception 'Organizer drafts must be submitted through Event Studio before publication.';
  end if;

  if old.status = 'changes_requested' then
    if new.status = 'draft' and old.organizer_id = v_actor then
      return new;
    end if;
    if v_is_admin and new.status in ('cancelled', 'archived') then
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

  if old.status = 'published' then
    if v_is_admin and new.status in ('paused', 'cancelled', 'archived') then
      return new;
    end if;
    raise exception 'Published organizer events can only be paused, cancelled, or archived by EYA Admin.';
  end if;

  if old.status = 'paused' then
    if v_is_admin and new.status in ('published', 'cancelled', 'archived') then
      return new;
    end if;
    raise exception 'Paused organizer events can only be resumed, cancelled, or archived by EYA Admin.';
  end if;

  if old.status = 'cancelled' then
    if v_is_admin and new.status = 'archived' then
      return new;
    end if;
    raise exception 'Cancelled organizer events are locked except for archival.';
  end if;

  if old.status = 'archived' then
    raise exception 'Archived organizer events are immutable.';
  end if;

  raise exception 'Unsupported organizer event status transition.';
end;
$$;

revoke execute on function public.protect_ticket_event_review_state() from public, anon, authenticated;
