-- Up Migration

-- Make updated_at strictly advance on every row update.
--
-- ETags are derived from updated_at at millisecond precision, while PostgreSQL
-- stores microseconds and the JavaScript driver truncates the value to
-- milliseconds. Two updates stamped within the same millisecond therefore
-- produced an identical ETag even though the row changed, which let a stale
-- If-Match header match after a concurrent write. Advancing the stored value by
-- at least one millisecond per update keeps millisecond-precision ETags unique
-- across consecutive updates.
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = GREATEST(clock_timestamp(), OLD.updated_at + interval '1 millisecond');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Down Migration

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
