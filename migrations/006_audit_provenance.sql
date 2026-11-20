ALTER TABLE audit_events ADD COLUMN actor_role text;
CREATE FUNCTION capture_audit_role() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN SELECT role INTO NEW.actor_role FROM users WHERE id=NEW.actor_id; RETURN NEW; END $$;
CREATE TRIGGER audit_role_snapshot BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION capture_audit_role();
CREATE TRIGGER schema_versions_immutable BEFORE UPDATE OR DELETE ON register_schemas FOR EACH ROW EXECUTE FUNCTION protect_append_only();
