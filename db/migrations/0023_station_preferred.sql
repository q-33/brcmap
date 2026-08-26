-- Which station speaks for the city.
--
-- Several stations now report from inside the fence, and "whichever answered
-- most recently" is a poor way to pick the one whose number goes in the map's
-- weather pill — it can flip between stations minute to minute and read as
-- flapping. An admin nominates one instead.
--
-- Still only a preference: if the nominated station goes quiet, the freshest
-- other station leads, and if they all go quiet the forecast model does.
ALTER TABLE weather_stations ADD COLUMN IF NOT EXISTS preferred boolean NOT NULL DEFAULT false;
