CREATE TABLE archdioceses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO archdioceses(name) VALUES('Archdiocese office');
ALTER TABLE tenants ADD COLUMN archdiocese_id uuid REFERENCES archdioceses;
UPDATE tenants SET archdiocese_id=(SELECT id FROM archdioceses LIMIT 1);
ALTER TABLE tenants ALTER COLUMN archdiocese_id SET NOT NULL;
CREATE FUNCTION default_archdiocese() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM archdioceses ORDER BY created_at LIMIT 1 $$;
ALTER TABLE tenants ALTER COLUMN archdiocese_id SET DEFAULT default_archdiocese();
ALTER TABLE users ADD COLUMN archdiocese_id uuid REFERENCES archdioceses;
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users DROP CONSTRAINT users_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('platform_admin','archdiocese_admin','admin','priest','secretary','clerk','archivist','auditor'));
ALTER TABLE users ADD CONSTRAINT users_scope_check CHECK(
 (role='platform_admin' AND tenant_id IS NULL AND archdiocese_id IS NULL) OR
 (role='archdiocese_admin' AND tenant_id IS NULL AND archdiocese_id IS NOT NULL) OR
 (role NOT IN ('platform_admin','archdiocese_admin') AND tenant_id IS NOT NULL AND archdiocese_id IS NULL));
ALTER TABLE parish_units ADD COLUMN authority_email text;
ALTER TABLE households ADD COLUMN alert_email text;
-- Records stay tenant scoped. An accountable central actor may work in a parish.
-- Replace only actor foreign keys, retaining every record-to-record tenant FK.
DO $$ DECLARE r record; actor_column text; BEGIN
 FOR r IN SELECT c.conname,c.conrelid,c.conkey FROM pg_constraint c
 WHERE c.contype='f' AND c.confrelid='users'::regclass AND array_length(c.conkey,1)=2 LOOP
 SELECT a.attname INTO actor_column FROM pg_attribute a WHERE a.attrelid=r.conrelid AND a.attnum=ANY(r.conkey) AND a.attname<>'tenant_id';
 EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.conrelid::regclass,r.conname);
 EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY(%I) REFERENCES users(id)',r.conrelid::regclass,r.conname,actor_column);
 END LOOP;
END $$;
CREATE TABLE change_alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants,
 actor_id uuid NOT NULL REFERENCES users, action text NOT NULL, resource text NOT NULL,
 resource_id text, message text NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE change_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_alerts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON change_alerts USING(tenant_id=tenant_context()) WITH CHECK(tenant_id=tenant_context());
CREATE INDEX alerts_timeline ON change_alerts(tenant_id,created_at DESC);
ALTER TABLE mail_outbox ADD COLUMN alert_id uuid REFERENCES change_alerts;
CREATE TABLE alert_reads (
 tenant_id uuid NOT NULL REFERENCES tenants, alert_id uuid NOT NULL REFERENCES change_alerts,
 user_id uuid NOT NULL REFERENCES users, read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(alert_id,user_id)
);
ALTER TABLE alert_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_reads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON alert_reads USING(tenant_id=tenant_context()) WITH CHECK(tenant_id=tenant_context());
