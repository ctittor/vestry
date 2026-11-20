CREATE TABLE ocr_results (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants,job_id uuid NOT NULL,provider text NOT NULL,provider_version text NOT NULL,raw_text text NOT NULL,confidence numeric,regions jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(tenant_id,job_id) REFERENCES ocr_jobs(tenant_id,id),CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1));
ALTER TABLE ocr_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_results FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ocr_results USING(tenant_id=tenant_context()) WITH CHECK(tenant_id=tenant_context());
CREATE TRIGGER ocr_results_immutable BEFORE UPDATE OR DELETE ON ocr_results FOR EACH ROW EXECUTE FUNCTION protect_append_only();
