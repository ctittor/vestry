CREATE FUNCTION certificate_validity(ref text) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT CASE WHEN revoked_at IS NULL THEN 'valid' ELSE 'revoked' END FROM certificate_issues WHERE reference=ref),'not_found')
$$;
REVOKE ALL ON FUNCTION certificate_validity(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION certificate_validity(text) TO PUBLIC;
