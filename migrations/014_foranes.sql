CREATE TABLE foranes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), archdiocese_id uuid NOT NULL REFERENCES archdioceses,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 300), code text NOT NULL,
 vicar_name text, contact_email text, address text, head_parish_id uuid,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(archdiocese_id,id), UNIQUE(archdiocese_id,code)
);
ALTER TABLE tenants ADD COLUMN forane_id uuid,
 ADD CONSTRAINT tenants_forane_archdiocese_fk FOREIGN KEY(archdiocese_id,forane_id) REFERENCES foranes(archdiocese_id,id),
 ADD CONSTRAINT tenants_forane_identity UNIQUE(archdiocese_id,forane_id,id);
ALTER TABLE foranes ADD CONSTRAINT foranes_head_parish_fk FOREIGN KEY(archdiocese_id,id,head_parish_id) REFERENCES tenants(archdiocese_id,forane_id,id);
CREATE INDEX tenants_forane ON tenants(forane_id);
ALTER TABLE users ADD COLUMN forane_id uuid;
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users DROP CONSTRAINT users_scope_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('platform_admin','archdiocese_admin','forane_admin','admin','priest','secretary','clerk','archivist','auditor'));
ALTER TABLE users ADD CONSTRAINT users_forane_archdiocese_fk FOREIGN KEY(archdiocese_id,forane_id) REFERENCES foranes(archdiocese_id,id);
ALTER TABLE users ADD CONSTRAINT users_scope_check CHECK(
 (role='platform_admin' AND tenant_id IS NULL AND archdiocese_id IS NULL AND forane_id IS NULL) OR
 (role='archdiocese_admin' AND tenant_id IS NULL AND archdiocese_id IS NOT NULL AND forane_id IS NULL) OR
 (role='forane_admin' AND tenant_id IS NULL AND archdiocese_id IS NOT NULL AND forane_id IS NOT NULL) OR
 (role NOT IN ('platform_admin','archdiocese_admin','forane_admin') AND tenant_id IS NOT NULL AND archdiocese_id IS NULL AND forane_id IS NULL));
CREATE FUNCTION forane_access(fid uuid, aid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT
 current_setting('app.office_role',true)='platform_admin' OR
 (current_setting('app.office_role',true)='archdiocese_admin' AND aid::text=current_setting('app.archdiocese_id',true)) OR
 (current_setting('app.office_role',true)='forane_admin' AND fid::text=current_setting('app.forane_id',true) AND aid::text=current_setting('app.archdiocese_id',true)) $$;
ALTER TABLE foranes ENABLE ROW LEVEL SECURITY;
ALTER TABLE foranes FORCE ROW LEVEL SECURITY;
CREATE POLICY forane_office ON foranes USING(forane_access(id,archdiocese_id)) WITH CHECK(forane_access(id,archdiocese_id));
CREATE POLICY parish_forane_directory ON foranes FOR SELECT USING(EXISTS(SELECT 1 FROM tenants t WHERE t.id=tenant_context() AND t.forane_id=foranes.id));
CREATE TABLE forane_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), forane_id uuid NOT NULL, archdiocese_id uuid NOT NULL,
 category text NOT NULL CHECK(category IN ('pastoral','catechesis','clergy_meeting','visitation','liturgy','stewardship','clergy_care','delegated_request')),
 title text NOT NULL, description text NOT NULL DEFAULT '', coordinator text, venue text,
 scheduled_on date, due_on date, status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','completed','cancelled')),
 minutes text NOT NULL DEFAULT '', action_items text NOT NULL DEFAULT '', authority_reference text,
 revision integer NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES users, updated_by uuid NOT NULL REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(archdiocese_id,forane_id,id), FOREIGN KEY(archdiocese_id,forane_id) REFERENCES foranes(archdiocese_id,id),
 CHECK(due_on IS NULL OR scheduled_on IS NULL OR due_on>=scheduled_on),
 CHECK(category<>'delegated_request' OR length(btrim(authority_reference))>0)
);
ALTER TABLE tenants ADD CONSTRAINT tenants_archdiocese_identity UNIQUE(archdiocese_id,id);
CREATE TABLE forane_activity_parishes (
 activity_id uuid NOT NULL, forane_id uuid NOT NULL, archdiocese_id uuid NOT NULL, tenant_id uuid NOT NULL,
 report text NOT NULL DEFAULT '', attendance integer NOT NULL DEFAULT 0 CHECK(attendance BETWEEN 0 AND 1000000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted','reviewed','returned')),
 review_note text, submitted_by uuid REFERENCES users, reviewed_by uuid REFERENCES users,
 revision integer NOT NULL DEFAULT 1, withdrawn_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(activity_id,tenant_id),
 FOREIGN KEY(archdiocese_id,forane_id,activity_id) REFERENCES forane_activities(archdiocese_id,forane_id,id),
 FOREIGN KEY(archdiocese_id,tenant_id) REFERENCES tenants(archdiocese_id,id)
);
CREATE TABLE forane_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), forane_id uuid NOT NULL, archdiocese_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users, action text NOT NULL, resource_id uuid NOT NULL,
 reason text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(archdiocese_id,forane_id) REFERENCES foranes(archdiocese_id,id)
);
CREATE INDEX forane_activity_schedule ON forane_activities(forane_id,status,due_on);
CREATE INDEX forane_participation_parish ON forane_activity_parishes(tenant_id,status);
ALTER TABLE forane_activity_parishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forane_activity_parishes FORCE ROW LEVEL SECURITY;
CREATE POLICY participation_read ON forane_activity_parishes FOR SELECT USING(
 forane_access(forane_id,archdiocese_id) OR (tenant_id=tenant_context() AND withdrawn_at IS NULL));
CREATE POLICY participation_insert ON forane_activity_parishes FOR INSERT WITH CHECK(forane_access(forane_id,archdiocese_id));
CREATE POLICY participation_update ON forane_activity_parishes FOR UPDATE USING(
 forane_access(forane_id,archdiocese_id) OR (tenant_id=tenant_context() AND withdrawn_at IS NULL)) WITH CHECK(
 forane_access(forane_id,archdiocese_id) OR (tenant_id=tenant_context() AND withdrawn_at IS NULL));
ALTER TABLE forane_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE forane_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY activity_read ON forane_activities FOR SELECT USING(forane_access(forane_id,archdiocese_id) OR EXISTS(
 SELECT 1 FROM forane_activity_parishes p WHERE p.activity_id=id AND p.tenant_id=tenant_context() AND p.withdrawn_at IS NULL));
CREATE POLICY activity_insert ON forane_activities FOR INSERT WITH CHECK(forane_access(forane_id,archdiocese_id));
CREATE POLICY activity_update ON forane_activities FOR UPDATE USING(forane_access(forane_id,archdiocese_id)) WITH CHECK(forane_access(forane_id,archdiocese_id));
ALTER TABLE forane_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE forane_events FORCE ROW LEVEL SECURITY;
CREATE POLICY forane_history ON forane_events USING(forane_access(forane_id,archdiocese_id)) WITH CHECK(forane_access(forane_id,archdiocese_id));
CREATE TRIGGER forane_events_immutable BEFORE UPDATE OR DELETE ON forane_events FOR EACH ROW EXECUTE FUNCTION protect_append_only();
