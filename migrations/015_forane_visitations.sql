ALTER TABLE forane_activities ADD COLUMN checklist jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(checklist)='array');
UPDATE forane_activities SET checklist='[{"key":"pastoral","status":"pending","note":""},{"key":"registers","status":"pending","note":""},{"key":"liturgy","status":"pending","note":""},{"key":"furnishings","status":"pending","note":""},{"key":"goods","status":"pending","note":""},{"key":"parish_house","status":"pending","note":""},{"key":"clergy","status":"pending","note":""}]'::jsonb
 WHERE category='visitation' AND status IN ('planned','in_progress');
