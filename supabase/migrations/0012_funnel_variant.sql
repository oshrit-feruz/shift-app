-- Which arm of the entry experiment a row belongs to.
--
-- PR 2 routes half of new users straight into the recommendation flow and
-- offers it to the other half, and the funnel has to be able to tell them
-- apart. This is one column rather than four new event names on purpose:
--
--   * the four names in 0011 stay exactly as they are, so every query written
--     against them keeps working and no historical row needs renaming;
--   * splitting by arm is `group by variant`, and stopping the split is
--     deleting that clause — no migration when the experiment ends;
--   * a second experiment reuses this column instead of adding four more
--     names, which is how a closed enum stays closed.
--
-- NULLABLE, and null is the normal case. A row carries an arm only when its
-- device actually entered through the experiment — see lib/experiment.ts. Every
-- event from an existing user, from anyone who was already past the first-run
-- overlay, and from every row written before this migration, has variant null.
-- That is what makes `group by variant` a comparison of the experiment rather
-- than of two arbitrary halves of the userbase: labelling everyone by a device
-- hash would put people in an arm they were never actually shown.
--
-- The arm is recorded on ALL FOUR events, not only the first. A funnel split by
-- arm needs the denominator and the numerator to carry the same label, or the
-- later stages cannot be attributed and the rate is uncomputable.
alter table public.funnel_events
  add column variant text
  check (variant is null or variant in ('routed', 'offered'));

-- Closed by a check constraint for the same reason `name` is: an open text
-- column is how an experiment quietly acquires a third arm nobody declared.

-- The column grant from 0011 named three columns, so the client cannot write a
-- fourth without being handed it here. Same two-step as before: this adds to
-- the existing grant rather than replacing it.
--
-- `created_at` is still not on the list, which is the point of naming columns
-- at all — the server's clock stays the server's.
grant insert (variant) on public.funnel_events to authenticated;

-- A by-arm companion to funnel_summary, which is deliberately left alone: it
-- still aggregates across arms, so every existing query and the reading in
-- docs/funnel.md keep meaning what they meant. Splitting is opt-in.
--
-- Rows with variant null are excluded rather than bucketed: they are not in the
-- experiment, and including them as a third group invites reading them as a
-- control. The control is the 'offered' arm.
create view public.funnel_summary_by_variant as
select
  e.variant,
  e.name,
  case e.name
    when 'reco_started' then 1
    when 'reco_completed' then 2
    when 'broker_screen_viewed' then 3
    when 'broker_action_clicked' then 4
  end                                as stage,
  count(*)                           as events,
  count(distinct e.session_id)       as sessions,
  count(distinct e.anon_id)          as devices,
  min(e.created_at)                  as first_seen,
  max(e.created_at)                  as last_seen
from public.funnel_events e
where e.created_at >= now() - interval '30 days'
  and e.variant is not null
group by e.variant, e.name
order by e.variant, stage;

-- Same reasoning as funnel_summary: a view runs as its owner unless told
-- otherwise, which would hand this out to any client that asked.
alter view public.funnel_summary_by_variant set (security_invoker = on);

revoke all on public.funnel_summary_by_variant from anon, authenticated;
