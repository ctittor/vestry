CREATE TABLE mail_outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient text NOT NULL,kind text NOT NULL,encrypted_token text NOT NULL,attempts integer NOT NULL DEFAULT 0,sent_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),next_attempt_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE security_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users,action text NOT NULL,request_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER security_events_immutable BEFORE UPDATE OR DELETE ON security_events FOR EACH ROW EXECUTE FUNCTION protect_append_only();
CREATE TRIGGER originals_immutable BEFORE UPDATE OR DELETE ON assets FOR EACH ROW EXECUTE FUNCTION protect_append_only();
