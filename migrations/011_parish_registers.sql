CREATE TABLE parish_units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 300),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX parish_units_name ON parish_units(tenant_id,lower(btrim(name)));
ALTER TABLE parish_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE parish_units FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON parish_units USING(tenant_id=tenant_context()) WITH CHECK(tenant_id=tenant_context());
INSERT INTO parish_units(tenant_id,name)
 SELECT DISTINCT tenant_id,btrim(unit) FROM households WHERE nullif(btrim(unit),'') IS NOT NULL
 ON CONFLICT DO NOTHING;
ALTER TABLE households ADD COLUMN unit_id uuid,
 ADD COLUMN status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected')),
 ADD COLUMN created_by uuid, ADD COLUMN submitted_by uuid, ADD COLUMN reviewed_by uuid,
 ADD COLUMN review_note text, ADD COLUMN revision integer NOT NULL DEFAULT 1,
 ADD CONSTRAINT households_unit_fk FOREIGN KEY(tenant_id,unit_id) REFERENCES parish_units(tenant_id,id),
 ADD CONSTRAINT households_creator_fk FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id),
 ADD CONSTRAINT households_submitter_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES users(tenant_id,id),
 ADD CONSTRAINT households_reviewer_fk FOREIGN KEY(tenant_id,reviewed_by) REFERENCES users(tenant_id,id);
UPDATE households h SET unit_id=u.id FROM parish_units u
 WHERE h.tenant_id=u.tenant_id AND lower(btrim(h.unit))=lower(btrim(u.name));
CREATE INDEX households_unit_status ON households(tenant_id,unit_id,status);
ALTER TABLE entries ADD COLUMN event_year text GENERATED ALWAYS AS
 (CASE WHEN date_precision IN ('exact','year') AND event_date ~ '^[0-9]{4}(-[0-9]{2}-[0-9]{2})?$'
 THEN left(event_date,4) ELSE NULL END) STORED;
CREATE INDEX entries_year ON entries(tenant_id,event_year,schema_id,status);
ALTER TABLE persons ADD COLUMN photo_version integer NOT NULL DEFAULT 0;
CREATE TABLE person_photos (
 tenant_id uuid NOT NULL REFERENCES tenants, person_id uuid NOT NULL,
 image bytea NOT NULL CHECK(octet_length(image)<=524288), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,person_id), FOREIGN KEY(tenant_id,person_id) REFERENCES persons(tenant_id,id)
);
ALTER TABLE person_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_photos FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON person_photos USING(tenant_id=tenant_context()) WITH CHECK(tenant_id=tenant_context());
INSERT INTO register_schemas(tenant_id,kind,label,fields)
 SELECT t.id,s.kind,s.label,s.fields::jsonb FROM tenants t CROSS JOIN (VALUES
 ('holy_communion','First Holy Communion','[{"key":"parents","label":"Parents / guardians","type":"text","required":false},{"key":"baptism_reference","label":"Baptism register reference","type":"text","required":false},{"key":"baptism_parish","label":"Parish of baptism","type":"text","required":false},{"key":"preparation_reference","label":"Catechism / preparation reference","type":"text","required":false}]'),
 ('burial','Burial','[{"key":"death_date","label":"Date of death","type":"text","required":false},{"key":"cemetery","label":"Cemetery / burial place","type":"text","required":false},{"key":"grave_reference","label":"Grave reference","type":"text","required":false},{"key":"next_of_kin","label":"Next of kin","type":"text","required":false}]')
 ) AS s(kind,label,fields)
 WHERE NOT EXISTS(SELECT 1 FROM register_schemas r WHERE r.tenant_id=t.id AND r.kind=s.kind)
 ON CONFLICT DO NOTHING;
