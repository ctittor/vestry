ALTER TABLE persons ADD COLUMN merged_into uuid;
ALTER TABLE persons ADD CONSTRAINT persons_merge_tenant FOREIGN KEY(tenant_id,merged_into) REFERENCES persons(tenant_id,id);
ALTER TABLE persons ADD CONSTRAINT persons_no_self_merge CHECK(merged_into IS DISTINCT FROM id);
CREATE TABLE membership_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants,person_id uuid NOT NULL,event text NOT NULL,effective_date date NOT NULL,previous_parish text,next_parish text,reason text NOT NULL,actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(tenant_id,person_id) REFERENCES persons(tenant_id,id));
CREATE TABLE household_memberships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants,person_id uuid NOT NULL,household_id uuid NOT NULL,start_date date NOT NULL DEFAULT current_date,end_date date,FOREIGN KEY(tenant_id,person_id) REFERENCES persons(tenant_id,id),FOREIGN KEY(tenant_id,household_id) REFERENCES households(tenant_id,id),CHECK(end_date IS NULL OR end_date>=start_date));
CREATE TABLE person_relationships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants,person_id uuid NOT NULL,related_person_id uuid NOT NULL,relationship text NOT NULL,start_date date,end_date date,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(tenant_id,person_id) REFERENCES persons(tenant_id,id),FOREIGN KEY(tenant_id,related_person_id) REFERENCES persons(tenant_id,id),CHECK(person_id<>related_person_id),CHECK(end_date IS NULL OR start_date IS NULL OR end_date>=start_date));
CREATE TABLE person_merge_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants,source_id uuid NOT NULL,target_id uuid NOT NULL,reason text NOT NULL,actor_id uuid NOT NULL,reversed_by uuid,reversed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,source_id) REFERENCES persons(tenant_id,id),FOREIGN KEY(tenant_id,target_id) REFERENCES persons(tenant_id,id));
ALTER TABLE amendments ADD COLUMN base_revision integer;
UPDATE amendments a SET base_revision=e.revision FROM entries e WHERE a.entry_id=e.id;
ALTER TABLE amendments ALTER COLUMN base_revision SET NOT NULL;
CREATE FUNCTION track_household() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' OR NEW.household_id IS DISTINCT FROM OLD.household_id THEN
 UPDATE household_memberships SET end_date=current_date WHERE tenant_id=NEW.tenant_id AND person_id=NEW.id AND end_date IS NULL;
 IF NEW.household_id IS NOT NULL THEN INSERT INTO household_memberships(tenant_id,person_id,household_id) VALUES(NEW.tenant_id,NEW.id,NEW.household_id); END IF;
 END IF;
 RETURN NEW; END $$;
CREATE TRIGGER person_household_history AFTER INSERT OR UPDATE OF household_id ON persons FOR EACH ROW EXECUTE FUNCTION track_household();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['membership_history','household_memberships','person_relationships','person_merge_history'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=tenant_context()) WITH CHECK (tenant_id=tenant_context())',t);
 END LOOP; END $$;
CREATE TRIGGER membership_history_immutable BEFORE UPDATE OR DELETE ON membership_history FOR EACH ROW EXECUTE FUNCTION protect_append_only();
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX persons_name_trigram ON persons USING gin (name gin_trgm_ops);
