-- Optional camp plot dimensions (feet). When set, the map draws a rectangular
-- footprint centred on the camp's pin (frontage along the street, depth radial).
-- Additive + idempotent.

alter table camps add column if not exists frontage_ft double precision;
alter table camps add column if not exists depth_ft double precision;
