ALTER TABLE entries ADD COLUMN subject_name text;
SELECT set_config('app.correction','authorized',true);
UPDATE entries e SET subject_name=p.name FROM persons p WHERE e.person_id=p.id AND e.tenant_id=p.tenant_id;
SELECT set_config('app.correction','',true);
ALTER TABLE entries ALTER COLUMN subject_name SET NOT NULL;
