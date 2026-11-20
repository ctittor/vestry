ALTER TABLE change_alerts ADD CONSTRAINT change_alerts_tenant_id UNIQUE(tenant_id,id);
ALTER TABLE alert_reads DROP CONSTRAINT alert_reads_alert_id_fkey;
ALTER TABLE alert_reads ADD CONSTRAINT alert_reads_parish_alert_fk FOREIGN KEY(tenant_id,alert_id) REFERENCES change_alerts(tenant_id,id);
CREATE TRIGGER change_alerts_immutable BEFORE UPDATE OR DELETE ON change_alerts FOR EACH ROW EXECUTE FUNCTION protect_append_only();
