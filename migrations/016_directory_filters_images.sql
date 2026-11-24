ALTER TABLE persons ADD COLUMN state text NOT NULL DEFAULT '', ADD COLUMN place text NOT NULL DEFAULT '';
ALTER TABLE households ADD COLUMN state text NOT NULL DEFAULT '', ADD COLUMN place text NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN state text NOT NULL DEFAULT '', ADD COLUMN place text NOT NULL DEFAULT '';
ALTER TABLE foranes ADD COLUMN state text NOT NULL DEFAULT '', ADD COLUMN place text NOT NULL DEFAULT '';
ALTER TABLE archdioceses ADD COLUMN state text NOT NULL DEFAULT '', ADD COLUMN place text NOT NULL DEFAULT '';
CREATE INDEX persons_birth_status ON persons(tenant_id,status,birth_date);
CREATE INDEX households_location ON households(tenant_id,state,place);
CREATE TABLE church_buildings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_kind text NOT NULL CHECK(parent_kind IN ('archdiocese','forane','parish')),
 parent_id uuid NOT NULL, name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 description text NOT NULL DEFAULT '', state text NOT NULL DEFAULT '', place text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION directory_visible(k text, eid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT CASE
 WHEN k='user' THEN eid::text=current_setting('app.user_id',true)
 WHEN k='archdiocese' THEN current_setting('app.office_role',true)='platform_admin' OR eid::text=current_setting('app.archdiocese_id',true) OR EXISTS(SELECT 1 FROM tenants WHERE id=tenant_context() AND archdiocese_id=eid)
 WHEN k='forane' THEN EXISTS(SELECT 1 FROM foranes WHERE id=eid)
 WHEN k='parish' THEN EXISTS(SELECT 1 FROM tenants t WHERE t.id=eid AND (t.id=tenant_context() OR current_setting('app.office_role',true)='platform_admin' OR (t.archdiocese_id::text=current_setting('app.archdiocese_id',true) AND (current_setting('app.office_role',true)='archdiocese_admin' OR t.forane_id::text=current_setting('app.forane_id',true)))))
 WHEN k='building' THEN EXISTS(SELECT 1 FROM church_buildings b WHERE b.id=eid)
 ELSE false END $$;
ALTER TABLE church_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE church_buildings FORCE ROW LEVEL SECURITY;
CREATE POLICY building_scope ON church_buildings USING(directory_visible(parent_kind,parent_id)) WITH CHECK(directory_visible(parent_kind,parent_id));
CREATE TABLE identity_photos (
 kind text NOT NULL CHECK(kind IN ('user','archdiocese','forane','parish','building')), entity_id uuid NOT NULL,
 image bytea NOT NULL CHECK(octet_length(image)<=262144), version bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(kind,entity_id)
);
ALTER TABLE identity_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_photos FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_photo_scope ON identity_photos USING(directory_visible(kind,entity_id)) WITH CHECK(directory_visible(kind,entity_id));
