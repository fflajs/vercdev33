--
-- PostgreSQL database dump
--

\restrict 2vkejb6QwHjQ5lU7QMuZINOgiIY4NA93qoBvA7dnKjaKgthuDr0pHCO3mxWkT4t

-- Dumped from database version 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_data; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_data (
    key character varying(255) NOT NULL,
    value text,
    updated_by_person_id integer,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.app_data OWNER TO postgres;

--
-- Name: iterations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.iterations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    start_date timestamp with time zone DEFAULT now() NOT NULL,
    end_date timestamp with time zone,
    question_set character varying(255) DEFAULT 'Deep_Analysis_120.json'::character varying NOT NULL
);


ALTER TABLE public.iterations OWNER TO postgres;

--
-- Name: iterations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.iterations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.iterations_id_seq OWNER TO postgres;

--
-- Name: iterations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.iterations_id_seq OWNED BY public.iterations.id;


--
-- Name: organization_units; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organization_units (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    parent_id integer,
    iteration_id integer NOT NULL
);


ALTER TABLE public.organization_units OWNER TO postgres;

--
-- Name: organization_units_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.organization_units_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.organization_units_id_seq OWNER TO postgres;

--
-- Name: organization_units_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.organization_units_id_seq OWNED BY public.organization_units.id;


--
-- Name: people; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.people (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.people OWNER TO postgres;

--
-- Name: people_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.people_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.people_id_seq OWNER TO postgres;

--
-- Name: people_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.people_id_seq OWNED BY public.people.id;


--
-- Name: person_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.person_roles (
    id integer NOT NULL,
    person_id integer NOT NULL,
    org_unit_id integer NOT NULL,
    is_manager boolean DEFAULT false NOT NULL,
    description text,
    iteration_id integer NOT NULL
);


ALTER TABLE public.person_roles OWNER TO postgres;

--
-- Name: person_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.person_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.person_roles_id_seq OWNER TO postgres;

--
-- Name: person_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.person_roles_id_seq OWNED BY public.person_roles.id;


--
-- Name: surveys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.surveys (
    id integer NOT NULL,
    person_role_id integer,
    org_unit_id integer,
    survey_type character varying(50),
    filename character varying(255),
    survey_results jsonb,
    analysis_voxel jsonb,
    analysis_graphs jsonb,
    iteration_id integer NOT NULL
);


ALTER TABLE public.surveys OWNER TO postgres;

--
-- Name: surveys_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.surveys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.surveys_id_seq OWNER TO postgres;

--
-- Name: surveys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.surveys_id_seq OWNED BY public.surveys.id;


--
-- Name: iterations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iterations ALTER COLUMN id SET DEFAULT nextval('public.iterations_id_seq'::regclass);


--
-- Name: organization_units id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_units ALTER COLUMN id SET DEFAULT nextval('public.organization_units_id_seq'::regclass);


--
-- Name: people id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.people ALTER COLUMN id SET DEFAULT nextval('public.people_id_seq'::regclass);


--
-- Name: person_roles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.person_roles ALTER COLUMN id SET DEFAULT nextval('public.person_roles_id_seq'::regclass);


--
-- Name: surveys id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.surveys ALTER COLUMN id SET DEFAULT nextval('public.surveys_id_seq'::regclass);


--
-- Name: app_data app_data_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_data
    ADD CONSTRAINT app_data_pkey PRIMARY KEY (key);


--
-- Name: iterations iterations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iterations
    ADD CONSTRAINT iterations_pkey PRIMARY KEY (id);


--
-- Name: organization_units organization_units_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_units
    ADD CONSTRAINT organization_units_pkey PRIMARY KEY (id);


--
-- Name: people people_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_name_key UNIQUE (name);


--
-- Name: people people_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_pkey PRIMARY KEY (id);


--
-- Name: person_roles person_roles_person_id_org_unit_id_is_manager_iteration_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.person_roles
    ADD CONSTRAINT person_roles_person_id_org_unit_id_is_manager_iteration_id_key UNIQUE (person_id, org_unit_id, is_manager, iteration_id);


--
-- Name: person_roles person_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.person_roles
    ADD CONSTRAINT person_roles_pkey PRIMARY KEY (id);


--
-- Name: surveys surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.surveys
    ADD CONSTRAINT surveys_pkey PRIMARY KEY (id);


--
-- Name: surveys_org_unit_id_calculated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX surveys_org_unit_id_calculated_idx ON public.surveys USING btree (org_unit_id) WHERE ((survey_type)::text = 'calculated'::text);


--
-- Name: surveys_person_role_id_individual_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX surveys_person_role_id_individual_idx ON public.surveys USING btree (person_role_id) WHERE ((survey_type)::text = 'individual'::text);


--
-- Name: app_data app_data_updated_by_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_data
    ADD CONSTRAINT app_data_updated_by_person_id_fkey FOREIGN KEY (updated_by_person_id) REFERENCES public.people(id);


--
-- Name: organization_units organization_units_iteration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_units
    ADD CONSTRAINT organization_units_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON DELETE CASCADE;


--
-- Name: organization_units organization_units_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization_units
    ADD CONSTRAINT organization_units_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.organization_units(id) ON DELETE CASCADE;


--
-- Name: person_roles person_roles_iteration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.person_roles
    ADD CONSTRAINT person_roles_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON DELETE CASCADE;


--
-- Name: person_roles person_roles_org_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.person_roles
    ADD CONSTRAINT person_roles_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES public.organization_units(id) ON DELETE CASCADE;


--
-- Name: person_roles person_roles_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.person_roles
    ADD CONSTRAINT person_roles_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;


--
-- Name: surveys surveys_iteration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.surveys
    ADD CONSTRAINT surveys_iteration_id_fkey FOREIGN KEY (iteration_id) REFERENCES public.iterations(id) ON DELETE CASCADE;


--
-- Name: surveys surveys_org_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.surveys
    ADD CONSTRAINT surveys_org_unit_id_fkey FOREIGN KEY (org_unit_id) REFERENCES public.organization_units(id) ON DELETE CASCADE;


--
-- Name: surveys surveys_person_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.surveys
    ADD CONSTRAINT surveys_person_role_id_fkey FOREIGN KEY (person_role_id) REFERENCES public.person_roles(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--



--
-- Name: TABLE app_data; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE iterations; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: SEQUENCE iterations_id_seq; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE organization_units; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: SEQUENCE organization_units_id_seq; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE people; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: SEQUENCE people_id_seq; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE person_roles; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: SEQUENCE person_roles_id_seq; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE surveys; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: SEQUENCE surveys_id_seq; Type: ACL; Schema: public; Owner: postgres
--



--
-- PostgreSQL database dump complete
--

\unrestrict 2vkejb6QwHjQ5lU7QMuZINOgiIY4NA93qoBvA7dnKjaKgthuDr0pHCO3mxWkT4t

