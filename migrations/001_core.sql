CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, code text UNIQUE NOT NULL,
 status text NOT NULL DEFAULT 'trial' CHECK(status IN ('trial','active','suspended','archived')),
 settings jsonb NOT NULL DEFAULT '{"timezone":"Asia/Kolkata","locale":"en-IN","tradition":"Roman Catholic","maker_checker":true,"ai_enabled":false,"storage_quota_mb":5120,"user_quota":20}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants,
 email text UNIQUE NOT NULL, name text NOT NULL, password_hash text,
 role text NOT NULL CHECK(role IN ('platform_admin','admin','priest','secretary','clerk','archivist','auditor')),
 permissions text[] NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true,
 mfa_secret text, mfa_enabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 CHECK ((role='platform_admin' AND tenant_id IS NULL) OR (role<>'platform_admin' AND tenant_id IS NOT NULL))
);
CREATE TABLE sessions (id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users, csrf text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, device text);
CREATE TABLE account_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text UNIQUE NOT NULL, user_id uuid REFERENCES users, kind text NOT NULL CHECK(kind IN ('invite','reset')), expires_at timestamptz NOT NULL, used_at timestamptz);
CREATE TABLE organisations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants, parent_id uuid, name text NOT NULL, kind text NOT NULL DEFAULT 'Parish', code text NOT NULL, address text, UNIQUE(tenant_id,id), UNIQUE(tenant_id,code), FOREIGN KEY(tenant_id,parent_id) REFERENCES organisations(tenant_id,id));
CREATE TABLE households (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants, name text NOT NULL, unit text, address text, contact text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id));
CREATE TABLE persons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants, household_id uuid, membership_no text NOT NULL, name text NOT NULL, local_name text, alternate_names text, birth_date text, date_precision text NOT NULL DEFAULT 'unknown' CHECK(date_precision IN ('exact','year','approximate','unknown')), email text, phone text, address text, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','deceased','transferred')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,membership_no), FOREIGN KEY(tenant_id,household_id) REFERENCES households(tenant_id,id));
CREATE TABLE register_schemas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants, kind text NOT NULL, version integer NOT NULL DEFAULT 1, label text NOT NULL, fields jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,kind,version));
CREATE TABLE volumes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants, title text NOT NULL, collection text NOT NULL, series text, kind text NOT NULL, date_range text, language text NOT NULL DEFAULT 'English', condition text NOT NULL DEFAULT 'Good', custodian text, notes text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id));
CREATE TABLE assets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants, volume_id uuid NOT NULL, filename text NOT NULL, storage_key text NOT NULL UNIQUE, mime text NOT NULL, size_bytes bigint NOT NULL, checksum text NOT NULL, page_label text NOT NULL, quality text NOT NULL DEFAULT 'unreviewed', uploaded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,volume_id) REFERENCES volumes(tenant_id,id), FOREIGN KEY(tenant_id,uploaded_by) REFERENCES users(tenant_id,id));
CREATE TABLE entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants, schema_id uuid NOT NULL, person_id uuid NOT NULL, entry_no text NOT NULL, event_date text, date_precision text NOT NULL DEFAULT 'unknown' CHECK(date_precision IN ('exact','year','approximate','unknown')), place text, minister text, fields jsonb NOT NULL DEFAULT '{}', source_id uuid, source_page text, source_row text, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected','corrected','void')), revision integer NOT NULL DEFAULT 1, created_by uuid NOT NULL, submitted_by uuid, approved_by uuid, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,schema_id,entry_no), FOREIGN KEY(tenant_id,schema_id) REFERENCES register_schemas(tenant_id,id), FOREIGN KEY(tenant_id,person_id) REFERENCES persons(tenant_id,id), FOREIGN KEY(tenant_id,source_id) REFERENCES assets(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id), FOREIGN KEY(tenant_id,submitted_by) REFERENCES users(tenant_id,id), FOREIGN KEY(tenant_id,approved_by) REFERENCES users(tenant_id,id));
CREATE TABLE entry_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants, entry_id uuid NOT NULL, revision integer NOT NULL, snapshot jsonb NOT NULL, actor_id uuid NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,entry_id,revision), FOREIGN KEY(tenant_id,entry_id) REFERENCES entries(tenant_id,id));
CREATE TABLE amendments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants, entry_id uuid NOT NULL, proposed jsonb NOT NULL, reason text NOT NULL, requested_by uuid NOT NULL, reviewed_by uuid, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,entry_id) REFERENCES entries(tenant_id,id));
CREATE TABLE annotations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants, entry_id uuid NOT NULL, text text NOT NULL, actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(tenant_id,entry_id) REFERENCES entries(tenant_id,id));
CREATE TABLE ocr_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants, asset_id uuid NOT NULL, schema_id uuid NOT NULL, status text NOT NULL DEFAULT 'manual' CHECK(status IN ('manual','queued','processing','review','reviewed','imported','failed')), provider text NOT NULL DEFAULT 'manual', provider_version text, raw_text text, extraction jsonb NOT NULL DEFAULT '{}', error text, attempts integer NOT NULL DEFAULT 0, reviewed_by uuid, imported_entry_id uuid, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,asset_id) REFERENCES assets(tenant_id,id), FOREIGN KEY(tenant_id,schema_id) REFERENCES register_schemas(tenant_id,id), FOREIGN KEY(tenant_id,imported_entry_id) REFERENCES entries(tenant_id,id));
CREATE TABLE certificate_templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants, name text NOT NULL, wording text NOT NULL, signatory text NOT NULL, approved boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id));
CREATE TABLE certificate_issues (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants, entry_id uuid NOT NULL, template_id uuid NOT NULL, reference text UNIQUE NOT NULL, snapshot jsonb NOT NULL, issued_by uuid NOT NULL, revoked_at timestamptz, reason text, reprints integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,entry_id) REFERENCES entries(tenant_id,id), FOREIGN KEY(tenant_id,template_id) REFERENCES certificate_templates(tenant_id,id));
CREATE TABLE audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants, actor_id uuid REFERENCES users, action text NOT NULL, resource text NOT NULL, resource_id text, detail jsonb NOT NULL DEFAULT '{}', request_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX persons_search ON persons(tenant_id,lower(name));
CREATE INDEX entries_status ON entries(tenant_id,status,created_at DESC);
CREATE INDEX assets_volume ON assets(tenant_id,volume_id);
CREATE INDEX audit_timeline ON audit_events(tenant_id,created_at DESC);
CREATE INDEX jobs_status ON ocr_jobs(tenant_id,status);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE FUNCTION tenant_context() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id',true),'')::uuid $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['organisations','households','persons','register_schemas','volumes','assets','entries','entry_versions','amendments','annotations','ocr_jobs','certificate_templates','certificate_issues','audit_events'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = tenant_context()) WITH CHECK (tenant_id = tenant_context())',t);
 END LOOP;
END $$;
CREATE FUNCTION protect_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Append-only table'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION protect_append_only();
CREATE TRIGGER versions_immutable BEFORE UPDATE OR DELETE ON entry_versions FOR EACH ROW EXECUTE FUNCTION protect_append_only();
CREATE FUNCTION protect_official_entry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status IN ('approved','corrected','void') AND current_setting('app.correction',true) IS DISTINCT FROM 'authorized' THEN RAISE EXCEPTION 'Official entry requires amendment workflow'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER official_entry_immutable BEFORE UPDATE OR DELETE ON entries FOR EACH ROW EXECUTE FUNCTION protect_official_entry();
